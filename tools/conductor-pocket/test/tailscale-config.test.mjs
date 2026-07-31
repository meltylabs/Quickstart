import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertLockedSidecarPrefs,
  assertNoFunnel,
  assertPrivateServeStatus,
  assertRootRemovedWithHandlersPreserved,
  assertSameTailnet,
  expectedAfterPocketRootRemoval,
  pocketRootState,
  runningTailscaleIdentity,
} from '../src/tailscale-config.mjs';

const expected = {
  TCP: { 443: { HTTPS: true } },
  Web: {
    'mac.example.ts.net:443': {
      Handlers: {
        '/': { Proxy: 'http://127.0.0.1:4317' },
      },
    },
  },
};

test('installer accepts only the exact private HTTPS loopback proxy', () => {
  assert.doesNotThrow(() =>
    assertPrivateServeStatus(expected, {
      rpId: 'mac.example.ts.net',
      port: 4317,
    }),
  );
  assert.throws(
    () =>
      assertPrivateServeStatus(
        {
          ...expected,
          Web: {
            'mac.example.ts.net:443': {
              Handlers: { '/': { Proxy: 'http://127.0.0.1:9999' } },
            },
          },
        },
        { rpId: 'mac.example.ts.net', port: 4317 },
      ),
    /expected private HTTPS root proxy/,
  );
  assert.throws(
    () =>
      assertPrivateServeStatus(
        {
          ...expected,
          AllowFunnel: { 'mac.example.ts.net:443': true },
        },
        { rpId: 'mac.example.ts.net', port: 4317 },
      ),
    /Funnel/,
  );
  assert.throws(
    () =>
      assertPrivateServeStatus(
        {
          ...expected,
          Web: {
            ...expected.Web,
            'mac.example.ts.net:443': {
              Handlers: {
                ...expected.Web['mac.example.ts.net:443'].Handlers,
                '/text': { Text: 'unexpected' },
              },
            },
          },
        },
        { rpId: 'mac.example.ts.net', port: 4317 },
      ),
    /expected private HTTPS root proxy/,
  );
  assert.throws(
    () =>
      assertPrivateServeStatus(
        {
          ...expected,
          TCP: {
            ...expected.TCP,
            8443: { TCPForward: '127.0.0.1:8443' },
          },
        },
        { rpId: 'mac.example.ts.net', port: 4317 },
      ),
    /expected private HTTPS root proxy/,
  );
});

test('Funnel detection accepts Serve state but rejects any enabled Funnel map', () => {
  assert.doesNotThrow(() => assertNoFunnel(expected));
  assert.doesNotThrow(() => assertNoFunnel({ ...expected, AllowFunnel: {} }));
  assert.throws(
    () =>
      assertNoFunnel({
        ...expected,
        AllowFunnel: { 'mac.example.ts.net:443': true },
      }),
    /Funnel/,
  );
});

test('sidecar status requires a running node with a real DNS name and address', () => {
  assert.deepEqual(
    runningTailscaleIdentity({
      BackendState: 'Running',
      Self: {
        DNSName: 'Conductor-Pocket.example.ts.net.',
        TailscaleIPs: ['100.64.0.2'],
      },
    }),
    {
      dnsName: 'conductor-pocket.example.ts.net',
      addresses: ['100.64.0.2'],
    },
  );
  assert.throws(
    () =>
      runningTailscaleIdentity({
        BackendState: 'NeedsLogin',
        Self: {},
      }),
    /not connected/,
  );
});

test('sidecar and Mac identities must belong to the same tailnet', () => {
  const sidecar = {
    CurrentTailnet: { MagicDNSSuffix: 'tail.example.ts.net' },
  };
  const main = {
    MagicDNSSuffix: 'tail.example.ts.net',
  };
  assert.doesNotThrow(() => assertSameTailnet(sidecar, main));
  assert.throws(
    () =>
      assertSameTailnet(sidecar, {
        MagicDNSSuffix: 'other.example.ts.net',
      }),
    /not authenticated to the Mac tailnet/,
  );
});

test('sidecar preferences refuse route, DNS, SSH, web, and advertising features', () => {
  const locked = {
    WantRunning: true,
    LoggedOut: false,
    RouteAll: false,
    CorpDNS: false,
    RunSSH: false,
    RunWebClient: false,
    ShieldsUp: false,
    PostureChecking: false,
    AdvertiseRoutes: [],
    AdvertiseServices: [],
    AdvertiseTags: [],
    DriveShares: [],
    ExitNodeID: '',
    ExitNodeIP: '',
    ExitNodeAllowLANAccess: false,
    AppConnector: { Advertise: false },
  };
  assert.doesNotThrow(() => assertLockedSidecarPrefs(locked));
  assert.doesNotThrow(() =>
    assertLockedSidecarPrefs({ ...locked, AdvertiseRoutes: null }),
  );
  assert.throws(
    () =>
      assertLockedSidecarPrefs({
        WantRunning: true,
        LoggedOut: false,
        RouteAll: false,
        CorpDNS: false,
      }),
    /locked-down Pocket profile/,
  );
  for (const unsafe of [
    { RouteAll: true },
    { CorpDNS: true },
    { RunSSH: true },
    { RunWebClient: true },
    { AdvertiseRoutes: ['10.0.0.0/8'] },
    { ExitNodeIP: '100.64.0.1' },
    { AppConnector: { Advertise: true } },
  ]) {
    assert.throws(
      () => assertLockedSidecarPrefs({ ...locked, ...unsafe }),
      new RegExp(
        `locked-down Pocket profile: ${Object.keys(unsafe)[0].replace(
          'AppConnector',
          'AppConnector.Advertise',
        )}`,
      ),
    );
  }
});

test('scoped root removal must preserve every unrelated Serve handler', () => {
  const before = {
    TCP: {
      443: { HTTPS: true },
      2222: { TCPForward: '127.0.0.1:22' },
    },
    Web: {
      'mac.example.ts.net:443': {
        Handlers: {
          '/': { Proxy: 'http://127.0.0.1:4317' },
          '/other': { Proxy: 'http://127.0.0.1:4173' },
        },
      },
      'other.example.ts.net:443': {
        Handlers: {
          '/status': { Text: 'ok' },
        },
      },
    },
    Foreground: { SessionID: 'preserve-me' },
  };
  const after = {
    TCP: {
      443: { HTTPS: true },
      2222: { TCPForward: '127.0.0.1:22' },
    },
    Web: {
      'mac.example.ts.net:443': {
        Handlers: {
          '/other': { Proxy: 'http://127.0.0.1:4173' },
        },
      },
      'other.example.ts.net:443': {
        Handlers: {
          '/status': { Text: 'ok' },
        },
      },
    },
    Foreground: { SessionID: 'preserve-me' },
  };
  assert.doesNotThrow(() =>
    assertRootRemovedWithHandlersPreserved(before, after, {
      rpId: 'mac.example.ts.net',
      port: 4317,
    }),
  );
  assert.throws(
    () =>
      assertRootRemovedWithHandlersPreserved(
        before,
        {
          ...after,
          TCP: {
            443: { HTTPS: true },
          },
        },
        { rpId: 'mac.example.ts.net', port: 4317 },
      ),
    /unrelated Serve state/,
  );
});

test('root classification never treats a foreign main-node root as Pocket', () => {
  assert.equal(
    pocketRootState(expected, {
      rpId: 'mac.example.ts.net',
      port: 4317,
    }),
    'pocket',
  );
  assert.equal(
    pocketRootState(
      {
        ...expected,
        Web: {
          'mac.example.ts.net:443': {
            Handlers: {
              '/': { Proxy: 'http://127.0.0.1:9999' },
            },
          },
        },
      },
      { rpId: 'mac.example.ts.net', port: 4317 },
    ),
    'foreign',
  );
  assert.equal(
    pocketRootState(
      {
        TCP: { 443: { HTTPS: true } },
        Web: {
          'mac.example.ts.net:443': {
            Handlers: {
              '/other': { Proxy: 'http://127.0.0.1:4173' },
            },
          },
        },
      },
      { rpId: 'mac.example.ts.net', port: 4317 },
    ),
    'absent',
  );
});

test('removing a lone Pocket root permits only expected empty-listener cleanup', () => {
  assert.deepEqual(
    expectedAfterPocketRootRemoval(expected, {
      rpId: 'mac.example.ts.net',
      port: 4317,
    }),
    {},
  );
  assert.doesNotThrow(() =>
    assertRootRemovedWithHandlersPreserved(expected, {}, {
      rpId: 'mac.example.ts.net',
      port: 4317,
    }),
  );
});
