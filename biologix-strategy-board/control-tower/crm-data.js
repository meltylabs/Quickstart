/* Biologix Control Tower — authoritative data adapter.
   Reads a same-origin projection and sends explicit, revision-aware actions.
   No browser persistence and no seed data. Exposed as window.CRM. */
(function (global) {
  'use strict';

  var PROJECTION_URL = '/api/control-tower/projection';
  var ACTION_URL = '/api/control-tower/action';

  /* Filled from the authoritative staff projection. Keep this array stable so
     schema controls that reference it update in place after every refresh. */
  var OWNERS = ['Unassigned'];

  var PROSPECT_STAGES = [
    { id: 'sourced', label: 'Sourced', group: 'recruit' },
    { id: 'contacted', label: 'Contacted', group: 'recruit' },
    { id: 'replied', label: 'Replied', group: 'recruit' },
    { id: 'qualified', label: 'Qualified', group: 'recruit' },
    { id: 'call_booked', label: 'Call booked', group: 'close' },
    { id: 'call_done', label: 'Call done', group: 'close' },
    { id: 'agreement_sent', label: 'Agreement sent', group: 'close' },
    { id: 'converted', label: 'Converted', group: 'close' },
    { id: 'disqualified', label: 'Disqualified', group: 'dead' }
  ];

  /* These are projections of the enrollment lifecycle. They are never editable
     as ordinary prospect stages. */
  var LIFECYCLE_STAGES = [
    { id: 'signed', label: 'Signed', group: 'close' },
    { id: 'onboarding', label: 'Onboarding', group: 'activate' },
    { id: 'active', label: 'Active', group: 'live' },
    { id: 'paused', label: 'Paused', group: 'live' },
    { id: 'churned', label: 'Churned', group: 'dead' },
    { id: 'rejected', label: 'Rejected', group: 'dead' }
  ];
  var STAGES = PROSPECT_STAGES.concat(LIFECYCLE_STAGES);

  var LOSS_REASONS = [
    'No reply', 'Not a fit', 'Audience too small', 'Compliance risk',
    'Wants cash upfront', 'Competing brand', 'Went dark', 'Rate rejected', 'Other'
  ];

  var GATES = [
    { id: 'passport', label: 'OVO Creator Passport', note: 'Reusable OVO identity clearance.' },
    { id: 'adult', label: 'Adult eligibility', note: '18+ verified via provider. Reference only, never stored here.' },
    { id: 'agreement', label: 'Agreement executed', note: 'Signed affiliate agreement, exact version recorded.' },
    { id: 'tax', label: 'Tax + payout set up', note: 'W-9/W-8 on file with provider, payout method verified.' },
    { id: 'training', label: 'Claims + disclosure training', note: 'What they may say, and the FTC disclosure rule.' },
    { id: 'account', label: 'Affiliate account created', note: 'Account exists in the affiliate system.' },
    { id: 'tracking', label: 'Tracking QA passed', note: 'Test click and test order attributed correctly.' },
    { id: 'content', label: 'First content approved', note: 'First batch reviewed against approved claims.' },
    { id: 'launch', label: 'Launch authorised', note: 'Owner signs off. Links go live.' }
  ];

  var CHANNELS = ['Instagram DM', 'Email', 'SMS', 'Discord', 'Referral', 'In person', 'Other'];
  var DISPOSITIONS = [
    'No response', 'Interested', 'Not interested', 'Wrong person',
    'Asked to follow up', 'Booked call', 'Do not contact'
  ];
  var RISK_FLAGS = [
    'Unverified age', 'Makes medical claims', 'No disclosure', 'Competing brand',
    'Chargeback history', 'Bought followers', 'Off-platform selling'
  ];

  var SCHEMA = {
    affiliates: {
      label: 'Affiliate',
      plural: 'Affiliates',
      fields: [
        { key: 'name', label: 'Name', type: 'text', required: true },
        { key: 'handle', label: 'Handle', type: 'text', hint: 'Primary social handle, no @' },
        { key: 'platform', label: 'Platform', type: 'select', options: ['Instagram', 'TikTok', 'YouTube', 'X', 'Other'] },
        { key: 'followers', label: 'Followers', type: 'number' },
        { key: 'owner', label: 'Owner', type: 'select', options: OWNERS, required: true },
        { key: 'stage', label: 'Stage', type: 'select', options: PROSPECT_STAGES.map(function (s) { return s.id; }), required: true, authoritative: true },
        { key: 'source', label: 'Source', type: 'text', hint: 'Where they came from' },
        { key: 'parentId', label: 'Recruited by', type: 'ref', ref: 'affiliates', hint: 'Upline affiliate. Drives override commission.' },
        { key: 'code', label: 'Code', type: 'text' },
        { key: 'link', label: 'Link', type: 'text' },
        { key: 'rate', label: 'Commission rate %', type: 'number', hint: 'Unset means unknown, never zero.' },
        { key: 'overrideRate', label: 'Override rate %', type: 'number' },
        { key: 'signedOn', label: 'Signed on', type: 'date' },
        { key: 'gates', label: 'Activation gates', type: 'gates', authoritative: true },
        { key: 'postsLive', label: 'Posts live', type: 'number' },
        { key: 'lastPostOn', label: 'Last post', type: 'date' },
        { key: 'nextAction', label: 'Next action', type: 'text', required: true },
        { key: 'nextActionDue', label: 'Next action due', type: 'date', required: true },
        { key: 'lossReason', label: 'Loss reason', type: 'select', options: LOSS_REASONS },
        { key: 'risk', label: 'Risk flags', type: 'multi', options: RISK_FLAGS },
        { key: 'notes', label: 'Notes', type: 'textarea' }
      ]
    },
    sales: {
      label: 'Sale',
      plural: 'Sales',
      fields: [
        { key: 'date', label: 'Date', type: 'date', required: true },
        { key: 'affiliateId', label: 'Affiliate', type: 'ref', ref: 'affiliates', required: true },
        { key: 'orderRef', label: 'Order ref', type: 'text' },
        { key: 'gross', label: 'Gross', type: 'money', required: true },
        { key: 'refunded', label: 'Refunded', type: 'money', readOnly: true, hint: 'Calculated from the immutable refund ledger.' },
        { key: 'product', label: 'Product', type: 'text' },
        { key: 'notes', label: 'Notes', type: 'text' }
      ]
    },
    outbound: {
      label: 'Target',
      plural: 'Outbound',
      fields: [
        { key: 'name', label: 'Name', type: 'text', required: true },
        { key: 'handle', label: 'Handle', type: 'text' },
        { key: 'platform', label: 'Platform', type: 'select', options: ['Instagram', 'TikTok', 'YouTube', 'X', 'Other'] },
        { key: 'followers', label: 'Followers', type: 'number' },
        { key: 'owner', label: 'Owner', type: 'select', options: OWNERS, required: true },
        { key: 'channel', label: 'Channel', type: 'select', options: CHANNELS },
        { key: 'step', label: 'Sequence step', type: 'number' },
        { key: 'lastTouch', label: 'Last touch', type: 'date', authoritative: true },
        { key: 'replied', label: 'Replied', type: 'bool' },
        { key: 'disposition', label: 'Disposition', type: 'select', options: DISPOSITIONS },
        { key: 'dnc', label: 'Do not contact', type: 'bool' },
        { key: 'nextAction', label: 'Next action', type: 'text' },
        { key: 'nextActionDue', label: 'Next action due', type: 'date' },
        { key: 'notes', label: 'Notes', type: 'textarea' }
      ]
    },
    payouts: {
      label: 'Payout',
      plural: 'Payouts',
      fields: [
        { key: 'date', label: 'Date', type: 'date', required: true },
        { key: 'affiliateId', label: 'Affiliate', type: 'ref', ref: 'affiliates', required: true },
        { key: 'amount', label: 'Amount', type: 'money', required: true },
        { key: 'method', label: 'Method', type: 'select', options: ['ACH', 'PayPal', 'Wire', 'Venmo', 'Other'] },
        { key: 'status', label: 'Status', type: 'select', options: ['Queued', 'Sent', 'Cleared', 'Failed', 'Clawed back'] },
        { key: 'reference', label: 'Reference', type: 'text' },
        { key: 'notes', label: 'Notes', type: 'text' }
      ]
    }
  };

  var ACTIONS = Object.freeze({
    'affiliates:create': 'affiliate.create',
    'affiliates:update': 'affiliate.update',
    'affiliates:delete': 'affiliate.delete',
    'sales:create': 'sale.create',
    'sales:update': 'sale.update',
    'sales:delete': 'sale.delete',
    'outbound:create': 'outbound.create',
    'outbound:update': 'outbound.update',
    'outbound:delete': 'outbound.delete',
    'payouts:create': 'payout.create',
    'payouts:update': 'payout.update',
    'payouts:delete': 'payout.delete',
    'affiliate:stage': 'affiliate.stage.set',
    'outbound:touch': 'outbound.touch.log',
    'enrollment:prepare': 'enrollment.prepare',
    'agreement:launch': 'agreement.launch',
    'agreement:manage': 'agreement.manage',
    'invitation:send': 'invitation.send',
    'test-account:create': 'test-account.create',
    'program:create': 'program.create',
    'program:update': 'program.update',
    'program:activate': 'program.activate'
  });

  var state = emptyState();
  var status = {
    phase: 'idle',
    error: null,
    revision: null,
    refreshedAt: null,
    generatedAt: null
  };

  function emptyState() {
    return {
      meta: {},
      program: {},
      programSetup: {},
      session: {},
      capabilities: {},
      owners: [],
      enrollments: [],
      audit: [],
      affiliates: [],
      sales: [],
      outbound: [],
      payouts: []
    };
  }

  function dispatch(name, detail) {
    if (typeof global.dispatchEvent !== 'function') return;
    var event;
    try { event = new CustomEvent(name, { detail: detail }); }
    catch (e) { event = { type: name, detail: detail }; }
    global.dispatchEvent(event);
  }

  function apiErrorMessage(statusCode, body) {
    var server = body && (body.message || body.error);
    if (statusCode === 401) return server || 'Your session expired. Sign in again.';
    if (statusCode === 403) return server || 'You do not have permission to perform that action.';
    if (statusCode === 409) return server || 'This record changed elsewhere. The latest version has been loaded.';
    if (statusCode === 503) return server || 'The control tower is temporarily unavailable. Try again shortly.';
    return server || ('Request failed with status ' + statusCode + '.');
  }

  function makeError(response, body) {
    var err = new Error(apiErrorMessage(response.status, body));
    err.status = response.status;
    err.code = body && body.code;
    err.details = body && body.details;
    return err;
  }

  function normalizeProjection(payload) {
    payload = payload || {};
    var source = payload && payload.projection ? payload.projection : payload;
    source = source || {};
    var next = emptyState();
    ['affiliates', 'sales', 'outbound', 'payouts', 'enrollments'].forEach(function (key) {
      next[key] = Array.isArray(source[key]) ? source[key].slice() : [];
    });
    next.audit = Array.isArray(source.audit) ? source.audit.slice()
      : Array.isArray(source.auditLog) ? source.auditLog.slice()
      : Array.isArray(source.history) ? source.history.slice() : [];
    next.meta = source.meta || {};
    next.program = source.program || {};
    next.programSetup = source.programSetup || {};
    next.session = source.session || payload.session || {};
    next.capabilities = source.capabilities || payload.capabilities || {};
    var projectedOwners = Array.isArray(source.owners) ? source.owners : [];
    var ownerNames = projectedOwners.map(function (owner) {
      if (typeof owner === 'string') return owner.trim();
      if (!owner || typeof owner !== 'object') return '';
      return String(owner.name || owner.fullName || owner.displayName || '').trim();
    }).filter(Boolean);
    ownerNames = ownerNames.filter(function (name, index) {
      return ownerNames.indexOf(name) === index && name !== 'Unassigned';
    });
    ownerNames.push('Unassigned');
    OWNERS.splice.apply(OWNERS, [0, OWNERS.length].concat(ownerNames));
    next.owners = projectedOwners.slice();
    var sourceRevision = source.revision;
    var payloadRevision = payload.revision;
    return {
      state: next,
      revision: sourceRevision !== undefined && sourceRevision !== null
        ? sourceRevision
        : payloadRevision !== undefined && payloadRevision !== null
          ? payloadRevision
          : null,
      generatedAt: source.generatedAt || payload.generatedAt || null
    };
  }

  async function readJson(response) {
    var text = await response.text();
    if (!text) return {};
    try { return JSON.parse(text); }
    catch (e) {
      var err = new Error('The server returned an unreadable response.');
      err.status = response.status;
      throw err;
    }
  }

  async function load() {
    status.phase = 'loading';
    status.error = null;
    dispatch('crm:status', status);
    try {
      var response = await global.fetch(PROJECTION_URL, {
        method: 'GET',
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
        cache: 'no-store'
      });
      var body = await readJson(response);
      if (!response.ok) throw makeError(response, body);
      var normalized = normalizeProjection(body);
      state = normalized.state;
      status.phase = 'ready';
      status.error = null;
      status.revision = normalized.revision;
      status.generatedAt = normalized.generatedAt;
      status.refreshedAt = new Date().toISOString();
      dispatch('crm:change', { source: 'projection' });
      dispatch('crm:status', status);
      return state;
    } catch (err) {
      if (err && err.status === 401) {
        state = emptyState();
        status.revision = null;
        status.generatedAt = null;
        status.refreshedAt = null;
        dispatch('crm:change', { source: 'session-expired' });
      }
      status.phase = 'error';
      status.error = err;
      dispatch('crm:status', status);
      throw err;
    }
  }

  function idempotencyKey(action) {
    var random = '';
    if (global.crypto && typeof global.crypto.randomUUID === 'function') {
      random = global.crypto.randomUUID();
    } else {
      random = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
    }
    return 'ct-' + String(action).replace(/[^a-z0-9]+/gi, '-').toLowerCase() + '-' + random;
  }

  function actionName(key) {
    var name = ACTIONS[key];
    if (!name) throw new Error('Unsupported control-tower action: ' + key);
    return name;
  }

  function capabilityAllows(action) {
    var list = state.capabilities && state.capabilities.actions;
    return Array.isArray(list) && list.indexOf(action) >= 0;
  }

  async function action(key, payload, options) {
    options = options || {};
    var name = actionName(key);
    if (!capabilityAllows(name)) {
      var denied = new Error('This action is not enabled for your account.');
      denied.status = 403;
      throw denied;
    }
    var body = {
      action: name,
      idempotencyKey: options.idempotencyKey || idempotencyKey(name),
      payload: payload || {}
    };
    var revision = options.expectedRevision;
    if (revision === undefined || revision === null || revision === '') revision = status.revision;
    if (revision !== undefined && revision !== null && revision !== '') body.expectedRevision = revision;

    var response = await global.fetch(ACTION_URL, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    var result = await readJson(response);
    if (!response.ok) throw makeError(response, result);
    return result;
  }

  function get(entity, id) {
    return (state[entity] || []).find(function (row) { return row.id === id; }) || null;
  }
  function all(entity) { return (state[entity] || []).slice(); }
  function num(value) { var n = parseFloat(value); return isNaN(n) ? 0 : n; }

  function isTestAffiliate(affiliate) {
    if (!affiliate) return false;
    return affiliate.isTest === true || affiliate.testAccount === true ||
      affiliate.sandbox === true || affiliate.environment === 'test' ||
      affiliate.accountType === 'test';
  }

  function isTestRecord(entity, record) {
    if (!record) return false;
    if (record.isTest === true || record.sandbox === true || record.environment === 'test') return true;
    if (entity === 'affiliates') return isTestAffiliate(record);
    if (entity === 'sales' || entity === 'payouts') {
      return isTestAffiliate(get('affiliates', record.affiliateId));
    }
    return false;
  }

  function today() {
    var d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function pad(n) { return n < 10 ? '0' + n : String(n); }
  function addDays(iso, n) {
    var d = new Date(iso + 'T12:00:00');
    d.setDate(d.getDate() + n);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function daysBetween(a, b) {
    if (!a || !b) return null;
    return Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000);
  }

  function affiliateMoney(id) {
    var sales = state.sales.filter(function (sale) { return sale.affiliateId === id; });
    var gross = 0, refunded = 0, lastSale = '';
    sales.forEach(function (sale) {
      gross += num(sale.gross);
      refunded += num(sale.refunded);
      if (!lastSale || sale.date > lastSale) lastSale = sale.date;
    });
    var net = gross - refunded;
    var affiliate = get('affiliates', id);
    var rate = affiliate && affiliate.rate !== null && affiliate.rate !== '' && affiliate.rate !== undefined
      ? num(affiliate.rate) : null;
    var earned = rate === null ? null : net * rate / 100;
    var downline = state.affiliates.filter(function (row) { return row.parentId === id; });
    var overrideEarned = null;
    downline.forEach(function (child) {
      var childRate = child.overrideRate !== null && child.overrideRate !== '' && child.overrideRate !== undefined
        ? num(child.overrideRate) : null;
      if (childRate === null) return;
      var childNet = state.sales.filter(function (sale) { return sale.affiliateId === child.id; })
        .reduce(function (sum, sale) { return sum + num(sale.gross) - num(sale.refunded); }, 0);
      overrideEarned = (overrideEarned || 0) + childNet * childRate / 100;
    });
    var paid = state.payouts.filter(function (payout) {
      return payout.affiliateId === id && (payout.status === 'Sent' || payout.status === 'Cleared');
    }).reduce(function (sum, payout) { return sum + num(payout.amount); }, 0);
    var totalEarned = earned === null && overrideEarned === null ? null : num(earned) + num(overrideEarned);
    return {
      orders: sales.length,
      gross: gross,
      refunded: refunded,
      net: net,
      refundRate: gross > 0 ? refunded / gross : 0,
      aov: sales.length ? gross / sales.length : 0,
      rate: rate,
      earned: earned,
      overrideEarned: overrideEarned,
      totalEarned: totalEarned,
      paid: paid,
      owed: totalEarned === null ? null : totalEarned - paid,
      lastSale: lastSale,
      daysSinceLastSale: lastSale ? daysBetween(lastSale, today()) : null,
      downlineCount: downline.length
    };
  }

  function gateProgress(affiliate) {
    var gates = affiliate && affiliate.gates || {};
    var done = GATES.filter(function (gate) { return gates[gate.id] === true; }).length;
    var blocked = GATES.find(function (gate) { return gates[gate.id] !== true; }) || null;
    return { done: done, total: GATES.length, blockedBy: blocked, complete: done === GATES.length };
  }

  function activationReadiness(affiliate) {
    var gates = affiliate && affiliate.gates || {};
    var prerequisites = GATES.filter(function (gate) { return gate.id !== 'launch'; });
    var done = prerequisites.filter(function (gate) { return gates[gate.id] === true; }).length;
    var blocked = prerequisites.find(function (gate) { return gates[gate.id] !== true; }) || null;
    return {
      done: done,
      total: prerequisites.length,
      blockedBy: blocked,
      ready: done === prerequisites.length
    };
  }

  function defects() {
    var result = [];
    state.affiliates.forEach(function (affiliate) {
      var why = [];
      if (!affiliate.owner || affiliate.owner === 'Unassigned') why.push('no owner');
      if (!affiliate.nextAction) why.push('no next action');
      if (!affiliate.nextActionDue) why.push('no due date');
      if (affiliate.stage === 'active' && !gateProgress(affiliate).complete) why.push('live but gates incomplete');
      if (affiliate.stage === 'active' && !affiliate.code && !affiliate.link) why.push('live but no code or link');
      if (why.length) result.push({ entity: 'affiliates', id: affiliate.id, name: affiliate.name, why: why });
    });
    state.outbound.forEach(function (target) {
      var why = [];
      if (!target.owner || target.owner === 'Unassigned') why.push('no owner');
      if (!target.dnc && !target.nextAction) why.push('no next action');
      if (why.length) result.push({ entity: 'outbound', id: target.id, name: target.name, why: why });
    });
    return result;
  }

  function overdue() {
    var date = today();
    var result = [];
    state.affiliates.forEach(function (affiliate) {
      if (affiliate.nextActionDue && affiliate.nextActionDue < date &&
          ['churned', 'rejected', 'disqualified'].indexOf(affiliate.stage) < 0) {
        result.push({
          entity: 'affiliates', id: affiliate.id, name: affiliate.name, owner: affiliate.owner,
          action: affiliate.nextAction, due: affiliate.nextActionDue,
          daysLate: -daysBetween(date, affiliate.nextActionDue)
        });
      }
    });
    state.outbound.forEach(function (target) {
      if (!target.dnc && target.nextActionDue && target.nextActionDue < date) {
        result.push({
          entity: 'outbound', id: target.id, name: target.name, owner: target.owner,
          action: target.nextAction, due: target.nextActionDue,
          daysLate: -daysBetween(date, target.nextActionDue)
        });
      }
    });
    return result.sort(function (a, b) { return b.daysLate - a.daysLate; });
  }

  function totals() {
    var liveAffiliates = state.affiliates.filter(function (affiliate) { return !isTestAffiliate(affiliate); });
    var liveSales = state.sales.filter(function (sale) { return !isTestRecord('sales', sale); });
    var gross = 0, refunded = 0;
    liveSales.forEach(function (sale) { gross += num(sale.gross); refunded += num(sale.refunded); });
    var live = liveAffiliates.filter(function (affiliate) { return affiliate.stage === 'active'; });
    var selling = {};
    liveSales.forEach(function (sale) { selling[sale.affiliateId] = true; });
    var producing = live.filter(function (affiliate) { return selling[affiliate.id]; });
    var signed = liveAffiliates.filter(function (affiliate) {
      return ['signed', 'onboarding', 'active', 'paused', 'churned'].indexOf(affiliate.stage) >= 0;
    });
    var anyRate = liveAffiliates.some(function (affiliate) {
      return affiliate.rate !== null && affiliate.rate !== '' && affiliate.rate !== undefined;
    });
    var owed = null;
    if (anyRate) {
      owed = 0;
      liveAffiliates.forEach(function (affiliate) {
        var money = affiliateMoney(affiliate.id);
        if (money.owed !== null) owed += money.owed;
      });
    }
    var onboarding = liveAffiliates.filter(function (affiliate) { return affiliate.stage === 'onboarding'; });
    var gatesBlocked = {};
    onboarding.forEach(function (affiliate) {
      var progress = gateProgress(affiliate);
      if (progress.blockedBy) {
        gatesBlocked[progress.blockedBy.id] = (gatesBlocked[progress.blockedBy.id] || 0) + 1;
      }
    });
    var net = gross - refunded;
    return {
      gross: gross, refunded: refunded, net: net, orders: liveSales.length,
      aov: liveSales.length ? gross / liveSales.length : 0,
      refundRate: gross > 0 ? refunded / gross : 0,
      affiliateCount: liveAffiliates.length,
      signedCount: signed.length,
      liveCount: live.length,
      producingCount: producing.length,
      activationRate: signed.length ? producing.length / signed.length : null,
      onboardingCount: onboarding.length,
      gatesBlocked: gatesBlocked,
      outboundCount: state.outbound.filter(function (target) { return !target.dnc && !isTestRecord('outbound', target); }).length,
      outboundReplied: state.outbound.filter(function (target) { return target.replied && !isTestRecord('outbound', target); }).length,
      commissionOwed: owed,
      rateAgreed: anyRate,
      defectCount: defects().length,
      overdueCount: overdue().length
    };
  }

  function pipelineCounts() {
    var result = {};
    STAGES.forEach(function (stage) { result[stage.id] = 0; });
    state.affiliates.forEach(function (affiliate) {
      result[affiliate.stage] = (result[affiliate.stage] || 0) + 1;
    });
    return result;
  }

  function salesByDay(days) {
    var end = today(), map = {}, result = [];
    for (var i = days - 1; i >= 0; i--) map[addDays(end, -i)] = 0;
    state.sales.filter(function (sale) { return !isTestRecord('sales', sale); }).forEach(function (sale) {
      if (map[sale.date] !== undefined) map[sale.date] += num(sale.gross) - num(sale.refunded);
    });
    Object.keys(map).forEach(function (date) { result.push({ date: date, value: map[date] }); });
    return result;
  }

  function sortValue(entity, row, key) {
    if (entity === 'affiliates' &&
        ['gross', 'net', 'orders', 'owed', 'aov', 'lastSale', 'refunded'].indexOf(key) >= 0) {
      return affiliateMoney(row.id)[key];
    }
    if (entity === 'affiliates' && key === 'gates') return gateProgress(row).done;
    if (key === 'affiliateId' && (entity === 'sales' || entity === 'payouts')) {
      var affiliate = get('affiliates', row.affiliateId);
      return affiliate && affiliate.name || '';
    }
    return row[key];
  }

  function list(entity, options) {
    options = options || {};
    var rows = all(entity);
    if (options.search) {
      var query = options.search.toLowerCase();
      rows = rows.filter(function (row) {
        return Object.keys(row).some(function (key) {
          return typeof row[key] === 'string' && row[key].toLowerCase().indexOf(query) >= 0;
        });
      });
    }
    Object.keys(options.filters || {}).forEach(function (key) {
      var expected = options.filters[key];
      if (!expected || expected === 'all') return;
      rows = rows.filter(function (row) { return String(row[key]) === String(expected); });
    });
    if (options.sort) {
      var direction = options.dir === 'desc' ? -1 : 1;
      rows.sort(function (a, b) {
        var av = sortValue(entity, a, options.sort);
        var bv = sortValue(entity, b, options.sort);
        if (av === null || av === undefined || av === '') return 1;
        if (bv === null || bv === undefined || bv === '') return -1;
        if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * direction;
        return String(av).localeCompare(String(bv)) * direction;
      });
    }
    return rows;
  }

  function csvEscape(value) {
    if (value === null || value === undefined) return '';
    var text = typeof value === 'object' ? JSON.stringify(value) : String(value);
    return /[",\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
  }

  function toCSV(entity) {
    var fields = SCHEMA[entity].fields.map(function (field) { return field.key; });
    var header = ['id'].concat(fields);
    if (entity === 'affiliates') header = header.concat(['orders', 'gross', 'refunded', 'net', 'commissionOwed']);
    var lines = [header.join(',')];
    all(entity).forEach(function (row) {
      lines.push(header.map(function (key) {
        if (entity === 'affiliates' &&
            ['orders', 'gross', 'refunded', 'net', 'commissionOwed'].indexOf(key) >= 0) {
          var money = affiliateMoney(row.id);
          return csvEscape(key === 'commissionOwed' ? (money.owed === null ? 'no rate set' : money.owed) : money[key]);
        }
        return csvEscape(row[key]);
      }).join(','));
    });
    return lines.join('\n');
  }

  global.CRM = {
    PROJECTION_URL: PROJECTION_URL,
    ACTION_URL: ACTION_URL,
    ACTIONS: ACTIONS,
    OWNERS: OWNERS,
    STAGES: STAGES,
    PROSPECT_STAGES: PROSPECT_STAGES,
    LIFECYCLE_STAGES: LIFECYCLE_STAGES,
    GATES: GATES,
    CHANNELS: CHANNELS,
    DISPOSITIONS: DISPOSITIONS,
    LOSS_REASONS: LOSS_REASONS,
    RISK_FLAGS: RISK_FLAGS,
    SCHEMA: SCHEMA,
    load: load,
    action: action,
    actionName: actionName,
    idempotencyKey: idempotencyKey,
    capabilityAllows: capabilityAllows,
    normalizeProjection: normalizeProjection,
    apiErrorMessage: apiErrorMessage,
    get: get,
    all: all,
    list: list,
    affiliateMoney: affiliateMoney,
    gateProgress: gateProgress,
    activationReadiness: activationReadiness,
    totals: totals,
    defects: defects,
    overdue: overdue,
    pipelineCounts: pipelineCounts,
    salesByDay: salesByDay,
    toCSV: toCSV,
    isTestAffiliate: isTestAffiliate,
    isTestRecord: isTestRecord,
    today: today,
    addDays: addDays,
    daysBetween: daysBetween,
    get state() { return state; },
    get status() { return status; },
    get revision() { return status.revision; }
  };
})(window);
