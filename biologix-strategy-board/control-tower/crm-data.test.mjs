import fs from 'node:fs';

const dataSource = fs.readFileSync('./crm-data.js', 'utf8');
const appSource = fs.readFileSync('./crm-app.js', 'utf8');
const htmlSource = fs.readFileSync('./index.html', 'utf8');

global.window = global;
global.CustomEvent = class {
  constructor(type, options = {}) {
    this.type = type;
    this.detail = options.detail;
  }
};
global.dispatchEvent = () => {};

const requests = [];
let responses = [];
function response(status, body) {
  return {
    status,
    ok: status >= 200 && status < 300,
    async text() {
      return body === undefined ? '' : JSON.stringify(body);
    }
  };
}
global.fetch = async (url, options = {}) => {
  requests.push({ url, options });
  if (!responses.length) throw new Error(`No queued response for ${url}`);
  return responses.shift();
};

eval(dataSource);
const CRM = global.CRM;

let failures = 0;
function ok(name, condition, extra = '') {
  console.log(`${condition ? 'PASS' : 'FAIL'} ${name}${extra ? `  ${extra}` : ''}`);
  if (!condition) failures += 1;
}

const projection = {
  revision: 1,
  generatedAt: '2026-07-25T18:00:00.000Z',
  owners: [
    { id: 'owner-1', name: 'Alex', role: 'admin' },
    { id: 'owner-2', name: 'Patricia', role: 'manager' }
  ],
  program: {
    name: 'Biologix Affiliate Program',
    status: 'active',
    revision: 7,
    economicsSchema: {
      version: 2,
      values: {
        currency: 'USD',
        model: 'percentage',
        terms: '25% of attributed net sales.',
        terms_reference: 'terms-creator-one-v1',
        commission_rate: '25',
        commission_base: 'Attributed net sales after refunds',
        attribution_window_days: '30',
        settlement_hold_days: '14',
        clawback_days: '60',
        payout_cadence: 'monthly',
        payout_threshold: '50.00',
        agreement_version: 'affiliate-v3',
        retainer_amount: null,
        retainer_cadence: null,
        retainer_proration: null
      }
    }
  },
  capabilities: { actions: Object.values(CRM.ACTIONS), testAccounts: true },
  affiliates: [
    {
      id: 'a1',
      revision: 4,
      authoritative: true,
      enrollmentId: 'e1',
      economicsStatus: 'bound',
      name: 'Creator One',
      owner: 'Patricia',
      stage: 'onboarding',
      rate: 20,
      gates: { passport: true, adult: true },
      nextAction: 'Complete agreement',
      nextActionDue: '2099-08-01'
    },
    {
      id: 'a-test',
      name: 'Sandbox Creator',
      owner: 'Alex',
      stage: 'active',
      isTest: true,
      rate: 100,
      gates: {},
      nextAction: 'Exercise the flow',
      nextActionDue: '2099-08-01'
    }
  ],
  sales: [
    { id: 's1', affiliateId: 'a1', date: '2026-07-24', gross: 200, refunded: 25 },
    { id: 's-test', affiliateId: 'a-test', date: '2026-07-24', gross: 999, refunded: 0, isTest: true }
  ],
  payouts: [
    { id: 'p1', affiliateId: 'a1', date: '2026-07-25', amount: 10, status: 'Cleared' }
  ],
  outbound: [],
  enrollments: [{ id: 'e1', affiliateId: 'a1', status: 'onboarding' }],
  auditLog: [{ id: 'event-1', action: 'enrollment.created', affiliateId: 'a1' }]
};

responses.push(response(200, { projection }));
await CRM.load();

ok('projection endpoint is same-origin', requests[0].url === '/api/control-tower/projection', requests[0].url);
ok('projection request bypasses caches', requests[0].options.cache === 'no-store');
ok('nested projection normalizes affiliates', CRM.all('affiliates').length === 2);
ok('auditLog alias normalizes to audit', CRM.state.audit.length === 1);
ok('projection revision is retained', CRM.revision === 1, String(CRM.revision));
ok('owners come only from the authoritative projection',
  CRM.OWNERS.join(',') === 'Alex,Patricia,Unassigned', CRM.OWNERS.join(','));
ok('refresh time is recorded after a successful load', Boolean(CRM.status.refreshedAt));

const money = CRM.affiliateMoney('a1');
ok('money derives net from authoritative ledgers', money.net === 175, String(money.net));
ok('commission derives from the projected rate', money.earned === 35, String(money.earned));
ok('cleared payout reduces commission owed', money.owed === 25, String(money.owed));
ok('gate progress derives from projected gates', CRM.gateProgress(CRM.get('affiliates', 'a1')).done === 2);
ok('sandbox sales are excluded from live totals', CRM.totals().net === 175, String(CRM.totals().net));
ok('sandbox affiliates are excluded from live counts', CRM.totals().affiliateCount === 1);

responses.push(response(200, { ok: true, receiptId: 'receipt-1' }));
const actionResult = await CRM.action(
  'affiliates:update',
  { id: 'a1', patch: { name: 'Creator Renamed' } },
  { idempotencyKey: 'fixed-idempotency-key', expectedRevision: 4 }
);
const actionRequest = requests.at(-1);
const actionBody = JSON.parse(actionRequest.options.body);
ok('actions use the same-origin action endpoint', actionRequest.url === '/api/control-tower/action');
ok('record update maps to explicit allowlisted action', actionBody.action === 'affiliate.update', actionBody.action);
ok('action carries caller-stable idempotency key', actionBody.idempotencyKey === 'fixed-idempotency-key');
ok('action carries expected numeric record revision', actionBody.expectedRevision === 4);
ok('action payload is explicit', actionBody.payload.id === 'a1' && actionBody.payload.patch.name === 'Creator Renamed');
ok('successful action returns server receipt', actionResult.receiptId === 'receipt-1');
ok('action does not optimistically mutate projection', CRM.get('affiliates', 'a1').name === 'Creator One');

ok('stage movement has a dedicated action', CRM.actionName('affiliate:stage') === 'affiliate.stage.set');
ok('touch logging has a dedicated action', CRM.actionName('outbound:touch') === 'outbound.touch.log');
ok('agreement onboarding actions are explicit', [
  CRM.actionName('enrollment:prepare'),
  CRM.actionName('agreement:launch'),
  CRM.actionName('agreement:manage'),
  CRM.actionName('invitation:send')
].join(',') === 'enrollment.prepare,agreement.launch,agreement.manage,invitation.send');
ok('test account has a dedicated action', CRM.actionName('test-account:create') === 'test-account.create');
ok('program setup actions are explicit', [
  CRM.actionName('program:create'),
  CRM.actionName('program:update'),
  CRM.actionName('program:activate')
].join(',') === 'program.create,program.update,program.activate');
ok('unsupported action is rejected before fetch', (() => {
  try { CRM.actionName('gate:toggle'); return false; } catch { return true; }
})());

const capabilityRequestCount = requests.length;
const savedCapabilities = CRM.state.capabilities.actions;
CRM.state.capabilities.actions = ['session.logout'];
let capabilityError;
try {
  await CRM.action('affiliates:update', { id: 'a1', patch: { owner: 'Alex' } });
} catch (error) {
  capabilityError = error;
}
CRM.state.capabilities.actions = savedCapabilities;
ok('actions fail closed when the capability is absent',
  capabilityError && capabilityError.status === 403 &&
  requests.length === capabilityRequestCount);

responses.push(response(409, { code: 'revision_conflict', message: 'Record changed elsewhere.' }));
let conflict;
try {
  await CRM.action('affiliates:update', { id: 'a1', patch: { owner: 'Alex' } });
} catch (error) {
  conflict = error;
}
const conflictBody = JSON.parse(requests.at(-1).options.body);
ok('default expectedRevision uses numeric projection revision', conflictBody.expectedRevision === 1);
ok('conflict exposes status 409', conflict && conflict.status === 409);
ok('conflict keeps last confirmed projection intact', CRM.get('affiliates', 'a1').owner === 'Patricia');

for (const [status, expected] of [
  [401, 'session'],
  [403, 'permission'],
  [503, 'temporarily']
]) {
  responses.push(response(status, {}));
  let error;
  try {
    await CRM.action('enrollment:prepare', {
      email: 'creator@example.com',
      economicsSnapshot: projection.program.economicsSchema.values
    });
  } catch (caught) {
    error = caught;
  }
  ok(`${status} has specific operator guidance`,
    error && error.status === status && error.message.toLowerCase().includes(expected),
    error && error.message);
}

responses.push(response(200, {
  ...projection,
  revision: 2,
  affiliates: [{ ...projection.affiliates[0], name: 'Creator Renamed' }]
}));
await CRM.load();
ok('later projection replaces the confirmed state', CRM.get('affiliates', 'a1').name === 'Creator Renamed');

responses.push(response(200, {
  ...projection,
  revision: 0,
  affiliates: []
}));
await CRM.load();
ok('numeric zero revision survives normalization', CRM.revision === 0, String(CRM.revision));

responses.push(response(200, { projection }));
await CRM.load();
responses.push(response(401, { code: 'session_expired' }));
try {
  await CRM.load();
} catch {}
ok('expired session clears previously rendered private projection',
  CRM.all('affiliates').length === 0 && CRM.revision === null);

ok('data layer has no browser persistence', !dataSource.includes('localStorage'));
ok('data layer has no fallback seed', !/\bseed\s*\(/.test(dataSource) && !dataSource.includes('Example —'));
ok('app has no reset or destructive clear controls',
  !appSource.includes('CRM.reset') && !appSource.includes('CRM.clearAll'));
ok('app refreshes after confirmed mutation', appSource.includes('await refreshProjection({ quiet: true })'));
ok('ambiguous retries retain the exact idempotency key',
  appSource.includes('pendingMutations[signature]') &&
  appSource.includes('idempotencyKey: stableKey') &&
  appSource.includes('error.status < 500'));
ok('app forces refresh on conflict', /error\.status === 409[\s\S]*refreshProjection/.test(appSource));
ok('app never exposes an editable gate action', !appSource.includes('toggleGate'));
ok('HTML exposes loading, retry, history, invitation and logout affordances',
  ['crm-system-state', 'crm-retry', 'tool-program', 'tool-history', 'tool-invite', 'tool-logout']
    .every((id) => htmlSource.includes(`id="${id}"`)));
ok('old import/reset/clear controls are gone',
  !['tool-import', 'tool-reset', 'tool-clear'].some((id) => htmlSource.includes(`id="${id}"`)));
ok('logout clears the Worker session with same-origin POST',
  appSource.includes("global.fetch('/api/control-tower/logout'") &&
  appSource.includes("method: 'POST'") &&
  appSource.includes("'/cdn-cgi/access/logout'") &&
  appSource.includes("'/control-tower/access'"));
ok('enrollment preparation binds the complete economicsSnapshot object',
  appSource.includes('payload.economicsSnapshot = economics.snapshot'));
ok('live enrollment preparation is fail-closed without program.economicsSchema',
  appSource.includes('Live economics schema is unavailable'));
ok('economicsSnapshot uses every exact v2 key', [
  'currency', 'model', 'terms', 'terms_reference', 'commission_rate',
  'commission_base', 'attribution_window_days', 'settlement_hold_days',
  'clawback_days', 'payout_cadence', 'payout_threshold', 'agreement_version',
  'retainer_amount', 'retainer_cadence', 'retainer_proration'
].every((key) => appSource.includes(`${key}:`)));
ok('obsolete free-text snapshot ids are not submitted',
  !appSource.includes('economicsSnapshotId') && !appSource.includes('invite-agreement'));
ok('sandbox records receive a visible label', appSource.includes("pill('sandbox', 'is-warn')"));
ok('production onboarding separates prepare, agreement and invitation actions',
  dataSource.includes("'enrollment:prepare'") &&
  dataSource.includes("'agreement:launch'") &&
  dataSource.includes("'agreement:manage'") &&
  dataSource.includes("'invitation:send'") &&
  !dataSource.includes("'invitation:create':"));
ok('agreement actions use the authoritative enrollment revision',
  appSource.includes('var revision = Number(affiliate.revision)') &&
  appSource.includes('expectedRevision: revision') &&
  appSource.includes('recordActionAvailable(affiliate, publicAction)'));
ok('enrollment preparation uses the authoritative program revision',
  appSource.includes('Number(CRM.state.program && CRM.state.program.revision)') &&
  appSource.includes("expectedRevision: expectedRevision"));
ok('Passport access waits for verified agreement evidence',
  appSource.includes('Passport access stays locked until the Contract Engine webhook verifies') &&
  appSource.includes('Send Passport access'));
ok('program update emits the exact BFF contract fields', [
  'programId', 'expectedRevision', 'legalEntityName', 'tradeName',
  'entityType', 'officialAddress',
  'authorizedSignerRef', 'authorizedSignerName', 'authorizedSignerTitle',
  'authorizedSignerEmail', 'agreementTemplateKey', 'agreementVersion',
  'affiliateBaseUrl', 'trackingBaseUrl', 'eligibleCountries',
  'eligibleRegions', 'minimumAge', 'economicsConfiguration'
].every((key) => appSource.includes(`${key}:`)));
ok('program activation fail-closes when requirements are omitted',
  appSource.includes('Activation status unavailable') &&
  appSource.includes('!requirementsKnown || missing.length > 0') &&
  appSource.includes('missingActivationRequirements'));
ok('program address is structured and locked to US', [
  'line1:', 'line2:', 'city:', 'region:', 'postalCode:', 'countryCode:'
].every((key) => appSource.includes(key)) &&
  appSource.includes("officialAddress.countryCode !== 'US'") &&
  appSource.includes("var eligibleCountries = ['US']"));
ok('program setup locks exact company-side signer facts',
  appSource.includes("tradeName: tradeName") &&
  appSource.includes("entityType: entityType") &&
  appSource.includes("authorizedSignerName: authorizedSignerName") &&
  appSource.includes("authorizedSignerTitle: authorizedSignerTitle") &&
  appSource.includes("authorizedSignerEmail: authorizedSignerEmail") &&
  appSource.includes('must match the company-side signer'));
ok('program setup mirrors the server validation bounds',
  appSource.includes('max="99"') &&
  appSource.includes('minimumAge > 99') &&
  appSource.includes('tradeName.length > 200') &&
  appSource.includes('entityType.length > 200') &&
  appSource.includes("tradeName.normalize('NFKC')") &&
  appSource.includes('/^[a-z0-9][a-z0-9-]{0,99}$/'));
ok('program economics policy cannot become creator defaults',
  appSource.includes("mode: 'individualized'") &&
  appSource.includes('noDefaults: true') &&
  !appSource.includes("collectEconomicsSnapshot('program-economics-error')"));
ok('prospect and enrollment stages use separate controls',
  appSource.includes('CRM.PROSPECT_STAGES') &&
  appSource.includes('data-lifecycle-stage="active"') &&
  appSource.includes('data-lifecycle-stage="churned"'));
ok('money records only offer authoritative bound production enrollments',
  appSource.includes("r.economicsStatus === 'bound'") &&
  appSource.includes('!CRM.isTestAffiliate(r)'));

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures ? 1 : 0);
