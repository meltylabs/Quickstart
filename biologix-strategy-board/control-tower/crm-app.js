/* Biologix Control Tower — application layer.
   Renders the six views against the authoritative same-origin API projection.
   Server confirmation is required before any mutation appears as successful. */
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
  var busy = false;
  var pendingMutations = {};

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

  function sandboxMark(record) {
    return CRM.isTestAffiliate(record) ? ' ' + pill('sandbox', 'is-warn') : '';
  }

  function pill(text, kind) {
    return '<span class="crm-pill' + (kind ? ' ' + kind : '') + '">' + esc(text) + '</span>';
  }

  function affNameHtml(id) {
    var affiliate = CRM.get('affiliates', id);
    return affiliate ? esc(affiliate.name) + sandboxMark(affiliate) : unset('unknown affiliate');
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

  function fmtDateTime(value) {
    if (!value) return 'not available';
    var date = new Date(value);
    if (isNaN(date.getTime())) return String(value);
    return date.toLocaleString([], {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
    });
  }

  function setBusy(next) {
    busy = next;
    document.body.classList.toggle('crm-is-saving', next);
    qsa('button').forEach(function (button) {
      if (next) {
        if (button.disabled) button.setAttribute('data-busy-was-disabled', '1');
        else {
          button.disabled = true;
          button.setAttribute('data-busy-lock', '1');
        }
      } else {
        if (button.getAttribute('data-busy-lock') === '1') button.disabled = false;
        button.removeAttribute('data-busy-lock');
        button.removeAttribute('data-busy-was-disabled');
      }
    });
    var sync = $('crm-sync');
    if (sync && next) sync.textContent = 'Saving…';
  }

  function mutationMessage(error) {
    if (!error) return 'The action could not be completed.';
    if (error.status === 401) return 'Session expired. Log in again, then retry.';
    if (error.status === 403) return 'You do not have permission to do that.';
    if (error.status === 409) return 'Someone else changed this record. The latest version is now loaded; review it and try again.';
    if (error.status === 503) return 'The live program service is temporarily unavailable. Nothing was changed here.';
    return error.message || 'The action could not be completed.';
  }

  async function refreshProjection(options) {
    options = options || {};
    try {
      await CRM.load();
      syncProjectionControls();
      renderAll();
      renderSystemState();
      if (!options.quiet) toast('Control tower refreshed.');
      return true;
    } catch (error) {
      renderSystemState();
      if (!options.quiet) toast(mutationMessage(error));
      return false;
    }
  }

  async function mutate(actionKey, payload, options) {
    options = options || {};
    if (busy) {
      toast('Another action is still saving. Wait for it to finish.');
      return null;
    }
    var expectedRevision = options.expectedRevision;
    if (expectedRevision === undefined || expectedRevision === null || expectedRevision === '') {
      expectedRevision = CRM.revision;
    }
    var signature = JSON.stringify({
      action: CRM.actionName(actionKey),
      expectedRevision: expectedRevision,
      payload: payload || {}
    });
    var stableKey = pendingMutations[signature] ||
      CRM.idempotencyKey(CRM.actionName(actionKey));
    pendingMutations[signature] = stableKey;
    setBusy(true);
    try {
      var result = await CRM.action(actionKey, payload, {
        expectedRevision: expectedRevision,
        idempotencyKey: stableKey
      });
      delete pendingMutations[signature];
      var refreshed = await refreshProjection({ quiet: true });
      if (!refreshed) {
        toast('The server accepted the action, but the latest projection could not be loaded. Refresh before making another change.');
        return null;
      }
      if (options.success) toast(options.success);
      return result;
    } catch (error) {
      /* A missing status or a 5xx can mean the mutation committed but its
         response was lost. Keep the exact key/body for the operator's retry. */
      if (error && error.status && error.status < 500) {
        delete pendingMutations[signature];
      }
      if (error.status === 409) {
        var conflictRefreshed = await refreshProjection({ quiet: true });
        toast(conflictRefreshed
          ? mutationMessage(error)
          : 'A conflict was detected, and the latest projection could not be loaded. Refresh before retrying.');
        return null;
      }
      if (error.status === 401) {
        CRM.status.phase = 'error';
        CRM.status.error = error;
      }
      renderSystemState();
      toast(mutationMessage(error));
      return null;
    } finally {
      setBusy(false);
      renderSystemState();
    }
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

  function refillSelect(el, values, allLabel, labelFn) {
    if (!el) return;
    var selected = el.value;
    fillSelect(el, values, allLabel, labelFn);
    var hasSelected = Array.prototype.some.call(el.options, function (option) {
      return option.value === selected;
    });
    el.value = hasSelected ? selected : (allLabel ? 'all' : '');
  }

  function syncProjectionControls() {
    refillSelect($('aff-owner'), CRM.OWNERS, 'All owners');
    refillSelect($('pipe-owner'), CRM.OWNERS, 'All owners');
    refillSelect($('onb-owner'), CRM.OWNERS, 'All owners');
    refillSelect($('out-owner'), CRM.OWNERS, 'All owners');
    refillSelect($('aff-stage'), CRM.STAGES, 'All stages');
    syncControls();
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

    renderProgram();
    renderHistoryPreview();
  }

  function displayValue(value) {
    if (value === null || value === undefined || value === '') return unset('not set');
    if (typeof value === 'boolean') return pill(value ? 'yes' : 'no', value ? 'is-ok' : 'is-quiet');
    if (Array.isArray(value)) return value.length ? esc(value.join(', ')) : unset('none');
    if (typeof value === 'object') return esc(JSON.stringify(value));
    return esc(value);
  }

  function renderProgram() {
    var program = CRM.state.program || {};
    var meta = CRM.state.meta || {};
    var title = program.name || program.label || 'Biologix affiliate program';
    var status = program.status || program.lifecycleStatus || meta.status || 'status not set';
    var normalizedStatus = String(status).toLowerCase();
    var missing = activationMissing();
    $('program-banner-title').textContent = title;
    $('program-banner-body').innerHTML =
      'Authoritative status: <b>' + esc(status) + '</b>. ' +
      'Projection revision <span class="crm-num">' + esc(CRM.revision || 'not supplied') + '</span>.';
    $('program-banner').classList.toggle('is-warn',
      normalizedStatus !== 'active' || !activationRequirementsAvailable() || missing.length > 0);
    $('program-banner').classList.toggle('is-info',
      normalizedStatus === 'active' && activationRequirementsAvailable() && missing.length === 0);

    var preferred = [
      ['Status', status],
      ['Program owner', program.owner || program.ownerName],
      ['Legal entity', programField('legalEntityName', 'legal_entity_name')],
      ['Agreement version', programField('agreementVersion', 'agreement_version')],
      ['Destination origin', programField('affiliateBaseUrl', 'affiliate_base_url')],
      ['Activation gaps', activationRequirementsAvailable() ? (missing.length ? missing.join('; ') : 'none') : 'not supplied'],
      ['Enrollment count', CRM.state.enrollments.length]
    ];
    $('dash-program').innerHTML = '<div class="crm-key-values">' + preferred.map(function (row) {
      return '<div class="crm-key-value"><span class="crm-sub">' + esc(row[0]) + '</span><span>' +
        displayValue(row[1]) + '</span></div>';
    }).join('') + '</div>';
  }

  function auditText(event) {
    return event.summary || event.message || event.description || event.action || event.type || 'Program event';
  }

  function auditTime(event) {
    return event.occurredAt || event.createdAt || event.timestamp || event.date || '';
  }

  function auditActor(event) {
    var actor = event.actor || event.actorName || event.user || {};
    if (typeof actor === 'string') return actor;
    return actor.name || actor.email || event.actorEmail || 'System';
  }

  function historyRows(limit) {
    var rows = CRM.state.audit.slice();
    rows.sort(function (a, b) { return String(auditTime(b)).localeCompare(String(auditTime(a))); });
    if (limit) rows = rows.slice(0, limit);
    return rows;
  }

  function historyHtml(rows) {
    if (!rows.length) return '<p class="crm-empty">No history has been recorded yet.</p>';
    return '<div class="crm-history-list">' + rows.map(function (event) {
      return '<div class="crm-history-item">' +
        '<div><b>' + esc(auditText(event)) + '</b><div class="crm-sub">' + esc(auditActor(event)) + '</div></div>' +
        '<time class="crm-sub crm-num" datetime="' + esc(auditTime(event)) + '">' + esc(fmtDateTime(auditTime(event))) + '</time>' +
        '</div>';
    }).join('') + '</div>';
  }

  function renderHistoryPreview() {
    $('dash-history').innerHTML = historyHtml(historyRows(5));
  }

  function renderSystemState() {
    var state = CRM.status;
    var host = $('crm-system-state');
    var retry = $('crm-retry');
    var sync = $('crm-sync');
    var ready = state.phase === 'ready';
    host.hidden = ready;
    retry.hidden = state.phase !== 'error';
    host.classList.toggle('is-warn', state.phase === 'error');
    host.classList.toggle('is-info', state.phase !== 'error');

    if (state.phase === 'loading') {
      $('crm-system-title').textContent = 'Loading the live control tower';
      $('crm-system-body').textContent = 'Connecting to the authoritative program record…';
      sync.textContent = 'Connecting…';
    } else if (state.phase === 'error') {
      $('crm-system-title').textContent = state.error && state.error.status === 401
        ? 'Sign in required'
        : 'Live data could not be loaded';
      $('crm-system-body').textContent = mutationMessage(state.error);
      sync.textContent = 'Offline';
    } else if (ready) {
      sync.textContent = 'Synced ' + fmtDateTime(state.refreshedAt);
      sync.title = 'Projection generated ' + fmtDateTime(state.generatedAt) +
        '. Revision ' + (state.revision || 'not supplied') + '.';
    }

    var actions = CRM.state.capabilities && CRM.state.capabilities.actions;
    $('tool-invite').hidden = Array.isArray(actions) && actions.indexOf('enrollment.prepare') < 0 &&
      actions.indexOf('test-account.create') < 0;
    $('tool-logout').hidden = Array.isArray(actions) && actions.indexOf('session.logout') < 0 &&
      !(CRM.state.session && CRM.state.session.logoutUrl);

    qsa('[data-mutation], #aff-add, #out-add, #sale-add, #payout-add, #tool-invite').forEach(function (button) {
      if (!ready && !button.disabled) {
        button.disabled = true;
        button.setAttribute('data-live-lock', '1');
      } else if (ready && button.getAttribute('data-live-lock') === '1') {
        button.disabled = false;
        button.removeAttribute('data-live-lock');
      }
    });
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
      if (!CRM.isTestAffiliate(a)) {
        tOrders += m.orders; tGross += m.gross; tRef += m.refunded; tNet += m.net;
      }
      var risk = (a.risk || []).map(function (r) { return '<span class="crm-flag">' + esc(r) + '</span>'; }).join(' ');
      return '<tr class="crm-row" data-entity="affiliates" data-id="' + esc(a.id) + '" tabindex="0" data-fkey="aff:' + esc(a.id) + '">' +
        '<td class="crm-cell-name">' + esc(a.name) + sandboxMark(a) +
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
      : 'No affiliates are in the live program yet.');

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
    }).filter(function (affiliate) {
      return affiliate.authoritative !== true && !affiliate.enrollmentId;
    });

    var byStage = {};
    CRM.PROSPECT_STAGES.forEach(function (s) { byStage[s.id] = []; });
    rows.forEach(function (a) {
      if (!byStage[a.stage]) byStage[a.stage] = [];
      byStage[a.stage].push(a);
    });

    $('pipe-board').innerHTML = CRM.PROSPECT_STAGES.map(function (s, si) {
      var cards = (byStage[s.id] || []).map(function (a) {
        var m = CRM.affiliateMoney(a.id);
        return '<div class="crm-card" data-entity="affiliates" data-id="' + esc(a.id) + '" tabindex="0" data-fkey="card:' + esc(a.id) + '">' +
          '<div class="crm-card-name">' + esc(a.name) + sandboxMark(a) + '</div>' +
          '<div class="crm-card-meta">' +
            (a.owner && a.owner !== 'Unassigned' ? esc(a.owner) : unset('unowned')) +
            ' · ' + (m.orders ? fmtMoney(m.net, 0) + ' net' : 'no sales') +
          '</div>' +
          '<div class="crm-card-meta">' + (a.nextAction ? esc(a.nextAction) : unset('no next action')) + '</div>' +
          '<div class="crm-btn-row">' +
            '<button type="button" class="crm-btn is-quiet" data-mutation data-move="-1" data-id="' + esc(a.id) + '" data-fkey="mv-:' + esc(a.id) + '"' +
              (si === 0 ? ' disabled' : '') + ' aria-label="Move ' + esc(a.name) + ' back to ' + esc(si > 0 ? CRM.PROSPECT_STAGES[si - 1].label : '') + '">Back</button>' +
            '<button type="button" class="crm-btn is-quiet" data-mutation data-move="1" data-id="' + esc(a.id) + '" data-fkey="mv+:' + esc(a.id) + '"' +
              (si === CRM.PROSPECT_STAGES.length - 1 ? ' disabled' : '') + ' aria-label="Move ' + esc(a.name) + ' forward to ' + esc(si < CRM.PROSPECT_STAGES.length - 1 ? CRM.PROSPECT_STAGES[si + 1].label : '') + '">Forward</button>' +
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
        'When the server moves someone into onboarding, their gates appear here.</p>';
      return;
    }

    $('onb-list').innerHTML = rows.map(function (a) {
      var prog = CRM.activationReadiness(a);
      var g = a.gates || {};
      var seenNext = false;

      var chips = CRM.GATES.map(function (gate, i) {
        var done = g[gate.id] === true;
        var cls = 'crm-gate';
        var gateState;
        if (done) cls += ' is-done';
        if (done) gateState = 'passed';
        else if (!seenNext) { cls += ' is-next'; gateState = 'next'; seenNext = true; }
        else { cls += ' is-blocked'; gateState = 'blocked'; }
        return '<span class="' + cls + '" role="status" aria-label="' + esc(gate.label + ': ' +
          gateState) + '" title="' + esc(gate.note) + '">' +
          '<span class="crm-num">' + (i + 1) + '</span> ' + esc(gate.label) + '</span>';
      }).join('');

      var status;
      if (prog.ready) {
        status = pill('Ready to launch', 'is-ok') +
          '<span class="crm-sub"> All eight prerequisites pass. The lifecycle service can now authorize activation.</span>';
      } else {
        var blocking = prog.total - prog.done - 1;
        status = pill('Blocked at ' + prog.blockedBy.label, 'is-warn') +
          '<div class="crm-sub">' + esc(prog.blockedBy.note) +
          ' Holding back ' + blocking + ' later gate' + (blocking === 1 ? '' : 's') +
          ', and the launch itself.</div>';
      }

      return '<div class="crm-panel">' +
        '<div class="crm-panel-head">' +
          '<h3 class="crm-panel-title"><button type="button" class="crm-btn is-quiet" data-entity="affiliates" data-id="' + esc(a.id) + '" data-open="1" data-fkey="onb:' + esc(a.id) + '">' + esc(a.name) + sandboxMark(a) + '</button></h3>' +
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
        '<td><button type="button" class="crm-btn is-quiet" data-mutation data-touch="' + esc(o.id) + '" data-fkey="touch:' + esc(o.id) + '"' +
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
        '<td class="crm-cell-name">' + esc(a.name) + sandboxMark(a) +
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
      ? 'Live commission owed: <span class="crm-unset">not computable</span>. No live affiliate has an approved economics rate in this projection, so the amount is unknown, not zero.'
      : 'Live commission owed: <b class="crm-num">' + esc(fmtMoney(t.commissionOwed)) + '</b>. Uses each affiliate’s own approved rate and excludes sandbox accounts.';

    /* sales ledger */
    var sales = CRM.list('sales', { sort: ui.sales.sort, dir: ui.sales.dir });
    var sg = 0, sr = 0;
    $('sale-body').innerHTML = sales.length ? sales.map(function (s) {
      var gross = parseFloat(s.gross) || 0, ref = parseFloat(s.refunded) || 0;
      if (!CRM.isTestRecord('sales', s)) { sg += gross; sr += ref; }
      return '<tr class="crm-row" data-entity="sales" data-id="' + esc(s.id) + '" tabindex="0" data-fkey="sale:' + esc(s.id) + '">' +
        '<td class="crm-num">' + esc(s.date) + '</td>' +
        '<td class="crm-cell-name">' + affNameHtml(s.affiliateId) + '</td>' +
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
      if (!CRM.isTestRecord('payouts', p) && (p.status === 'Sent' || p.status === 'Cleared')) pt += amt;
      var kind = p.status === 'Cleared' ? 'is-ok'
        : p.status === 'Failed' || p.status === 'Clawed back' ? 'is-bad'
        : p.status === 'Sent' ? 'is-warn' : 'is-quiet';
      return '<tr class="crm-row" data-entity="payouts" data-id="' + esc(p.id) + '" tabindex="0" data-fkey="pay:' + esc(p.id) + '">' +
        '<td class="crm-num">' + esc(p.date) + '</td>' +
        '<td class="crm-cell-name">' + affNameHtml(p.affiliateId) + '</td>' +
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
    var locked = Boolean(f.readOnly || (rec && f.authoritative));

    if (f.type === 'textarea') {
      out = '<textarea class="crm-textarea" id="' + id + '" data-field="' + esc(f.key) + '" rows="3"' +
        (locked ? ' readonly aria-readonly="true"' : '') + '>' + esc(v || '') + '</textarea>';
    } else if (f.type === 'number' || f.type === 'money') {
      out = '<input class="crm-input crm-num" id="' + id + '" data-field="' + esc(f.key) + '" type="number" ' +
        (f.type === 'money' ? 'step="0.01" ' : 'step="any" ') +
        'value="' + (isBlank(v) ? '' : esc(v)) + '"' + (locked ? ' readonly aria-readonly="true"' : '') + '>';
    } else if (f.type === 'date') {
      out = '<input class="crm-input crm-num" id="' + id + '" data-field="' + esc(f.key) + '" type="date" value="' + esc(v || '') + '"' +
        (locked ? ' readonly aria-readonly="true"' : '') + '>';
    } else if (f.type === 'bool') {
      out = '<label class="crm-check" for="' + id + '"><input type="checkbox" id="' + id + '" data-field="' + esc(f.key) + '"' +
        (v ? ' checked' : '') + (locked ? ' disabled aria-readonly="true"' : '') + '> ' + esc(f.label) + '</label>';
    } else if (f.type === 'select') {
      var opts = '<option value="">' + (f.required ? 'Choose one' : 'Not set') + '</option>';
      (f.options || []).forEach(function (o) {
        var lab = (f.key === 'stage' && STAGE_BY_ID[o]) ? STAGE_BY_ID[o].label : o;
        opts += '<option value="' + esc(o) + '"' + (String(v) === String(o) ? ' selected' : '') + '>' + esc(lab) + '</option>';
      });
      out = '<select class="crm-select" id="' + id + '" data-field="' + esc(f.key) + '"' +
        (locked ? ' disabled aria-readonly="true"' : '') + '>' + opts + '</select>';
    } else if (f.type === 'ref') {
      var refs = CRM.all(f.ref).filter(function (r) { return !rec || r.id !== rec.id; });
      if ((entity === 'sales' || entity === 'payouts') && f.key === 'affiliateId') {
        refs = refs.filter(function (r) {
          return String(r.id) === String(v) || (
            r.authoritative === true &&
            Boolean(r.enrollmentId) &&
            !CRM.isTestAffiliate(r) &&
            r.economicsStatus === 'bound'
          );
        });
      }
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
      out = '<div class="crm-gate-readonly" role="list" aria-labelledby="lbl-' + esc(f.key) + '">' +
        CRM.GATES.map(function (gate, i) {
          var passed = g[gate.id] === true;
          return '<div class="crm-check" role="listitem"><span aria-hidden="true">' + (passed ? '✓' : '○') +
            '</span> <span class="crm-num">' + (i + 1) + '</span> ' + esc(gate.label) +
            '<span class="crm-field-hint">' + esc(gate.note) + '</span></div>';
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
      (locked || f.type === 'gates' ? '<p class="crm-field-hint">' +
        (f.readOnly ? 'Authoritative server ledger value.' : 'Authoritative. Change this through its specific lifecycle action.') +
        '</p>' : '') +
      (f.hint ? '<p class="crm-field-hint">' + esc(f.hint) + '</p>' : '') +
      '<p class="crm-field-hint" data-error-for="' + esc(f.key) + '"></p>' +
      '</div>';
  }

  function recordActionAvailable(record, action) {
    return Array.isArray(record && record.availableActions) &&
      record.availableActions.indexOf(action) >= 0 &&
      hasExplicitCapability(action);
  }

  function agreementAux(a) {
    var agreement = a.agreement && typeof a.agreement === 'object' ? a.agreement : {};
    var receipt = a.economicsReceipt && typeof a.economicsReceipt === 'object'
      ? a.economicsReceipt : null;
    var agreementStatus = agreement.enrollmentStatus || agreement.engineStatus || 'not started';
    var agreementTone = agreement.webhookVerified === true
      ? 'is-ok'
      : agreementStatus === 'pending' || agreementStatus === 'not started'
        ? 'is-quiet'
        : 'is-warn';
    var actions = [];
    if (recordActionAvailable(a, 'agreement.launch')) {
      actions.push(
        '<button type="button" class="crm-btn is-primary" data-mutation data-agreement-action="launch" data-id="' +
          esc(a.id) + '">Launch agreement</button>'
      );
    }
    if (recordActionAvailable(a, 'agreement.manage')) {
      actions.push(
        '<button type="button" class="crm-btn" data-mutation data-agreement-action="manage" data-id="' +
          esc(a.id) + '">Open agreement</button>'
      );
    }
    if (recordActionAvailable(a, 'invitation.send')) {
      actions.push(
        '<button type="button" class="crm-btn is-primary" data-mutation data-agreement-action="send" data-id="' +
          esc(a.id) + '">Send Passport access</button>'
      );
    }
    var economics = receipt
      ? '<div class="crm-key-values">' +
          '<div class="crm-key-value"><span class="crm-sub">Economics</span><span>' +
            pill(a.economicsStatus || 'bound', 'is-ok') + '</span></div>' +
          '<div class="crm-key-value"><span class="crm-sub">Terms reference</span><span class="crm-num">' +
            esc(receipt.termsReference || 'not supplied') + '</span></div>' +
          '<div class="crm-key-value"><span class="crm-sub">Agreement version</span><span class="crm-num">' +
            esc(receipt.agreementVersion || 'not supplied') + '</span></div>' +
          '<div class="crm-key-value"><span class="crm-sub">Snapshot receipt</span><span class="crm-num">' +
            esc(receipt.snapshotSha256 || a.economicsSnapshotSha256 || 'not supplied') + '</span></div>' +
          '<div class="crm-key-value"><span class="crm-sub">Bound</span><span>' +
            esc(fmtDateTime(receipt.boundAt)) + '</span></div>' +
        '</div>'
      : '<div class="crm-banner is-warn"><div class="crm-banner-title">Economics not bound</div>' +
          '<div class="crm-banner-body">A production agreement cannot launch until the exact per-affiliate economics receipt exists.</div></div>';
    var evidence = agreement.webhookVerified === true
      ? '<p class="crm-field-hint">' +
          pill('Verified signature evidence', 'is-ok') +
          (agreement.signedAt ? ' Signed ' + esc(fmtDateTime(agreement.signedAt)) + '.' : '') +
        '</p>'
      : '<p class="crm-field-hint">Passport access stays locked until the Contract Engine webhook verifies the signed artifact and certificate hashes.</p>';
    if (a.isTest === true) {
      evidence = '<p class="crm-field-hint"><b>Sandbox:</b> fixed nonpayable test records do not create a production agreement.</p>';
      economics = '<div class="crm-banner is-info"><div class="crm-banner-title">SANDBOX economics</div>' +
        '<div class="crm-banner-body">Fixed nonpayable policy. Excluded from live merchant connections, revenue, commission and payout totals.</div></div>';
    }
    return '<div class="crm-fieldset"><h3 class="crm-fieldset-title">Agreement + Passport handoff</h3>' +
      '<p class="crm-field-hint">Current agreement state: ' + pill(agreementStatus, agreementTone) + '</p>' +
      economics + evidence +
      (actions.length
        ? '<div class="crm-btn-row">' + actions.join('') + '</div>'
        : '<p class="crm-field-hint">No agreement or invitation action is currently authorized for this record.</p>') +
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
    var activation = CRM.activationReadiness(a);
    var lifecycleButtons = '';
    if (a.authoritative === true || a.enrollmentId) {
      if (a.stage === 'signed' || a.stage === 'onboarding') {
        lifecycleButtons =
          '<button type="button" class="crm-btn is-primary" data-mutation data-lifecycle-stage="active" data-id="' + esc(a.id) + '"' +
          (activation.ready ? '' : ' disabled title="Complete every activation prerequisite first."') +
          '>Activate affiliate</button>';
      } else if (a.stage === 'active') {
        lifecycleButtons =
          '<button type="button" class="crm-btn" data-mutation data-lifecycle-stage="paused" data-id="' + esc(a.id) + '">Pause</button>' +
          '<button type="button" class="crm-btn is-danger" data-mutation data-lifecycle-stage="churned" data-id="' + esc(a.id) + '">Offboard</button>';
      } else if (a.stage === 'paused') {
        lifecycleButtons =
          '<button type="button" class="crm-btn is-primary" data-mutation data-lifecycle-stage="active" data-id="' + esc(a.id) + '"' +
          (activation.ready ? '' : ' disabled title="Restore every activation prerequisite first."') +
          '>Reactivate</button>' +
          '<button type="button" class="crm-btn is-danger" data-mutation data-lifecycle-stage="churned" data-id="' + esc(a.id) + '">Offboard</button>';
      }
    }
    var gateHtml = '<div class="crm-fieldset"><h3 class="crm-fieldset-title">Activation</h3>' +
      '<p class="crm-field-hint">' + gateBar(a) + '</p>' +
      '<p class="crm-field-hint">' + (a.stage === 'active' && g.complete
        ? pill('Active and all nine gates pass', 'is-ok')
        : activation.ready
          ? pill('Ready for lifecycle activation', 'is-ok')
          : pill('Blocked at ' + activation.blockedBy.label, 'is-warn') + ' ' + esc(activation.blockedBy.note)) + '</p>' +
      (lifecycleButtons ? '<div class="crm-btn-row">' + lifecycleButtons + '</div>' : '') +
      '</div>';

    var relatedHistory = historyRows().filter(function (event) {
      return event.affiliateId === a.id || event.enrollmentId === a.enrollmentId ||
        event.subjectId === a.id || event.entityId === a.id;
    }).slice(0, 12);
    var history = '<div class="crm-fieldset"><h3 class="crm-fieldset-title">History</h3>' +
      historyHtml(relatedHistory) + '</div>';

    return '<div id="crm-drawer-aux">' + agreementAux(a) + money + gateHtml + salesHtml + payHtml + treeHtml + history + '</div>';
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

  function showSystemDrawer(title, body, foot, trigger) {
    drawer.open = true;
    drawer.entity = null;
    drawer.id = null;
    drawer.back = null;
    drawer.trigger = trigger || document.activeElement;
    $('crm-drawer-title').textContent = title;
    $('crm-drawer-body').innerHTML = body;
    $('crm-drawer-foot').innerHTML = foot || '<button type="button" class="crm-btn is-primary" data-drawer-close>Done</button>';
    var panel = $('crm-drawer');
    panel.hidden = false;
    panel.classList.add('is-open');
    document.body.classList.add('crm-drawer-open');
    var first = qs('input, select, textarea, button, a[href]', $('crm-drawer-panel'));
    (first || $('crm-drawer-close')).focus();
  }

  function openHistoryDrawer(trigger) {
    showSystemDrawer(
      'Program history',
      '<div class="crm-fieldset"><p class="crm-field-hint">Authoritative actions, lifecycle events and operator changes.</p>' +
        historyHtml(historyRows()) + '</div>',
      '<button type="button" class="crm-btn is-primary" data-drawer-close>Done</button>',
      trigger
    );
  }

  function canCreateTestAccount() {
    var capabilities = CRM.state.capabilities || {};
    var actions = capabilities.actions;
    return capabilities.testAccounts === true ||
      (Array.isArray(actions) && actions.indexOf('test-account.create') >= 0);
  }

  var ECON_MODELS = ['percentage', 'retainer', 'hybrid', 'flat', 'tiered', 'custom'];
  var PAYOUT_CADENCES = ['daily', 'weekly', 'biweekly', 'monthly', 'quarterly', 'manual', 'custom'];
  var RETAINER_CADENCES = ['weekly', 'monthly', 'quarterly', 'custom'];
  var RETAINER_PRORATIONS = ['none', 'daily', 'monthly', 'custom'];
  var programDirty = false;

  function hasExplicitCapability(action) {
    var actions = CRM.state.capabilities && CRM.state.capabilities.actions;
    return Array.isArray(actions) && actions.indexOf(action) >= 0;
  }

  function programField(camel, snake) {
    var program = CRM.state.program || {};
    var config = program.config || program.configuration || {};
    if (program[camel] !== undefined && program[camel] !== null) return program[camel];
    if (snake && program[snake] !== undefined && program[snake] !== null) return program[snake];
    if (config[camel] !== undefined && config[camel] !== null) return config[camel];
    if (snake && config[snake] !== undefined && config[snake] !== null) return config[snake];
    return '';
  }

  function activationMissing() {
    var program = CRM.state.program || {};
    var explicitMissing = program.missingActivationRequirements ||
      program.missing_activation_requirements;
    if (Array.isArray(explicitMissing)) {
      return explicitMissing.map(function (item) {
        if (typeof item === 'string') return item;
        return item.label || item.message || item.key || item.code || JSON.stringify(item);
      });
    }
    var requirements = program.activationRequirements || program.activation_requirements || {};
    var missing = Array.isArray(requirements)
      ? requirements.filter(function (item) {
          return item && item.satisfied !== true;
        })
      : Array.isArray(requirements.missing) ? requirements.missing
      : Array.isArray(requirements.missingRequirements) ? requirements.missingRequirements
      : Array.isArray(program.missingRequirements) ? program.missingRequirements
      : [];
    return missing.map(function (item) {
      if (typeof item === 'string') return item;
      return item.label || item.message || item.key || item.code || JSON.stringify(item);
    });
  }

  function activationRequirementsAvailable() {
    var program = CRM.state.program || {};
    return program.missingActivationRequirements !== undefined ||
      program.missing_activation_requirements !== undefined ||
      program.activationRequirements !== undefined ||
      program.activation_requirements !== undefined ||
      program.missingRequirements !== undefined;
  }

  function originValue(value) {
    try {
      var parsed = new URL(value);
      if (parsed.protocol !== 'https:' || parsed.username || parsed.password ||
          parsed.pathname !== '/' || parsed.search || parsed.hash) return null;
      return parsed.origin;
    } catch (error) {
      return null;
    }
  }

  function programStatusHtml() {
    var status = String(programField('status', 'status') || 'unknown').toLowerCase();
    var kind = status === 'active' ? 'is-ok' : status === 'paused' ? 'is-warn' : 'is-quiet';
    return pill(status, kind);
  }

  function economicsSchema() {
    var schema = CRM.state.program && CRM.state.program.economicsSchema;
    return schema && typeof schema === 'object' ? schema : null;
  }

  function economicsSchemaValue(schema, key) {
    var buckets = [
      schema && schema.values,
      schema && schema.initialValues,
      schema && schema.defaults,
      schema && schema.snapshot,
      schema && schema.current
    ];
    for (var i = 0; i < buckets.length; i++) {
      if (buckets[i] && Object.prototype.hasOwnProperty.call(buckets[i], key)) return buckets[i][key];
    }
    if (schema && schema.properties && schema.properties[key]) {
      var property = schema.properties[key];
      if (property.const !== undefined) return property.const;
      if (property.default !== undefined) return property.default;
    }
    if (schema && Array.isArray(schema.fields)) {
      var field = schema.fields.find(function (candidate) {
        return candidate && (candidate.key === key || candidate.name === key);
      });
      if (field) {
        if (field.value !== undefined) return field.value;
        if (field.default !== undefined) return field.default;
      }
    }
    return '';
  }

  function econOptions(id, values, selected) {
    return '<select class="crm-select" id="' + id + '">' +
      '<option value="">Choose one</option>' +
      values.map(function (value) {
        return '<option value="' + esc(value) + '"' + (String(selected) === value ? ' selected' : '') + '>' +
          esc(value) + '</option>';
      }).join('') + '</select>';
  }

  function economicsSnapshotFields(schema, options) {
    options = options || {};
    var containerId = options.containerId || 'invite-live-economics';
    var errorId = options.errorId || 'invite-economics-error';
    var heading = options.heading || 'Per-affiliate economics snapshot';
    var description = options.description ||
      'All 15 v2 fields bind immutably to this invitation. No program-wide rate is assumed.';
    function value(key) {
      var current = economicsSchemaValue(schema, key);
      return current === null || current === undefined ? '' : String(current);
    }
    return '<div class="crm-fieldset" id="' + esc(containerId) + '">' +
      '<h3 class="crm-fieldset-title">' + esc(heading) + '</h3>' +
      '<p class="crm-field-hint">' + esc(description) + '</p>' +
      '<div class="crm-form-grid">' +
        '<div class="crm-field"><label class="crm-field-label" for="econ-currency">Currency <span class="crm-pill is-warn">required</span></label>' +
          '<input class="crm-input crm-num" id="econ-currency" maxlength="3" autocomplete="off" value="' + esc(value('currency')) + '"></div>' +
        '<div class="crm-field"><label class="crm-field-label" for="econ-model">Model <span class="crm-pill is-warn">required</span></label>' +
          econOptions('econ-model', ECON_MODELS, value('model')) + '</div>' +
      '</div>' +
      '<div class="crm-field"><label class="crm-field-label" for="econ-terms">Terms <span class="crm-pill is-warn">required</span></label>' +
        '<textarea class="crm-textarea" id="econ-terms" rows="4" maxlength="2000">' + esc(value('terms')) + '</textarea>' +
        '<p class="crm-field-hint">3–2,000 characters. State the exact individualized economics.</p></div>' +
      '<div class="crm-field"><label class="crm-field-label" for="econ-terms-reference">Terms reference <span class="crm-pill is-warn">server locked</span></label>' +
        '<input class="crm-input crm-num" id="econ-terms-reference" readonly aria-readonly="true" value="' + esc(value('terms_reference')) + '">' +
        '<p class="crm-field-hint">Immutable server reference, 3–500 characters.</p></div>' +
      '<div class="crm-form-grid">' +
        '<div class="crm-field"><label class="crm-field-label" for="econ-commission-rate">Commission rate %</label>' +
          '<input class="crm-input crm-num" id="econ-commission-rate" inputmode="decimal" value="' + esc(value('commission_rate')) + '">' +
          '<p class="crm-field-hint">0–100, up to 4 decimals. Required above zero for percentage and hybrid.</p></div>' +
        '<div class="crm-field"><label class="crm-field-label" for="econ-commission-base">Commission base <span class="crm-pill is-warn">required</span></label>' +
          '<input class="crm-input" id="econ-commission-base" maxlength="500" value="' + esc(value('commission_base')) + '"></div>' +
      '</div>' +
      '<div class="crm-form-grid is-three">' +
        '<div class="crm-field"><label class="crm-field-label" for="econ-attribution-window">Attribution days</label>' +
          '<input class="crm-input crm-num" id="econ-attribution-window" type="number" min="1" max="3650" step="1" value="' + esc(value('attribution_window_days')) + '"></div>' +
        '<div class="crm-field"><label class="crm-field-label" for="econ-settlement-hold">Settlement hold</label>' +
          '<input class="crm-input crm-num" id="econ-settlement-hold" type="number" min="0" max="3650" step="1" value="' + esc(value('settlement_hold_days')) + '"></div>' +
        '<div class="crm-field"><label class="crm-field-label" for="econ-clawback-days">Clawback days</label>' +
          '<input class="crm-input crm-num" id="econ-clawback-days" type="number" min="0" max="3650" step="1" value="' + esc(value('clawback_days')) + '"></div>' +
      '</div>' +
      '<div class="crm-form-grid">' +
        '<div class="crm-field"><label class="crm-field-label" for="econ-payout-cadence">Payout cadence <span class="crm-pill is-warn">required</span></label>' +
          econOptions('econ-payout-cadence', PAYOUT_CADENCES, value('payout_cadence')) + '</div>' +
        '<div class="crm-field"><label class="crm-field-label" for="econ-payout-threshold">Payout threshold</label>' +
          '<input class="crm-input crm-num" id="econ-payout-threshold" inputmode="decimal" value="' + esc(value('payout_threshold')) + '">' +
          '<p class="crm-field-hint">0–1,000,000,000, up to 2 decimals.</p></div>' +
      '</div>' +
      '<div class="crm-field"><label class="crm-field-label" for="econ-agreement-version">Agreement version <span class="crm-pill is-warn">required</span></label>' +
        '<input class="crm-input crm-num" id="econ-agreement-version" maxlength="160" value="' + esc(value('agreement_version')) + '"></div>' +
      '<div class="crm-form-grid is-three" id="econ-retainer-fields">' +
        '<div class="crm-field"><label class="crm-field-label" for="econ-retainer-amount">Retainer amount</label>' +
          '<input class="crm-input crm-num" id="econ-retainer-amount" inputmode="decimal" value="' + esc(value('retainer_amount')) + '"></div>' +
        '<div class="crm-field"><label class="crm-field-label" for="econ-retainer-cadence">Retainer cadence</label>' +
          econOptions('econ-retainer-cadence', RETAINER_CADENCES, value('retainer_cadence')) + '</div>' +
        '<div class="crm-field"><label class="crm-field-label" for="econ-retainer-proration">Retainer proration</label>' +
          econOptions('econ-retainer-proration', RETAINER_PRORATIONS, value('retainer_proration')) + '</div>' +
      '</div>' +
      '<p class="crm-field-hint" id="' + esc(errorId) + '" role="alert"></p>' +
      '</div>';
  }

  function openInviteDrawer(trigger) {
    var testFlag = canCreateTestAccount()
      ? '<label class="crm-check" for="invite-test"><input type="checkbox" id="invite-test"> Create as sandbox/test data</label>' +
        '<p class="crm-field-hint">Sandbox accounts are nonpayable, cannot connect to a live merchant account and do not count toward live totals.</p>' +
        '<div id="invite-test-options" hidden><label class="crm-check" for="invite-test-send">' +
          '<input type="checkbox" id="invite-test-send"> Explicitly send the sandbox invitation to this email</label>' +
          '<p class="crm-field-hint">Leave this off to create a manual redemption link without sending email.</p></div>'
      : '';
    var schema = economicsSchema();
    var liveEconomics = schema
      ? economicsSnapshotFields(schema)
      : '<div class="crm-banner is-warn" id="invite-live-economics"><div class="crm-banner-title">Live invitations are fail-closed</div>' +
        '<div class="crm-banner-body">The projection did not provide program.economicsSchema. Refresh after the server publishes the exact per-affiliate schema, or create sandbox data.</div></div>';
    showSystemDrawer(
      'Start affiliate onboarding',
      '<div class="crm-banner is-info"><div class="crm-banner-title">One controlled sequence</div>' +
        '<div class="crm-banner-body">1. Prepare the enrollment and lock its exact economics. 2. Launch and execute the enrollment-bound agreement. 3. Send Passport access only after verified signature evidence returns.</div></div>' +
        '<div class="crm-fieldset"><h3 class="crm-fieldset-title">Creator details</h3>' +
        '<div class="crm-field"><label class="crm-field-label" for="invite-name">Creator name</label>' +
          '<input class="crm-input" id="invite-name" type="text" autocomplete="name"></div>' +
        '<div class="crm-field"><label class="crm-field-label" for="invite-email">Email <span class="crm-pill is-warn" id="invite-email-required">required</span></label>' +
          '<input class="crm-input" id="invite-email" type="email" autocomplete="email" required></div>' +
        testFlag +
        '<p class="crm-field-hint" id="invite-error" role="alert"></p></div>' +
        '<div class="crm-banner is-info" id="invite-sandbox-policy" hidden><div class="crm-banner-title">SANDBOX policy</div>' +
          '<div class="crm-banner-body">The server maps a fixed nonpayable test policy. No editable economics, no live merchant link, no live metrics.</div></div>' +
        liveEconomics +
        '<div id="invite-result"></div>',
      '<div class="crm-btn-row"><button type="button" class="crm-btn is-primary" id="invite-create" data-mutation>Prepare enrollment</button>' +
        '<button type="button" class="crm-btn is-quiet" data-drawer-close>Cancel</button></div>',
      trigger
    );
    syncInviteTestMode();
    syncEconomicsConditions();
    $('invite-email').focus();
  }

  function syncInviteTestMode() {
    var test = $('invite-test');
    if (!test) return;
    var enabled = test.checked;
    var send = $('invite-test-send');
    var sendExplicitly = enabled && send && send.checked;
    $('invite-test-options').hidden = !enabled;
    $('invite-live-economics').hidden = enabled;
    $('invite-sandbox-policy').hidden = !enabled;
    $('invite-email').required = !enabled || sendExplicitly;
    $('invite-email-required').hidden = enabled && !sendExplicitly;
    $('invite-email').placeholder = enabled && !sendExplicitly
      ? 'Optional; a non-deliverable sandbox address will be generated'
      : '';
    $('invite-create').textContent = enabled ? 'Create sandbox link' : 'Prepare enrollment';
    $('invite-create').disabled = !enabled && !economicsSchema();
  }

  function syncEconomicsConditions() {
    var modelField = $('econ-model');
    if (!modelField) return;
    var model = modelField.value;
    var hasRetainer = model === 'retainer' || model === 'hybrid';
    var commission = $('econ-commission-rate');
    if (commission) {
      commission.disabled = model === 'retainer';
      if (model === 'retainer') commission.value = '';
    }
    ['econ-retainer-amount', 'econ-retainer-cadence', 'econ-retainer-proration'].forEach(function (id) {
      var field = $(id);
      field.disabled = !hasRetainer;
      if (!hasRetainer) field.value = '';
    });
    $('econ-retainer-fields').classList.toggle('is-disabled', !hasRetainer);
  }

  function collectEconomicsSnapshot(errorId) {
    errorId = errorId || 'invite-economics-error';
    var errors = [];
    function raw(id) {
      var field = $(id);
      return field ? field.value.trim() : '';
    }
    function requiredText(id, label, min, max) {
      var value = raw(id);
      if (value.length < min || value.length > max) {
        errors.push({ id: id, message: label + ' must be ' + min + '–' + max + ' characters.' });
      }
      return value;
    }
    function decimal(id, label, maximum, places, options) {
      options = options || {};
      var value = raw(id);
      if (!value && options.nullable) return null;
      var pattern = new RegExp('^(?:0|[1-9][0-9]*)(?:\\.[0-9]{1,' + places + '})?$');
      var number = Number(value);
      if (!pattern.test(value) || !isFinite(number) || number < 0 || number > maximum ||
          (options.positive && number <= 0)) {
        errors.push({
          id: id,
          message: label + ' must be ' + (options.positive ? 'greater than zero and ' : '') +
            'no more than ' + maximum + ', with up to ' + places + ' decimal places.'
        });
      }
      return value || null;
    }
    function integer(id, label, minimum, maximum) {
      var value = raw(id);
      var number = Number(value);
      if (!/^(?:0|[1-9][0-9]*)$/.test(value) || number < minimum || number > maximum) {
        errors.push({ id: id, message: label + ' must be an integer from ' + minimum + ' to ' + maximum + '.' });
      }
      return value;
    }
    function choice(id, label, choices) {
      var value = raw(id);
      if (choices.indexOf(value) < 0) errors.push({ id: id, message: 'Choose a valid ' + label + '.' });
      return value;
    }

    var currency = raw('econ-currency').toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) {
      errors.push({ id: 'econ-currency', message: 'Currency must be exactly three uppercase ISO letters.' });
    }
    var model = choice('econ-model', 'model', ECON_MODELS);
    var hasRetainer = model === 'retainer' || model === 'hybrid';
    var requiresCommission = model === 'percentage' || model === 'hybrid';
    var commissionRate = model === 'retainer'
      ? null
      : decimal('econ-commission-rate', 'Commission rate', 100, 4, {
          nullable: !requiresCommission,
          positive: requiresCommission
        });
    var retainerAmount = hasRetainer
      ? decimal('econ-retainer-amount', 'Retainer amount', 1000000000, 2, { positive: true })
      : null;
    var retainerCadence = hasRetainer
      ? choice('econ-retainer-cadence', 'retainer cadence', RETAINER_CADENCES)
      : null;
    var retainerProration = hasRetainer
      ? choice('econ-retainer-proration', 'retainer proration', RETAINER_PRORATIONS)
      : null;

    var snapshot = {
      currency: currency,
      model: model,
      terms: requiredText('econ-terms', 'Terms', 3, 2000),
      terms_reference: requiredText('econ-terms-reference', 'Terms reference', 3, 500),
      commission_rate: commissionRate,
      commission_base: requiredText('econ-commission-base', 'Commission base', 3, 500),
      attribution_window_days: integer('econ-attribution-window', 'Attribution window', 1, 3650),
      settlement_hold_days: integer('econ-settlement-hold', 'Settlement hold', 0, 3650),
      clawback_days: integer('econ-clawback-days', 'Clawback days', 0, 3650),
      payout_cadence: choice('econ-payout-cadence', 'payout cadence', PAYOUT_CADENCES),
      payout_threshold: decimal('econ-payout-threshold', 'Payout threshold', 1000000000, 2),
      agreement_version: requiredText('econ-agreement-version', 'Agreement version', 3, 160),
      retainer_amount: retainerAmount,
      retainer_cadence: retainerCadence,
      retainer_proration: retainerProration
    };

    var errorHost = $(errorId);
    if (errors.length) {
      errorHost.innerHTML = '<span class="crm-pill is-bad">' + esc(errors[0].message) + '</span>';
      var first = $(errors[0].id);
      if (first) {
        first.setAttribute('aria-invalid', 'true');
        first.focus();
      }
      announce(errors.map(function (error) { return error.message; }).join(' '));
    } else {
      errorHost.textContent = '';
      qsa('[aria-invalid="true"]', errorHost.parentElement).forEach(function (field) {
        field.removeAttribute('aria-invalid');
      });
    }
    return { snapshot: snapshot, errors: errors };
  }

  function openProgramDrawer(trigger) {
    var program = CRM.state.program || {};
    var programId = program.id || program.programId || '';
    var canCreate = hasExplicitCapability('program.create');
    var canUpdate = hasExplicitCapability('program.update');
    var canActivate = hasExplicitCapability('program.activate');
    programDirty = false;

    if (!programId) {
      showSystemDrawer(
        'Program setup',
        '<div class="crm-banner is-warn"><div class="crm-banner-title">No program record</div>' +
          '<div class="crm-banner-body">Create a fail-closed setup record before entering legal, destination, agreement, or economics configuration.</div></div>',
        canCreate
          ? '<div class="crm-btn-row"><button type="button" class="crm-btn is-primary" id="program-create" data-mutation>Create setup record</button>' +
            '<button type="button" class="crm-btn is-quiet" data-drawer-close>Cancel</button></div>'
          : '<p class="crm-field-hint">Your session does not advertise program.create.</p>' +
            '<button type="button" class="crm-btn is-primary" data-drawer-close>Done</button>',
        trigger
      );
      return;
    }

    var missing = activationMissing();
    var requirementsKnown = activationRequirementsAvailable();
    var requirements = !requirementsKnown
      ? '<div class="crm-banner is-warn"><div class="crm-banner-title">Activation status unavailable</div>' +
        '<div class="crm-banner-body">The projection omitted activationRequirements. Activation stays disabled.</div></div>'
      : missing.length
        ? '<div class="crm-banner is-warn"><div class="crm-banner-title">Activation blocked</div>' +
          '<div class="crm-banner-body"><ul class="crm-plain-list">' +
            missing.map(function (item) { return '<li>' + esc(item) + '</li>'; }).join('') +
          '</ul></div></div>'
        : '<div class="crm-banner is-info"><div class="crm-banner-title">Activation requirements</div>' +
          '<div class="crm-banner-body">The projection reports no missing requirement. The server validates again on activation.</div></div>';

    var fields;
    if (canUpdate) {
      var regions = programField('eligibleRegions', 'eligible_regions');
      var officialAddress = programField('officialAddress', 'official_address');
      if (!officialAddress || typeof officialAddress !== 'object' || Array.isArray(officialAddress)) {
        officialAddress = {};
      }
      fields =
        '<form id="program-setup-form" novalidate>' +
        '<div class="crm-fieldset"><h3 class="crm-fieldset-title">Legal identity</h3>' +
          '<div class="crm-field"><label class="crm-field-label" for="program-legal-entity">Exact registered legal entity</label>' +
            '<input class="crm-input" id="program-legal-entity" maxlength="500" value="' + esc(programField('legalEntityName', 'legal_entity_name')) + '"></div>' +
          '<div class="crm-form-grid">' +
            '<div class="crm-field"><label class="crm-field-label" for="program-trade-name">Trade name / DBA</label>' +
              '<input class="crm-input" id="program-trade-name" maxlength="200" value="' + esc(programField('tradeName', 'trade_name')) + '"></div>' +
            '<div class="crm-field"><label class="crm-field-label" for="program-entity-type">Legal entity type</label>' +
              '<input class="crm-input" id="program-entity-type" maxlength="200" value="' + esc(programField('entityType', 'entity_type')) + '">' +
              '<p class="crm-field-hint">Use the exact legal form printed in the agreement.</p></div>' +
          '</div>' +
          '<div class="crm-form-grid">' +
            '<div class="crm-field"><label class="crm-field-label" for="program-address-line1">Address line 1</label>' +
              '<input class="crm-input" id="program-address-line1" maxlength="240" value="' + esc(officialAddress.line1 || '') + '"></div>' +
            '<div class="crm-field"><label class="crm-field-label" for="program-address-line2">Address line 2</label>' +
              '<input class="crm-input" id="program-address-line2" maxlength="240" value="' + esc(officialAddress.line2 || '') + '"></div>' +
            '<div class="crm-field"><label class="crm-field-label" for="program-address-city">City</label>' +
              '<input class="crm-input" id="program-address-city" maxlength="120" value="' + esc(officialAddress.city || '') + '"></div>' +
            '<div class="crm-field"><label class="crm-field-label" for="program-address-region">State / region</label>' +
              '<input class="crm-input crm-num" id="program-address-region" maxlength="2" value="' + esc(officialAddress.region || '') + '"></div>' +
            '<div class="crm-field"><label class="crm-field-label" for="program-address-postal">Postal code</label>' +
              '<input class="crm-input crm-num" id="program-address-postal" maxlength="10" value="' + esc(officialAddress.postalCode || '') + '"></div>' +
            '<div class="crm-field"><label class="crm-field-label" for="program-address-country">Country</label>' +
              '<input class="crm-input crm-num" id="program-address-country" readonly aria-readonly="true" value="' + esc(officialAddress.countryCode || 'US') + '">' +
              '<p class="crm-field-hint">Must be the server-approved US legal address.</p></div>' +
          '</div>' +
          '<div class="crm-field"><label class="crm-field-label" for="program-signer-ref">Authorized signer reference</label>' +
            '<input class="crm-input crm-num" id="program-signer-ref" maxlength="500" value="' + esc(programField('authorizedSignerRef', 'authorized_signer_ref')) + '">' +
            '<p class="crm-field-hint">Approval or corporate-record reference. This is retained with the exact signer facts below.</p></div>' +
          '<div class="crm-form-grid is-three">' +
            '<div class="crm-field"><label class="crm-field-label" for="program-signer-name">Authorized signer legal name</label>' +
              '<input class="crm-input" id="program-signer-name" maxlength="160" autocomplete="off" value="' +
                esc(programField('authorizedSignerName', 'authorized_signer_name')) + '"></div>' +
            '<div class="crm-field"><label class="crm-field-label" for="program-signer-title">Authorized signer title</label>' +
              '<input class="crm-input" id="program-signer-title" maxlength="160" autocomplete="off" value="' +
                esc(programField('authorizedSignerTitle', 'authorized_signer_title')) + '"></div>' +
            '<div class="crm-field"><label class="crm-field-label" for="program-signer-email">Authorized signer email</label>' +
              '<input class="crm-input" id="program-signer-email" type="email" maxlength="254" autocomplete="off" value="' +
                esc(programField('authorizedSignerEmail', 'authorized_signer_email')) + '"></div>' +
          '</div>' +
          '<p class="crm-field-hint">These facts are locked into the agreement launch and must match the company-side signer and execution certificate exactly.</p>' +
        '</div>' +
        '<div class="crm-fieldset"><h3 class="crm-fieldset-title">Agreement and destinations</h3>' +
          '<div class="crm-form-grid">' +
            '<div class="crm-field"><label class="crm-field-label" for="program-template-key">Agreement template key</label>' +
              '<input class="crm-input crm-num" id="program-template-key" maxlength="100" value="' + esc(programField('agreementTemplateKey', 'agreement_template_key')) + '"></div>' +
            '<div class="crm-field"><label class="crm-field-label" for="program-agreement-version">Agreement version</label>' +
              '<input class="crm-input crm-num" id="program-agreement-version" maxlength="160" value="' + esc(programField('agreementVersion', 'agreement_version')) + '"></div>' +
          '</div>' +
          '<div class="crm-field"><label class="crm-field-label" for="program-affiliate-origin">Locked destination origin</label>' +
            '<input class="crm-input crm-num" id="program-affiliate-origin" type="url" value="' + esc(programField('affiliateBaseUrl', 'affiliate_base_url')) + '">' +
            '<p class="crm-field-hint">Exact HTTPS origin only. No path, query, credentials, or fragment.</p></div>' +
          '<div class="crm-field"><label class="crm-field-label" for="program-tracking-origin">Canonical tracking origin</label>' +
            '<input class="crm-input crm-num" id="program-tracking-origin" type="url" value="' + esc(programField('trackingBaseUrl', 'tracking_base_url')) + '">' +
            '<p class="crm-field-hint">Exact HTTPS origin only. The server enforces the configured portal origin.</p></div>' +
        '</div>' +
        '<div class="crm-fieldset"><h3 class="crm-fieldset-title">Eligibility</h3>' +
          '<div class="crm-form-grid">' +
            '<div class="crm-field"><label class="crm-field-label" for="program-countries">Eligible countries</label>' +
              '<input class="crm-input crm-num" id="program-countries" readonly aria-readonly="true" value="US">' +
              '<p class="crm-field-hint">Passport v1 is locked to the United States.</p></div>' +
            '<div class="crm-field"><label class="crm-field-label" for="program-minimum-age">Minimum age</label>' +
              '<input class="crm-input crm-num" id="program-minimum-age" type="number" min="18" max="99" step="1" value="' +
                esc(programField('minimumAge', 'minimum_age')) + '"></div>' +
          '</div>' +
          '<div class="crm-field"><label class="crm-field-label" for="program-regions">Eligible regions JSON</label>' +
            '<textarea class="crm-textarea crm-num" id="program-regions" rows="4">' +
              esc(regions && typeof regions === 'object' ? JSON.stringify(regions, null, 2) : regions) + '</textarea>' +
            '<p class="crm-field-hint">A JSON object keyed by eligible country. Enter the exact reviewed scope.</p></div>' +
        '</div>' +
        '<div class="crm-fieldset"><h3 class="crm-fieldset-title">Economics policy</h3>' +
          '<div class="crm-banner is-info"><div class="crm-banner-title">Individualized, no defaults</div>' +
            '<div class="crm-banner-body"><span class="crm-num">schemaVersion 2 · mode individualized · noDefaults true</span><br>' +
              'Program setup never stores a creator rate, payout cadence, threshold, or retainer. Every live invitation binds its own complete 15-key snapshot.</div></div>' +
        '</div>' +
        '<p class="crm-field-hint" id="program-error" role="alert"></p>' +
        '</form>';
    } else {
      fields = '<div class="crm-banner is-warn"><div class="crm-banner-title">Setup is read-only</div>' +
        '<div class="crm-banner-body">This session does not advertise program.update.</div></div>' +
        '<div class="crm-key-values">' +
          '<div class="crm-key-value"><span class="crm-sub">Legal entity</span><span>' + displayValue(programField('legalEntityName', 'legal_entity_name')) + '</span></div>' +
          '<div class="crm-key-value"><span class="crm-sub">Trade name / DBA</span><span>' + displayValue(programField('tradeName', 'trade_name')) + '</span></div>' +
          '<div class="crm-key-value"><span class="crm-sub">Entity type</span><span>' + displayValue(programField('entityType', 'entity_type')) + '</span></div>' +
          '<div class="crm-key-value"><span class="crm-sub">Authorized signer</span><span>' +
            displayValue(programField('authorizedSignerName', 'authorized_signer_name')) + '</span></div>' +
          '<div class="crm-key-value"><span class="crm-sub">Signer title</span><span>' +
            displayValue(programField('authorizedSignerTitle', 'authorized_signer_title')) + '</span></div>' +
          '<div class="crm-key-value"><span class="crm-sub">Signer email</span><span>' +
            displayValue(programField('authorizedSignerEmail', 'authorized_signer_email')) + '</span></div>' +
          '<div class="crm-key-value"><span class="crm-sub">Destination</span><span>' + displayValue(programField('affiliateBaseUrl', 'affiliate_base_url')) + '</span></div>' +
          '<div class="crm-key-value"><span class="crm-sub">Tracking</span><span>' + displayValue(programField('trackingBaseUrl', 'tracking_base_url')) + '</span></div>' +
        '</div>';
    }

    var status = String(programField('status', 'status') || 'unknown').toLowerCase();
    var activateDisabled = !requirementsKnown || missing.length > 0 || status === 'active';
    var foot = '<div class="crm-btn-row">';
    if (canUpdate) {
      foot += '<button type="button" class="crm-btn is-primary" id="program-save" data-mutation>Save setup</button>';
    }
    if (canActivate) {
      foot += '<button type="button" class="crm-btn" id="program-activate" data-mutation' +
        (activateDisabled ? ' disabled' : '') + '>' +
        (status === 'paused' ? 'Reactivate saved setup' : 'Activate saved setup') + '</button>';
    }
    foot += '<button type="button" class="crm-btn is-quiet" data-drawer-close>Done</button></div>';
    if (status === 'paused') {
      foot += '<p class="crm-field-hint">Paused is server-owned. This client exposes only actions the server advertises.</p>';
    }

    showSystemDrawer(
      'Program setup',
      '<div class="crm-banner is-info"><div class="crm-banner-title">Program state</div>' +
        '<div class="crm-banner-body">' + programStatusHtml() + ' <span class="crm-num">revision ' +
          esc(program.revision || CRM.revision || 'not supplied') + '</span></div></div>' +
        requirements + fields,
      foot,
      trigger
    );
  }

  function collectProgramSetup() {
    var errors = [];
    function val(id) { return $(id).value.trim(); }
    function invalid(id, message) { errors.push({ id: id, message: message }); }
    var legalEntityName = val('program-legal-entity');
    var tradeName = val('program-trade-name');
    var entityType = val('program-entity-type');
    var officialAddress = {
      line1: val('program-address-line1'),
      line2: val('program-address-line2') || null,
      city: val('program-address-city'),
      region: val('program-address-region').toUpperCase(),
      postalCode: val('program-address-postal'),
      countryCode: val('program-address-country').toUpperCase()
    };
    var authorizedSignerRef = val('program-signer-ref');
    var authorizedSignerName = val('program-signer-name');
    var authorizedSignerTitle = val('program-signer-title');
    var authorizedSignerEmail = val('program-signer-email').toLowerCase();
    var agreementTemplateKey = val('program-template-key');
    var agreementVersion = val('program-agreement-version');
    var affiliateBaseUrl = originValue(val('program-affiliate-origin'));
    var trackingBaseUrl = originValue(val('program-tracking-origin'));
    var eligibleCountries = ['US'];
    var minimumAgeRaw = val('program-minimum-age');
    var minimumAge = Number(minimumAgeRaw);
    var eligibleRegions = null;
    try {
      eligibleRegions = JSON.parse(val('program-regions'));
      if (!eligibleRegions || Array.isArray(eligibleRegions) || typeof eligibleRegions !== 'object') {
        throw new Error('object required');
      }
      var regionKeys = Object.keys(eligibleRegions);
      if (regionKeys.some(function (country) { return country !== 'US'; }) ||
          (eligibleRegions.US !== undefined &&
            (!Array.isArray(eligibleRegions.US) ||
              eligibleRegions.US.some(function (region) {
                return typeof region !== 'string' || !region.trim();
              })))) {
        throw new Error('US regions required');
      }
    } catch (error) {
      invalid('program-regions', 'Eligible regions must be an explicit JSON object.');
    }

    if (legalEntityName.length < 2 || legalEntityName.length > 500 || legalEntityName !== legalEntityName.normalize('NFKC')) {
      invalid('program-legal-entity', 'Legal entity must be exact NFKC text from 2–500 characters.');
    }
    if (tradeName.length < 1 || tradeName.length > 200 || tradeName !== tradeName.normalize('NFKC')) {
      invalid('program-trade-name', 'Trade name must be exact NFKC text from 1–200 characters.');
    }
    if (entityType.length < 2 || entityType.length > 200 || entityType !== entityType.normalize('NFKC')) {
      invalid('program-entity-type', 'Entity type must be exact NFKC text from 2–200 characters.');
    }
    if (officialAddress.line1.length < 2 || officialAddress.line1.length > 240) invalid('program-address-line1', 'Address line 1 must be 2–240 characters.');
    if (officialAddress.line2 && officialAddress.line2.length > 240) invalid('program-address-line2', 'Address line 2 must be no more than 240 characters.');
    if (officialAddress.city.length < 2 || officialAddress.city.length > 120) invalid('program-address-city', 'City must be 2–120 characters.');
    if (!/^[A-Z]{2}$/.test(officialAddress.region)) invalid('program-address-region', 'State / region must be a two-letter code.');
    if (!/^[0-9]{5}(?:-[0-9]{4})?$/.test(officialAddress.postalCode)) invalid('program-address-postal', 'Postal code must be a valid US ZIP code.');
    if (officialAddress.countryCode !== 'US') invalid('program-address-country', 'Program legal address country must be the server-approved US value.');
    if (authorizedSignerRef.length < 3 || authorizedSignerRef.length > 500) invalid('program-signer-ref', 'Authorized signer reference must be 3–500 characters.');
    if (authorizedSignerName.length < 2 || authorizedSignerName.length > 160) invalid('program-signer-name', 'Authorized signer legal name must be 2–160 characters.');
    if (authorizedSignerTitle.length < 2 || authorizedSignerTitle.length > 160) invalid('program-signer-title', 'Authorized signer title must be 2–160 characters.');
    if (authorizedSignerEmail.length > 254 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(authorizedSignerEmail)) {
      invalid('program-signer-email', 'Enter the exact authorized signer email.');
    }
    if (!/^[a-z0-9][a-z0-9-]{0,99}$/.test(agreementTemplateKey)) invalid('program-template-key', 'Agreement template key must be 1–100 lowercase letters, numbers, or hyphens.');
    if (agreementVersion.length < 3 || agreementVersion.length > 160) invalid('program-agreement-version', 'Agreement version must be 3–160 characters.');
    if (!affiliateBaseUrl) invalid('program-affiliate-origin', 'Destination must be an exact HTTPS origin.');
    if (!trackingBaseUrl) invalid('program-tracking-origin', 'Tracking base must be an exact HTTPS origin.');
    if (!/^(?:0|[1-9][0-9]*)$/.test(minimumAgeRaw) || minimumAge < 18 || minimumAge > 99) {
      invalid('program-minimum-age', 'Minimum age must be a whole number from 18 to 99.');
    }

    var errorHost = $('program-error');
    if (errors.length) {
      errorHost.innerHTML = '<span class="crm-pill is-bad">' + esc(errors[0].message) + '</span>';
      var first = $(errors[0].id);
      if (first) { first.setAttribute('aria-invalid', 'true'); first.focus(); }
      return null;
    }
    errorHost.textContent = '';
    return {
      programId: CRM.state.program.id || CRM.state.program.programId,
      expectedRevision: CRM.state.program.revision || CRM.revision,
      legalEntityName: legalEntityName,
      tradeName: tradeName,
      entityType: entityType,
      officialAddress: officialAddress,
      authorizedSignerRef: authorizedSignerRef,
      authorizedSignerName: authorizedSignerName,
      authorizedSignerTitle: authorizedSignerTitle,
      authorizedSignerEmail: authorizedSignerEmail,
      agreementTemplateKey: agreementTemplateKey,
      agreementVersion: agreementVersion,
      affiliateBaseUrl: affiliateBaseUrl,
      trackingBaseUrl: trackingBaseUrl,
      eligibleCountries: eligibleCountries,
      eligibleRegions: eligibleRegions,
      minimumAge: minimumAge,
      economicsConfiguration: {
        schemaVersion: 2,
        mode: 'individualized',
        noDefaults: true
      }
    };
  }

  function renderInvitationResult(result, testAccount) {
    var invitation = result && (result.invitation || result.testAccount || result);
    var url = invitation && (invitation.url || invitation.invitationUrl || invitation.claimUrl || invitation.link);
    var expires = invitation && (invitation.expiresAt || invitation.expiry);
    var resultHost = $('invite-result');
    qsa('#crm-drawer-body > *').forEach(function (section) {
      section.hidden = section !== resultHost;
    });
    resultHost.hidden = false;
    resultHost.innerHTML = '<div class="crm-banner is-info">' +
      '<div class="crm-banner-title">' + esc(testAccount ? 'SANDBOX test account created' : 'Invitation created') + '</div>' +
      '<div class="crm-banner-body">' +
        (testAccount
          ? '<p><b>Nonpayable test data.</b> No live merchant connection or live-program metrics.</p>'
          : '') +
        (url
          ? '<label class="crm-field-label" for="invite-url">Secure link</label>' +
            '<input class="crm-input crm-num" id="invite-url" readonly value="' + esc(url) + '">' +
            '<div class="crm-btn-row"><button type="button" class="crm-btn is-primary" id="invite-copy">Copy link</button></div>'
          : 'The server created the record but did not return a shareable link. Open history for the receipt.') +
        (expires ? '<p class="crm-field-hint">Expires ' + esc(fmtDateTime(expires)) + '.</p>' : '') +
      '</div></div>';
    $('crm-drawer-foot').innerHTML = '<button type="button" class="crm-btn is-primary" data-drawer-close>Done</button>';
    $('crm-drawer-body').scrollTop = 0;
    var copy = $('invite-copy');
    (copy || $('crm-drawer-close')).focus();
  }

  function affiliateForEnrollment(enrollmentId) {
    return CRM.all('affiliates').find(function (affiliate) {
      return String(affiliate.id) === String(enrollmentId) ||
        String(affiliate.enrollmentId || '') === String(enrollmentId);
    }) || null;
  }

  function agreementActionButtons(affiliate) {
    if (!affiliate) return '';
    var buttons = [];
    if (recordActionAvailable(affiliate, 'agreement.launch')) {
      buttons.push(
        '<button type="button" class="crm-btn is-primary" data-mutation data-agreement-action="launch" data-id="' +
          esc(affiliate.id) + '">Launch agreement</button>'
      );
    }
    if (recordActionAvailable(affiliate, 'agreement.manage')) {
      buttons.push(
        '<button type="button" class="crm-btn" data-mutation data-agreement-action="manage" data-id="' +
          esc(affiliate.id) + '">Open agreement</button>'
      );
    }
    if (recordActionAvailable(affiliate, 'invitation.send')) {
      buttons.push(
        '<button type="button" class="crm-btn is-primary" data-mutation data-agreement-action="send" data-id="' +
          esc(affiliate.id) + '">Send Passport access</button>'
      );
    }
    return buttons.join('');
  }

  function renderPreparedEnrollment(result) {
    var enrollmentId = result && result.enrollmentId;
    var affiliate = enrollmentId ? affiliateForEnrollment(enrollmentId) : null;
    var resultHost = $('invite-result');
    qsa('#crm-drawer-body > *').forEach(function (section) {
      section.hidden = section !== resultHost;
    });
    resultHost.hidden = false;
    var actionButtons = agreementActionButtons(affiliate);
    var economicsReceipt = result && result.economicsSnapshotSha256
      ? '<p class="crm-field-hint">Economics receipt <span class="crm-num">' +
          esc(result.economicsSnapshotSha256) + '</span></p>'
      : '';
    resultHost.innerHTML = '<div class="crm-banner is-info">' +
      '<div class="crm-banner-title">Enrollment prepared</div>' +
      '<div class="crm-banner-body"><p>The exact economics are now bound to the canonical enrollment. No invitation email was sent.</p>' +
        economicsReceipt +
        '<p>Next: launch the enrollment-bound agreement. Passport access remains locked until verified signature evidence returns.</p>' +
        (actionButtons
          ? '<div class="crm-btn-row">' + actionButtons + '</div>'
          : '<p class="crm-field-hint">No next agreement action is currently authorized. Open the affiliate record to see the server-owned blocker.</p>') +
      '</div></div>';
    $('crm-drawer-foot').innerHTML = '<button type="button" class="crm-btn is-primary" data-drawer-close>Done</button>';
    $('crm-drawer-body').scrollTop = 0;
    var firstAction = qs('[data-agreement-action]', resultHost);
    (firstAction || $('crm-drawer-close')).focus();
  }

  function secureAgreementUrl(value) {
    try {
      var url = new URL(value);
      if (url.protocol !== 'https:' || url.username || url.password) return null;
      return url.toString();
    } catch (error) {
      return null;
    }
  }

  function renderAgreementWorkspaceResult(action, result, affiliate) {
    var url = secureAgreementUrl(
      action === 'launch'
        ? result && result.launchUrl
        : result && result.manageUrl
    );
    if (!url) {
      toast('The server completed the action but returned no valid secure agreement URL.');
      return;
    }
    showSystemDrawer(
      action === 'launch' ? 'Agreement ready to create' : 'Agreement workspace',
      '<div class="crm-banner is-info"><div class="crm-banner-title">' +
        esc(action === 'launch' ? 'Enrollment context verified' : 'Authoritative agreement loaded') +
        '</div><div class="crm-banner-body">' +
          (action === 'launch'
            ? '<p>The creator, program, agreement version and immutable economics receipt are locked into this launch.</p>'
            : '<p>Open the existing enrollment-bound agreement to review delivery and signature status.</p>') +
          '<a class="crm-btn is-primary" href="' + esc(url) + '" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">' +
            esc(action === 'launch' ? 'Continue to secure agreement' : 'Open secure agreement') +
          '</a>' +
          '<p class="crm-field-hint">Return here after the Contract Engine records the authoritative agreement. This record will update from its signed webhook evidence.</p>' +
        '</div></div>',
      '<button type="button" class="crm-btn is-primary" data-drawer-close>Done</button>',
      null
    );
    if (affiliate) {
      $('crm-drawer-title').setAttribute('data-affiliate-id', affiliate.id);
    }
  }

  async function runAgreementAction(button) {
    var action = button.getAttribute('data-agreement-action');
    var affiliate = CRM.get('affiliates', button.getAttribute('data-id'));
    if (!affiliate || ['launch', 'manage', 'send'].indexOf(action) < 0) {
      toast('The authoritative affiliate record could not be loaded.');
      return;
    }
    var publicAction = action === 'send'
      ? 'invitation.send'
      : 'agreement.' + action;
    if (!recordActionAvailable(affiliate, publicAction)) {
      toast('That action is no longer authorized for this affiliate. Refresh to see the current state.');
      return;
    }
    var enrollmentId = affiliate.enrollmentId || affiliate.id;
    var revision = Number(affiliate.revision);
    if (!Number.isSafeInteger(revision) || revision < 0) {
      toast('The enrollment revision is missing. Refresh before continuing.');
      return;
    }
    if (action === 'send' &&
        !global.confirm('Send Passport access to ' + affiliate.email + '? The signed agreement evidence will be checked again.')) {
      return;
    }
    var result = await mutate(
      action === 'send' ? 'invitation:send' : 'agreement:' + action,
      { enrollmentId: enrollmentId },
      {
        expectedRevision: revision,
        success: action === 'send' ? 'Passport access sent.' : ''
      }
    );
    if (result === null) return;
    if (action === 'send') {
      renderAll();
      if (drawer.open && drawer.entity === 'affiliates') renderAux();
      return;
    }
    renderAgreementWorkspaceResult(action, result, affiliate);
  }

  async function copyInvitation() {
    var input = $('invite-url');
    if (!input) return;
    try {
      if (global.navigator.clipboard && global.isSecureContext) {
        await global.navigator.clipboard.writeText(input.value);
      } else {
        input.focus();
        input.select();
        if (!document.execCommand('copy')) throw new Error('copy unavailable');
      }
      toast('Invitation link copied.');
    } catch (error) {
      input.focus();
      input.select();
      toast('Copy was blocked. The link is selected so you can copy it manually.');
    }
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
      '<button type="button" class="crm-btn is-primary" id="crm-save" data-mutation>Save</button>' +
      '<button type="button" class="crm-btn is-quiet" id="crm-cancel">Cancel</button>';
    if (rec) foot += '<span class="crm-spacer"></span><button type="button" class="crm-btn is-danger" id="crm-delete" data-mutation>Delete</button>';
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
      if (f.type === 'gates' || f.readOnly || (drawer.id && f.authoritative)) return;
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

  /* Saves the open record after server confirmation. */
  async function saveDrawer(silent) {
    if (!drawer.open) return null;
    var res = collectDrawer();
    showErrors(res.errors);
    if (res.errors.length) {
      if (!silent) toast('Not saved. ' + res.errors[0].msg);
      return null;
    }
    var id = drawer.id;
    var current = id ? CRM.get(drawer.entity, id) : null;
    var verb = id ? 'update' : 'create';
    var payload = id ? { id: id, patch: res.rec } : { record: res.rec };
    var result = await mutate(drawer.entity + ':' + verb, payload, {
      expectedRevision: current && current.revision,
      success: silent ? '' : CRM.SCHEMA[drawer.entity].label + (id ? ' saved.' : ' created.')
    });
    if (result === null) return null;
    if (!id) {
      var created = result.record || result.created || result;
      id = created.id || result.id || null;
      drawer.id = id;
    }
    return id;
  }

  /* ============================================================== RENDER  */

  function renderCounts() {
    var t = CRM.totals();
    $('count-dashboard').textContent = t.overdueCount + t.defectCount;
    $('count-affiliates').textContent = t.affiliateCount;
    $('count-pipeline').textContent = CRM.all('affiliates').filter(function (affiliate) {
      return affiliate.authoritative !== true && !affiliate.enrollmentId;
    }).length;
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
    renderSystemState();

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
    $('tool-refresh').addEventListener('click', function () { refreshProjection(); });
    $('crm-retry').addEventListener('click', function () { refreshProjection(); });
    $('tool-program').addEventListener('click', function () { openProgramDrawer(this); });
    $('tool-history').addEventListener('click', function () { openHistoryDrawer(this); });
    $('dash-history-open').addEventListener('click', function () { openHistoryDrawer(this); });
    $('tool-invite').addEventListener('click', function () { openInviteDrawer(this); });
    $('tool-logout').addEventListener('click', function () { logout(); });

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

    document.addEventListener('change', function (e) {
      if (e.target && (e.target.id === 'invite-test' || e.target.id === 'invite-test-send')) {
        syncInviteTestMode();
      }
      if (e.target && e.target.id === 'econ-model') syncEconomicsConditions();
    });

    document.addEventListener('input', function (e) {
      if (!e.target || !closest(e.target, '#program-setup-form')) return;
      programDirty = true;
      var activate = $('program-activate');
      if (activate) {
        activate.disabled = true;
        activate.title = 'Save this configuration before activating it.';
      }
    });

    /* delegated clicks across the app */
    document.addEventListener('click', async function (e) {
      var el = e.target;

      var sortTh = closest(el, '.crm-th.is-sortable');
      if (sortTh) {
        var bag = sortBagFor(closest(sortTh, 'table'));
        if (bag) { toggleSort(bag, sortTh.getAttribute('data-sort')); return; }
      }

      var moveBtn = closest(el, '[data-move]');
      if (moveBtn) {
        e.stopPropagation();
        await moveStage(moveBtn.getAttribute('data-id'), parseInt(moveBtn.getAttribute('data-move'), 10));
        return;
      }

      var agreementBtn = closest(el, '[data-agreement-action]');
      if (agreementBtn) {
        e.stopPropagation();
        await runAgreementAction(agreementBtn);
        return;
      }

      var lifecycleBtn = closest(el, '[data-lifecycle-stage]');
      if (lifecycleBtn) {
        e.stopPropagation();
        await setLifecycleStage(
          lifecycleBtn.getAttribute('data-id'),
          lifecycleBtn.getAttribute('data-lifecycle-stage')
        );
        return;
      }

      var touchBtn = closest(el, '[data-touch]');
      if (touchBtn) {
        e.stopPropagation();
        await logTouch(touchBtn.getAttribute('data-touch'));
        return;
      }

      var openBtn = closest(el, '[data-open]');
      if (openBtn) {
        e.stopPropagation();
        openDrawer(openBtn.getAttribute('data-entity'), openBtn.getAttribute('data-id'), openBtn);
        return;
      }

      var childBtn = closest(el, '[data-new-child]');
      if (childBtn) {
        e.stopPropagation();
        var parentId = drawer.id;
        if (!parentId) { toast('Save the affiliate before adding a related record.'); return; }
        var childEntity = childBtn.getAttribute('data-new-child');
        var back = { entity: 'affiliates', id: parentId };
        openDrawer(childEntity, null, childBtn, back);
        var affField = qs('[data-field="affiliateId"]', $('crm-drawer-body'));
        if (affField) affField.value = parentId;
        var dateField = qs('[data-field="date"]', $('crm-drawer-body'));
        if (dateField && !dateField.value) dateField.value = CRM.today();
        return;
      }

      if (closest(el, '#program-create')) {
        var createdProgram = await mutate('program:create', {}, {
          expectedRevision: CRM.revision,
          success: 'Program setup record created.'
        });
        if (createdProgram !== null) openProgramDrawer(drawer.trigger || $('tool-program'));
        return;
      }

      if (closest(el, '#program-save')) {
        var programPayload = collectProgramSetup();
        if (!programPayload) return;
        var savedProgram = await mutate('program:update', programPayload, {
          expectedRevision: programPayload.expectedRevision,
          success: 'Program configuration saved in setup state.'
        });
        if (savedProgram !== null) openProgramDrawer(drawer.trigger || $('tool-program'));
        return;
      }

      if (closest(el, '#program-activate')) {
        if (programDirty) {
          toast('Save the edited configuration before activating it.');
          return;
        }
        var currentProgram = CRM.state.program || {};
        var programId = currentProgram.id || currentProgram.programId;
        var expectedRevision = currentProgram.revision || CRM.revision;
        if (!global.confirm('Activate the saved program configuration? The server will re-check every requirement.')) return;
        var activatedProgram = await mutate('program:activate', {
          programId: programId,
          expectedRevision: expectedRevision
        }, {
          expectedRevision: expectedRevision,
          success: 'Program activation confirmed.'
        });
        if (activatedProgram !== null) openProgramDrawer(drawer.trigger || $('tool-program'));
        return;
      }

      if (closest(el, '[data-drawer-close]')) { closeDrawer(); return; }

      if (closest(el, '#crm-save')) {
        if (await saveDrawer() !== null) {
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
        drawer.back = null;
        openDrawer(bb.entity, bb.id, drawer.trigger);
        return;
      }
      if (closest(el, '#crm-delete')) {
        var label = CRM.SCHEMA[drawer.entity].label;
        var extra = drawer.entity === 'affiliates'
          ? ' The server may block deletion while related sales, payouts or enrollments exist.'
          : '';
        if (!global.confirm('Delete this ' + label.toLowerCase() + '?' + extra)) return;
        var doomed = CRM.get(drawer.entity, drawer.id);
        var deleted = await mutate(drawer.entity + ':delete', { id: drawer.id }, {
          expectedRevision: doomed && doomed.revision,
          success: label + ' deleted.'
        });
        if (deleted === null) return;
        closeDrawer();
        renderAll();
        return;
      }

      if (closest(el, '#invite-create')) {
        var email = $('invite-email').value.trim();
        var name = $('invite-name').value.trim();
        var testAccount = !!($('invite-test') && $('invite-test').checked);
        var sendTestEmail = !!($('invite-test-send') && $('invite-test-send').checked);
        var emailRequired = !testAccount || sendTestEmail;
        var errorHost = $('invite-error');
        if (emailRequired && (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))) {
          errorHost.innerHTML = '<span class="crm-pill is-bad">Enter a valid email address.</span>';
          $('invite-email').focus();
          return;
        }
        if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
          errorHost.innerHTML = '<span class="crm-pill is-bad">Remove the optional email or enter a valid address.</span>';
          $('invite-email').focus();
          return;
        }
        errorHost.textContent = '';
        if (testAccount && !email) email = 'sandbox-' + Date.now() + '@example.invalid';
        var payload = {
          email: email,
          name: name || null
        };
        var expectedRevision = CRM.revision;
        if (testAccount) payload.sendEmail = sendTestEmail;
        if (!testAccount) {
          if (!economicsSchema()) {
            errorHost.innerHTML = '<span class="crm-pill is-bad">Live economics schema is unavailable. Refresh or use sandbox.</span>';
            return;
          }
          expectedRevision = Number(CRM.state.program && CRM.state.program.revision);
          if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
            errorHost.innerHTML = '<span class="crm-pill is-bad">The program revision is missing. Refresh before preparing this enrollment.</span>';
            return;
          }
          var economics = collectEconomicsSnapshot();
          if (economics.errors.length) return;
          payload.economicsSnapshot = economics.snapshot;
        }
        var result = await mutate(testAccount ? 'test-account:create' : 'enrollment:prepare', payload, {
          expectedRevision: expectedRevision,
          success: testAccount ? '' : 'Enrollment prepared. No invitation has been sent.'
        });
        if (result !== null) {
          if (testAccount) renderInvitationResult(result, true);
          else renderPreparedEnrollment(result);
        }
        return;
      }

      if (closest(el, '#invite-copy')) {
        await copyInvitation();
        return;
      }

      var row = closest(el, '.crm-row, .crm-card');
      if (row && row.getAttribute('data-entity')) {
        var rowInDrawer = $('crm-drawer').contains(row);
        if (rowInDrawer) {
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
    document.addEventListener('keydown', async function (e) {
      if (!drawer.open) return;
      if (e.key === 'Escape' || e.key === 'Esc') {
        e.preventDefault();
        closeDrawer();
        return;
      }
      if (drawer.entity && e.key === 'Enter' && e.target && e.target.tagName === 'INPUT' && e.target.type !== 'checkbox') {
        e.preventDefault();
        if (await saveDrawer() !== null) { closeDrawer(); renderAll(); }
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
    global.addEventListener('crm:status', function () { renderSystemState(); });
  }

  function closest(el, sel) {
    while (el && el.nodeType === 1) {
      if (el.matches ? el.matches(sel) : el.msMatchesSelector(sel)) return el;
      el = el.parentElement;
    }
    return null;
  }

  /* ------------------------------------------------------------- actions */

  async function moveStage(id, delta) {
    var a = CRM.get('affiliates', id);
    if (!a) return;
    if (a.authoritative === true || a.enrollmentId) {
      toast('Enrollment lifecycle changes use explicit activation controls.');
      return;
    }
    var idx = -1;
    CRM.PROSPECT_STAGES.forEach(function (s, i) { if (s.id === a.stage) idx = i; });
    if (idx < 0) idx = 0;
    var next = idx + delta;
    if (next < 0 || next >= CRM.PROSPECT_STAGES.length) return;
    await mutate('affiliate:stage', {
      affiliateId: id,
      stage: CRM.PROSPECT_STAGES[next].id
    }, {
      expectedRevision: a.revision,
      success: a.name + ' moved to ' + CRM.PROSPECT_STAGES[next].label + '.'
    });
  }

  async function setLifecycleStage(id, stage) {
    var affiliate = CRM.get('affiliates', id);
    if (!affiliate || !(affiliate.authoritative === true || affiliate.enrollmentId)) return;
    var labels = { active: 'active', paused: 'paused', churned: 'offboarded' };
    if (!labels[stage]) return;
    if (stage === 'churned' &&
        !global.confirm('Offboard ' + affiliate.name + '? Their Passport access will be revoked.')) {
      return;
    }
    var result = await mutate('affiliate:stage', {
      affiliateId: id,
      stage: stage
    }, {
      expectedRevision: affiliate.revision,
      success: affiliate.name + ' is now ' + labels[stage] + '.'
    });
    if (result !== null && drawer.open && drawer.entity === 'affiliates' && drawer.id === id) {
      openDrawer('affiliates', id, drawer.trigger);
    }
  }

  async function logTouch(id) {
    var o = CRM.get('outbound', id);
    if (!o) return;
    if (o.dnc) { toast('This target asked not to be contacted. No touch logged.'); return; }
    await mutate('outbound:touch', {
      outboundId: id,
      occurredAt: new Date().toISOString()
    }, {
      expectedRevision: o.revision,
      success: o.name + ': touch confirmed.'
    });
  }

  async function logout() {
    if (busy) return;
    setBusy(true);
    try {
      var response = await global.fetch('/api/control-tower/logout', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { Accept: 'application/json' }
      });
      if (!response.ok) {
        var body = {};
        try { body = await response.json(); } catch (error) {}
        throw new Error(body.message || body.error || 'Logout was not completed.');
      }
      var sessionUser = CRM.state.session && CRM.state.session.user || {};
      var authType = sessionUser.authType ||
        (CRM.state.session && CRM.state.session.authType);
      global.location.assign(authType === 'cloudflare_access'
        ? '/cdn-cgi/access/logout'
        : '/control-tower/access');
    } catch (error) {
      toast(mutationMessage(error));
      setBusy(false);
    }
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

  async function init() {
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
    await refreshProjection({ quiet: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})(window);
