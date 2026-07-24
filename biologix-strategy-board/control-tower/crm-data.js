/* Biologix Control Tower — data layer.
   Everything the UI needs: schema, storage, CSV, derived money.
   Persists to localStorage. No backend. Exposed as window.CRM. */
(function (global) {
  'use strict';

  var KEY = 'biologix-control-tower-v1';

  /* ---------------------------------------------------------------- vocab */

  var OWNERS = ['Alex', 'Patricia', 'Connor', 'Jaci', 'Kennedy', 'Unassigned'];

  var STAGES = [
    { id: 'sourced', label: 'Sourced', group: 'recruit' },
    { id: 'contacted', label: 'Contacted', group: 'recruit' },
    { id: 'replied', label: 'Replied', group: 'recruit' },
    { id: 'qualified', label: 'Qualified', group: 'recruit' },
    { id: 'call_booked', label: 'Call booked', group: 'close' },
    { id: 'call_done', label: 'Call done', group: 'close' },
    { id: 'agreement_sent', label: 'Agreement sent', group: 'close' },
    { id: 'signed', label: 'Signed', group: 'close' },
    { id: 'onboarding', label: 'Onboarding', group: 'activate' },
    { id: 'active', label: 'Active', group: 'live' },
    { id: 'paused', label: 'Paused', group: 'live' },
    { id: 'churned', label: 'Churned', group: 'dead' },
    { id: 'rejected', label: 'Rejected', group: 'dead' }
  ];

  var LOSS_REASONS = [
    'No reply', 'Not a fit', 'Audience too small', 'Compliance risk',
    'Wants cash upfront', 'Competing brand', 'Went dark', 'Rate rejected', 'Other'
  ];

  /* The activation gates. An affiliate is not live until all nine pass.
     Order matters: each one blocks the next. */
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

  /* --------------------------------------------------------------- schema */

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
        { key: 'stage', label: 'Stage', type: 'select', options: STAGES.map(function (s) { return s.id; }), required: true },
        { key: 'source', label: 'Source', type: 'text', hint: 'Where they came from' },
        { key: 'parentId', label: 'Recruited by', type: 'ref', ref: 'affiliates', hint: 'Upline affiliate. Drives override commission.' },
        { key: 'code', label: 'Code', type: 'text' },
        { key: 'link', label: 'Link', type: 'text' },
        { key: 'rate', label: 'Commission rate %', type: 'number', hint: 'No rate has been agreed with Biologix. Leave blank until it is.' },
        { key: 'overrideRate', label: 'Override rate %', type: 'number', hint: 'What the upline earns on this affiliate. Also unset.' },
        { key: 'signedOn', label: 'Signed on', type: 'date' },
        { key: 'gates', label: 'Activation gates', type: 'gates' },
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
        { key: 'refunded', label: 'Refunded', type: 'money', hint: 'Refund or chargeback amount against this order.' },
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
        { key: 'step', label: 'Sequence step', type: 'number', hint: '0 = not yet touched' },
        { key: 'lastTouch', label: 'Last touch', type: 'date' },
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

  /* ----------------------------------------------------------------- seed */

  /* Seed rows are illustrative. The people who are real are marked real:true.
     Replace the examples with your own via Import CSV or Add. */
  function seed() {
    return {
      meta: {
        createdAt: today(),
        rateAgreed: false,
        baselineNote: 'No commission rate has been agreed with Biologix. Rates left blank on purpose.'
      },
      affiliates: [
        {
          id: 'aff_braden', real: true, name: 'Braden', handle: 'biologix', platform: 'Instagram',
          followers: null, owner: 'Alex', stage: 'signed', source: 'Founder',
          parentId: '', code: '', link: '', rate: null, overrideRate: null,
          signedOn: '', gates: {}, postsLive: 0, lastPostOn: '',
          nextAction: 'Reconcile the four live deal versions before any term sheet',
          nextActionDue: today(), lossReason: '', risk: [],
          notes: 'Founder. Not an affiliate. Held here so the account has a person record. Three calls recorded: 2026-07-21, 2026-07-22, 2026-07-23. A fourth call is pending and its outcome is not recorded.'
        },
        {
          id: 'aff_connor', real: true, name: 'Connor', handle: '', platform: 'Other',
          followers: null, owner: 'Unassigned', stage: 'active', source: 'Biologix team',
          parentId: '', code: '', link: '', rate: null, overrideRate: null,
          signedOn: '', gates: {}, postsLive: 0, lastPostOn: '',
          nextAction: 'Resolve who owns the legacy affiliate book',
          nextActionDue: today(), lossReason: '', risk: [],
          notes: 'Runs the existing Creators Corner affiliates. Ownership of the legacy book is unresolved. Reported three to five actually active affiliates.'
        },
        {
          id: 'aff_ex1', name: 'Example — Mara K.', handle: 'marakfit', platform: 'Instagram',
          followers: 84000, owner: 'Patricia', stage: 'active', source: 'IG explore',
          parentId: '', code: 'MARA', link: 'biologixlabsresearch.com/?ref=MARA',
          rate: null, overrideRate: null, signedOn: '2026-07-08', postsLive: 6, lastPostOn: '2026-07-21',
          gates: { passport: true, adult: true, agreement: true, tax: true, training: true, account: true, tracking: true, content: true, launch: true },
          nextAction: 'Approve next content batch', nextActionDue: addDays(today(), 2),
          lossReason: '', risk: [], notes: 'Example row. Delete once real data is loaded.'
        },
        {
          id: 'aff_ex2', name: 'Example — Devon R.', handle: 'devonlifts', platform: 'Instagram',
          followers: 210000, owner: 'Patricia', stage: 'onboarding', source: 'Referral from Mara',
          parentId: 'aff_ex1', code: 'DEVON', link: '',
          rate: null, overrideRate: null, signedOn: '2026-07-19', postsLive: 0, lastPostOn: '',
          gates: { passport: true, adult: true, agreement: true, tax: false, training: false, account: false, tracking: false, content: false, launch: false },
          nextAction: 'Chase W-9 and payout method', nextActionDue: addDays(today(), -1),
          lossReason: '', risk: [], notes: 'Example row. Recruited by Mara, so Mara earns the override once a rate exists.'
        },
        {
          id: 'aff_ex3', name: 'Example — Sasha B.', handle: 'sashabwell', platform: 'TikTok',
          followers: 45000, owner: 'Patricia', stage: 'call_booked', source: 'Outbound DM',
          parentId: '', code: '', link: '', rate: null, overrideRate: null,
          signedOn: '', gates: {}, postsLive: 0, lastPostOn: '',
          nextAction: 'Run the qualification call', nextActionDue: addDays(today(), 1),
          lossReason: '', risk: ['Makes medical claims'], notes: 'Example row. Flagged: prior posts make dosing claims. Screen hard.'
        },
        {
          id: 'aff_ex4', name: 'Example — Tomas L.', handle: 'tomaslifts', platform: 'Instagram',
          followers: 128000, owner: 'Patricia', stage: 'contacted', source: 'IG explore',
          parentId: '', code: '', link: '', rate: null, overrideRate: null,
          signedOn: '', gates: {}, postsLive: 0, lastPostOn: '',
          nextAction: 'Follow up on first DM', nextActionDue: addDays(today(), -4),
          lossReason: '', risk: [], notes: 'Example row. Overdue on purpose so you can see the stalled view work.'
        }
      ],
      sales: [
        { id: 's1', date: addDays(today(), -18), affiliateId: 'aff_ex1', orderRef: 'BX-10241', gross: 248, refunded: 0, product: 'Retatrutide 10mg', notes: '' },
        { id: 's2', date: addDays(today(), -15), affiliateId: 'aff_ex1', orderRef: 'BX-10288', gross: 496, refunded: 0, product: 'Bundle', notes: '' },
        { id: 's3', date: addDays(today(), -12), affiliateId: 'aff_ex1', orderRef: 'BX-10330', gross: 189, refunded: 189, product: 'BPC-157', notes: 'Full refund, customer changed mind' },
        { id: 's4', date: addDays(today(), -9), affiliateId: 'aff_ex1', orderRef: 'BX-10402', gross: 372, refunded: 0, product: 'Tirzepatide 20mg', notes: '' },
        { id: 's5', date: addDays(today(), -6), affiliateId: 'aff_ex1', orderRef: 'BX-10465', gross: 248, refunded: 0, product: 'Retatrutide 10mg', notes: '' },
        { id: 's6', date: addDays(today(), -3), affiliateId: 'aff_ex1', orderRef: 'BX-10530', gross: 620, refunded: 0, product: 'Bundle', notes: '' },
        { id: 's7', date: addDays(today(), -2), affiliateId: 'aff_ex2', orderRef: 'BX-10544', gross: 248, refunded: 0, product: 'Retatrutide 10mg', notes: 'Pre-launch test order' }
      ],
      outbound: [
        { id: 'o1', name: 'Example — Priya N.', handle: 'priyastrong', platform: 'Instagram', followers: 96000, owner: 'Patricia', channel: 'Instagram DM', step: 2, lastTouch: addDays(today(), -3), replied: false, disposition: 'No response', dnc: false, nextAction: 'Send touch 3', nextActionDue: addDays(today(), 1), notes: 'Example row.' },
        { id: 'o2', name: 'Example — Jordan V.', handle: 'jordanvfit', platform: 'TikTok', followers: 155000, owner: 'Patricia', channel: 'Instagram DM', step: 1, lastTouch: addDays(today(), -6), replied: true, disposition: 'Interested', dnc: false, nextAction: 'Book the call', nextActionDue: addDays(today(), -2), notes: 'Example row. Replied and went quiet.' },
        { id: 'o3', name: 'Example — Cole M.', handle: 'colemhealth', platform: 'Instagram', followers: 61000, owner: 'Kennedy', channel: 'Email', step: 3, lastTouch: addDays(today(), -1), replied: false, disposition: 'No response', dnc: false, nextAction: 'Last touch then close out', nextActionDue: addDays(today(), 4), notes: 'Example row.' },
        { id: 'o4', name: 'Example — Riley T.', handle: 'rileytwell', platform: 'Instagram', followers: 32000, owner: 'Patricia', channel: 'Instagram DM', step: 1, lastTouch: addDays(today(), -10), replied: true, disposition: 'Do not contact', dnc: true, nextAction: '', nextActionDue: '', notes: 'Example row. Asked to be left alone. Never contact again.' }
      ],
      payouts: [
        { id: 'p1', date: addDays(today(), -14), affiliateId: 'aff_ex1', amount: 0, method: 'ACH', status: 'Queued', reference: '', notes: 'Amount is zero because no commission rate has been agreed.' }
      ]
    };
  }

  /* ----------------------------------------------------------- date utils */

  function today() {
    var d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function addDays(iso, n) {
    var d = new Date(iso + 'T12:00:00');
    d.setDate(d.getDate() + n);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function daysBetween(a, b) {
    if (!a || !b) return null;
    var da = new Date(a + 'T12:00:00'), db = new Date(b + 'T12:00:00');
    return Math.round((db - da) / 86400000);
  }

  /* --------------------------------------------------------------- store */

  var state = null;

  function load() {
    var raw = null;
    try { raw = global.localStorage.getItem(KEY); } catch (e) { raw = null; }
    if (raw) {
      try {
        var parsed = JSON.parse(raw);
        if (parsed && parsed.affiliates) { state = parsed; return state; }
      } catch (e) { /* fall through to seed */ }
    }
    state = seed();
    save();
    return state;
  }

  function save() {
    try { global.localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* private mode */ }
    if (typeof global.dispatchEvent === 'function') {
      global.dispatchEvent(new CustomEvent('crm:change'));
    }
  }

  function reset() {
    state = seed();
    save();
    return state;
  }

  function clearAll() {
    state = { meta: seed().meta, affiliates: [], sales: [], outbound: [], payouts: [] };
    save();
    return state;
  }

  function nextId(entity) {
    var p = { affiliates: 'aff', sales: 's', outbound: 'o', payouts: 'p' }[entity] || 'r';
    var n = 1;
    (state[entity] || []).forEach(function (r) {
      var m = /(\d+)$/.exec(r.id || '');
      if (m && +m[1] >= n) n = +m[1] + 1;
    });
    return p + '_' + n + '_' + Math.random().toString(36).slice(2, 6);
  }

  function add(entity, record) {
    var r = Object.assign({}, record);
    if (!r.id) r.id = nextId(entity);
    state[entity].push(r);
    save();
    return r;
  }

  function update(entity, id, patch) {
    var r = get(entity, id);
    if (!r) return null;
    Object.assign(r, patch);
    save();
    return r;
  }

  function remove(entity, id) {
    var i = state[entity].findIndex(function (r) { return r.id === id; });
    if (i < 0) return false;
    state[entity].splice(i, 1);
    /* keep referential integrity: orphan the children rather than delete them */
    if (entity === 'affiliates') {
      state.affiliates.forEach(function (a) { if (a.parentId === id) a.parentId = ''; });
      state.sales = state.sales.filter(function (s) { return s.affiliateId !== id; });
      state.payouts = state.payouts.filter(function (p) { return p.affiliateId !== id; });
    }
    save();
    return true;
  }

  function get(entity, id) {
    return (state[entity] || []).find(function (r) { return r.id === id; }) || null;
  }

  function all(entity) { return (state[entity] || []).slice(); }

  /* ------------------------------------------------------------- derived */

  function num(v) { var n = parseFloat(v); return isNaN(n) ? 0 : n; }

  /* Money for one affiliate. Commission is null, not zero, when no rate is set.
     Zero would be a lie: it reads as "owed nothing" when the truth is "unknown". */
  function affiliateMoney(id) {
    var sales = state.sales.filter(function (s) { return s.affiliateId === id; });
    var gross = 0, refunded = 0, orders = sales.length, lastSale = '';
    sales.forEach(function (s) {
      gross += num(s.gross);
      refunded += num(s.refunded);
      if (!lastSale || s.date > lastSale) lastSale = s.date;
    });
    var net = gross - refunded;

    var aff = get('affiliates', id);
    var rate = aff && aff.rate !== null && aff.rate !== '' && aff.rate !== undefined ? num(aff.rate) : null;
    var earned = rate === null ? null : net * rate / 100;

    /* override earned BY this affiliate on its downline */
    var downline = state.affiliates.filter(function (a) { return a.parentId === id; });
    var overrideEarned = null;
    downline.forEach(function (child) {
      var childRate = child.overrideRate !== null && child.overrideRate !== '' && child.overrideRate !== undefined
        ? num(child.overrideRate) : null;
      if (childRate === null) return;
      var childNet = state.sales
        .filter(function (s) { return s.affiliateId === child.id; })
        .reduce(function (t, s) { return t + num(s.gross) - num(s.refunded); }, 0);
      overrideEarned = (overrideEarned || 0) + childNet * childRate / 100;
    });

    var paid = state.payouts
      .filter(function (p) { return p.affiliateId === id && (p.status === 'Sent' || p.status === 'Cleared'); })
      .reduce(function (t, p) { return t + num(p.amount); }, 0);

    var totalEarned = (earned === null && overrideEarned === null)
      ? null
      : num(earned) + num(overrideEarned);
    var owed = totalEarned === null ? null : totalEarned - paid;

    return {
      orders: orders, gross: gross, refunded: refunded, net: net,
      refundRate: gross > 0 ? refunded / gross : 0,
      aov: orders > 0 ? gross / orders : 0,
      rate: rate, earned: earned, overrideEarned: overrideEarned,
      totalEarned: totalEarned, paid: paid, owed: owed,
      lastSale: lastSale,
      daysSinceLastSale: lastSale ? daysBetween(lastSale, today()) : null,
      downlineCount: downline.length
    };
  }

  function gateProgress(aff) {
    var g = aff.gates || {};
    var done = GATES.filter(function (x) { return g[x.id] === true; }).length;
    var blocked = null;
    for (var i = 0; i < GATES.length; i++) {
      if (g[GATES[i].id] !== true) { blocked = GATES[i]; break; }
    }
    return { done: done, total: GATES.length, blockedBy: blocked, complete: done === GATES.length };
  }

  /* A record is a defect if it has no owner or no next action.
     That rule is the whole point of the panel: nothing sits unowned. */
  function defects() {
    var out = [];
    state.affiliates.forEach(function (a) {
      var why = [];
      if (!a.owner || a.owner === 'Unassigned') why.push('no owner');
      if (!a.nextAction) why.push('no next action');
      if (!a.nextActionDue) why.push('no due date');
      if (a.stage === 'active' && !gateProgress(a).complete) why.push('live but gates incomplete');
      if (a.stage === 'active' && !a.code && !a.link) why.push('live but no code or link');
      if (why.length) out.push({ entity: 'affiliates', id: a.id, name: a.name, why: why });
    });
    state.outbound.forEach(function (o) {
      var why = [];
      if (!o.owner || o.owner === 'Unassigned') why.push('no owner');
      if (!o.dnc && !o.nextAction) why.push('no next action');
      if (why.length) out.push({ entity: 'outbound', id: o.id, name: o.name, why: why });
    });
    return out;
  }

  function overdue() {
    var t = today();
    var out = [];
    state.affiliates.forEach(function (a) {
      if (a.nextActionDue && a.nextActionDue < t && a.stage !== 'churned' && a.stage !== 'rejected') {
        out.push({ entity: 'affiliates', id: a.id, name: a.name, owner: a.owner,
          action: a.nextAction, due: a.nextActionDue, daysLate: -daysBetween(t, a.nextActionDue) });
      }
    });
    state.outbound.forEach(function (o) {
      if (!o.dnc && o.nextActionDue && o.nextActionDue < t) {
        out.push({ entity: 'outbound', id: o.id, name: o.name, owner: o.owner,
          action: o.nextAction, due: o.nextActionDue, daysLate: -daysBetween(t, o.nextActionDue) });
      }
    });
    return out.sort(function (a, b) { return b.daysLate - a.daysLate; });
  }

  function totals() {
    var gross = 0, refunded = 0, orders = 0;
    state.sales.forEach(function (s) { gross += num(s.gross); refunded += num(s.refunded); orders++; });
    var net = gross - refunded;

    var live = state.affiliates.filter(function (a) { return a.stage === 'active'; });
    var selling = {};
    state.sales.forEach(function (s) { selling[s.affiliateId] = true; });
    var producing = live.filter(function (a) { return selling[a.id]; });

    var signed = state.affiliates.filter(function (a) {
      return ['signed', 'onboarding', 'active', 'paused', 'churned'].indexOf(a.stage) >= 0;
    });

    var anyRate = state.affiliates.some(function (a) {
      return a.rate !== null && a.rate !== '' && a.rate !== undefined;
    });

    var owed = null;
    if (anyRate) {
      owed = 0;
      state.affiliates.forEach(function (a) {
        var m = affiliateMoney(a.id);
        if (m.owed !== null) owed += m.owed;
      });
    }

    var onboarding = state.affiliates.filter(function (a) { return a.stage === 'onboarding'; });
    var gatesBlocked = {};
    onboarding.forEach(function (a) {
      var g = gateProgress(a);
      if (g.blockedBy) gatesBlocked[g.blockedBy.id] = (gatesBlocked[g.blockedBy.id] || 0) + 1;
    });

    return {
      gross: gross, refunded: refunded, net: net, orders: orders,
      aov: orders > 0 ? gross / orders : 0,
      refundRate: gross > 0 ? refunded / gross : 0,
      affiliateCount: state.affiliates.length,
      signedCount: signed.length,
      liveCount: live.length,
      producingCount: producing.length,
      activationRate: signed.length > 0 ? producing.length / signed.length : null,
      onboardingCount: onboarding.length,
      gatesBlocked: gatesBlocked,
      outboundCount: state.outbound.filter(function (o) { return !o.dnc; }).length,
      outboundReplied: state.outbound.filter(function (o) { return o.replied; }).length,
      commissionOwed: owed,
      rateAgreed: anyRate,
      defectCount: defects().length,
      overdueCount: overdue().length
    };
  }

  function pipelineCounts() {
    var out = {};
    STAGES.forEach(function (s) { out[s.id] = 0; });
    state.affiliates.forEach(function (a) {
      if (out[a.stage] === undefined) out[a.stage] = 0;
      out[a.stage]++;
    });
    return out;
  }

  /* Sales grouped by day, for the trend strip. */
  function salesByDay(days) {
    var end = today(), map = {}, out = [];
    for (var i = days - 1; i >= 0; i--) map[addDays(end, -i)] = 0;
    state.sales.forEach(function (s) {
      if (map[s.date] !== undefined) map[s.date] += num(s.gross) - num(s.refunded);
    });
    Object.keys(map).forEach(function (d) { out.push({ date: d, value: map[d] }); });
    return out;
  }

  /* ------------------------------------------------------------- filters */

  function list(entity, opts) {
    opts = opts || {};
    var rows = all(entity);

    if (opts.search) {
      var q = opts.search.toLowerCase();
      rows = rows.filter(function (r) {
        return Object.keys(r).some(function (k) {
          var v = r[k];
          return typeof v === 'string' && v.toLowerCase().indexOf(q) >= 0;
        });
      });
    }
    if (opts.filters) {
      Object.keys(opts.filters).forEach(function (k) {
        var want = opts.filters[k];
        if (!want || want === 'all') return;
        rows = rows.filter(function (r) { return String(r[k]) === String(want); });
      });
    }
    if (opts.sort) {
      var key = opts.sort, dir = opts.dir === 'desc' ? -1 : 1;
      rows.sort(function (a, b) {
        var av = sortValue(entity, a, key), bv = sortValue(entity, b, key);
        if (av === null || av === undefined || av === '') return 1;
        if (bv === null || bv === undefined || bv === '') return -1;
        if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
        return String(av).localeCompare(String(bv)) * dir;
      });
    }
    return rows;
  }

  /* Derived columns are sortable too, which is the point of a panel. */
  function sortValue(entity, row, key) {
    if (entity === 'affiliates') {
      var m;
      if (key === 'gross' || key === 'net' || key === 'orders' || key === 'owed' ||
          key === 'aov' || key === 'lastSale' || key === 'refunded') {
        m = affiliateMoney(row.id);
        return m[key];
      }
      if (key === 'gates') return gateProgress(row).done;
    }
    /* The ledgers show the affiliate name, so sort on the name, not the id.
       Sorting on the raw id looks random to whoever clicked the column. */
    if (key === 'affiliateId' && (entity === 'sales' || entity === 'payouts')) {
      var aff = get('affiliates', row.affiliateId);
      return aff && aff.name ? aff.name : '';
    }
    return row[key];
  }

  /* ----------------------------------------------------------------- CSV */

  function csvEscape(v) {
    if (v === null || v === undefined) return '';
    var s = String(v);
    if (typeof v === 'object') s = JSON.stringify(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function toCSV(entity) {
    var fields = SCHEMA[entity].fields.map(function (f) { return f.key; });
    var typeByKey = {};
    SCHEMA[entity].fields.forEach(function (f) { typeByKey[f.key] = f.type; });
    var head = ['id'].concat(fields);
    if (entity === 'affiliates') head = head.concat(['orders', 'gross', 'refunded', 'net', 'commissionOwed']);
    var lines = [head.join(',')];
    all(entity).forEach(function (r) {
      var row = head.map(function (k) {
        if (entity === 'affiliates' && ['orders', 'gross', 'refunded', 'net', 'commissionOwed'].indexOf(k) >= 0) {
          var m = affiliateMoney(r.id);
          return csvEscape(k === 'commissionOwed' ? (m.owed === null ? 'no rate set' : m.owed) : m[k]);
        }
        /* Multi-select columns export as "a; b" so importing them back returns
           the same list. JSON here would re-import as one nonsense flag. */
        if (typeByKey[k] === 'multi') {
          return csvEscape((r[k] || []).join('; '));
        }
        return csvEscape(r[k]);
      });
      lines.push(row.join(','));
    });
    return lines.join('\n');
  }

  function parseCSV(text) {
    var rows = [], row = [], cur = '', inQ = false;
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (inQ) {
        if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; }
        else if (c === '"') inQ = false;
        else cur += c;
      } else if (c === '"') inQ = true;
      else if (c === ',') { row.push(cur); cur = ''; }
      else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
      else if (c !== '\r') cur += c;
    }
    if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
    return rows.filter(function (r) { return r.some(function (c) { return c !== ''; }); });
  }

  /* Multi-select cells arrive as "a; b". Files written by older builds of this
     tool hold a JSON array instead, so accept that too rather than turning
     ["Makes medical claims"] into a single junk flag. */
  function parseMulti(raw) {
    var s = String(raw === null || raw === undefined ? '' : raw).trim();
    if (!s || s === '[]') return [];
    if (s.charAt(0) === '[') {
      try {
        var arr = JSON.parse(s);
        if (Object.prototype.toString.call(arr) === '[object Array]') {
          return arr.map(function (x) { return String(x).trim(); })
            .filter(function (x) { return x !== ''; });
        }
      } catch (e) { /* not JSON, fall through to the separator split */ }
    }
    return s.split(/\s*;\s*/).map(function (x) { return x.trim(); })
      .filter(function (x) { return x !== ''; });
  }

  /* Import merges by id when present, appends otherwise. Never silently drops. */
  function fromCSV(entity, text) {
    var rows = parseCSV(text);
    if (!rows.length) return { added: 0, updated: 0, skipped: 0, errors: ['empty file'] };
    var head = rows[0].map(function (h) { return h.trim(); });
    var known = SCHEMA[entity].fields.map(function (f) { return f.key; }).concat(['id']);
    var unknown = head.filter(function (h) { return known.indexOf(h) < 0; });
    var added = 0, updated = 0, skipped = 0, errors = [];

    for (var i = 1; i < rows.length; i++) {
      var rec = {};
      head.forEach(function (h, j) {
        if (known.indexOf(h) < 0) return;
        var f = SCHEMA[entity].fields.find(function (x) { return x.key === h; });
        var raw = (rows[i][j] || '').trim();
        if (!f) { rec[h] = raw; return; }
        if (f.type === 'number' || f.type === 'money') rec[h] = raw === '' ? null : parseFloat(raw);
        else if (f.type === 'bool') rec[h] = /^(true|yes|1)$/i.test(raw);
        else if (f.type === 'multi') rec[h] = parseMulti(raw);
        else if (f.type === 'gates') { try { rec[h] = raw ? JSON.parse(raw) : {}; } catch (e) { rec[h] = {}; } }
        else rec[h] = raw;
      });
      var req = SCHEMA[entity].fields.filter(function (f) { return f.required; });
      var missing = req.filter(function (f) { return !rec[f.key] && rec[f.key] !== 0; });
      if (missing.length) {
        skipped++;
        errors.push('row ' + (i + 1) + ': missing ' + missing.map(function (f) { return f.label; }).join(', '));
        continue;
      }
      if (rec.id && get(entity, rec.id)) { update(entity, rec.id, rec); updated++; }
      else { delete rec.id; add(entity, rec); added++; }
    }
    if (unknown.length) errors.push('ignored unknown columns: ' + unknown.join(', '));
    return { added: added, updated: updated, skipped: skipped, errors: errors };
  }

  /* --------------------------------------------------------------- expose */

  global.CRM = {
    KEY: KEY,
    OWNERS: OWNERS, STAGES: STAGES, GATES: GATES, CHANNELS: CHANNELS,
    DISPOSITIONS: DISPOSITIONS, LOSS_REASONS: LOSS_REASONS, RISK_FLAGS: RISK_FLAGS,
    SCHEMA: SCHEMA,
    load: load, save: save, reset: reset, clearAll: clearAll,
    add: add, update: update, remove: remove, get: get, all: all, list: list,
    affiliateMoney: affiliateMoney, gateProgress: gateProgress,
    totals: totals, defects: defects, overdue: overdue,
    pipelineCounts: pipelineCounts, salesByDay: salesByDay,
    toCSV: toCSV, fromCSV: fromCSV,
    today: today, addDays: addDays, daysBetween: daysBetween,
    get state() { return state; }
  };
})(window);
