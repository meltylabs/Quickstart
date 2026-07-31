import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { createConfig } from '../src/config.mjs';
import { parseAttachmentMessage } from '../src/attachment-markup.mjs';
import { createPocketServer } from '../src/server.mjs';

const port = Number(process.env.POCKET_UI_PORT || 4320);
const fixtureMode = process.env.POCKET_UI_MODE || 'unlocked';
const fixtureWorkspacePath =
  process.env.POCKET_UI_WORKSPACE ||
  fileURLToPath(new URL('../../../', import.meta.url));
const now = Date.now();
const at = (minutesAgo) => new Date(now - minutesAgo * 60_000).toISOString();

const workspaces = [
  {
    id: 'w-pocket',
    name: 'iphone conductor',
    repositoryName: 'Quickstart',
    branch: 'understand-conductor-setup',
    state: 'active',
    pinned: true,
    sessionCount: 3,
    unreadCount: 0,
    workingCount: 1,
    activityAt: at(0),
  },
  {
    id: 'w-academy',
    name: 'OVO Academy',
    repositoryName: 'ovo-academy',
    branch: 'main',
    state: 'active',
    pinned: true,
    sessionCount: 8,
    unreadCount: 4,
    workingCount: 0,
    activityAt: at(12),
  },
  {
    id: 'w-finance',
    name: 'ovo finances',
    repositoryName: 'finance',
    branch: 'reconcile-july',
    state: 'active',
    pinned: false,
    sessionCount: 2,
    unreadCount: 1,
    workingCount: 0,
    activityAt: at(38),
  },
  {
    id: 'w-outbound',
    name: 'outbound',
    repositoryName: 'outbound',
    branch: 'agent-routing',
    state: 'active',
    pinned: false,
    sessionCount: 5,
    unreadCount: 0,
    workingCount: 0,
    activityAt: at(88),
  },
  {
    id: 'w-social',
    name: 'social media',
    repositoryName: 'social',
    branch: 'main',
    state: 'active',
    pinned: false,
    sessionCount: 4,
    unreadCount: 0,
    workingCount: 0,
    activityAt: at(210),
  },
  {
    id: 'w-sync',
    name: 'card sync',
    repositoryName: 'media',
    branch: 'sony-import',
    state: 'active',
    pinned: false,
    sessionCount: 1,
    unreadCount: 0,
    workingCount: 0,
    activityAt: at(1_440),
  },
];

const sessionsByWorkspace = new Map([
  [
    'w-pocket',
    [
      {
        id: 's-pocket',
        workspaceId: 'w-pocket',
        title: 'Explain conductor operations',
        agentType: 'codex',
        model: 'gpt-5.6-sol',
        status: fixtureMode === 'errors' ? 'error' : 'working',
        unreadCount: 0,
        queuedCount: 0,
        queuePaused: false,
        contextUsedPercent: 42,
        activityAt: at(0),
      },
      {
        id: 's-security',
        workspaceId: 'w-pocket',
        title: 'Threat model the iPhone relay',
        agentType: 'claude',
        model: 'claude-opus-4.6',
        status: 'idle',
        unreadCount: 2,
        queuedCount: 0,
        queuePaused: false,
        contextUsedPercent: 18,
        activityAt: at(14),
      },
      {
        id: 's-research',
        workspaceId: 'w-pocket',
        title: 'Research Conductor transport options',
        agentType: 'codex',
        model: 'gpt-5.4',
        status: 'idle',
        unreadCount: 0,
        queuedCount: 0,
        queuePaused: false,
        contextUsedPercent: 61,
        activityAt: at(43),
      },
    ],
  ],
  [
    'w-academy',
    [
      {
        id: 's-academy',
        workspaceId: 'w-academy',
        title: 'Review checkout funnel',
        agentType: 'claude',
        model: 'claude-fable-5',
        status: 'idle',
        unreadCount: 4,
        queuedCount: 0,
        queuePaused: false,
        contextUsedPercent: 27,
        activityAt: at(12),
      },
    ],
  ],
]);

for (const workspace of workspaces) {
  if (!sessionsByWorkspace.has(workspace.id)) {
    sessionsByWorkspace.set(workspace.id, [
      {
        id: `s-${workspace.id}`,
        workspaceId: workspace.id,
        title: `Continue ${workspace.name}`,
        agentType: 'codex',
        model: 'gpt-5.4',
        status: 'idle',
        unreadCount: workspace.unreadCount,
        queuedCount: 0,
        queuePaused: false,
        contextUsedPercent: 24,
        activityAt: workspace.activityAt,
      },
    ]);
  }
}

const recentSessions = [...sessionsByWorkspace.values()]
  .flat()
  .map((session) => ({
    ...session,
    workspaceName:
      workspaces.find((workspace) => workspace.id === session.workspaceId)?.name ||
      'Workspace',
  }))
  .sort((left, right) => Date.parse(right.activityAt) - Date.parse(left.activityAt));

const messages = [
  {
    id: 'm-1',
    rowId: 1,
    kind: 'user',
    text:
      'I want a clean way to use my actual Conductor chats from my iPhone. It needs to feel instant and the security has to be extremely tight.',
    createdAt: at(9),
    sentAt: at(9),
    queued: false,
    turnId: 'turn-private-relay',
  },
  {
    id: 'm-2',
    rowId: 2,
    kind: 'assistant',
    text:
      'Yes. The right shape is a private companion, not another model client. Conductor stays the source of truth on your Mac, while this phone becomes a secure window into the same workspaces and sessions.',
    createdAt: at(8),
    model: 'gpt-5.6-sol',
    turnId: 'turn-private-relay',
  },
  {
    id: 'm-3',
    rowId: 3,
    kind: 'tool',
    toolCallId: 'tool-1',
    name: 'Inspect Conductor Database',
    state: 'completed',
    createdAt: at(7),
    turnId: 'turn-private-relay',
  },
  {
    id: 'm-4',
    rowId: 4,
    kind: 'tool-result',
    toolCallId: 'tool-1',
    state: 'completed',
    createdAt: at(7),
    turnId: 'turn-private-relay',
  },
  {
    id: 'm-5',
    rowId: 5,
    kind: 'assistant',
    text:
      'The relay now has three hard boundaries:\n\n- it reads the Conductor database in read-only mode\n- it accepts traffic only through private Tailscale Serve\n- every unlock requires the phone passkey and Face ID\n\n```text\nphone → tailnet HTTPS → loopback relay → Conductor\n```\n\nNothing is copied to a public host.',
    createdAt: at(5),
    model: 'gpt-5.6-sol',
    turnId: 'turn-private-relay',
  },
  {
    id: 'm-5-result',
    rowId: 6,
    kind: 'turn-result',
    state: 'complete',
    createdAt: at(5),
    turnId: 'turn-private-relay',
  },
  {
    id: 'm-6',
    rowId: 7,
    kind: 'user',
    text: 'Will the two-way sync actually be fast?',
    createdAt: at(3),
    sentAt: at(3),
    queued: false,
    turnId: 'turn-speed',
  },
  {
    id: 'm-7',
    rowId: 8,
    kind: 'assistant',
    text:
      '## What makes it fast\n**New transcript rows** should appear in hundreds of milliseconds.\n1. Pocket watches the local Conductor database.\n2. Phone sends use the real `Conductor` composer.\n   - delivery is confirmed against the exact Conductor row\n3. Your *account and model* stay exactly where you configured them.\n\n> **Pocket rule:** keep the Mac as the source of truth.\n\n- [x] Private Tailnet transport\n- [x] Safe Markdown\n- [ ] Faster than mind reading\n- Plain mixed-list item keeps its bullet\n\n| Surface | Behavior |\n| --- | :---: |\n| Short reply | Compact |\n| Long answer | Comfortable |\n\nRead the [security notes](https://example.com/security) when you want the full model.\n\nNames like MAX_RETRY_COUNT stay untouched, and 2 * 3 * 4 remains readable.',
    createdAt: at(1),
    model: 'gpt-5.6-sol',
    turnId: 'turn-speed',
  },
  {
    id: 'm-7-result',
    rowId: 9,
    kind: 'turn-result',
    state: 'complete',
    createdAt: at(1),
    turnId: 'turn-speed',
  },
  {
    id: 'm-8',
    rowId: 10,
    kind: 'user',
    text: 'Make deep research easier to scan on my phone.',
    createdAt: at(0.7),
    sentAt: at(0.7),
    queued: false,
    turnId: 'turn-focused-transcript',
  },
  {
    id: 'm-9',
    rowId: 11,
    kind: 'assistant',
    text:
      'I’m mapping the intermediate research updates separately from the final answer.',
    createdAt: at(0.4),
    model: 'gpt-5.6-sol',
    turnId: 'turn-focused-transcript',
  },
];

const errorMessages = [
  ...Array.from({ length: 20 }, (_, index) => {
    const rowId = 12 + index * 2;
    return [
      {
        id: `m-bash-error-${index + 1}`,
        rowId,
        kind: 'tool',
        toolCallId: `bash-error-${index + 1}`,
        name: 'Bash',
        state: 'running',
        createdAt: at(0.8 - index / 1_000),
        turnId: 'turn-error',
      },
      {
        id: `m-bash-result-${index + 1}`,
        rowId: rowId + 1,
        kind: 'tool-result',
        toolCallId: `bash-error-${index + 1}`,
        state: 'failed',
        createdAt: at(0.7 - index / 1_000),
        turnId: 'turn-error',
      },
    ];
  }).flat(),
  ...Array.from({ length: 20 }, (_, index) => ({
    id: `m-background-error-${index + 1}`,
    rowId: 52 + index,
    kind: 'agent-error',
    code: 'background_action_failed',
    severity: 'error',
    title: 'Background action failed',
    guidance:
      'A background Conductor action failed. Open the turn on your Mac for full details.',
    retrying: false,
    createdAt: at(0.6 - index / 1_000),
    turnId: 'turn-error',
    parentToolUseId: `spawn-background-${index + 1}`,
  })),
  {
    id: 'm-error-agent',
    rowId: 72,
    kind: 'agent-error',
    code: 'usage_limit',
    severity: 'error',
    title: 'Account limit reached',
    guidance: 'Open Conductor on the Mac to switch accounts or review limits.',
    retrying: false,
    createdAt: at(0.5),
    turnId: 'turn-error',
  },
];

const { config } = createConfig({
  publicOrigin: `http://127.0.0.1:${port}`,
  port,
  developmentMode: true,
});
config.macName = "Alex's MacBook Pro";

const watcher = {
  subscribe() {
    return () => {};
  },
  stop() {},
};

const database = {
  listLocalWorkspacePaths() {
    return [fixtureWorkspacePath];
  },
  listWorkspaces() {
    return fixtureMode === 'empty' ? [] : workspaces;
  },
  listRecentSessions(limit) {
    if (fixtureMode === 'empty') return [];
    return recentSessions.slice(0, Number(limit) || 50);
  },
  listSessions(workspaceId) {
    return sessionsByWorkspace.get(workspaceId) || [];
  },
  getSessionRoute(sessionId) {
    const session = recentSessions.find((candidate) => candidate.id === sessionId);
    if (!session) return null;
    return {
      id: session.id,
      workspaceId: session.workspaceId,
      workspaceName: session.workspaceName,
      title: session.title,
      titleOrdinal: 1,
      status: session.status,
      agentType: session.agentType,
      model: session.model,
      workspacePath: fixtureWorkspacePath,
      sandboxProvider: null,
    };
  },
  getSessionMessageCursor(sessionId) {
    if (sessionId !== 's-pocket') return 0;
    return messages.at(-1)?.rowId || 0;
  },
  listUserMessagesAfter(sessionId, afterRowId) {
    if (sessionId !== 's-pocket') return [];
    return messages.filter(
      (message) =>
        message.kind === 'user' &&
        message.rowId > Number(afterRowId || 0),
    );
  },
  resolveSessionAttachment(sessionId, attachmentId) {
    if (sessionId !== 's-pocket') return null;
    for (const message of messages) {
      const attachment = message.attachments?.find(
        ({ id }) => id === attachmentId,
      );
      if (attachment) return attachment;
    }
    return null;
  },
  listMessages(sessionId, { after = 0 } = {}) {
    if (!recentSessions.some((candidate) => candidate.id === sessionId)) return null;
    const source =
      sessionId === 's-pocket'
        ? fixtureMode === 'errors'
          ? [...messages, ...errorMessages]
          : messages
        : [];
    return {
      cursor: source.at(-1)?.rowId || 0,
      messages: source.filter((message) => message.rowId > Number(after || 0)),
    };
  },
};

const security = {
  async startPairing() {
    return {
      options: {
        challenge: 'Zml4dHVyZS1jaGFsbGVuZ2U',
        rp: { id: '127.0.0.1', name: 'Conductor Pocket' },
        user: {
          id: 'Zml4dHVyZS11c2Vy',
          name: 'This iPhone',
          displayName: 'This iPhone',
        },
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
        timeout: 60_000,
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          residentKey: 'required',
          userVerification: 'required',
        },
        attestation: 'none',
      },
      setCookie:
        '__Host-cp_pair=fixture; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=300',
    };
  },
  bootstrap() {
    return {
      authenticated: true,
      unlocked: fixtureMode !== 'locked',
      unlockedUntil:
        fixtureMode === 'locked'
          ? null
          : new Date(Date.now() + 5 * 60_000).toISOString(),
      csrfToken: 'ui-fixture-csrf',
      device: {
        id: 'device-this-phone',
        name: "Alex's iPhone",
        createdAt: at(14_400),
        lastSeenAt: at(0),
        tailscaleLogin: 'alex@example.com',
        passkeyBackedUp: true,
      },
    };
  },
  session() {
    return {
      device: { id: 'device-this-phone' },
      csrfToken: 'ui-fixture-csrf',
      unlocked: true,
    };
  },
  assertOrigin() {},
  lock() {
    return { locked: true };
  },
  touch() {
    return {
      unlocked: true,
      unlockedUntil: new Date(Date.now() + 5 * 60_000).toISOString(),
    };
  },
  listDevices() {
    return [
      {
        id: 'device-this-phone',
        name: "Alex's iPhone",
        createdAt: at(14_400),
        lastSeenAt: at(0),
        tailscaleLogin: 'alex@example.com',
        passkeyBackedUp: true,
      },
      {
        id: 'device-spare',
        name: 'Travel iPhone',
        createdAt: at(43_200),
        lastSeenAt: at(1_440),
        tailscaleLogin: 'alex@example.com',
        passkeyBackedUp: true,
      },
    ];
  },
  async revokeDevice(_request, deviceId) {
    return {
      revoked: true,
      currentDevice: deviceId === 'device-this-phone',
      setCookie: null,
    };
  },
};

const transport = {
  async doctor() {
    return { ok: true, code: 'ready' };
  },
  async send({ message }) {
    if (fixtureMode === 'conflict') {
      return {
        ok: false,
        code: 'draft_conflict',
        draftBase64: Buffer.from(
          'Draft already being written on the Mac',
          'utf8',
        ).toString('base64'),
      };
    }
    if (fixtureMode === 'sendfail') {
      return { ok: false, code: 'send_failed' };
    }
    const parsed = parseAttachmentMessage(message);
    const pressedAt = Date.now();
    messages.push({
      id: `m-${messages.length + 1}`,
      rowId: (messages.at(-1)?.rowId || 0) + 1,
      kind: 'user',
      text: parsed.text,
      attachments: parsed.attachments,
      createdAt: new Date(pressedAt).toISOString(),
      sentAt: new Date(pressedAt).toISOString(),
      queued: false,
    });
    return {
      ok: true,
      code: 'sent',
      pressedAt,
      composerOwned: true,
    };
  },
};

const server = createPocketServer({
  configStore: { value: config },
  security,
  database,
  watcher,
  transport,
});

const usesConnectionProxy =
  fixtureMode === 'offline' || fixtureMode === 'reconnecting';
const relayPort = usesConnectionProxy ? port + 1_000 : port;
let proxy = null;

function startConnectionProxy() {
  let servedInitialStream = false;
  proxy = http.createServer((request, response) => {
    const isEventStream = request.url?.startsWith('/api/events');
    if (
      isEventStream &&
      (fixtureMode === 'reconnecting' || servedInitialStream)
    ) {
      response.writeHead(503, {
        'Cache-Control': 'no-store',
        'Content-Type': 'application/json; charset=utf-8',
      });
      response.end('{"error":{"code":"fixture_mac_unreachable"}}');
      return;
    }

    if (isEventStream) servedInitialStream = true;
    const upstream = http.request(
      {
        host: config.bindHost,
        port: relayPort,
        path: request.url,
        method: request.method,
        headers: request.headers,
      },
      (upstreamResponse) => {
        response.writeHead(
          upstreamResponse.statusCode || 502,
          upstreamResponse.headers,
        );
        upstreamResponse.pipe(response);
        if (isEventStream) {
          setTimeout(() => {
            upstream.destroy();
            response.destroy();
          }, 250).unref();
        }
      },
    );
    upstream.on('error', () => {
      if (!response.headersSent) {
        response.writeHead(502, {
          'Content-Type': 'application/json; charset=utf-8',
        });
      }
      response.end('{"error":{"code":"fixture_upstream_unavailable"}}');
    });
    request.pipe(upstream);
  });
  proxy.listen(port, config.bindHost, () => {
    process.stdout.write(
      `Conductor Pocket ${fixtureMode} UI fixture: ${config.publicOrigin}\n`,
    );
  });
}

server.listen(relayPort, config.bindHost, () => {
  if (usesConnectionProxy) startConnectionProxy();
  else process.stdout.write(`Conductor Pocket UI fixture: ${config.publicOrigin}\n`);
});

function shutdown() {
  const closeRelay = () => server.close(() => process.exit(0));
  if (proxy) proxy.close(closeRelay);
  else closeRelay();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
