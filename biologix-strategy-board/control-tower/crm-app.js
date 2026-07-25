/* Biologix Control Tower — application layer.
   Renders the six views, drives the drawer, wires every control.
   All storage, money math, CSV and filtering live in crm-data.js. */
(function (global) {
  'use strict';

  var CRM = global.CRM;
  if (!CRM) return;

  /* ------------------------------------------------------------- lookups */

  var STAGE_BY_ID = {};
  CRM.STAGES.forEach(function (s) { STAGE_BY_ID[s.id] = s; });

  var GATE_BY_ID = {};
  CRM.GATES.forEach(function (g) { GATE_BY_ID[g.id] = g; });

  var TABS = ['dashboard', 'affiliates', 'pipeline', 'onboarding', 'outbound', 'money'];

  var TAB_ENTITY = {
    dashboard: 'affiliates', affiliates: 'affiliates', pipeline: 'affiliates',
    onboarding: 'affiliates', outbound: 'outbound', money: 'sales'
  };

  /* Columns that read better sorted high to low on first click. */
  var NUMERIC_SORT = {
    orders: 1, gross: 1, refunded: 1, net: 1, owed: 1, rate: 1, gates: 1,
    lastSale: 1, followers: 1, step: 1, lastTouch: 1, date: 1, amount: 1,
    nextActionDue: 0
  };

  /* --------------------------------------------------------------- state */

  var ui = {
    tab: 'dashboard',
    aff: { q: '', owner: 'all', stage: 'all', sort: 'name', dir: 'asc' },
    out: { q: '', owner: 'all', disposition: 'all', hideDnc: true, sort: 'name', dir: 'asc' },
    pipe: { owner: 'all' },
    onb: { owner: 'all' },
    sales: { sort: 'date', dir: 'desc' },
    payouts: { sort: 'date', dir: 'desc' }
  };

  var drawer = { open: false, entity: null, id: null, trigger: null, back: null };
  var toastTimer = null;
  var hashLock = false;

  /* ------------------------------------------------------------- helpers */

  function $(id) { return document.getElementById(id); }
  function qs(sel, root) { return (root || document).querySelector(sel); }
  function qsa(sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  }

  function esc(v) {
    if (v === null || v === undefined) return '';
    return String(v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function isBlank(v) { return v === null || v === undefined || v === ''; }

  function thousands(s) {
    var parts = String(s).split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return parts.join('.');
  }

  function fmtMoney(n, dp) {
    if (n === null || n === undefined || isNaN(n)) return '';
    var d = dp === undefined ? 2 : dp;
    var neg = n < 0;
    var s = '$' + thousands(Math.abs(n).toFixed(d));
    return neg ? '-' + s : s;
  }

  function fmtInt(n) {
    if (n === null || n === undefined || isNaN(n)) return '';
    return thousands(Math.round(n));
  }

  function fmtPct(x, dp) {
    if (x === null || x === undefined || isNaN(x)) return '';
    return (x * 100).toFixed(dp === undefined ? 1 : dp) + '%';
  }

  function unset(text) {
    return '<span class="crm-unset">' + esc(text || 'no rate set') + '</span>';
  }

  function stageChip(id) {
    var s = STAGE_BY_ID[id];
    if (!s) return unset('no stage');
    return '<span class="crm-stage" data-group="' + esc(s.group) + '">' + esc(s.label) + '</span>';
  }

  function pill(text, kind) {
    return '<span class="crm-pill' + (kind ? ' ' + kind : '') + '">' + esc(text) + '</span>';
  }

  function affName(id) {
    var a = CRM.get('affiliates', id);
    return a ? a.name : '';
  }

  function dueCell(due, action) {
    var out = action ? esc(action) : unset('no next action');
    if (!due) return out + '<div class="crm-sub">' + unset('no due date') + '</div>';
    var late = CRM.daysBetween(CRM.today(), due);
    var tag = late < 0
      ? pill(due + ', ' + Math.abs(late) + 'd late', 'is-bad')
      : '<span class="crm-sub">' + esc(due) + '</span>';
    return out + '<div class="crm-sub">' + tag + '</div>';
  }

  function announce(msg) {
    var el = $('crm-live');
    if (el) el.textContent = msg;
  }

  function toast(msg) {
    var el = $('crm-toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('is-show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('is-show'); }, 5000);
    announce(msg);
  }

  function emptyRow(cols, text) {
    return '<tr><td class="crm-empty" colspan="' + cols + '">' + esc(text) + '</td></tr>';
  }

  /* ----------------------------------------------------------- hash sync */

  var HASH_MAP = [
    ['t', function () { return ui.tab; }, function (v) { if (TABS.indexOf(v) >= 0) ui.tab = v; }],
    ['aq', function () { return ui.aff.q; }, function (v) { ui.aff.q = v; }],
    ['ao', function () { return ui.aff.owner; }, function (v) { ui.aff.owner = v; }],
    ['as', function () { return ui.aff.stage; }, function (v) { ui.aff.stage = v; }],
    ['ak', function () { return ui.aff.sort; }, function (v) { ui.aff.sort = v; }],
    ['ad', function () { return ui.aff.dir; }, function (v) { ui.aff.dir = v === 'desc' ? 'desc' : 'asc'; }],
    ['oq', function () { return ui.out.q; }, function (v) { ui.out.q = v; }],
    ['oo', function () { return ui.out.owner; }, function (v) { ui.out.owner = v; }],
    ['od', function () { return ui.out.disposition; }, function (v) { ui.out.disposition = v; }],
    ['ox', function () { return ui.out.hideDnc ? '1' : '0'; }, function (v) { ui.out.hideDnc = v !== '0'; }],
    ['ok', function () { return ui.out.sort; }, function (v) { ui.out.sort = v; }],
    ['oe', function () { return ui.out.dir; }, function (v) { ui.out.dir = v === 'desc' ? 'desc' : 'asc'; }],
    ['po', function () { return ui.pipe.owner; }, function (v) { ui.pipe.owner = v; }],
    ['no', function () { return ui.onb.owner; }, function (v) { ui.onb.owner = v; }],
    ['sk', function () { return ui.sales.sort; }, function (v) { ui.sales.sort = v; }],
    ['sd', function () { return ui.sales.dir; }, function (v) { ui.sales.dir = v === 'asc' ? 'asc' : 'desc'; }],
    ['pk', function () { return ui.payouts.sort; }, function (v) { ui.payouts.sort = v; }],
    ['pd', function () { return ui.payouts.dir; }, function (v) { ui.payouts.dir = v === 'asc' ? 'asc' : 'desc'; }]
  ];

  function writeHash() {
    var parts = [];
    HASH_MAP.forEach(function (m) {
      var v = m[1]();
      if (v === '' || v === null || v === undefined) return;
      parts.push(m[0] + '=' + encodeURIComponent(v));
    });
    hashLock = true;
    var h = '#' + parts.join('&');
    if (global.history && global.history.replaceState) {
      global.history.replaceState(null, '', global.location.pathname + global.location.search + h);
    } else {
      global.location.hash = h;
    }
    setTimeout(function () { hashLock = false; }, 0);
  }

  function readHash() {
    var raw = global.location.hash.replace(/^#/, '');
    if (!raw) return;
    var bag = {};
    raw.split('&').forEach(function (p) {
      if (!p) return;
      var i = p.indexOf('=');
      var k = i < 0 ? p : p.slice(0, i);
      var v = i < 0 ? '' : decodeURIComponent(p.slice(i + 1).replace(/\+/g, ' '));
      bag[k] = v;
    });
    HASH_MAP.forEach(function (m) {
      if (bag[m[0]] !== undefined) m[2](bag[m[0]]);
    });
  }

  /* ------------------------------------------------------------- filling */

  function fillSelect(el, values, allLabel, labelFn) {
    if (!el) return;
    var html = allLabel ? '<option value="all">' + esc(allLabel) + '</option>' : '';
    values.forEach(function (v) {
      var val = typeof v === 'object' ? v.id : v;
      var lab = labelFn ? labelFn(v) : (typeof v === 'object' ? v.label : v);
      html += '<option value="' + esc(val) + '">' + esc(lab) + '</option>';
    });
    el.innerHTML = html;
  }

  /* ============================================================ DASHBOARD */

  function renderDashboard() {
    var t = CRM.totals();

    var metrics = [
      { v: fmtMoney(t.net, 0), l: 'Net sales', n: fmtInt(t.orders) + ' orders, ' + fmtMoney(t.gross, 0) + ' gross' },
      { v: fmtInt(t.orders), l: 'Orders', n: 'across ' + fmtInt(t.affiliateCount) + ' affiliate records' },
      { v: t.orders > 0 ? fmtMoney(t.aov, 0) : null, l: 'Average order', n: t.orders > 0 ? 'gross over orders' : 'no orders recorded yet' },
      { v: t.gross > 0 ? fmtPct(t.refundRate) : null, l: 'Refund rate', n: t.gross > 0 ? fmtMoney(t.refunded, 0) + ' refunded' : 'no gross sales to measure against' },
      { v: fmtInt(t.liveCount), l: 'Live affiliates', n: fmtInt(t.onboardingCount) + ' in onboarding' },
      { v: fmtInt(t.producingCount), l: 'Producing affiliates', n: 'live and have sold at least once' },
      { v: t.activationRate === null ? null : fmtPct(t.activationRate, 0), l: 'Activation rate', n: t.activationRate === null ? 'no signed affiliates to measure' : fmtInt(t.producingCount) + ' producing of ' + fmtInt(t.signedCount) + ' signed' },
      { v: t.commissionOwed === null ? null : fmtMoney(t.commissionOwed, 0), l: 'Commission owed', n: t.commissionOwed === null ? 'no commission rate agreed' : 'earned less paid' }
    ];

    $('dash-metrics').innerHTML = metrics.map(function (m) {
      var unknown = m.v === null || m.v === '';
      return '<div class="crm-metric">' +
        '<div class="crm-metric-value">' + (unknown ? '<span class="crm-unset">not computable</span>' : esc(m.v)) + '</div>' +
        '<div class="crm-metric-label">' + esc(m.l) + '</div>' +
        '<div class="crm-metric-note' + (unknown ? ' is-unknown' : '') + '">' + esc(m.n) + '</div>' +
        '</div>';
    }).join('');

    /* trend */
    var days = CRM.salesByDay(30);
    var max = 0, sum = 0, best = null;
    days.forEach(function (d) {
      var v = Math.max(0, d.value);
      sum += d.value;
      if (v > max) { max = v; best = d; }
    });
    $('dash-spark').innerHTML = days.map(function (d) {
      var v = Math.max(0, d.value);
      var h = max > 0 ? Math.max(2, Math.round(v / max * 100)) : 2;
      return '<span class="crm-spark-bar" style="height:' + h + '%" title="' +
        esc(d.date + ', ' + (d.value ? fmtMoney(d.value, 0) : 'no sales')) + '"></span>';
    }).join('');
    $('dash-spark').setAttribute('aria-hidden', 'true');
    $('dash-spark-note').textContent = best && max > 0
      ? fmtMoney(sum, 0) + ' over 30 days, best day ' + best.date + ' at ' + fmtMoney(best.value, 0)
      : 'No sales recorded in the last 30 days.';

    /* overdue */
    var od = CRM.overdue();
    $('dash-overdue').innerHTML = od.length ? od.map(function (r) {
      return '<tr class="crm-row" data-entity="' + esc(r.entity) + '" data-id="' + esc(r.id) + '" tabindex="0" data-fkey="od:' + esc(r.id) + '">' +
        '<td class="crm-cell-name">' + esc(r.name) + '<div class="crm-sub">' + esc(CRM.SCHEMA[r.entity].label) + '</div></td>' +
        '<td>' + (r.owner && r.owner !== 'Unassigned' ? esc(r.owner) : unset('unowned')) + '</td>' +
        '<td>' + (r.action ? esc(r.action) : unset('no next action')) + '</td>' +
        '<td class="crm-num">' + esc(r.due) + '</td>' +
        '<td class="crm-num">' + pill(r.daysLate + 'd', 'is-bad') + '</td></tr>';
    }).join('') : emptyRow(5, 'Nothing is past due.');

    /* defects */
    var df = CRM.defects();
    $('dash-defects').innerHTML = df.length ? df.map(function (r) {
      return '<tr class="crm-row" data-entity="' + esc(r.entity) + '" data-id="' + esc(r.id) + '" tabindex="0" data-fkey="df:' + esc(r.id) + '">' +
        '<td class="crm-cell-name">' + esc(r.name) + '</td>' +
        '<td>' + esc(CRM.SCHEMA[r.entity].label) + '</td>' +
        '<td>' + r.why.map(function (w) { return pill(w, 'is-warn'); }).join(' ') + '</td></tr>';
    }).join('') : emptyRow(3, 'No defects. Every record has an owner and a next action.');

    /* pipeline counts */
    var counts = CRM.pipelineCounts();
    $('dash-pipeline').innerHTML = CRM.STAGES.map(function (s) {
      var n = counts[s.id] || 0;
      return '<span class="crm-stage" data-group="' + esc(s.group) + '">' + esc(s.label) +
        ' <b class="crm-num">' + n + '</b></span>';
    }).join(' ');

    /* gate bottleneck */
    var gb = t.gatesBlocked, keys = Object.keys(gb);
    if (!keys.length) {
      $('dash-gates').innerHTML = '<p class="crm-sub">' +
        (t.onboardingCount === 0
          ? 'No affiliate is in onboarding, so no gate is blocking anyone.'
          : 'No affiliate is blocked. Every onboarding record has cleared its gates.') + '</p>';
    } else {
      keys.sort(function (a, b) { return gb[b] - gb[a]; });
      $('dash-gates').innerHTML = keys.map(function (k) {
        var g = GATE_BY_ID[k];
        return '<div>' +
          pill(gb[k] + (gb[k] === 1 ? ' affiliate blocked at ' : ' affiliates blocked at ') + (g ? g.label : k), 'is-warn') +
          '<div class="crm-sub">' + esc(g ? g.note : '') + '</div></div>';
      }).join('');
    }
  }

  /* =========================================================== AFFILIATES */

  function affiliateRows() {
    return CRM.list('affiliates', {
      search: ui.aff.q,
      filters: { owner: ui.aff.owner, stage: ui.aff.stage },
      sort: ui.aff.sort,
      dir: ui.aff.dir
    });
  }

  function gateBar(aff) {
    var g = CRM.gateProgress(aff);
    var pct = Math.round(g.done / g.total * 100);
    return '<span class="crm-gatebar" title="' + esc(g.done + ' of ' + g.total + ' gates passed') + '">' +
      '<span class="crm-gatebar-fill" style="width:' + pct + '%"></span></span>' +
      '<span class="crm-num crm-sub">' + g.done + '/' + g.total + '</span>';
  }

  function renderAffiliates() {
    var rows = affiliateRows();
    var tOrders = 0, tGross = 0, tRef = 0, tNet = 0;

    var html = rows.map(function (a) {
      var m = CRM.affiliateMoney(a.id);
      tOrders += m.orders; tGross += m.gross; tRef += m.refunded; tNet += m.net;
      var risk = (a.risk || []).map(function (r) { return '<span class="crm-flag">' + esc(r) + '</span>'; }).join(' ');
      return '<tr class="crm-row" data-entity="affiliates" data-id="' + esc(a.id) + '" tabindex="0" data-fkey="aff:' + esc(a.id) + '">' +
        '<td class="crm-cell-name">' + esc(a.name) +
          (a.handle ? '<div class="crm-sub">@' + esc(a.handle) + '</div>' : '') +
          (risk ? '<div class="crm-sub">' + risk + '</div>' : '') + '</td>' +
        '<td>' + stageChip(a.stage) + '</td>' +
        '<td>' + (a.owner && a.owner !== 'Unassigned' ? esc(a.owner) : unset('unowned')) + '</td>' +
        '<td class="crm-num">' + (a.code ? esc(a.code) : unset('none')) + '</td>' +
        '<td class="crm-num">' + fmtInt(m.orders) + '</td>' +
        '<td class="crm-num">' + fmtMoney(m.gross, 0) + '</td>' +
        '<td class="crm-num">' + (m.refunded ? fmtMoney(m.refunded, 0) : '0') + '</td>' +
        '<td class="crm-num">' + fmtMoney(m.net, 0) + '</td>' +
        '<td class="crm-num">' + (m.rate === null ? unset('no rate set') : m.rate + '%') + '</td>' +
        '<td class="crm-num">' + (m.owed === null ? unset('no rate set') : fmtMoney(m.owed)) + '</td>' +
        '<td>' + gateBar(a) + '</td>' +
        '<td class="crm-num">' + (m.lastSale ? esc(m.lastSale) + '<div class="crm-sub">' + m.daysSinceLastSale + 'd ago</div>' : unset('never')) + '</td>' +
        '<td>' + dueCell(a.nextActionDue, a.nextAction) + '</td>' +
        '</tr>';
    }).join('');

    $('aff-body').innerHTML = html || emptyRow(13, rows.length === 0 && (ui.aff.q || ui.aff.owner !== 'all' || ui.aff.stage !== 'all')
      ? 'No affiliate matches this search or filter.'
      : 'No affiliates yet. Use Add affiliate or Import CSV.');

    $('aff-tot-orders').textContent = fmtInt(tOrders);
    $('aff-tot-gross').textContent = fmtMoney(tGross, 0);
    $('aff-tot-refunded').textContent = fmtMoney(tRef, 0);
    $('aff-tot-net').textContent = fmtMoney(tNet, 0);

    markSorted($('aff-table'), ui.aff.sort, ui.aff.dir);
  }

  function markSorted(table, sort, dir) {
    if (!table) return;
    qsa('.crm-th', table).forEach(function (th) {
      th.classList.remove('is-sorted-asc', 'is-sorted-desc');
      if (!th.getAttribute('data-sort')) return;
      if (th.getAttribute('data-sort') === sort) {
        th.classList.add(dir === 'desc' ? 'is-sorted-desc' : 'is-sorted-asc');
        th.setAttribute('aria-sort', dir === 'desc' ? 'descending' : 'ascending');
      } else {
        th.setAttribute('aria-sort', 'none');
      }
    });
  }

  /* ============================================================= PIPELINE */

  function renderPipeline() {
    var rows = CRM.list('affiliates', {
      filters: { owner: ui.pipe.owner },
      sort: 'name', dir: 'asc'
    });

    var byStage = {};
    CRM.STAGES.forEach(function (s) { byStage[s.id] = []; });
    rows.forEach(function (a) {
      if (!byStage[a.stage]) byStage[a.stage] = [];
      byStage[a.stage].push(a);
    });

    $('pipe-board').innerHTML = CRM.STAGES.map(function (s, si) {
      var cards = (byStage[s.id] || []).map(function (a) {
        var m = CRM.affiliateMoney(a.id);
        return '<div class="crm-card" data-entity="affiliates" data-id="' + esc(a.id) + '" tabindex="0" data-fkey="card:' + esc(a.id) + '">' +
          '<div class="crm-card-name">' + esc(a.name) + '</div>' +
          '<div class="crm-card-meta">' +
            (a.owner && a.owner !== 'Unassigned' ? esc(a.owner) : unset('unowned')) +
            ' · ' + (m.orders ? fmtMoney(m.net, 0) + ' net' : 'no sales') +
          '</div>' +
          '<div class="crm-card-meta">' + (a.nextAction ? esc(a.nextAction) : unset('no next action')) + '</div>' +
          '<div class="crm-btn-row">' +
            '<button type="button" class="crm-btn is-quiet" data-move="-1" data-id="' + esc(a.id) + '" data-fkey="mv-:' + esc(a.id) + '"' +
              (si === 0 ? ' disabled' : '') + ' aria-label="Move ' + esc(a.name) + ' back to ' + esc(si > 0 ? CRM.STAGES[si - 1].label : '') + '">Back</button>' +
            '<button type="button" class="crm-btn is-quiet" data-move="1" data-id="' + esc(a.id) + '" data-fkey="mv+:' + esc(a.id) + '"' +
              (si === CRM.STAGES.length - 1 ? ' disabled' : '') + ' aria-label="Move ' + esc(a.name) + ' forward to ' + esc(si < CRM.STAGES.length - 1 ? CRM.STAGES[si + 1].label : '') + '">Forward</button>' +
          '</div>' +
        '</div>';
      }).join('');

      return '<div class="crm-col" data-group="' + esc(s.group) + '">' +
        '<div class="crm-col-head">' + esc(s.label) +
          '<span class="crm-col-count">' + (byStage[s.id] || []).length + '</span></div>' +
        (cards || '<p class="crm-empty">Empty</p>') +
        '</div>';
    }).join('');
  }

  /* =========================================================== ONBOARDING */

  function onboardingRows() {
    return CRM.list('affiliates', {
      filters: { owner: ui.onb.owner }, sort: 'name', dir: 'asc'
    }).filter(function (a) { return a.stage === 'signed' || a.stage === 'onboarding'; });
  }

  function renderOnboarding() {
    var rows = onboardingRows();
    if (!rows.length) {
      $('onb-list').innerHTML = '<p class="crm-empty">No affiliate is signed or onboarding right now. ' +
        'Move someone to Signed on the Pipeline tab and their nine gates appear here.</p>';
      return;
    }

    $('onb-list').innerHTML = rows.map(function (a) {
      var prog = CRM.gateProgress(a);
      var g = a.gates || {};
      var seenNext = false;

      var chips = CRM.GATES.map(function (gate, i) {
        var done = g[gate.id] === true;
        var cls = 'crm-gate';
        if (done) cls += ' is-done';
        else if (!seenNext) { cls += ' is-next'; seenNext = true; }
        else cls += ' is-blocked';
        return '<button type="button" class="' + cls + '" data-gate="' + esc(gate.id) + '" data-id="' + esc(a.id) + '"' +
          ' aria-pressed="' + (done ? 'true' : 'false') + '" data-fkey="gate:' + esc(a.id) + ':' + esc(gate.id) + '"' +
          ' title="' + esc(gate.note) + '">' +
          '<span class="crm-num">' + (i + 1) + '</span> ' + esc(gate.label) + '</button>';
      }).join('');

      var status;
      if (prog.complete) {
        status = pill('Ready to launch', 'is-ok') +
          '<span class="crm-sub"> All nine gates pass. Move this affiliate to Active.</span>';
      } else {
        var blocking = CRM.GATES.length - CRM.GATES.indexOf(prog.blockedBy) - 1;
        status = pill('Blocked at ' + prog.blockedBy.label, 'is-warn') +
          '<div class="crm-sub">' + esc(prog.blockedBy.note) +
          ' Holding back ' + blocking + ' later gate' + (blocking === 1 ? '' : 's') +
          ', and the launch itself.</div>';
      }

      return '<div class="crm-panel">' +
        '<div class="crm-panel-head">' +
          '<h3 class="crm-panel-title"><button type="button" class="crm-btn is-quiet" data-entity="affiliates" data-id="' + esc(a.id) + '" data-open="1" data-fkey="onb:' + esc(a.id) + '">' + esc(a.name) + '</button></h3>' +
          stageChip(a.stage) +
          '<span class="crm-spacer"></span>' +
          gateBar(a) +
        '</div>' +
        '<div class="crm-gates">' + chips + '</div>' +
        '<div>' + status + '</div>' +
        '</div>';
    }).join('');
  }

  /* ============================================================= OUTBOUND */

  function outboundRows() {
    var rows = CRM.list('outbound', {
      search: ui.out.q,
      filters: { owner: ui.out.owner, disposition: ui.out.disposition },
      sort: ui.out.sort, dir: ui.out.dir
    });
    if (ui.out.hideDnc) rows = rows.filter(function (o) { return !o.dnc; });
    return rows;
  }

  function dispKind(d) {
    if (d === 'Do not contact') return 'is-bad';
    if (d === 'Interested' || d === 'Booked call') return 'is-ok';
    if (d === 'Not interested' || d === 'Wrong person') return 'is-quiet';
    if (d === 'Asked to follow up') return 'is-warn';
    return 'is-quiet';
  }

  function renderOutbound() {
    var rows = outboundRows();

    $('out-body').innerHTML = rows.length ? rows.map(function (o) {
      return '<tr class="crm-row" data-entity="outbound" data-id="' + esc(o.id) + '" tabindex="0" data-fkey="out:' + esc(o.id) + '">' +
        '<td class="crm-cell-name">' + esc(o.name) + (o.dnc ? ' ' + pill('do not contact', 'is-bad') : '') + '</td>' +
        '<td>' + (o.handle ? '@' + esc(o.handle) : unset('none')) + '</td>' +
        '<td>' + esc(o.platform || '') + '</td>' +
        '<td class="crm-num">' + (isBlank(o.followers) ? unset('unknown') : fmtInt(o.followers)) + '</td>' +
        '<td>' + (o.owner && o.owner !== 'Unassigned' ? esc(o.owner) : unset('unowned')) + '</td>' +
        '<td>' + esc(o.channel || '') + '</td>' +
        '<td class="crm-num">' + (isBlank(o.step) ? '0' : fmtInt(o.step)) + '</td>' +
        '<td class="crm-num">' + (o.lastTouch ? esc(o.lastTouch) : unset('never')) + '</td>' +
        '<td>' + (o.replied ? pill('yes', 'is-ok') : pill('no', 'is-quiet')) + '</td>' +
        '<td>' + (o.disposition ? pill(o.disposition, dispKind(o.disposition)) : unset('none')) + '</td>' +
        '<td>' + (o.dnc ? '<span class="crm-sub">left alone on request</span>' : dueCell(o.nextActionDue, o.nextAction)) + '</td>' +
        '<td><button type="button" class="crm-btn is-quiet" data-touch="' + esc(o.id) + '" data-fkey="touch:' + esc(o.id) + '"' +
          (o.dnc ? ' disabled title="Do not contact. Logging a touch is blocked."' : '') +
          ' aria-label="Log a touch for ' + esc(o.name) + '">Log touch</button></td>' +
        '</tr>';
    }).join('') : emptyRow(12, 'No target matches this search or filter.');

    markSorted($('out-table'), ui.out.sort, ui.out.dir);
  }

  /* ================================================================ MONEY */

  function renderMoney() {
    /* commission table */
    var affs = CRM.list('affiliates', { sort: 'name', dir: 'asc' });
    $('comm-body').innerHTML = affs.length ? affs.map(function (a) {
      var m = CRM.affiliateMoney(a.id);
      return '<tr class="crm-row" data-entity="affiliates" data-id="' + esc(a.id) + '" tabindex="0" data-fkey="comm:' + esc(a.id) + '">' +
        '<td class="crm-cell-name">' + esc(a.name) +
          (m.downlineCount ? '<div class="crm-sub">' + m.downlineCount + ' in downline</div>' : '') + '</td>' +
        '<td class="crm-num">' + fmtMoney(m.net, 0) + '</td>' +
        '<td class="crm-num">' + (m.rate === null ? unset('no rate set') : m.rate + '%') + '</td>' +
        '<td class="crm-num">' + (m.earned === null ? unset('no rate set') : fmtMoney(m.earned)) + '</td>' +
        '<td class="crm-num">' + (m.overrideEarned === null ? unset('no override rate') : fmtMoney(m.overrideEarned)) + '</td>' +
        '<td class="crm-num">' + fmtMoney(m.paid) + '</td>' +
        '<td class="crm-num">' + (m.owed === null ? unset('no rate set') : fmtMoney(m.owed)) + '</td>' +
        '</tr>';
    }).join('') : emptyRow(7, 'No affiliates yet.');

    var t = CRM.totals();
    $('comm-total').innerHTML = t.commissionOwed === null
      ? 'Total commission owed: <span class="crm-unset">not computable</span>. No commission rate has been agreed with Biologix, so the amount is unknown, not zero.'
      : 'Total commission owed: <b class="crm-num">' + esc(fmtMoney(t.commissionOwed)) + '</b>. Counts only affiliates with a rate set.';

    /* sales ledger */
    var sales = CRM.list('sales', { sort: ui.sales.sort, dir: ui.sales.dir });
    var sg = 0, sr = 0;
    $('sale-body').innerHTML = sales.length ? sales.map(function (s) {
      var gross = parseFloat(s.gross) || 0, ref = parseFloat(s.refunded) || 0;
      sg += gross; sr += ref;
      return '<tr class="crm-row" data-entity="sales" data-id="' + esc(s.id) + '" tabindex="0" data-fkey="sale:' + esc(s.id) + '">' +
        '<td class="crm-num">' + esc(s.date) + '</td>' +
        '<td class="crm-cell-name">' + (affName(s.affiliateId) ? esc(affName(s.affiliateId)) : unset('unknown affiliate')) + '</td>' +
        '<td class="crm-num">' + (s.orderRef ? esc(s.orderRef) : unset('none')) + '</td>' +
        '<td>' + esc(s.product || '') + '</td>' +
        '<td class="crm-num">' + fmtMoney(gross) + '</td>' +
        '<td class="crm-num">' + (ref ? pill(fmtMoney(ref), 'is-bad') : '0.00') + '</td>' +
        '<td class="crm-num">' + fmtMoney(gross - ref) + '</td>' +
        '</tr>';
    }).join('') : emptyRow(7, 'No sales recorded.');
    $('sale-tot-gross').textContent = fmtMoney(sg);
    $('sale-tot-refunded').textContent = fmtMoney(sr);
    $('sale-tot-net').textContent = fmtMoney(sg - sr);
    markSorted($('sale-table'), ui.sales.sort, ui.sales.dir);

    /* payout ledger */
    var payouts = CRM.list('payouts', { sort: ui.payouts.sort, dir: ui.payouts.dir });
    var pt = 0;
    $('payout-body').innerHTML = payouts.length ? payouts.map(function (p) {
      var amt = parseFloat(p.amount) || 0;
      if (p.status === 'Sent' || p.status === 'Cleared') pt += amt;
      var kind = p.status === 'Cleared' ? 'is-ok'
        : p.status === 'Failed' || p.status === 'Clawed back' ? 'is-bad'
        : p.status === 'Sent' ? 'is-warn' : 'is-quiet';
      return '<tr class="crm-row" data-entity="payouts" data-id="' + esc(p.id) + '" tabindex="0" data-fkey="pay:' + esc(p.id) + '">' +
        '<td class="crm-num">' + esc(p.date) + '</td>' +
        '<td class="crm-cell-name">' + (affName(p.affiliateId) ? esc(affName(p.affiliateId)) : unset('unknown affiliate')) + '</td>' +
        '<td class="crm-num">' + fmtMoney(amt) + '</td>' +
        '<td>' + esc(p.method || '') + '</td>' +
        '<td>' + (p.status ? pill(p.status, kind) : unset('none')) + '</td>' +
        '<td class="crm-num">' + (p.reference ? esc(p.reference) : unset('none')) + '</td>' +
        '</tr>';
    }).join('') : emptyRow(6, 'No payouts recorded.');
    $('payout-tot').textContent = fmtMoney(pt);
    markSorted($('payout-table'), ui.payouts.sort, ui.payouts.dir);
  }

  /* =============================================================== DRAWER */

  function fieldControl(entity, f, rec) {
    var v = rec ? rec[f.key] : undefined;
    var id = 'fld-' + f.key;
    var out = '';

    if (f.type === 'textarea') {
      out = '<textarea class="crm-textarea" id="' + id + '" data-field="' + esc(f.key) + '" rows="3">' + esc(v || '') + '</textarea>';
    } else if (f.type === 'number' || f.type === 'money') {
      out = '<input class="crm-input crm-num" id="' + id + '" data-field="' + esc(f.key) + '" type="number" ' +
        (f.type === 'money' ? 'step="0.01" ' : 'step="any" ') +
        'value="' + (isBlank(v) ? '' : esc(v)) + '">';
    } else if (f.type === 'date') {
      out = '<input class="crm-input crm-num" id="' + id + '" data-field="' + esc(f.key) + '" type="date" value="' + esc(v || '') + '">';
    } else if (f.type === 'bool') {
      out = '<label class="crm-check" for="' + id + '"><input type="checkbox" id="' + id + '" data-field="' + esc(f.key) + '"' +
        (v ? ' checked' : '') + '> ' + esc(f.label) + '</label>';
    } else if (f.type === 'select') {
      var opts = '<option value="">' + (f.required ? 'Choose one' : 'Not set') + '</option>';
      (f.options || []).forEach(function (o) {
        var lab = (f.key === 'stage' && STAGE_BY_ID[o]) ? STAGE_BY_ID[o].label : o;
        opts += '<option value="' + esc(o) + '"' + (String(v) === String(o) ? ' selected' : '') + '>' + esc(lab) + '</option>';
      });
      out = '<select class="crm-select" id="' + id + '" data-field="' + esc(f.key) + '">' + opts + '</select>';
    } else if (f.type === 'ref') {
      var refs = CRM.all(f.ref).filter(function (r) { return !rec || r.id !== rec.id; });
      refs.sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });
      var ropts = '<option value="">' + (f.required ? 'Choose one' : 'None') + '</option>';
      refs.forEach(function (r) {
        ropts += '<option value="' + esc(r.id) + '"' + (String(v) === String(r.id) ? ' selected' : '') + '>' + esc(r.name) + '</option>';
      });
      out = '<select class="crm-select" id="' + id + '" data-field="' + esc(f.key) + '">' + ropts + '</select>';
    } else if (f.type === 'multi') {
      var have = v || [];
      out = '<div data-field="' + esc(f.key) + '" role="group" aria-labelledby="lbl-' + esc(f.key) + '">' +
        (f.options || []).map(function (o, i) {
          var oid = id + '-' + i;
          return '<label class="crm-check" for="' + oid + '"><input type="checkbox" id="' + oid + '" data-opt="' + esc(o) + '"' +
            (have.indexOf(o) >= 0 ? ' checked' : '') + '> ' + esc(o) + '</label>';
        }).join('') + '</div>';
    } else if (f.type === 'gates') {
      var g = v || {};
      out = '<div data-field="' + esc(f.key) + '" role="group" aria-labelledby="lbl-' + esc(f.key) + '">' +
        CRM.GATES.map(function (gate, i) {
          var gid = id + '-' + gate.id;
          return '<label class="crm-check" for="' + gid + '"><input type="checkbox" id="' + gid + '" data-gate="' + esc(gate.id) + '"' +
            (g[gate.id] === true ? ' checked' : '') + '> <span class="crm-num">' + (i + 1) + '</span> ' + esc(gate.label) +
            '<span class="crm-field-hint">' + esc(gate.note) + '</span></label>';
        }).join('') + '</div>';
    } else {
      out = '<input class="crm-input" id="' + id + '" data-field="' + esc(f.key) + '" type="text" value="' + esc(v === null || v === undefined ? '' : v) + '">';
    }

    var showLabel = f.type !== 'bool';
    return '<div class="crm-field" data-field-wrap="' + esc(f.key) + '">' +
      (showLabel ? '<label class="crm-field-label" id="lbl-' + esc(f.key) + '"' +
        (f.type === 'multi' || f.type === 'gates' ? '' : ' for="' + id + '"') + '>' +
        esc(f.label) + (f.required ? ' <span class="crm-pill is-warn">required</span>' : '') + '</label>' : '') +
      out +
      (f.hint ? '<p class="crm-field-hint">' + esc(f.hint) + '</p>' : '') +
      '<p class="crm-field-hint" data-error-for="' + esc(f.key) + '"></p>' +
      '</div>';
  }

  function affiliateAux(a) {
    var m = CRM.affiliateMoney(a.id);
    var rows = [
      ['Orders', fmtInt(m.orders)],
      ['Gross', fmtMoney(m.gross)],
      ['Refunded', fmtMoney(m.refunded)],
      ['Net', fmtMoney(m.net)],
      ['Refund rate', m.gross > 0 ? fmtPct(m.refundRate) : 'no sales yet'],
      ['Average order', m.orders ? fmtMoney(m.aov) : 'no sales yet'],
      ['Rate', m.rate === null ? null : m.rate + '%'],
      ['Earned', m.earned === null ? null : fmtMoney(m.earned)],
      ['Override earned', m.overrideEarned === null ? null : fmtMoney(m.overrideEarned)],
      ['Paid', fmtMoney(m.paid)],
      ['Owed', m.owed === null ? null : fmtMoney(m.owed)],
      ['Last sale', m.lastSale ? m.lastSale + ', ' + m.daysSinceLastSale + ' days ago' : 'never']
    ];

    var money = '<div class="crm-fieldset"><h3 class="crm-fieldset-title">Money</h3>' +
      '<div class="crm-table-wrap"><table class="crm-table"><tbody>' +
      rows.map(function (r) {
        return '<tr><th class="crm-th" scope="row">' + esc(r[0]) + '</th>' +
          '<td class="crm-num">' + (r[1] === null ? unset('no rate set') : esc(r[1])) + '</td></tr>';
      }).join('') + '</tbody></table></div></div>';

    var sales = CRM.all('sales').filter(function (s) { return s.affiliateId === a.id; })
      .sort(function (x, y) { return String(y.date).localeCompare(String(x.date)); });
    var salesHtml = '<div class="crm-fieldset"><h3 class="crm-fieldset-title">Sales</h3>' +
      '<div class="crm-table-wrap"><table class="crm-table"><thead><tr>' +
      '<th class="crm-th crm-num" scope="col">Date</th><th class="crm-th" scope="col">Order</th>' +
      '<th class="crm-th crm-num" scope="col">Gross</th><th class="crm-th crm-num" scope="col">Refunded</th></tr></thead><tbody>' +
      (sales.length ? sales.map(function (s) {
        return '<tr class="crm-row" data-entity="sales" data-id="' + esc(s.id) + '" tabindex="0">' +
          '<td class="crm-num">' + esc(s.date) + '</td>' +
          '<td>' + esc(s.orderRef || '') + (s.product ? '<div class="crm-sub">' + esc(s.product) + '</div>' : '') + '</td>' +
          '<td class="crm-num">' + fmtMoney(parseFloat(s.gross) || 0) + '</td>' +
          '<td class="crm-num">' + fmtMoney(parseFloat(s.refunded) || 0) + '</td></tr>';
      }).join('') : emptyRow(4, 'No sales for this affiliate.')) +
      '</tbody></table></div>' +
      '<div class="crm-btn-row"><button type="button" class="crm-btn" data-new-child="sales">Add sale</button></div></div>';

    var payouts = CRM.all('payouts').filter(function (p) { return p.affiliateId === a.id; })
      .sort(function (x, y) { return String(y.date).localeCompare(String(x.date)); });
    var payHtml = '<div class="crm-fieldset"><h3 class="crm-fieldset-title">Payouts</h3>' +
      '<div class="crm-table-wrap"><table class="crm-table"><thead><tr>' +
      '<th class="crm-th crm-num" scope="col">Date</th><th class="crm-th crm-num" scope="col">Amount</th>' +
      '<th class="crm-th" scope="col">Status</th></tr></thead><tbody>' +
      (payouts.length ? payouts.map(function (p) {
        return '<tr class="crm-row" data-entity="payouts" data-id="' + esc(p.id) + '" tabindex="0">' +
          '<td class="crm-num">' + esc(p.date) + '</td>' +
          '<td class="crm-num">' + fmtMoney(parseFloat(p.amount) || 0) + '</td>' +
          '<td>' + esc(p.status || '') + '</td></tr>';
      }).join('') : emptyRow(3, 'No payouts for this affiliate.')) +
      '</tbody></table></div>' +
      '<div class="crm-btn-row"><button type="button" class="crm-btn" data-new-child="payouts">Add payout</button></div></div>';

    var up = a.parentId ? CRM.get('affiliates', a.parentId) : null;
    var down = CRM.all('affiliates').filter(function (x) { return x.parentId === a.id; });
    var treeHtml = '<div class="crm-fieldset"><h3 class="crm-fieldset-title">Network</h3>' +
      '<p class="crm-field-hint">Upline: ' + (up
        ? '<button type="button" class="crm-btn is-quiet" data-entity="affiliates" data-id="' + esc(up.id) + '" data-open="1">' + esc(up.name) + '</button>'
        : unset('none')) + '</p>' +
      '<p class="crm-field-hint">Downline: ' + (down.length
        ? down.map(function (d) {
            return '<button type="button" class="crm-btn is-quiet" data-entity="affiliates" data-id="' + esc(d.id) + '" data-open="1">' + esc(d.name) + '</button>';
          }).join(' ')
        : unset('none')) + '</p></div>';

    var g = CRM.gateProgress(a);
    var gateHtml = '<div class="crm-fieldset"><h3 class="crm-fieldset-title">Activation</h3>' +
      '<p class="crm-field-hint">' + gateBar(a) + '</p>' +
      '<p class="crm-field-hint">' + (g.complete
        ? pill('All nine gates pass', 'is-ok')
        : pill('Blocked at ' + g.blockedBy.label, 'is-warn') + ' ' + esc(g.blockedBy.note)) + '</p></div>';

    return '<div id="crm-drawer-aux">' + money + gateHtml + salesHtml + payHtml + treeHtml + '</div>';
  }

  function renderAux() {
    var host = $('crm-drawer-aux');
    if (!host || !drawer.open || drawer.entity !== 'affiliates' || !drawer.id) return;
    var a = CRM.get('affiliates', drawer.id);
    if (!a) return;
    var tmp = document.createElement('div');
    tmp.innerHTML = affiliateAux(a);
    host.innerHTML = tmp.firstChild.innerHTML;
  }

  function openDrawer(entity, id, trigger, back) {
    var schema = CRM.SCHEMA[entity];
    if (!schema) return;
    var rec = id ? CRM.get(entity, id) : null;
    if (id && !rec) return;

    drawer.open = true;
    drawer.entity = entity;
    drawer.id = id || null;
    drawer.back = back || null;
    if (trigger) drawer.trigger = trigger;

    $('crm-drawer-title').textContent = (rec ? 'Edit ' : 'New ') + schema.label.toLowerCase() +
      (rec ? ': ' + (rec.name || rec.orderRef || rec.id) : '');

    var body = '';
    if (drawer.back) {
      var backRec = CRM.get(drawer.back.entity, drawer.back.id);
      if (backRec) {
        body += '<div class="crm-btn-row"><button type="button" class="crm-btn is-quiet" id="crm-drawer-back">' +
          'Back to ' + esc(backRec.name || backRec.id) + '</button></div>';
      }
    }

    body += '<div class="crm-fieldset"><h3 class="crm-fieldset-title">' + esc(schema.label) + ' details</h3>' +
      schema.fields.map(function (f) { return fieldControl(entity, f, rec); }).join('') + '</div>';

    if (entity === 'affiliates' && rec) body += affiliateAux(rec);
    if (entity === 'affiliates' && !rec) {
      body += '<p class="crm-field-hint">Save this affiliate first, then sales, payouts and network appear here.</p>';
    }

    $('crm-drawer-body').innerHTML = body;

    var foot = '<div class="crm-btn-row">' +
      '<button type="button" class="crm-btn is-primary" id="crm-save">Save</button>' +
      '<button type="button" class="crm-btn is-quiet" id="crm-cancel">Cancel</button>';
    if (rec) foot += '<span class="crm-spacer"></span><button type="button" class="crm-btn is-danger" id="crm-delete">Delete</button>';
    foot += '</div>';
    if (rec) foot += '<p class="crm-field-hint crm-num">id ' + esc(rec.id) + '</p>';
    $('crm-drawer-foot').innerHTML = foot;

    var d = $('crm-drawer');
    d.hidden = false;
    d.classList.add('is-open');
    document.body.classList.add('crm-drawer-open');

    var first = qs('.crm-drawer-body input, .crm-drawer-body select, .crm-drawer-body textarea', d);
    (first || $('crm-drawer-close')).focus();
  }

  function closeDrawer() {
    if (!drawer.open) return;
    var d = $('crm-drawer');
    d.classList.remove('is-open');
    d.hidden = true;
    document.body.classList.remove('crm-drawer-open');
    drawer.open = false;
    drawer.entity = null;
    drawer.id = null;
    drawer.back = null;
    /* Put focus back where it came from. A re-render can destroy the trigger,
       so fall back to its data-fkey twin, then to the current tab, never to
       nothing: losing focus to body strands keyboard users at the top. */
    var restored = null;
    if (drawer.trigger && document.body.contains(drawer.trigger)) {
      restored = drawer.trigger;
    } else if (drawer.trigger) {
      var fk = drawer.trigger.getAttribute && drawer.trigger.getAttribute('data-fkey');
      restored = fk ? qs('[data-fkey="' + fk + '"]') : null;
    }
    if (!restored || !restored.focus) restored = $('tab-' + ui.tab);
    if (restored && restored.focus) restored.focus();
    drawer.trigger = null;
  }

  function collectDrawer() {
    var entity = drawer.entity;
    var body = $('crm-drawer-body');
    var rec = {};
    var errors = [];

    CRM.SCHEMA[entity].fields.forEach(function (f) {
      var el = qs('[data-field="' + f.key + '"]', body);
      if (!el) return;
      var v;
      if (f.type === 'gates') {
        v = {};
        qsa('input[data-gate]', el).forEach(function (i) { v[i.getAttribute('data-gate')] = i.checked; });
      } else if (f.type === 'multi') {
        v = [];
        qsa('input[data-opt]', el).forEach(function (i) { if (i.checked) v.push(i.getAttribute('data-opt')); });
      } else if (f.type === 'bool') {
        v = el.checked;
      } else if (f.type === 'number' || f.type === 'money') {
        var raw = el.value.trim();
        v = raw === '' ? null : parseFloat(raw);
        if (raw !== '' && isNaN(v)) errors.push({ key: f.key, msg: 'Not a number.' });
      } else {
        v = el.value.trim();
      }

      if (f.required) {
        var missing = (f.type === 'number' || f.type === 'money') ? (v === null) : isBlank(v);
        if (missing) errors.push({ key: f.key, msg: f.label + ' is required.' });
      }
      rec[f.key] = v;
    });

    return { rec: rec, errors: errors };
  }

  function showErrors(errors) {
    qsa('[data-error-for]', $('crm-drawer-body')).forEach(function (p) { p.innerHTML = ''; });
    qsa('[data-field]', $('crm-drawer-body')).forEach(function (el) { el.removeAttribute('aria-invalid'); });
    errors.forEach(function (e) {
      var p = qs('[data-error-for="' + e.key + '"]', $('crm-drawer-body'));
      if (p) p.innerHTML = '<span class="crm-pill is-bad">' + esc(e.msg) + '</span>';
      var el = qs('[data-field="' + e.key + '"]', $('crm-drawer-body'));
      if (el) el.setAttribute('aria-invalid', 'true');
    });
    if (errors.length) {
      var first = qs('[data-field="' + errors[0].key + '"]', $('crm-drawer-body'));
      if (first && first.focus) first.focus();
      announce(errors.length + ' problem' + (errors.length === 1 ? '' : 's') + ' with this record. ' +
        errors.map(function (e) { return e.msg; }).join(' '));
    }
  }

  /* Saves the open record. Returns the id on success, null when invalid. */
  function saveDrawer(silent) {
    if (!drawer.open) return null;
    var res = collectDrawer();
    showErrors(res.errors);
    if (res.errors.length) {
      if (!silent) toast('Not saved. ' + res.errors[0].msg);
      return null;
    }
    var id = drawer.id;
    if (id) {
      CRM.update(drawer.entity, id, res.rec);
      if (!silent) toast(CRM.SCHEMA[drawer.entity].label + ' saved.');
    } else {
      var added = CRM.add(drawer.entity, res.rec);
      id = added.id;
      drawer.id = id;
      if (!silent) toast(CRM.SCHEMA[drawer.entity].label + ' created.');
    }
    return id;
  }

  /* ============================================================== RENDER  */

  function renderCounts() {
    var t = CRM.totals();
    $('count-dashboard').textContent = t.overdueCount + t.defectCount;
    $('count-affiliates').textContent = t.affiliateCount;
    $('count-pipeline').textContent = t.affiliateCount;
    $('count-onboarding').textContent = CRM.all('affiliates').filter(function (a) {
      return a.stage === 'signed' || a.stage === 'onboarding';
    }).length;
    $('count-outbound').textContent = t.outboundCount;
    $('count-money').textContent = CRM.all('sales').length + CRM.all('payouts').length;
  }

  function renderAll() {
    var active = document.activeElement;
    var fkey = active && active.getAttribute ? active.getAttribute('data-fkey') : null;
    var inDrawer = active && $('crm-drawer').contains(active);

    renderCounts();
    renderDashboard();
    renderAffiliates();
    renderPipeline();
    renderOnboarding();
    renderOutbound();
    renderMoney();
    renderAux();

    if (fkey && !inDrawer) {
      var again = qs('[data-fkey="' + fkey + '"]');
      if (again && again.focus) again.focus();
    }
  }

  function setTab(tab, focusTab) {
    if (TABS.indexOf(tab) < 0) tab = 'dashboard';
    ui.tab = tab;
    TABS.forEach(function (t) {
      var btn = $('tab-' + t), view = $('view-' + t);
      var on = t === tab;
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-selected', on ? 'true' : 'false');
      btn.tabIndex = on ? 0 : -1;
      view.classList.toggle('is-active', on);
      view.hidden = !on;
    });
    if (focusTab) $('tab-' + tab).focus();
    writeHash();
  }

  /* =============================================================== EVENTS */

  function toggleSort(bag, key, table) {
    if (bag.sort === key) {
      bag.dir = bag.dir === 'asc' ? 'desc' : 'asc';
    } else {
      bag.sort = key;
      bag.dir = NUMERIC_SORT[key] ? 'desc' : 'asc';
    }
    writeHash();
    renderAll();
    announce('Sorted by ' + key + ', ' + (bag.dir === 'desc' ? 'descending' : 'ascending') + '.');
  }

  function sortBagFor(table) {
    if (!table) return null;
    if (table.id === 'aff-table') return ui.aff;
    if (table.id === 'out-table') return ui.out;
    if (table.id === 'sale-table') return ui.sales;
    if (table.id === 'payout-table') return ui.payouts;
    return null;
  }

  function download(filename, text) {
    var blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function exportEntity(entity) {
    var stamp = CRM.today();
    download('biologix-' + entity + '-' + stamp + '.csv', CRM.toCSV(entity));
    toast('Exported ' + CRM.all(entity).length + ' ' + entity + ' rows to CSV.');
  }

  function wire() {
    /* tabs */
    qsa('.crm-tab').forEach(function (btn) {
      btn.addEventListener('click', function () { setTab(btn.getAttribute('data-tab')); });
      btn.addEventListener('keydown', function (e) {
        var i = TABS.indexOf(ui.tab), next = null;
        if (e.key === 'ArrowRight') next = TABS[(i + 1) % TABS.length];
        else if (e.key === 'ArrowLeft') next = TABS[(i - 1 + TABS.length) % TABS.length];
        else if (e.key === 'Home') next = TABS[0];
        else if (e.key === 'End') next = TABS[TABS.length - 1];
        if (next) { e.preventDefault(); setTab(next, true); }
      });
    });

    /* topbar tools */
    $('tool-export').addEventListener('click', function () {
      exportEntity(TAB_ENTITY[ui.tab]);
    });
    $('tool-import').addEventListener('click', function () { $('tool-file').click(); });
    $('tool-file').addEventListener('change', function (e) {
      var file = e.target.files && e.target.files[0];
      if (!file) return;
      var entity = TAB_ENTITY[ui.tab];
      var reader = new FileReader();
      reader.onload = function () {
        var res;
        try {
          res = CRM.fromCSV(entity, String(reader.result));
        } catch (err) {
          toast('Import failed: ' + err.message);
          return;
        }
        var msg = 'Import into ' + CRM.SCHEMA[entity].plural + ': ' + res.added + ' added, ' +
          res.updated + ' updated, ' + res.skipped + ' skipped.';
        if (res.errors && res.errors.length) msg += ' Problems: ' + res.errors.join('; ');
        toast(msg);
        renderAll();
      };
      reader.onerror = function () { toast('Import failed: the file could not be read.'); };
      reader.readAsText(file);
      e.target.value = '';
    });
    $('tool-reset').addEventListener('click', function () {
      if (!global.confirm('Reset to the seeded demo data? Every change you have made here is discarded.')) return;
      CRM.reset();
      toast('Demo data reset.');
      renderAll();
    });
    $('tool-clear').addEventListener('click', function () {
      if (!global.confirm('Delete every record: affiliates, sales, outbound and payouts? This cannot be undone.')) return;
      CRM.clearAll();
      toast('All records cleared.');
      renderAll();
    });

    /* affiliate toolbar */
    var affSearch = $('aff-search');
    affSearch.addEventListener('input', function () {
      ui.aff.q = affSearch.value;
      writeHash();
      renderAffiliates();
    });
    $('aff-owner').addEventListener('change', function () {
      ui.aff.owner = this.value; writeHash(); renderAffiliates();
    });
    $('aff-stage').addEventListener('change', function () {
      ui.aff.stage = this.value; writeHash(); renderAffiliates();
    });
    $('aff-clear-filters').addEventListener('click', function () {
      ui.aff.q = ''; ui.aff.owner = 'all'; ui.aff.stage = 'all';
      affSearch.value = ''; $('aff-owner').value = 'all'; $('aff-stage').value = 'all';
      writeHash(); renderAffiliates();
      toast('Filters cleared.');
    });
    $('aff-add').addEventListener('click', function () {
      openDrawer('affiliates', null, this);
    });

    /* pipeline and onboarding filters */
    $('pipe-owner').addEventListener('change', function () {
      ui.pipe.owner = this.value; writeHash(); renderPipeline();
    });
    $('onb-owner').addEventListener('change', function () {
      ui.onb.owner = this.value; writeHash(); renderOnboarding();
    });

    /* outbound toolbar */
    var outSearch = $('out-search');
    outSearch.addEventListener('input', function () {
      ui.out.q = outSearch.value; writeHash(); renderOutbound();
    });
    $('out-owner').addEventListener('change', function () {
      ui.out.owner = this.value; writeHash(); renderOutbound();
    });
    $('out-disp').addEventListener('change', function () {
      ui.out.disposition = this.value; writeHash(); renderOutbound();
    });
    $('out-dnc').addEventListener('change', function () {
      ui.out.hideDnc = this.checked; writeHash(); renderOutbound();
    });
    $('out-add').addEventListener('click', function () {
      openDrawer('outbound', null, this);
    });

    /* money buttons */
    $('sale-add').addEventListener('click', function () { openDrawer('sales', null, this); });
    $('payout-add').addEventListener('click', function () { openDrawer('payouts', null, this); });
    $('sale-export').addEventListener('click', function () { exportEntity('sales'); });
    $('payout-export').addEventListener('click', function () { exportEntity('payouts'); });

    /* delegated clicks across the app */
    document.addEventListener('click', function (e) {
      var el = e.target;

      var sortTh = closest(el, '.crm-th.is-sortable');
      if (sortTh) {
        var bag = sortBagFor(closest(sortTh, 'table'));
        if (bag) { toggleSort(bag, sortTh.getAttribute('data-sort')); return; }
      }

      var moveBtn = closest(el, '[data-move]');
      if (moveBtn) {
        e.stopPropagation();
        moveStage(moveBtn.getAttribute('data-id'), parseInt(moveBtn.getAttribute('data-move'), 10));
        return;
      }

      var gateBtn = closest(el, '.crm-gate[data-gate]');
      if (gateBtn) {
        e.stopPropagation();
        toggleGate(gateBtn.getAttribute('data-id'), gateBtn.getAttribute('data-gate'));
        return;
      }

      var touchBtn = closest(el, '[data-touch]');
      if (touchBtn) {
        e.stopPropagation();
        logTouch(touchBtn.getAttribute('data-touch'));
        return;
      }

      var openBtn = closest(el, '[data-open]');
      if (openBtn) {
        e.stopPropagation();
        var inDrawer = $('crm-drawer').contains(openBtn);
        if (inDrawer) {
          if (saveDrawer(true) === null) { toast('Fix the highlighted field before moving on.'); return; }
        }
        openDrawer(openBtn.getAttribute('data-entity'), openBtn.getAttribute('data-id'), openBtn);
        return;
      }

      var childBtn = closest(el, '[data-new-child]');
      if (childBtn) {
        e.stopPropagation();
        var parentId = saveDrawer(true);
        if (parentId === null) { toast('Fix the highlighted field before adding a record.'); return; }
        var childEntity = childBtn.getAttribute('data-new-child');
        var back = { entity: 'affiliates', id: parentId };
        openDrawer(childEntity, null, childBtn, back);
        var affField = qs('[data-field="affiliateId"]', $('crm-drawer-body'));
        if (affField) affField.value = parentId;
        var dateField = qs('[data-field="date"]', $('crm-drawer-body'));
        if (dateField && !dateField.value) dateField.value = CRM.today();
        return;
      }

      if (closest(el, '[data-drawer-close]')) { closeDrawer(); return; }

      if (closest(el, '#crm-save')) {
        if (saveDrawer() !== null) {
          if (drawer.back) {
            var b = drawer.back;
            drawer.back = null;
            openDrawer(b.entity, b.id, drawer.trigger);
          } else {
            closeDrawer();
          }
          renderAll();
        }
        return;
      }
      if (closest(el, '#crm-cancel')) { closeDrawer(); return; }
      if (closest(el, '#crm-drawer-back')) {
        var bb = drawer.back;
        if (saveDrawer(true) === null) { toast('Fix the highlighted field before going back.'); return; }
        drawer.back = null;
        openDrawer(bb.entity, bb.id, drawer.trigger);
        return;
      }
      if (closest(el, '#crm-delete')) {
        var label = CRM.SCHEMA[drawer.entity].label;
        var extra = drawer.entity === 'affiliates'
          ? ' Their sales and payouts go with them, and anyone they recruited loses the upline link.'
          : '';
        if (!global.confirm('Delete this ' + label.toLowerCase() + '?' + extra)) return;
        CRM.remove(drawer.entity, drawer.id);
        closeDrawer();
        toast(label + ' deleted.');
        renderAll();
        return;
      }

      var row = closest(el, '.crm-row, .crm-card');
      if (row && row.getAttribute('data-entity')) {
        var rowInDrawer = $('crm-drawer').contains(row);
        if (rowInDrawer) {
          if (saveDrawer(true) === null) { toast('Fix the highlighted field before moving on.'); return; }
          openDrawer(row.getAttribute('data-entity'), row.getAttribute('data-id'), row,
            { entity: 'affiliates', id: drawer.id });
        } else {
          openDrawer(row.getAttribute('data-entity'), row.getAttribute('data-id'), row);
        }
      }
    });

    /* keyboard on rows, cards and sortable headers */
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
      var el = e.target;
      var th = closest(el, '.crm-th.is-sortable');
      if (th) {
        e.preventDefault();
        var bag = sortBagFor(closest(th, 'table'));
        if (bag) toggleSort(bag, th.getAttribute('data-sort'));
        return;
      }
      var row = closest(el, '.crm-row, .crm-card');
      if (row && row.getAttribute('data-entity') && el === row) {
        e.preventDefault();
        row.click();
      }
    });

    /* drawer keyboard: escape closes, tab traps, enter saves */
    document.addEventListener('keydown', function (e) {
      if (!drawer.open) return;
      if (e.key === 'Escape' || e.key === 'Esc') {
        e.preventDefault();
        closeDrawer();
        return;
      }
      if (e.key === 'Enter' && e.target && e.target.tagName === 'INPUT' && e.target.type !== 'checkbox') {
        e.preventDefault();
        if (saveDrawer() !== null) { closeDrawer(); renderAll(); }
        return;
      }
      if (e.key !== 'Tab') return;
      var panel = $('crm-drawer-panel');
      var items = qsa('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])', panel)
        .filter(function (n) { return n.getClientRects().length > 0 || n === document.activeElement; });
      if (!items.length) return;
      var first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });

    /* hash and data changes */
    global.addEventListener('hashchange', function () {
      if (hashLock) return;
      readHash();
      syncControls();
      setTab(ui.tab);
      renderAll();
    });
    global.addEventListener('crm:change', function () { renderAll(); });
  }

  function closest(el, sel) {
    while (el && el.nodeType === 1) {
      if (el.matches ? el.matches(sel) : el.msMatchesSelector(sel)) return el;
      el = el.parentElement;
    }
    return null;
  }

  /* ------------------------------------------------------------- actions */

  function moveStage(id, delta) {
    var a = CRM.get('affiliates', id);
    if (!a) return;
    var idx = -1;
    CRM.STAGES.forEach(function (s, i) { if (s.id === a.stage) idx = i; });
    if (idx < 0) idx = 0;
    var next = idx + delta;
    if (next < 0 || next >= CRM.STAGES.length) return;
    CRM.update('affiliates', id, { stage: CRM.STAGES[next].id });
    toast(a.name + ' moved to ' + CRM.STAGES[next].label + '.');
  }

  function toggleGate(id, gateId) {
    var a = CRM.get('affiliates', id);
    if (!a) return;
    var gates = {};
    CRM.GATES.forEach(function (g) { gates[g.id] = (a.gates || {})[g.id] === true; });
    gates[gateId] = !gates[gateId];
    CRM.update('affiliates', id, { gates: gates });
    var g = GATE_BY_ID[gateId];
    var prog = CRM.gateProgress(CRM.get('affiliates', id));
    toast(a.name + ': ' + g.label + ' ' + (gates[gateId] ? 'passed' : 'reopened') + '. ' +
      prog.done + ' of ' + prog.total + ' gates.' + (prog.complete ? ' Ready to launch.' : ''));
  }

  function logTouch(id) {
    var o = CRM.get('outbound', id);
    if (!o) return;
    if (o.dnc) { toast('This target asked not to be contacted. No touch logged.'); return; }
    var step = (parseFloat(o.step) || 0) + 1;
    CRM.update('outbound', id, { step: step, lastTouch: CRM.today() });
    toast(o.name + ': touch ' + step + ' logged for ' + CRM.today() + '.');
  }

  /* ---------------------------------------------------------------- init */

  function syncControls() {
    $('aff-search').value = ui.aff.q;
    $('aff-owner').value = ui.aff.owner;
    $('aff-stage').value = ui.aff.stage;
    $('pipe-owner').value = ui.pipe.owner;
    $('onb-owner').value = ui.onb.owner;
    $('out-search').value = ui.out.q;
    $('out-owner').value = ui.out.owner;
    $('out-disp').value = ui.out.disposition;
    $('out-dnc').checked = ui.out.hideDnc;
  }

  function init() {
    CRM.load();

    fillSelect($('aff-owner'), CRM.OWNERS, 'All owners');
    fillSelect($('pipe-owner'), CRM.OWNERS, 'All owners');
    fillSelect($('onb-owner'), CRM.OWNERS, 'All owners');
    fillSelect($('out-owner'), CRM.OWNERS, 'All owners');
    fillSelect($('aff-stage'), CRM.STAGES, 'All stages');
    fillSelect($('out-disp'), CRM.DISPOSITIONS, 'All dispositions');

    readHash();
    syncControls();
    wire();
    setTab(ui.tab);
    renderAll();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})(window);
