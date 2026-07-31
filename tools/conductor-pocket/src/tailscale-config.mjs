import { isDeepStrictEqual } from 'node:util';

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function walk(value, visitor) {
  if (!isObject(value) && !Array.isArray(value)) return;
  visitor(value);
  for (const child of Object.values(value)) walk(child, visitor);
}

function hasEnabledValue(value) {
  if (value === true) return true;
  if (Array.isArray(value)) return value.some(hasEnabledValue);
  if (isObject(value)) return Object.values(value).some(hasEnabledValue);
  return false;
}

function handlersFor(status, rpId) {
  return status?.Web?.[`${rpId}:443`]?.Handlers || {};
}

function normalizedServeStatus(value) {
  const normalized = structuredClone(value);
  if (isObject(normalized.AllowFunnel) && !hasEnabledValue(normalized.AllowFunnel)) {
    delete normalized.AllowFunnel;
  }
  return normalized;
}

export function assertNoFunnel(status) {
  if (!isObject(status)) {
    throw new Error('Tailscale returned an invalid status document');
  }
  let funnelEnabled = false;
  walk(status, (value) => {
    if (isObject(value) && hasEnabledValue(value.AllowFunnel)) {
      funnelEnabled = true;
    }
  });
  if (funnelEnabled) {
    throw new Error('Tailscale unexpectedly enabled public Funnel access');
  }
}

export function runningTailscaleIdentity(status) {
  if (!isObject(status)) {
    throw new Error('Tailscale returned an invalid status document');
  }
  const dnsName =
    typeof status.Self?.DNSName === 'string'
      ? status.Self.DNSName.replace(/\.$/, '').toLowerCase()
      : '';
  const addresses = Array.isArray(status.Self?.TailscaleIPs)
    ? status.Self.TailscaleIPs.filter((value) => typeof value === 'string')
    : [];
  if (status.BackendState !== 'Running' || !dnsName || addresses.length === 0) {
    throw new Error('The dedicated Tailscale node is not connected');
  }
  return { dnsName, addresses };
}

export function assertSameTailnet(sidecarStatus, mainStatus) {
  const sidecarSuffix =
    sidecarStatus?.CurrentTailnet?.MagicDNSSuffix ||
    sidecarStatus?.MagicDNSSuffix;
  const mainSuffix =
    mainStatus?.CurrentTailnet?.MagicDNSSuffix ||
    mainStatus?.MagicDNSSuffix;
  if (
    typeof sidecarSuffix !== 'string' ||
    typeof mainSuffix !== 'string' ||
    !sidecarSuffix ||
    sidecarSuffix !== mainSuffix
  ) {
    throw new Error('The dedicated node is not authenticated to the Mac tailnet');
  }
}

function explicitEmptyList(prefs, key, { nullAllowed = true } = {}) {
  if (!Object.hasOwn(prefs, key)) return false;
  const value = prefs[key];
  return (
    (nullAllowed && value === null) ||
    (Array.isArray(value) && value.length === 0)
  );
}

export function assertLockedSidecarPrefs(prefs) {
  if (!isObject(prefs)) {
    throw new Error('Tailscale returned invalid sidecar preferences');
  }
  const mismatches = [];
  const requirePreference = (condition, name) => {
    if (!condition) mismatches.push(name);
  };
  requirePreference(prefs.WantRunning === true, 'WantRunning');
  requirePreference(prefs.LoggedOut === false, 'LoggedOut');
  requirePreference(prefs.RouteAll === false, 'RouteAll');
  requirePreference(prefs.CorpDNS === false, 'CorpDNS');
  requirePreference(prefs.RunSSH === false, 'RunSSH');
  requirePreference(prefs.RunWebClient === false, 'RunWebClient');
  requirePreference(prefs.ShieldsUp === false, 'ShieldsUp');
  requirePreference(prefs.PostureChecking === false, 'PostureChecking');
  requirePreference(
    explicitEmptyList(prefs, 'AdvertiseRoutes'),
    'AdvertiseRoutes',
  );
  requirePreference(
    explicitEmptyList(prefs, 'AdvertiseServices'),
    'AdvertiseServices',
  );
  requirePreference(
    explicitEmptyList(prefs, 'AdvertiseTags'),
    'AdvertiseTags',
  );
  requirePreference(
    explicitEmptyList(prefs, 'DriveShares'),
    'DriveShares',
  );
  requirePreference(prefs.ExitNodeID === '', 'ExitNodeID');
  requirePreference(prefs.ExitNodeIP === '', 'ExitNodeIP');
  requirePreference(
    prefs.ExitNodeAllowLANAccess === false,
    'ExitNodeAllowLANAccess',
  );
  requirePreference(
    isObject(prefs.AppConnector) &&
      prefs.AppConnector.Advertise === false,
    'AppConnector.Advertise',
  );
  if (mismatches.length > 0) {
    throw new Error(
      `The dedicated Tailscale node does not match the locked-down Pocket profile: ${mismatches.join(', ')}`,
    );
  }
}

export function assertPrivateServeStatus(status, { rpId, port }) {
  if (!isObject(status)) {
    throw new Error('Tailscale Serve returned an invalid status document');
  }
  const expectedTarget = `http://127.0.0.1:${port}`;
  assertNoFunnel(status);
  const expected = {
    TCP: { 443: { HTTPS: true } },
    Web: {
      [`${rpId}:443`]: {
        Handlers: {
          '/': { Proxy: expectedTarget },
        },
      },
    },
  };
  if (!isDeepStrictEqual(normalizedServeStatus(status), expected)) {
    throw new Error(
      `Tailscale Serve is not the expected private HTTPS root proxy to ${expectedTarget}`,
    );
  }
}

export function pocketRootState(status, { rpId, port }) {
  if (!isObject(status)) {
    throw new Error('Tailscale Serve returned an invalid status document');
  }
  assertNoFunnel(status);
  const root = handlersFor(status, rpId)['/'];
  if (!root) return 'absent';
  return isDeepStrictEqual(root, {
    Proxy: `http://127.0.0.1:${port}`,
  })
    ? 'pocket'
    : 'foreign';
}

export function expectedAfterPocketRootRemoval(before, { rpId, port }) {
  if (pocketRootState(before, { rpId, port }) !== 'pocket') {
    throw new Error('The old Pocket root handler was not the expected proxy');
  }
  const expected = structuredClone(before);
  const listener = `${rpId}:443`;
  delete expected.Web[listener].Handlers['/'];
  if (Object.keys(expected.Web[listener].Handlers).length === 0) {
    delete expected.Web[listener];
  }
  if (Object.keys(expected.Web).length === 0) {
    delete expected.Web;
  }
  const hasHttps443Web = Object.keys(expected.Web || {}).some((key) =>
    key.endsWith(':443'),
  );
  if (
    !hasHttps443Web &&
    isDeepStrictEqual(expected.TCP?.['443'], { HTTPS: true })
  ) {
    delete expected.TCP['443'];
    if (Object.keys(expected.TCP).length === 0) delete expected.TCP;
  }
  return expected;
}

export function assertRootRemovedWithHandlersPreserved(
  before,
  after,
  { rpId, port },
) {
  if (!isObject(before) || !isObject(after)) {
    throw new Error('Tailscale Serve returned an invalid status document');
  }
  assertNoFunnel(before);
  assertNoFunnel(after);
  const expected = expectedAfterPocketRootRemoval(before, { rpId, port });
  if (!isDeepStrictEqual(expected, after)) {
    throw new Error(
      'Tailscale changed unrelated Serve state while removing the Pocket root',
    );
  }
}
