import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { MAX_MESSAGE_BYTES } from './constants.mjs';
import { normalizeText } from './encoding.mjs';

const execFileAsync = promisify(execFile);
const scriptPath = fileURLToPath(new URL('./conductor-send.applescript', import.meta.url));
const inputScriptPath = fileURLToPath(new URL('./conductor-input.js', import.meta.url));
const PHYSICAL_INPUT_COUNTER_COUNT = 16;
const safeToRetryCodes = new Set([
  'accessibility_disabled',
  'composer_changed_pre_send',
  'composer_unavailable',
  'conductor_not_running',
  'conductor_window_unavailable',
  'draft_conflict',
  'input_helper_unavailable',
  'session_locked',
  'send_unavailable',
  'session_not_visible',
  'user_input_active',
  'workspace_list_unavailable',
  'workspace_not_visible',
]);

function byteLength(value) {
  return Buffer.byteLength(value, 'utf8');
}

function safeToRetry(code) {
  return { ok: false, code, safeToRetry: true };
}

export function parseResult(stdout) {
  const trimmed = stdout.trim();
  try {
    const result = JSON.parse(trimmed);
    if (!result || typeof result.ok !== 'boolean' || typeof result.code !== 'string') {
      throw new Error('Unexpected result shape');
    }
    if (
      (result.code === 'sent' ||
        result.code === 'send_not_confirmed' ||
        result.code === 'send_interrupted') &&
      (!Number.isSafeInteger(result.pressedAt) ||
        result.pressedAt <= 0 ||
        typeof result.composerOwned !== 'boolean')
    ) {
      throw new Error('Missing ambiguous-send attribution');
    }
    if (
      result.code === 'composer_changed_pre_send' &&
      (result.ok ||
        typeof result.retryCertificate !== 'string' ||
        result.retryCertificate.length === 0 ||
        result.retryCertificate.length > 48 * 1024 ||
        !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
          result.retryCertificate,
        ))
    ) {
      throw new Error('Missing composer retry certificate');
    }
    if (!result.ok && safeToRetryCodes.has(result.code)) {
      result.safeToRetry = true;
    }
    return result;
  } catch {
    return { ok: false, code: 'automation_invalid_response' };
  }
}

export function mapAutomationError(error) {
  const details = `${error?.stderr || ''}\n${error?.message || ''}`.toLowerCase();
  if (
    details.includes('not authorized to send apple events') ||
    details.includes('not allowed assistive access') ||
    details.includes('(-1743)') ||
    details.includes('(-25211)')
  ) {
    return {
      ok: false,
      code: 'accessibility_disabled',
      safeToRetry: true,
    };
  }
  if (error?.killed || error?.signal === 'SIGTERM') {
    return { ok: false, code: 'automation_timeout' };
  }
  return { ok: false, code: 'automation_failed' };
}

export class AccessibilityTransport {
  #queue = Promise.resolve();

  doctor() {
    return this.#run({ operation: 'doctor' });
  }

  send({
    workspaceName,
    sessionTitle,
    sessionOrdinal,
    message,
    replaceDraft = false,
    expectedMacDraft,
    expectedInputCounters = null,
    timeoutMs = 45_000,
  }) {
    const normalized = normalizeText(message);
    if (!normalized.trim()) {
      return Promise.resolve(safeToRetry('message_empty'));
    }
    if (normalized.includes('\0')) {
      return Promise.resolve(safeToRetry('message_invalid'));
    }
    if (
      !normalized.isWellFormed() ||
      /[\u0001-\u0009\u000b-\u001f\u007f]/.test(normalized)
    ) {
      return Promise.resolve(safeToRetry('message_invalid'));
    }
    if (byteLength(normalized) > MAX_MESSAGE_BYTES) {
      return Promise.resolve(safeToRetry('message_too_large'));
    }
    const normalizedExpectedDraft =
      typeof expectedMacDraft === 'string'
        ? normalizeText(expectedMacDraft)
        : null;
    if (replaceDraft && normalizedExpectedDraft === null) {
      return Promise.resolve(safeToRetry('draft_recheck_required'));
    }
    if (
      normalizedExpectedDraft !== null &&
      byteLength(normalizedExpectedDraft) > MAX_MESSAGE_BYTES
    ) {
      return Promise.resolve(safeToRetry('draft_recheck_required'));
    }
    if (
      expectedInputCounters !== null &&
      (typeof expectedInputCounters !== 'string' ||
        expectedInputCounters.split(',').length !==
          PHYSICAL_INPUT_COUNTER_COUNT ||
        expectedInputCounters
          .split(',')
          .some(
            (counter) =>
              !/^(?:0|[1-9][0-9]*)$/.test(counter) ||
              !Number.isSafeInteger(Number(counter)),
          ))
    ) {
      return Promise.resolve({
        ok: false,
        code: 'automation_invalid_response',
      });
    }
    if (
      !Number.isSafeInteger(timeoutMs) ||
      timeoutMs < 1_000 ||
      timeoutMs > 45_000
    ) {
      return Promise.resolve({
        ok: false,
        code: 'automation_invalid_response',
      });
    }
    const task = () =>
      this.#run({
        operation: 'send',
        workspaceName,
        sessionTitle,
        sessionOrdinal,
        message: normalized,
        replaceDraft,
        expectedMacDraft: normalizedExpectedDraft || '',
        expectedInputCounters: expectedInputCounters || '',
        timeoutMs,
      });
    this.#queue = this.#queue.then(task, task);
    return this.#queue;
  }

  async #run({
    operation,
    workspaceName = '',
    sessionTitle = '',
    sessionOrdinal = 1,
    message = '',
    replaceDraft = false,
    expectedMacDraft = '',
    expectedInputCounters = '',
    timeoutMs = 45_000,
  }) {
    const attemptStartedAt = Date.now();
    try {
      const { stdout } = await execFileAsync('/usr/bin/osascript', [scriptPath], {
        encoding: 'utf8',
        timeout: timeoutMs,
        maxBuffer: 64 * 1024,
        env: {
          ...process.env,
          POCKET_OPERATION: operation,
          POCKET_WORKSPACE_NAME: workspaceName,
          POCKET_WORKSPACE_NAME_BASE64: Buffer.from(
            workspaceName,
            'utf8',
          ).toString('base64'),
          POCKET_SESSION_TITLE: sessionTitle,
          POCKET_SESSION_TITLE_BASE64: Buffer.from(
            sessionTitle,
            'utf8',
          ).toString('base64'),
          POCKET_SESSION_ORDINAL: String(sessionOrdinal),
          POCKET_MESSAGE_BASE64: Buffer.from(message, 'utf8').toString(
            'base64',
          ),
          POCKET_INPUT_SCRIPT: inputScriptPath,
          POCKET_REPLACE_DRAFT: replaceDraft ? 'true' : 'false',
          POCKET_ATTEMPT_STARTED_AT: String(attemptStartedAt),
          POCKET_EXPECTED_DRAFT_BASE64: Buffer.from(
            expectedMacDraft,
            'utf8',
          ).toString('base64'),
          POCKET_EXPECTED_INPUT_COUNTERS: expectedInputCounters,
        },
      });
      return parseResult(stdout);
    } catch (error) {
      return mapAutomationError(error);
    }
  }
}
