ObjC.import('AppKit');
ObjC.import('ApplicationServices');
ObjC.import('CoreGraphics');
ObjC.import('Foundation');

// JXA exposes NSData.bytes as a generic pointer. Rebind the ABI-compatible C
// signature so CoreGraphics accepts the UTF-16 backing buffer without a
// shared paste state or globally posted keyboard event.
ObjC.bindFunction('CGEventKeyboardSetUnicodeString', [
  'void',
  ['pointer', 'unsigned long', 'pointer'],
]);

const CONDUCTOR_BUNDLE_ID = 'com.conductor.app';
const COMPOSER_CLASSES = [
  'tiptap',
  'ProseMirror',
  'composer-tiptap-editor',
];
const SEND_CLASSES = [
  'ml-1',
  'bg-foreground',
  'hover:bg-foreground/80',
];
const NON_SEND_CLASSES = [
  'bg-foreground/50',
  'cursor-not-allowed',
  'hover:bg-muted',
  'border',
];
const QUEUED_EDIT_MARKER = 'Editing queued message';
const QUEUED_EDIT_PLACEHOLDER = 'Edit queued message';
const MAX_PRE_TRANSCRIPT_CONTROLS = 1;
const MAX_QUEUED_EDIT_CONTEXT_SIBLINGS = 8;
const MAX_QUEUED_EDIT_CONTEXT_CHILDREN = 8;
const MAX_QUEUED_EDIT_CONTEXT_NODES = 96;
const MAX_MESSAGE_BYTES = 16 * 1024;
const MAX_CHUNK_UTF16 = 256;
const MIN_PHYSICAL_IDLE_SECONDS = 1;
const PHYSICAL_INPUT_EVENT_TYPES = [
  $.kCGEventLeftMouseDown,
  $.kCGEventLeftMouseUp,
  $.kCGEventRightMouseDown,
  $.kCGEventRightMouseUp,
  $.kCGEventMouseMoved,
  $.kCGEventLeftMouseDragged,
  $.kCGEventRightMouseDragged,
  $.kCGEventKeyDown,
  $.kCGEventKeyUp,
  $.kCGEventFlagsChanged,
  $.kCGEventScrollWheel,
  $.kCGEventTabletPointer,
  $.kCGEventTabletProximity,
  $.kCGEventOtherMouseDown,
  $.kCGEventOtherMouseUp,
  $.kCGEventOtherMouseDragged,
];
const KEY_A = 0;
const KEY_DELETE = 51;
const KEY_RETURN = 36;
const CERTIFIABLE_PRE_SEND_CODES = [
  'composer_focus_changed',
  'composer_update_failed',
  'draft_changed',
  'route_changed',
  'send_unavailable',
];

function fail(code) {
  const error = new Error(code);
  error.pocketCode = code;
  throw error;
}

function environmentValue(name) {
  const value = $.NSProcessInfo.processInfo.environment.objectForKey(name);
  return value ? ObjC.unwrap(value) : null;
}

function decodeBase64Environment(name) {
  const encoded = environmentValue(name);
  if (typeof encoded !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) {
    fail('invalid_encoding');
  }
  if (!encoded) return '';
  const data = $.NSData.alloc.initWithBase64EncodedStringOptions($(encoded), 0);
  if (!data) fail('invalid_encoding');
  const decoded = $.NSString.alloc.initWithDataEncoding(
    data,
    $.NSUTF8StringEncoding,
  );
  if (!decoded) fail('invalid_encoding');
  const value = ObjC.unwrap(decoded);
  if (!isWellFormed(value)) fail('invalid_encoding');
  return value;
}

function encodeBase64(value) {
  const data = $(value).dataUsingEncoding($.NSUTF8StringEncoding);
  if (!data) fail('invalid_encoding');
  return ObjC.unwrap(data.base64EncodedStringWithOptions(0));
}

function workspaceMatches(workspaceName, candidateName) {
  return (
    candidateName === workspaceName ||
    candidateName.startsWith(`${workspaceName} +`)
  );
}

function isWellFormed(value) {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
      index += 1;
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      return false;
    }
  }
  return true;
}

function normalizedDraft(rawValue) {
  const value = typeof rawValue === 'string' ? rawValue : '';
  return value.endsWith('\n') ? value.slice(0, -1) : value;
}

function assertSessionUnlocked() {
  const sessionRef = $.CGSessionCopyCurrentDictionary();
  if (!sessionRef) fail('session_locked');
  const state = ObjC.deepUnwrap(ObjC.castRefToObject(sessionRef));
  if (
    !state ||
    state.kCGSessionLoginDoneKey !== true ||
    state.kCGSSessionOnConsoleKey !== true ||
    state.CGSSessionScreenIsLocked === true
  ) {
    fail('session_locked');
  }
}

function childElements(element) {
  try {
    return element.uiElements();
  } catch {
    return [];
  }
}

function webAreaRootElements(process) {
  let webArea;
  try {
    webArea = process.windows[0]
      .groups[0]
      .groups[0]
      .scrollAreas[0]
      .uiElements[0];
  } catch {
    fail('route_changed');
  }
  const rootElements = childElements(webArea);
  if (rootElements.length < 3) fail('route_changed');
  return rootElements;
}

function routeElements(element) {
  try {
    const elements = element.uiElements();
    if (!elements || typeof elements.length !== 'number') {
      fail('route_changed');
    }
    return elements;
  } catch (error) {
    if (error?.pocketCode === 'route_changed') throw error;
    fail('route_changed');
  }
}

function routeTarget() {
  const workspaceName = environmentValue('POCKET_WORKSPACE_NAME');
  const sessionTitle = environmentValue('POCKET_SESSION_TITLE');
  const sessionOrdinal = Number(environmentValue('POCKET_SESSION_ORDINAL'));
  if (
    typeof workspaceName !== 'string' ||
    !workspaceName ||
    typeof sessionTitle !== 'string' ||
    !sessionTitle ||
    !Number.isSafeInteger(sessionOrdinal) ||
    sessionOrdinal <= 0
  ) {
    fail('route_changed');
  }
  const hintValues = [
    environmentValue('POCKET_WORKSPACE_CONTAINER_INDEX'),
    environmentValue('POCKET_WORKSPACE_LINK_INDEX'),
    environmentValue('POCKET_WORKSPACE_SIDEBAR_CHILD_COUNT'),
    environmentValue('POCKET_WORKSPACE_CONTAINER_CHILD_COUNT'),
  ];
  const hintProvided = hintValues.some((value) => value !== null);
  let workspaceHint = null;
  if (hintProvided) {
    if (hintValues.some((value) => value === null)) {
      fail('route_changed');
    }
    const [
      containerIndex,
      linkIndex,
      sidebarChildCount,
      containerChildCount,
    ] = hintValues.map(Number);
    if (
      !Number.isSafeInteger(containerIndex) ||
      containerIndex < 0 ||
      !Number.isSafeInteger(linkIndex) ||
      linkIndex < 0 ||
      !Number.isSafeInteger(sidebarChildCount) ||
      sidebarChildCount <= 0 ||
      !Number.isSafeInteger(containerChildCount) ||
      containerChildCount <= 0
    ) {
      fail('route_changed');
    }
    workspaceHint = {
      containerChildCount,
      path: [containerIndex, linkIndex],
      sidebarChildCount,
    };
  }
  return {
    sessionOrdinal,
    sessionTitle,
    workspaceHint,
    workspaceName,
  };
}

function routeRole(element) {
  try {
    return element.role();
  } catch {
    fail('route_changed');
  }
}

function routeName(element) {
  try {
    return element.name();
  } catch {
    fail('route_changed');
  }
}

function routeClasses(element) {
  try {
    const classes = element.attributes.byName('AXDOMClassList').value();
    if (!Array.isArray(classes)) fail('route_changed');
    return classes;
  } catch (error) {
    if (error?.pocketCode === 'route_changed') throw error;
    fail('route_changed');
  }
}

function routeSelected(element) {
  try {
    return Boolean(element.value());
  } catch {
    fail('route_changed');
  }
}

function sessionRadioTopology(tabGroup) {
  const topology = [];
  const tabChildren = routeElements(tabGroup);
  for (
    let childIndex = 0;
    childIndex < tabChildren.length;
    childIndex += 1
  ) {
    const tabChild = tabChildren[childIndex];
    if (routeRole(tabChild) === 'AXRadioButton') {
      topology.push({
        element: tabChild,
        name: routeName(tabChild),
        path: [childIndex],
        selected: routeSelected(tabChild),
      });
      continue;
    }
    const nestedChildren = routeElements(tabChild);
    for (
      let nestedIndex = 0;
      nestedIndex < nestedChildren.length;
      nestedIndex += 1
    ) {
      const nested = nestedChildren[nestedIndex];
      if (routeRole(nested) !== 'AXRadioButton') continue;
      topology.push({
        element: nested,
        name: routeName(nested),
        path: [childIndex, nestedIndex],
        selected: routeSelected(nested),
      });
    }
  }
  return topology;
}

function acquireRouteLease(process, target = routeTarget()) {
  const rootElements = webAreaRootElements(process);
  const sidebarElements = routeElements(rootElements[1]);
  let workspace;
  if (target.workspaceHint) {
    const {
      containerChildCount,
      path,
      sidebarChildCount,
    } = target.workspaceHint;
    if (
      !Array.isArray(path) ||
      path.length !== 2 ||
      sidebarElements.length !== sidebarChildCount
    ) {
      fail('route_changed');
    }
    const container = sidebarElements[path[0]];
    if (!container) fail('route_changed');
    const links = routeElements(container);
    const link = links[path[1]];
    if (
      links.length !== containerChildCount ||
      !link ||
      routeRole(link) !== 'AXLink' ||
      !workspaceMatches(target.workspaceName, routeName(link)) ||
      !routeClasses(link).includes('bg-sidebar-accent')
    ) {
      fail('route_changed');
    }
    workspace = {
      containerChildCount,
      path: path.slice(),
    };
  } else {
    const workspaceCandidates = [];
    for (
      let containerIndex = 0;
      containerIndex < sidebarElements.length;
      containerIndex += 1
    ) {
      const links = routeElements(sidebarElements[containerIndex]);
      for (let linkIndex = 0; linkIndex < links.length; linkIndex += 1) {
        const link = links[linkIndex];
        if (routeRole(link) !== 'AXLink') continue;
        if (!workspaceMatches(target.workspaceName, routeName(link))) continue;
        workspaceCandidates.push({
          classes: routeClasses(link),
          containerChildCount: links.length,
          path: [containerIndex, linkIndex],
        });
      }
    }
    if (
      workspaceCandidates.length !== 1 ||
      !workspaceCandidates[0].classes.includes('bg-sidebar-accent')
    ) {
      fail('route_changed');
    }
    workspace = workspaceCandidates[0];
  }

  const mainElements = routeElements(rootElements[2]);
  let tabGroupIndex = -1;
  for (let index = 0; index < mainElements.length; index += 1) {
    if (routeRole(mainElements[index]) !== 'AXTabGroup') continue;
    if (tabGroupIndex >= 0) fail('route_changed');
    tabGroupIndex = index;
  }
  if (tabGroupIndex < 0) fail('route_changed');

  const sessionName = `Close chat ${target.sessionTitle}`;
  const sessionTopology = sessionRadioTopology(
    mainElements[tabGroupIndex],
  );
  const matchingSessions = sessionTopology.filter(
    (entry) => entry.name === sessionName,
  );
  if (matchingSessions.length < target.sessionOrdinal) {
    fail('route_changed');
  }
  const targetSession = matchingSessions[target.sessionOrdinal - 1];
  if (
    !targetSession.selected ||
    sessionTopology.filter((entry) => entry.selected).length !== 1
  ) {
    fail('route_changed');
  }

  return Object.freeze({
    mainChildCount: mainElements.length,
    sessionName,
    sessionOrdinal: target.sessionOrdinal,
    sessionTopology: Object.freeze(
      sessionTopology.map((entry) =>
        Object.freeze({
          name: entry.name,
          path: Object.freeze(entry.path.slice()),
        }),
      ),
    ),
    sidebarChildCount: sidebarElements.length,
    tabGroupIndex,
    targetSessionPath: Object.freeze(targetSession.path.slice()),
    workspaceContainerChildCount: workspace.containerChildCount,
    workspaceName: target.workspaceName,
    workspacePath: Object.freeze(workspace.path.slice()),
  });
}

function sameRoutePath(left, right) {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function assertRouteLease(process, lease) {
  if (
    !lease ||
    typeof lease.workspaceName !== 'string' ||
    !Array.isArray(lease.workspacePath) ||
    !Array.isArray(lease.targetSessionPath) ||
    !Array.isArray(lease.sessionTopology)
  ) {
    fail('route_changed');
  }

  const rootElements = webAreaRootElements(process);
  const sidebarElements = routeElements(rootElements[1]);
  if (sidebarElements.length !== lease.sidebarChildCount) {
    fail('route_changed');
  }
  const workspaceContainer =
    sidebarElements[lease.workspacePath[0]];
  if (!workspaceContainer) fail('route_changed');
  const workspaceLinks = routeElements(workspaceContainer);
  if (
    workspaceLinks.length !== lease.workspaceContainerChildCount
  ) {
    fail('route_changed');
  }
  const workspaceLink = workspaceLinks[lease.workspacePath[1]];
  if (
    !workspaceLink ||
    routeRole(workspaceLink) !== 'AXLink' ||
    !workspaceMatches(lease.workspaceName, routeName(workspaceLink)) ||
    !routeClasses(workspaceLink).includes('bg-sidebar-accent')
  ) {
    fail('route_changed');
  }

  const mainElements = routeElements(rootElements[2]);
  if (mainElements.length !== lease.mainChildCount) {
    fail('route_changed');
  }
  const tabGroup = mainElements[lease.tabGroupIndex];
  if (!tabGroup || routeRole(tabGroup) !== 'AXTabGroup') {
    fail('route_changed');
  }
  const currentTopology = sessionRadioTopology(tabGroup);
  if (currentTopology.length !== lease.sessionTopology.length) {
    fail('route_changed');
  }
  for (let index = 0; index < currentTopology.length; index += 1) {
    const current = currentTopology[index];
    const expected = lease.sessionTopology[index];
    if (
      current.name !== expected.name ||
      !sameRoutePath(current.path, expected.path)
    ) {
      fail('route_changed');
    }
  }
  const matchingSessions = currentTopology.filter(
    (entry) => entry.name === lease.sessionName,
  );
  if (matchingSessions.length < lease.sessionOrdinal) {
    fail('route_changed');
  }
  const targetSession = matchingSessions[lease.sessionOrdinal - 1];
  if (
    !sameRoutePath(targetSession.path, lease.targetSessionPath) ||
    !targetSession.selected ||
    currentTopology.filter((entry) => entry.selected).length !== 1
  ) {
    fail('route_changed');
  }
}

function validatedConductorProcess(pid) {
  assertSessionUnlocked();
  const conductor = $.NSRunningApplication.runningApplicationWithProcessIdentifier(
    pid,
  );
  if (!conductor || ObjC.unwrap(conductor.bundleIdentifier) !== CONDUCTOR_BUNDLE_ID) {
    fail('invalid_target_process');
  }
  if (!Boolean(conductor.active)) fail('target_not_active');

  const systemEvents = Application('System Events');
  const process = systemEvents.processes.byName('Conductor');
  if (!process.exists() || Number(process.unixId()) !== pid || !process.frontmost()) {
    fail('invalid_target_process');
  }
  return process;
}

function validateFocusedComposer(pid, expectedDraft = null) {
  const process = validatedConductorProcess(pid);
  let focusedElement;
  let classes;
  try {
    focusedElement = process.attributes
      .byName('AXFocusedUIElement')
      .value();
    classes = focusedElement.attributes
      .byName('AXDOMClassList')
      .value();
  } catch {
    fail('composer_focus_changed');
  }
  if (
    focusedElement.role() !== 'AXTextArea' ||
    !Array.isArray(classes) ||
    !COMPOSER_CLASSES.every((name) => classes.includes(name))
  ) {
    fail('composer_focus_changed');
  }
  if (
    typeof expectedDraft === 'string' &&
    normalizedDraft(focusedElement.value()) !== expectedDraft
  ) {
    fail('draft_changed');
  }
  return process;
}

function eventPair(source, virtualKey, flags = 0) {
  const keyDown = $.CGEventCreateKeyboardEvent(source, virtualKey, true);
  const keyUp = $.CGEventCreateKeyboardEvent(source, virtualKey, false);
  if (!keyDown || !keyUp) fail('event_create_failed');
  $.CGEventSetFlags(keyDown, flags);
  $.CGEventSetFlags(keyUp, flags);
  return [keyDown, keyUp];
}

function buildUnicodeEvents(source, chunk) {
  if (
    typeof chunk !== 'string' ||
    !chunk.length ||
    chunk.length > MAX_CHUNK_UTF16 ||
    !isWellFormed(chunk) ||
    chunk.includes('\0') ||
    /[\u0001-\u001f\u007f]/.test(chunk)
  ) {
    fail('invalid_chunk');
  }

  const [keyDown, keyUp] = eventPair(source, KEY_A);

  const utf16 = $(chunk).dataUsingEncoding($.NSUTF16LittleEndianStringEncoding);
  if (!utf16 || Number(utf16.length) !== chunk.length * 2) {
    fail('utf16_encode_failed');
  }
  $.CGEventKeyboardSetUnicodeString(keyDown, chunk.length, utf16.bytes);
  const roundTrip = $.NSEvent.eventWithCGEvent(keyDown);
  if (!roundTrip || ObjC.unwrap(roundTrip.characters) !== chunk) {
    fail('unicode_roundtrip_failed');
  }
  return { keyDown, keyUp, utf16 };
}

function physicalIdleSeconds() {
  return Number(
    $.CGEventSourceSecondsSinceLastEventType(
      $.kCGEventSourceStateHIDSystemState,
      $.kCGAnyInputEventType,
    ),
  );
}

function physicalInputCounters() {
  return PHYSICAL_INPUT_EVENT_TYPES.map((eventType) =>
    Number(
      $.CGEventSourceCounterForEventType(
        $.kCGEventSourceStateHIDSystemState,
        eventType,
      ),
    ),
  );
}

function sameCounters(left, right) {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function expectedInputCounters() {
  const encoded = environmentValue('POCKET_EXPECTED_INPUT_COUNTERS');
  if (encoded === null || encoded === '') return null;
  const counters = encoded.split(',');
  if (
    counters.length !== PHYSICAL_INPUT_EVENT_TYPES.length ||
    counters.some((counter) => !/^(?:0|[1-9][0-9]*)$/.test(counter))
  ) {
    fail('user_input_active');
  }
  const parsed = counters.map(Number);
  if (
    parsed.some(
      (counter) => !Number.isSafeInteger(counter) || counter < 0,
    )
  ) {
    fail('user_input_active');
  }
  return parsed;
}

function physicalInputSnapshot() {
  const countersBefore = physicalInputCounters();
  const idleSeconds = physicalIdleSeconds();
  const countersAfter = physicalInputCounters();
  if (
    !Number.isFinite(idleSeconds) ||
    countersBefore.some(
      (counter) => !Number.isSafeInteger(counter) || counter < 0,
    ) ||
    countersAfter.some(
      (counter) => !Number.isSafeInteger(counter) || counter < 0,
    ) ||
    !sameCounters(countersBefore, countersAfter)
  ) {
    fail('user_input_active');
  }
  return { idleSeconds, inputCounters: countersAfter };
}

function acquireInputLease() {
  const snapshot = physicalInputSnapshot();
  if (snapshot.idleSeconds < MIN_PHYSICAL_IDLE_SECONDS) {
    fail('user_input_active');
  }
  return {
    inputCounters: snapshot.inputCounters,
    syntheticInputPosted: false,
  };
}

function waitForInputIdle(timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  do {
    try {
      acquireInputLease();
      return true;
    } catch (error) {
      if (error?.pocketCode !== 'user_input_active') throw error;
    }
    delay(0.1);
  } while (Date.now() < deadline);
  return false;
}

function assertInputLease(lease) {
  const snapshot = physicalInputSnapshot();
  if (
    !sameCounters(snapshot.inputCounters, lease.inputCounters) ||
    (!lease.syntheticInputPosted &&
      snapshot.idleSeconds < MIN_PHYSICAL_IDLE_SECONDS)
  ) {
    fail('user_input_active');
  }
}

function exposureError(error, exposedAt) {
  const result =
    error && typeof error === 'object'
      ? error
      : new Error(String(error));
  result.pocketExactDraftExposedAt = exposedAt;
  return result;
}

function postToConductor(
  pid,
  lease,
  events,
  exactDraftMayBeExposedAt = 0,
) {
  assertInputLease(lease);
  assertSessionUnlocked();
  let eventPosted = false;
  try {
    for (const event of events) {
      $.CGEventPostToPid(pid, event);
      eventPosted = true;
      // The aggregate HID idle timer includes the first targeted synthetic
      // event on macOS. Per-type HID counters do not, so they remain the
      // physical-input proof after this point.
      lease.syntheticInputPosted = true;
    }
    delay(0.03);
    assertSessionUnlocked();
    assertInputLease(lease);
  } catch (error) {
    if (eventPosted && exactDraftMayBeExposedAt > 0) {
      throw exposureError(error, exactDraftMayBeExposedAt);
    }
    throw error;
  }
}

function unicodeChunks(value) {
  const chunks = [];
  let chunk = '';
  for (const scalar of value) {
    if (chunk && chunk.length + scalar.length > MAX_CHUNK_UTF16) {
      chunks.push(chunk);
      chunk = '';
    }
    chunk += scalar;
  }
  if (chunk) chunks.push(chunk);
  return chunks;
}

function prepareInput(message) {
  const source = $.CGEventSourceCreate($.kCGEventSourceStatePrivate);
  if (!source) fail('event_source_failed');
  const operations = [];
  const lines = message.split('\n');
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    for (const chunk of unicodeChunks(lines[lineIndex])) {
      const unicodeEvents = buildUnicodeEvents(source, chunk);
      operations.push({
        text: chunk,
        events: [unicodeEvents.keyDown, unicodeEvents.keyUp],
        backing: unicodeEvents.utf16,
      });
    }
    if (lineIndex + 1 < lines.length) {
      operations.push({
        text: '\n',
        events: eventPair(source, KEY_RETURN, $.kCGEventFlagMaskShift),
        backing: null,
      });
    }
  }
  return {
    source,
    clearEvents: [
      ...eventPair(source, KEY_A, $.kCGEventFlagMaskCommand),
      ...eventPair(source, KEY_DELETE),
    ],
    operations,
  };
}

function focusedDraft(process) {
  try {
    const focusedElement = process.attributes
      .byName('AXFocusedUIElement')
      .value();
    return normalizedDraft(focusedElement.value());
  } catch {
    fail('composer_focus_changed');
  }
}

function hasStaticTextInBoundedTree(element, expectedTexts, budget) {
  if (budget.remaining <= 0) fail('send_unavailable');
  budget.remaining -= 1;
  let role;
  try {
    role = element.role();
  } catch {
    fail('send_unavailable');
  }
  if (role === 'AXStaticText') {
    let nameReadable = false;
    let valueReadable = false;
    try {
      const elementName = element.name();
      nameReadable = true;
      if (expectedTexts.includes(elementName)) return true;
    } catch {
      // Try the value independently.
    }
    try {
      const elementValue = element.value();
      valueReadable = true;
      if (expectedTexts.includes(elementValue)) return true;
    } catch {
      // Fail below unless the name was independently readable.
    }
    if (!nameReadable || !valueReadable) fail('send_unavailable');
  }

  let children;
  try {
    children = element.uiElements();
  } catch {
    fail('send_unavailable');
  }
  if (!children || typeof children.length !== 'number') {
    fail('send_unavailable');
  }
  for (const child of children) {
    if (hasStaticTextInBoundedTree(child, expectedTexts, budget)) return true;
  }
  return false;
}

function composerSendContext(process) {
  const main = webAreaRootElements(process)[2];
  const mainElements = childElements(main);
  let composer = null;
  let composerIndex = -1;
  let tabGroupCount = 0;
  let tabGroupIndex = -1;
  const mainRoles = [];
  for (let index = 0; index < mainElements.length; index += 1) {
    const candidate = mainElements[index];
    let role;
    let description;
    try {
      role = candidate.role();
      description = candidate.description();
    } catch {
      fail('send_unavailable');
    }
    mainRoles.push(role);
    if (role === 'AXTabGroup') {
      tabGroupCount += 1;
      tabGroupIndex = index;
    }
    if (description !== 'composer') continue;
    if (composer) fail('send_unavailable');
    composer = candidate;
    composerIndex = index;
  }
  if (
    !composer ||
    tabGroupCount !== 1 ||
    tabGroupIndex < 0 ||
    tabGroupIndex >= composerIndex - 1
  ) {
    fail('send_unavailable');
  }

  let transcriptBoundaryIndex = -1;
  for (
    let index = tabGroupIndex + 1;
    index < composerIndex;
    index += 1
  ) {
    if (mainRoles[index] === 'AXGroup') {
      transcriptBoundaryIndex = index;
      break;
    }
    let candidateChildren;
    let pressActionCount;
    try {
      candidateChildren = mainElements[index].uiElements();
      pressActionCount = mainElements[index]
        .actions()
        .filter((action) => action.name() === 'AXPress')
        .length;
    } catch {
      fail('send_unavailable');
    }
    if (
      mainRoles[index] !== 'AXPopUpButton' ||
      !candidateChildren ||
      typeof candidateChildren.length !== 'number' ||
      candidateChildren.length !== 0 ||
      pressActionCount !== 1
    ) {
      fail('send_unavailable');
    }
  }
  if (
    transcriptBoundaryIndex < 0 ||
    transcriptBoundaryIndex - tabGroupIndex - 1 >
      MAX_PRE_TRANSCRIPT_CONTROLS
  ) {
    fail('send_unavailable');
  }

  const contextElements = mainElements.slice(
    transcriptBoundaryIndex + 1,
    composerIndex + 1,
  );
  if (
    contextElements.length < 1 ||
    contextElements.length > MAX_QUEUED_EDIT_CONTEXT_SIBLINGS + 1
  ) {
    fail('send_unavailable');
  }
  for (const candidate of contextElements.slice(0, -1)) {
    let candidateChildren;
    try {
      candidateChildren = candidate.uiElements();
    } catch {
      fail('send_unavailable');
    }
    if (
      !candidateChildren ||
      typeof candidateChildren.length !== 'number' ||
      candidateChildren.length > MAX_QUEUED_EDIT_CONTEXT_CHILDREN
    ) {
      fail('send_unavailable');
    }
  }
  return { composer, contextElements };
}

function assertNotQueuedEditMode(process) {
  const { composer, contextElements } = composerSendContext(process);
  const budget = { remaining: MAX_QUEUED_EDIT_CONTEXT_NODES };
  if (
    contextElements.slice(0, -1).some((candidate) =>
      hasStaticTextInBoundedTree(
        candidate,
        [QUEUED_EDIT_MARKER],
        budget,
      )
    ) ||
    hasStaticTextInBoundedTree(
      composer,
      [QUEUED_EDIT_MARKER, QUEUED_EDIT_PLACEHOLDER],
      budget,
    )
  ) {
    fail('send_unavailable');
  }
  return composer;
}

function uniqueComposerDraft(process) {
  const composer = assertNotQueuedEditMode(process);
  const textAreas = childElements(composer).filter((candidate) => {
    try {
      const classes = candidate.attributes
        .byName('AXDOMClassList')
        .value();
      return (
        candidate.role() === 'AXTextArea' &&
        Array.isArray(classes) &&
        COMPOSER_CLASSES.every((name) => classes.includes(name))
      );
    } catch {
      return false;
    }
  });
  if (textAreas.length !== 1) fail('send_unavailable');
  return normalizedDraft(textAreas[0].value());
}

function certifyPreSendRetry({
  error,
  pid,
  inputLease,
  routeLease,
  lastProvenPrefix,
  lastAttemptedPrefix,
  message,
}) {
  const trackedPrefixes = [
    lastProvenPrefix,
    lastAttemptedPrefix,
  ].filter(
    (prefix, index, values) =>
      typeof prefix === 'string' &&
      prefix !== message &&
      (prefix === '' || message.startsWith(prefix)) &&
      values.indexOf(prefix) === index,
  );
  if (
    !CERTIFIABLE_PRE_SEND_CODES.includes(error?.pocketCode) ||
    !inputLease ||
    !routeLease ||
    trackedPrefixes.length === 0
  ) {
    return null;
  }
  try {
    assertInputLease(inputLease);
    let process = validatedConductorProcess(pid);
    assertRouteLease(process, routeLease);
    const firstDraft = uniqueComposerDraft(process);
    assertInputLease(inputLease);
    process = validatedConductorProcess(pid);
    assertRouteLease(process, routeLease);
    const secondDraft = uniqueComposerDraft(process);
    assertRouteLease(process, routeLease);
    assertInputLease(inputLease);
    if (
      firstDraft !== secondDraft ||
      !trackedPrefixes.includes(firstDraft)
    ) {
      return null;
    }
    return encodeBase64(
      JSON.stringify({
        draftBase64: encodeBase64(firstDraft),
        inputCounters: inputLease.inputCounters.join(','),
      }),
    );
  } catch {
    return null;
  }
}

function resolveComposerSend(process, expectedDraft) {
  const composer = assertNotQueuedEditMode(process);
  const composerElements = childElements(composer);
  const textAreas = composerElements.filter((candidate) => {
    try {
      const classes = candidate.attributes
        .byName('AXDOMClassList')
        .value();
      return (
        candidate.role() === 'AXTextArea' &&
        candidate.focused() === true &&
        Array.isArray(classes) &&
        COMPOSER_CLASSES.every((name) => classes.includes(name)) &&
        normalizedDraft(candidate.value()) === expectedDraft
      );
    } catch {
      return false;
    }
  });
  if (textAreas.length !== 1) fail('send_unavailable');

  const buttons = composerElements.filter((candidate) => {
    try {
      const classes = candidate.attributes
        .byName('AXDOMClassList')
        .value();
      const pressActions = candidate
        .actions()
        .filter((action) => action.name() === 'AXPress');
      return (
        candidate.role() === 'AXButton' &&
        candidate.enabled() === true &&
        Array.isArray(classes) &&
        SEND_CLASSES.every((name) => classes.includes(name)) &&
        NON_SEND_CLASSES.every((name) => !classes.includes(name)) &&
        pressActions.length === 1
      );
    } catch {
      return false;
    }
  });
  if (buttons.length !== 1) fail('send_unavailable');
  return buttons[0];
}

function waitForExactDraft(pid, expectedDraft, routeLease) {
  for (let attempt = 0; attempt < 75; attempt += 1) {
    const process = validateFocusedComposer(pid);
    assertRouteLease(process, routeLease);
    const refreshed = validateFocusedComposer(pid);
    if (focusedDraft(refreshed) === expectedDraft) return;
    delay(0.02);
  }
  fail('composer_update_failed');
}

function waitForComposerSend(
  pid,
  expectedDraft,
  inputLease,
  routeLease,
) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    assertInputLease(inputLease);
    const process = validateFocusedComposer(pid, expectedDraft);
    assertRouteLease(process, routeLease);
    const refreshed = validateFocusedComposer(pid, expectedDraft);
    try {
      return resolveComposerSend(refreshed, expectedDraft);
    } catch (error) {
      if (error?.pocketCode !== 'send_unavailable') throw error;
    }
    delay(0.02);
  }
  fail('send_unavailable');
}

function typeAndSendMessage(pid) {
  const message = decodeBase64Environment('POCKET_MESSAGE_BASE64');
  const expectedDraft = decodeBase64Environment(
    'POCKET_EXPECTED_DRAFT_BASE64',
  );
  const replaceDraft = environmentValue('POCKET_REPLACE_DRAFT') === 'true';
  const attemptStartedAt = Number(
    environmentValue('POCKET_ATTEMPT_STARTED_AT'),
  );
  const messageData = $(message).dataUsingEncoding($.NSUTF8StringEncoding);
  if (
    !message.length ||
    !messageData ||
    Number(messageData.length) > MAX_MESSAGE_BYTES ||
    message.includes('\0') ||
    /[\u0001-\u0009\u000b-\u001f\u007f]/.test(message) ||
    !Number.isSafeInteger(attemptStartedAt) ||
    attemptStartedAt <= 0 ||
    attemptStartedAt > Date.now()
  ) {
    fail('invalid_message');
  }
  const carriedInputCounters = expectedInputCounters();

  // Allocate and round-trip every event before clearing an owned draft.
  const prepared = prepareInput(message);
  let inputLease = null;
  let routeLease = null;
  let lastProvenPrefix = null;
  let lastAttemptedPrefix = null;
  let exactDraftExposedAt = 0;
  let pressInvokedAt = 0;
  try {
    inputLease = acquireInputLease();
    if (
      carriedInputCounters &&
      !sameCounters(
        inputLease.inputCounters,
        carriedInputCounters,
      )
    ) {
      fail('user_input_active');
    }
    assertSessionUnlocked();
    let process = validateFocusedComposer(pid);
    routeLease = acquireRouteLease(process);
    assertNotQueuedEditMode(process);
    process = validateFocusedComposer(pid);
    const draftReadStartedAt = Date.now();
    const currentDraft = focusedDraft(process);
    if (currentDraft === message) {
      exactDraftExposedAt = draftReadStartedAt;
    } else {
      if (!replaceDraft && currentDraft !== '') fail('draft_conflict');
      if (replaceDraft && currentDraft !== expectedDraft) fail('draft_conflict');
      if (currentDraft === '') lastProvenPrefix = '';

      if (currentDraft !== '') {
        process = validateFocusedComposer(pid, currentDraft);
        assertRouteLease(process, routeLease);
        validateFocusedComposer(pid, currentDraft);
        postToConductor(pid, inputLease, prepared.clearEvents);
        waitForExactDraft(pid, '', routeLease);
        lastProvenPrefix = '';
      }

      let committedPrefix = '';
      for (const operation of prepared.operations) {
        process = validateFocusedComposer(pid, committedPrefix);
        assertRouteLease(process, routeLease);
        validateFocusedComposer(pid, committedPrefix);
        const nextPrefix = committedPrefix + operation.text;
        const possibleExposureAt =
          nextPrefix === message ? Date.now() : 0;
        postToConductor(
          pid,
          inputLease,
          operation.events,
          possibleExposureAt,
        );
        lastAttemptedPrefix = nextPrefix;
        if (possibleExposureAt > 0) {
          exactDraftExposedAt = possibleExposureAt;
        }
        waitForExactDraft(pid, nextPrefix, routeLease);
        committedPrefix = nextPrefix;
        lastProvenPrefix = nextPrefix;
        lastAttemptedPrefix = null;
        if (operation.backing) Number(operation.backing.length);
      }
    }

    if (exactDraftExposedAt <= 0) fail('draft_changed');
    assertInputLease(inputLease);
    process = validateFocusedComposer(pid, message);
    assertRouteLease(process, routeLease);
    waitForComposerSend(pid, message, inputLease, routeLease);
    process = validateFocusedComposer(pid, message);
    assertRouteLease(process, routeLease);
    process = validateFocusedComposer(pid, message);
    const sendButton = resolveComposerSend(process, message);
    assertRouteLease(process, routeLease);
    assertInputLease(inputLease);
    assertSessionUnlocked();
    pressInvokedAt = Date.now();
    sendButton.actions.byName('AXPress').perform();
    assertSessionUnlocked();
    assertInputLease(inputLease);
    return `pressed:${pressInvokedAt}`;
  } catch (error) {
    const possibleExposureAt = Number(
      error?.pocketExactDraftExposedAt,
    );
    if (
      exactDraftExposedAt <= 0 &&
      Number.isSafeInteger(possibleExposureAt) &&
      possibleExposureAt > 0
    ) {
      exactDraftExposedAt = possibleExposureAt;
    }
    let inputInterrupted = error?.pocketCode === 'user_input_active';
    if (!inputInterrupted && inputLease) {
      try {
        assertInputLease(inputLease);
      } catch (leaseError) {
        inputInterrupted =
          leaseError?.pocketCode === 'user_input_active';
      }
    }
    if (pressInvokedAt > 0 || exactDraftExposedAt > 0) {
      return `ambiguous:${
        pressInvokedAt || exactDraftExposedAt || attemptStartedAt
      }`;
    }
    if (inputInterrupted) return `interrupted:${attemptStartedAt}`;
    if (error?.pocketCode === 'session_locked') return 'session_locked';
    const retryCertificate = certifyPreSendRetry({
      error,
      pid,
      inputLease,
      routeLease,
      lastProvenPrefix,
      lastAttemptedPrefix,
      message,
    });
    if (retryCertificate) return `retryable:${retryCertificate}`;
    throw error;
  }
}

function run(argv) {
  if (!Boolean($.AXIsProcessTrusted())) fail('accessibility_disabled');

  const pid = Number(argv[0]);
  if (!Number.isSafeInteger(pid) || pid <= 0) fail('invalid_target_pid');

  const operation = environmentValue('POCKET_OPERATION');
  if (operation === 'doctor') {
    assertSessionUnlocked();
    validateFocusedComposer(pid);
    return 'ready';
  }
  if (operation === 'route-check') {
    assertSessionUnlocked();
    const process = validateFocusedComposer(pid);
    const routeLease = acquireRouteLease(process);
    const refreshed = validateFocusedComposer(pid);
    assertRouteLease(refreshed, routeLease);
    validateFocusedComposer(pid);
    return 'ready';
  }
  if (operation === 'input-check') {
    assertSessionUnlocked();
    return waitForInputIdle() ? 'ready' : 'busy';
  }
  if (operation === 'type-and-send') return typeAndSendMessage(pid);
  fail('invalid_operation');
}
