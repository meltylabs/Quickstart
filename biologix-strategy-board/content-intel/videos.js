/* Video census (view 10) — renders window.PEPTIDE_VIDEOS.
   Rules this file enforces, same as intel.js:
   - A null metric renders as an explicit "not exposed" / a stated reason. Never
     0, never a bare dash.
   - Every control is wired, and no control is rendered without data behind it.
   - Captions, transcripts and OCR are third-party text: escaped everywhere, and
     anything that reaches an href goes through safeUrl first.
   - OCR garbage is marked as garbage, never presented as content. */
(function () {
  'use strict';

  var D = window.PEPTIDE_VIDEOS;
  var $ = function (id) { return document.getElementById(id); };

  if (!D || !Array.isArray(D.videos)) {
    document.querySelector('.page-shell').insertAdjacentHTML(
      'afterbegin',
      '<p class="empty-state">Dataset failed to load. <code>videos-data.js</code> did not set <code>window.PEPTIDE_VIDEOS</code>. Regenerate it with <code>node .context/peptide-content-intel/build_video_site.mjs</code>.</p>'
    );
    return;
  }

  var V = D.videos;
  var C = D.census;

  /* ------------------------------------------------------------ utils --- */
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };

  var num = function (n) { return n == null ? null : n.toLocaleString('en-US'); };

  var nullCell = function (reason) {
    return '<span class="null-cell" title="' + esc(reason) + '">not exposed</span>';
  };

  var missing = function (label, reason) {
    return '<span class="null-cell" title="' + esc(reason) + '">' + esc(label) + '</span>';
  };

  var fixed = function (n, dp) { return n == null ? null : n.toFixed(dp == null ? 2 : dp); };

  // Third-party text can carry "javascript:" and friends, which survive HTML
  // escaping inside an href. Only http/https ever reaches the DOM.
  var safeUrl = function (u) {
    if (!u) return null;
    try {
      var p = new URL(String(u), 'https://example.invalid');
      return (p.protocol === 'http:' || p.protocol === 'https:') ? p.href : null;
    } catch (e) { return null; }
  };

  var link = function (url, text, cls) {
    var u = safeUrl(url);
    var label = esc(text == null ? url : text);
    if (!u) return '<span class="null-cell">' + label + '</span>';
    return '<a' + (cls ? ' class="' + cls + '"' : '') + ' href="' + esc(u) +
      '" target="_blank" rel="noopener noreferrer">' + label + '</a>';
  };

  var laneLabel = function (l) {
    return l === 'research_peptide' ? 'research peptide' : l === 'telehealth' ? 'telehealth' : l === 'unclear' ? 'unclear' : 'unknown';
  };

  var profLabel = function (p) { return String(p || '').replace(/_/g, ' '); };

  var cleanOnscreen = function (v) {
    return v.os.filter(function (s) { return !s.noise; }).map(function (s) { return s.t; }).join(' ');
  };

  var haystack = function (v) {
    if (v._hay == null) {
      v._hay = (v.h + ' ' + v.cap + ' ' + v.tags.join(' ') + ' ' + v.tr + ' ' + cleanOnscreen(v)).toLowerCase();
    }
    return v._hay;
  };

  var primary = function (v) {
    var os = cleanOnscreen(v);
    var cands = [
      { src: 'onscreen', t: os },
      { src: 'speech', t: v.tr },
      { src: 'caption', t: v.cap }
    ].filter(function (c) { return c.t && c.t.trim(); });
    if (!cands.length) return null;
    cands.sort(function (a, b) { return b.t.length - a.t.length; });
    return cands[0];
  };

  /* ---------------------------------------------------------- coverage --- */
  function renderCoverage() {
    var t = D.totals;
    var items = [
      { k: 'Videos', v: num(t.videos), u: t.creators + ' creators' },
      { k: 'In census window', v: num(t.census_window), u: '≤' + C.window_days + 'd' },
      { k: 'Age-matched set', v: num(t.ranked), u: t.ranked_creators + ' creators' },
      { k: 'Named retatrutide', v: num(t.reta.any), u: 'caption alone ' + t.reta.caption, gap: true },
      { k: 'On-screen layer', v: num(t.layers.onscreen), u: 'speech ' + t.layers.speech },
      { k: 'Compliance-blocked', v: num(t.compliance_blocked), u: 'cannot be briefed', gap: true }
    ];
    $('coverage-strip').innerHTML = items.map(function (i) {
      return '<div><dt>' + esc(i.k) + '</dt><dd' + (i.gap ? ' class="is-gap"' : '') + '>' +
        esc(i.v) + (i.u ? '<span class="unit">' + esc(i.u) + '</span>' : '') + '</dd></div>';
    }).join('');

    $('method-correction').innerHTML =
      'Read the two metrics differently. <b>Out30</b> = plays ÷ that creator’s median plays inside the ' +
      C.window_days + '-day census window, defined only where the creator has ≥' + C.min_baseline_n +
      ' posts in the window (' + num(D.totals.ranked) + ' of ' + num(D.totals.videos) +
      ' videos, once posts under ' + C.mature_days + ' days old are held back as unmatured). <b>Raw</b> is the ' +
      'outlier column shipped in outliers.json, which is plays ÷ the creator’s all-time median and rises with post ' +
      'age because the scrape mixed last week’s posts with a survivorship-selected historical tail. Rank on out30. ' +
      'The raw column is shown only so nobody goes back to the file for it.';

    var trims = (D.build_log || []).filter(function (l) { return /trimmed|WARN|dropped/.test(l); });
    $('method-body').innerHTML =
      '<h4>Method carried from the scoring pass</h4><ul>' +
      (D.method_notes || []).map(function (m) { return '<li>' + esc(m) + '</li>'; }).join('') +
      '</ul><h4>Built for this page</h4><ul>' +
      '<li>Post age comes from the TikTok id timestamp (top 32 bits). Neither source file carries a date field.</li>' +
      '<li>out30 window ' + C.window_days + ' days, minimum ' + C.min_baseline_n +
      ' posts per creator in the window, posts under ' + C.mature_days + ' days old excluded from the ranked set.</li>' +
      '<li>Evidence bar: a group is a pattern only at ≥' + C.bar_videos + ' videos across ≥' + C.bar_creators +
      ' creators. Anything thinner is marked and stays a lead.</li>' +
      '<li>Transcripts trimmed at ' + num(C.transcript_max) + ' chars and on-screen text at ' + num(C.onscreen_max) +
      ' chars for page weight. The full length is kept and shown per video.</li>' +
      '<li>OCR segments that are non-Latin glyphs, vowel-less, mostly symbols or a repeat of an earlier frame are ' +
      'marked as noise in the detail view and excluded from search and from the text column.</li>' +
      '</ul><h4>Build log</h4><ul>' +
      trims.map(function (l) { return '<li class="gap-item">' + esc(l) + '</li>'; }).join('') +
      '</ul><h4>What this page cannot tell you</h4><ul>' +
      '<li class="gap-item">The videos were never watched. replication_difficulty is an additive rubric inferred from duration, transcript length and on-screen density.</li>' +
      '<li class="gap-item">' + num(D.totals.null_duration) + ' videos have no duration exposed, and ' +
      num(D.totals.data_gap) + ' are flagged as suspected data gaps.</li>' +
      '<li class="gap-item">Sampling is capped at 10 videos per creator, so nothing here is a full feed.</li>' +
      '</ul>';

    $('scan-legend').innerHTML =
      'Layers column: <b>C</b> caption, <b>S</b> speech, <b>O</b> on-screen; filled = that layer carries text. ' +
      'Rows with a red left edge are compliance-blocked: they perform partly because of dosing, sourcing, personal ' +
      'outcome, stacking or efficacy-magnitude content, which a Biologix affiliate cannot produce. Click any row for all three layers.';

    $('footer-note').textContent =
      'videos-data.js generated ' + D.generated_at + ' from ' + D.source.merged + ', ' + D.source.outliers +
      ', ' + D.source.cohort + ' and ' + D.source.lanes + '. ' + num(D.totals.videos) + ' videos, ' +
      D.totals.creators + ' creators. Scores from outliers.json generated ' + D.source.outliers_generated_at + '.';
  }

  /* ----------------------------------------------------------- filters --- */
  var GROUPS = [
    {
      id: 'diff', el: 'filter-diff',
      opts: [
        { id: '1', label: 'd1 easiest' }, { id: '2', label: 'd2' }, { id: '3', label: 'd3' },
        { id: '4', label: 'd4' }, { id: '5', label: 'd5 hardest' }
      ],
      test: function (v, id) { return String(v.diff) === id; }
    },
    {
      id: 'age', el: 'filter-age',
      opts: [
        { id: '0-7', label: '≤7d' }, { id: '7-30', label: '7–30d' },
        { id: '30-90', label: '30–90d' }, { id: '90+', label: '90d+' }
      ],
      // age_exact, not the rounded display value, so a filtered count always
      // reproduces when someone recomputes it from the raw files
      test: function (v, id) {
        var a = v.age_exact;
        if (a == null) return false;
        if (id === '0-7') return a < 7;
        if (id === '7-30') return a >= 7 && a < 30;
        if (id === '30-90') return a >= 30 && a < 90;
        return a >= 90;
      }
    },
    {
      id: 'lane', el: 'filter-lane',
      opts: [
        { id: 'research_peptide', label: 'research peptide' },
        { id: 'telehealth', label: 'telehealth' },
        { id: 'unclear', label: 'unclear' }
      ],
      test: function (v, id) { return v.lane === id; }
    },
    {
      id: 'layer', el: 'filter-layer',
      opts: [
        { id: 'caption', label: 'has caption' }, { id: 'speech', label: 'has speech' },
        { id: 'onscreen', label: 'has on-screen' }, { id: 'none', label: 'no text layer' }
      ],
      test: function (v, id) {
        if (id === 'caption') return v.lay.c;
        if (id === 'speech') return v.lay.s;
        if (id === 'onscreen') return v.lay.o;
        return !v.lay.c && !v.lay.s && !v.lay.o;
      }
    },
    {
      id: 'signal', el: 'filter-signal',
      opts: [
        { id: 'reta', label: 'retatrutide' }, { id: 'pep', label: 'peptide' },
        { id: 'dose', label: 'dosing' }, { id: 'out', label: 'outcome claim' }
      ],
      test: function (v, id) { return !!v.sig[id]; }
    },
    {
      id: 'comp', el: 'filter-comp',
      opts: [{ id: 'blocked', label: 'blocked' }, { id: 'clear', label: 'clear' }],
      test: function (v, id) { return id === 'blocked' ? v.comp : !v.comp; }
    }
  ];

  var SORTS = [
    { id: 'out30', label: 'Out30', get: function (v) { return v.out30; }, dp: 2 },
    { id: 'plays', label: 'Plays', get: function (v) { return v.plays; } },
    { id: 'diff', label: 'Difficulty', get: function (v) { return v.diff; } },
    { id: 'age', label: 'Age', get: function (v) { return v.age; } },
    { id: 'er', label: 'Engagement', get: function (v) { return v.er; } },
    { id: 'out', label: 'Raw outlier', get: function (v) { return v.out; } }
  ];

  var state = { sort: 'out30', desc: true, q: '', ranked: false, sel: {} };
  GROUPS.forEach(function (g) { state.sel[g.id] = {}; });

  var selectedIds = function (g) {
    return Object.keys(state.sel[g.id]).filter(function (k) { return state.sel[g.id][k]; });
  };

  var passGroup = function (v, g) {
    var ids = selectedIds(g);
    if (!ids.length) return true;
    for (var i = 0; i < ids.length; i++) if (g.test(v, ids[i])) return true;
    return false;
  };

  var passQuery = function (v) {
    if (!state.q) return true;
    return haystack(v).indexOf(state.q) !== -1;
  };

  var passRanked = function (v) { return !state.ranked || (v.out30 != null && v.mature); };

  // rows passing everything except one group (used for honest facet counts)
  var passAllExcept = function (v, skipId) {
    if (!passQuery(v) || !passRanked(v)) return false;
    for (var i = 0; i < GROUPS.length; i++) {
      if (GROUPS[i].id === skipId) continue;
      if (!passGroup(v, GROUPS[i])) return false;
    }
    return true;
  };

  var currentRows = function () {
    return V.filter(function (v) { return passAllExcept(v, null); });
  };

  /* ----------------------------------------------------------- render ---- */
  // Chips are built once and then updated in place. Re-rendering the markup on
  // every toggle would move focus to <body> and make the filters unusable from
  // the keyboard.
  function buildControls() {
    $('sort-set').innerHTML = SORTS.map(function (s) {
      return '<button type="button" class="chip" data-sort="' + esc(s.id) + '" aria-pressed="' +
        (state.sort === s.id) + '">' + esc(s.label) + '</button>';
    }).join('');

    GROUPS.forEach(function (g) {
      $(g.el).innerHTML = g.opts.map(function (o) {
        return '<button type="button" class="chip" data-group="' + esc(g.id) + '" data-opt="' + esc(o.id) +
          '" aria-pressed="false">' + esc(o.label) + '<span class="n"></span></button>';
      }).join('');
    });
  }

  function renderControls() {
    Array.prototype.forEach.call($('sort-set').children, function (b) {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-sort') === state.sort));
    });

    GROUPS.forEach(function (g) {
      var pool = V.filter(function (v) { return passAllExcept(v, g.id); });
      Array.prototype.forEach.call($(g.el).children, function (b) {
        var id = b.getAttribute('data-opt');
        var n = pool.filter(function (v) { return g.test(v, id); }).length;
        var on = !!state.sel[g.id][id];
        b.setAttribute('aria-pressed', String(on));
        b.disabled = (n === 0 && !on);
        b.querySelector('.n').textContent = n;
      });
    });

    $('sort-dir-label').textContent = state.desc ? 'High → low' : 'Low → high';
    $('sort-dir').setAttribute('aria-pressed', String(!state.desc));
    $('ranked-only-label').textContent = 'Age-matched only (' + D.totals.ranked + ')';

    Array.prototype.forEach.call(document.querySelectorAll('.th-sort'), function (b) {
      var on = b.getAttribute('data-sort') === state.sort;
      b.setAttribute('aria-pressed', String(on));
      b.closest('th').setAttribute('aria-sort', on ? (state.desc ? 'descending' : 'ascending') : 'none');
    });
  }

  function layerBadges(v) {
    return [['C', v.lay.c], ['S', v.lay.s], ['O', v.lay.o]].map(function (p) {
      return '<span class="lay-badge ' + (p[1] ? 'lay-on' : 'lay-off') + '" title="' +
        (p[1] ? 'carries text' : 'empty') + '">' + p[0] + '</span>';
    }).join('');
  }

  function sigChips(v) {
    var out = [];
    if (v.sig.reta) out.push('<span class="sig-chip sig-reta">reta</span>');
    if (v.sig.pep) out.push('<span class="sig-chip">pep</span>');
    if (v.sig.dose) out.push('<span class="sig-chip sig-blocked">dose</span>');
    if (v.sig.out) out.push('<span class="sig-chip sig-blocked">outcome</span>');
    if (v.comp) out.push('<span class="sig-chip sig-blocked">blocked</span>');
    return out.length ? out.join('') : '<span class="null-cell">none</span>';
  }

  function sortRows(rows) {
    var s = SORTS.filter(function (x) { return x.id === state.sort; })[0];
    var dir = state.desc ? -1 : 1;
    return rows.slice().sort(function (a, b) {
      var av = s.get(a), bv = s.get(b);
      if (av == null && bv == null) return b.plays - a.plays;
      if (av == null) return 1;   // nulls always last, both directions
      if (bv == null) return -1;
      if (av === bv) return b.plays - a.plays;
      return (av - bv) * dir;
    });
  }

  var lastRows = [];

  function renderTable() {
    var rows = sortRows(currentRows());
    lastRows = rows;

    $('census-body').innerHTML = rows.map(function (v, i) {
      var p = primary(v);
      var out30 = v.out30 == null
        ? (v.cw
          ? missing('thin baseline', 'creator has ' + v.base30_n + ' posts in the ' + C.window_days + '-day window, needs ' + C.min_baseline_n)
          : missing('outside window', 'posted ' + Math.round(v.age) + ' days ago, outside the ' + C.window_days + '-day census window'))
        : '<span class="out-strong">' + esc(fixed(v.out30, 2)) + '×</span>' +
          (v.mature ? '' : '<span class="cell-sub">unmatured</span>');

      return '<tr' + (v.comp ? ' class="row-blocked"' : '') + ' data-id="' + esc(v.id) + '">' +
        '<td class="num col-rank">' + (i + 1) + '</td>' +
        '<td><button type="button" class="cell-handle">@' + esc(v.h) + '</button>' +
          '<span class="cell-sub">' + num(v.f) + ' followers<span class="cell-lane"> · ' +
          esc(laneLabel(v.lane)) + '</span></span></td>' +
        '<td class="num col-age">' + esc(fixed(v.age, 1)) + 'd</td>' +
        '<td class="num">' + num(v.plays) + '</td>' +
        '<td class="num">' + out30 + '</td>' +
        '<td class="num col-raw"><span class="out-raw">' + esc(fixed(v.out, 2)) + '×</span></td>' +
        '<td class="num col-er">' + esc(fixed(v.er, 1)) + '</td>' +
        '<td class="num"><span class="diff-badge diff-' + v.diff + '">d' + v.diff + '</span></td>' +
        '<td class="col-layers">' + layerBadges(v) + '</td>' +
        '<td class="col-sig">' + sigChips(v) + '</td>' +
        '<td><span class="census-text">' + (p
          ? '<span class="src">' + esc(p.src) + '</span>' + esc(p.t)
          : '<span class="null-cell">no text in any layer</span>') + '</span></td>' +
        '</tr>';
    }).join('');

    $('empty-state').hidden = rows.length !== 0;

    var creators = {};
    rows.forEach(function (v) { creators[v.h] = 1; });
    var sortLabel = SORTS.filter(function (s) { return s.id === state.sort; })[0].label;
    $('result-count').textContent = rows.length + ' of ' + V.length + ' videos · ' +
      Object.keys(creators).length + ' creators · sorted by ' + sortLabel.toLowerCase() +
      (state.desc ? ' high to low' : ' low to high');
  }

  /* ------------------------------------------------------------ drawer --- */
  var drawer = $('drawer'), scrim = $('scrim'), lastFocus = null;

  function layerBlock(kind, cls, body, meta) {
    return '<div class="layer-block ' + cls + '">' +
      '<div class="layer-head"><span class="who">' + esc(kind) + '</span>' + meta + '</div>' +
      body + '</div>';
  }

  function openDrawer(id) {
    var v = V.filter(function (x) { return x.id === id; })[0];
    if (!v) return;
    lastFocus = document.activeElement;

    var m = [
      { k: 'Plays', v: num(v.plays) },
      { k: 'Likes', v: num(v.likes) },
      { k: 'Comments', v: num(v.comments) },
      { k: 'Shares', v: num(v.shares) },
      { k: 'Engagement', v: fixed(v.er, 2) + '%' },
      { k: 'Duration', v: v.dur == null ? null : v.dur + 's', why: 'the collector returned no duration for this video' },
      { k: 'Followers', v: num(v.f) },
      { k: 'Age', v: fixed(v.age, 1) + 'd' }
    ].map(function (x) {
      return '<div><dt>' + esc(x.k) + '</dt><dd' + (x.v == null ? ' class="null-cell"' : '') + '>' +
        (x.v == null ? nullCell(x.why || 'not exposed by the platform') : esc(x.v)) + '</dd></div>';
    }).join('');

    var out30Line = v.out30 == null
      ? '<p>' + (v.cw
        ? 'No age-matched baseline. This creator has ' + v.base30_n + ' post(s) inside the ' + C.window_days +
          '-day window and needs at least ' + C.min_baseline_n + '.'
        : 'Outside the ' + C.window_days + '-day census window (posted ' + esc(fixed(v.age, 1)) +
          ' days ago), so no age-matched score is computed for it.') + '</p>'
      : '<p><b>' + esc(fixed(v.out30, 2)) + '×</b> against this creator’s ' + C.window_days +
        '-day median of ' + num(v.base30) + ' plays across ' + v.base30_n + ' posts in the window.' +
        (v.mature ? '' : ' Held out of the ranked set: under ' + C.mature_days + ' days old, so plays have not matured.') + '</p>';

    var rawLine = '<p><b>' + esc(fixed(v.out, 2)) + '×</b> against this creator’s all-time collected median of ' +
      num(v.base_all) + ' plays across ' + v.base_all_n + ' posts. This is the shipped column and it rises with ' +
      'post age; at ' + esc(fixed(v.age, 1)) + ' days old, treat it as unreliable for ranking.</p>';

    var reasons = v.diff_reasons.length
      ? '<ul class="reason-list">' + v.diff_reasons.map(function (r) {
        return '<li>' + esc(r.why) + ' <span class="w">' + esc(r.f) + ' ' + (r.w > 0 ? '+' : '') + r.w + '</span></li>';
      }).join('') + '</ul>'
      : '<p class="null-cell">No factor moved this video off the base score of 2.</p>';

    var comp = v.comp
      ? '<p>' + v.flags.map(function (f) { return '<span class="risk-chip">' + esc(f.replace(/_/g, ' ')) + '</span>'; }).join('') +
        '</p><p>Fired on the video’s own mechanism. Whatever works here works partly because of this, so it cannot be briefed to a Biologix affiliate.</p>'
      : '<p>No flag fired on speech or on-screen text.</p>';
    if (v.flags_cap.length) {
      comp += '<p class="basis-note">Caption-only mentions, listed separately because the caption is not the mechanism: ' +
        esc(v.flags_cap.join(', ').replace(/_/g, ' ')) + '</p>';
    }

    var capBody = v.cap.trim()
      // the tags array is what the collector parsed out, which is not always
      // every hashtag in the caption text above, so it is labelled as such
      ? esc(v.cap) + (v.tags.length ? '<div class="tag-row"><span class="src">tags parsed by the collector</span>' +
        v.tags.map(function (t) {
          return '<span class="hashtag">#' + esc(t) + '</span>';
        }).join('') + '</div>' : '')
      : '<span class="null-cell">No caption text.</span>';

    var speechBody = v.tr.trim()
      ? esc(v.tr) + (v.tr_trimmed ? '<div class="basis-note">Trimmed to ' + num(C.transcript_max) +
        ' of ' + num(v.tr_chars) + ' characters for page weight.</div>' : '')
      : '<span class="null-cell">No speech captured. ' + (v.lay.s ? 'Layer marked present upstream but empty here.' : 'This video has no spoken words in the collected transcript.') + '</span>';

    var noiseN = v.os.filter(function (s) { return s.noise; }).length;
    var onscreenBody = v.os.length
      ? v.os.map(function (s) {
        return s.noise
          ? '<span class="ocr-seg ocr-noise">' + esc(s.t) + '<span class="why">OCR noise · ' + esc(s.noise) + '</span></span>'
          : '<span class="ocr-seg">' + esc(s.t) + '</span>';
      }).join('') + (v.os_trimmed ? '<div class="basis-note">Trimmed to ' + num(C.onscreen_max) +
        ' of ' + num(v.os_chars) + ' characters for page weight.</div>' : '')
      : '<span class="null-cell">No burned-in text read from this video.</span>';

    var retaMark = function (on) { return on ? '<span class="sig-chip sig-reta">names retatrutide</span>' : ''; };

    $('drawer-kicker').textContent = '@' + v.h + ' · ' + laneLabel(v.lane) + ' · id ' + v.id;
    $('drawer-body').innerHTML =
      '<h2 id="drawer-title" class="sr-only">Video detail</h2>' +
      '<h3>' + (primary(v) ? esc(primary(v).t.slice(0, 180)) : '<span class="null-cell">No text in any layer</span>') + '</h3>' +
      '<p class="post-meta"><span class="tag">d' + v.diff + ' difficulty</span> <span class="tag">' +
        esc(profLabel(v.prof)) + '</span> <span class="tag">' + esc(laneLabel(v.lane)) + '</span>' +
        (v.gap ? ' <span class="tag badge-hand">suspected data gap</span>' : '') + '</p>' +
      '<dl class="drawer-metrics">' + m + '</dl>' +

      '<div class="spec-block"><p class="spec-label">Age-matched outlier (out30)</p>' + out30Line + '</div>' +
      '<div class="spec-block"><p class="spec-label">Raw outlier, as shipped <span class="thin-flag">age-confounded</span></p>' + rawLine + '</div>' +

      '<div class="spec-block"><p class="spec-label">Layer 1 — caption</p>' +
        layerBlock('Caption', 'layer-caption', capBody,
          '<span>' + num(v.cap_chars) + ' chars</span>' + retaMark(v.reta.c)) + '</div>' +
      '<div class="spec-block"><p class="spec-label">Layer 2 — spoken words</p>' +
        layerBlock('Speech / transcript', 'layer-speech', speechBody,
          '<span>' + num(v.tr_chars) + ' chars</span>' + retaMark(v.reta.s)) + '</div>' +
      '<div class="spec-block"><p class="spec-label">Layer 3 — burned-in on-screen text</p>' +
        layerBlock('On-screen OCR', 'layer-onscreen', onscreenBody,
          '<span>' + num(v.os_chars) + ' chars · ' + v.os.length + ' segments' +
          (noiseN ? ' · ' + noiseN + ' marked noise' : '') + '</span>' + retaMark(v.reta.o)) + '</div>' +

      '<div class="spec-block"><p class="spec-label">Why this difficulty</p>' + reasons + '</div>' +
      '<div class="spec-block"><p class="spec-label">Compliance</p>' + comp + '</div>' +
      '<div class="drawer-actions">' + link(v.url, 'Open on TikTok', 'ext-link') + '</div>';

    drawer.hidden = false;
    scrim.hidden = false;
    $('drawer-close').focus();
  }

  function closeDrawer() {
    drawer.hidden = true;
    scrim.hidden = true;
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  /* ---------------------------------------------------------- findings --- */
  function renderFindings() {
    $('findings-list').innerHTML = (D.findings || []).map(function (f) {
      var ex = (f.examples || []).map(function (u) {
        var m = /\/@([^/]+)\/video\/(\d+)/.exec(u);
        return link(u, m ? '@' + m[1] + ' · ' + m[2].slice(-6) : u);
      }).join(' · ');
      return '<div class="finding">' +
        '<h3><span class="verdict-chip verdict-COPY">' + esc(f.verdict) + '</span><br>' + esc(f.headline) + '</h3>' +
        '<div><p class="detail">' + esc(f.claim) + '</p>' +
        '<p class="detail" style="margin-top:10px"><b>Evidence.</b> ' + esc(f.evidence) + '</p>' +
        (ex ? '<p class="detail" style="margin-top:10px"><b>Examples.</b> ' + ex + '</p>' : '') +
        '<p class="detail" style="margin-top:10px"><b>Lens.</b> ' + esc(f.lens) + '</p></div>' +
        '<p class="so-what"><b>So what</b>' + esc(f.so_what) + '</p>' +
        '<p class="n">n = ' + f.n_videos + ' videos across ' + f.n_creators + ' creators</p>' +
        '</div>';
    }).join('');

    $('age-body').innerHTML = (D.recomputed.age_table || []).map(function (r) {
      return '<tr><td class="group-key">' + esc(r.key) + '</td><td class="num">' + num(r.n) +
        '</td><td class="num">' + num(r.creators) + '</td><td class="num">' +
        (r.med_out_raw == null ? nullCell('no video in this bucket') : esc(fixed(r.med_out_raw, 2)) + '×') +
        '</td><td class="num">' + (r.med_plays == null ? nullCell('no video in this bucket') : num(r.med_plays)) + '</td></tr>';
    }).join('');

    $('out30-body').innerHTML = (D.recomputed.out30_table || []).map(function (r) {
      return '<tr><td class="group-key">' + esc(r.key) + '</td><td class="num">' + num(r.n) +
        '</td><td class="num">' + num(r.creators) + '</td><td class="num">' +
        (r.med_out30 == null ? nullCell('no age-matched video in this bucket') : esc(fixed(r.med_out30, 2)) + '×') +
        '</td><td class="num">' + (r.med_plays == null ? nullCell('no age-matched video in this bucket') : num(r.med_plays)) + '</td></tr>';
    }).join('');

    var rl = D.recomputed.reta_layers || [];
    $('reta-body').innerHTML = rl.map(function (r) {
      return '<tr><td class="group-key">' + esc(r.key) + '</td><td class="num">' + num(r.n) +
        '</td><td class="num">' + num(r.creators) + '</td></tr>';
    }).join('');

    var f = D.recomputed.reta_fresh;
    $('reta-note').textContent =
      'Captions alone name it in ' + D.totals.reta.caption + ' videos; adding speech and on-screen raises it to ' +
      D.totals.reta.any + ' across ' + D.totals.reta.creators + ' creators. Under 7 days old, research-peptide-lane ' +
      'reta posts run at a median of ' + num(f.research_reta.med_plays) + ' plays (n=' + f.research_reta.n + ', ' +
      f.research_reta.creators + ' creators) against ' + num(f.research_non_reta.med_plays) +
      ' for non-reta posts in the same lane and window (n=' + f.research_non_reta.n + ', ' +
      f.research_non_reta.creators + ' creators). Week-one expectation is roughly a thousand plays, not a hundred thousand.';
  }

  function renderLeads() {
    $('leads-list').innerHTML = (D.leads || []).map(function (l) {
      return '<div class="lead-card">' +
        '<span class="lead-status">' + esc(l.status) + '</span>' +
        '<h3>' + esc(l.headline) + '</h3>' +
        '<p class="quoted">Original claim, as written: “' + esc(l.original_claim) + '”</p>' +
        '<p class="spec-label">Why it did not survive</p>' +
        '<ul>' + (l.why_refuted || []).map(function (w) { return '<li>' + esc(w) + '</li>'; }).join('') + '</ul>' +
        '<p class="basis-note">' + esc(l.fair_to_the_claim) + '</p>' +
        '<p class="so-what"><b>What survives, as a lead only</b>' + esc(l.survives_as) + '</p>' +
        '</div>';
    }).join('');
  }

  /* ----------------------------------------------------------- rollups --- */
  var rollupKeys = Object.keys(D.rollups).concat(['difficulty_research']);
  var rollupState = 'difficulty';

  function rollupRows(key) {
    if (key === 'difficulty_research') return D.rollup_research_difficulty || [];
    return D.rollups[key].rows;
  }

  function rollupMeta(key) {
    if (key === 'difficulty_research') {
      return {
        label: 'Difficulty — research lane only',
        note: 'The lane Biologix actually competes in. The pooled difficulty table is the banned move: it is carried by telehealth and unclear creators.'
      };
    }
    return D.rollups[key];
  }

  function renderRollups() {
    $('rollup-basis').textContent =
      'Age-matched set only: ' + D.totals.ranked + ' videos across ' + D.totals.ranked_creators +
      ' creators. Hit rate = share of the group at out30 ≥ 2×.';

    $('rollup-tabs').innerHTML = rollupKeys.map(function (k) {
      return '<button type="button" class="chip" data-roll="' + esc(k) + '" role="tab" aria-pressed="' +
        (rollupState === k) + '">' + esc(rollupMeta(k).label) + '</button>';
    }).join('');

    var meta = rollupMeta(rollupState);
    $('rollup-note').textContent = meta.note;

    var rows = rollupRows(rollupState);
    $('rollup-body').innerHTML = rows.map(function (r) {
      var best = r.best
        ? '@' + esc(r.best.h) + ' · ' + esc(fixed(r.best.out30, 2)) + '× · ' + num(r.best.plays) + ' plays'
        : '<span class="null-cell">no age-matched video in this group</span>';
      return '<tr><td class="group-key">' + esc(String(r.key).replace(/_/g, ' ')) +
        (r.bar ? '' : '<span class="thin-flag">thin</span>') + '</td>' +
        '<td class="num">' + num(r.n) + '</td><td class="num">' + num(r.creators) + '</td>' +
        '<td class="num">' + (r.med_out30 == null ? nullCell('no age-matched video') : esc(fixed(r.med_out30, 2)) + '×') + '</td>' +
        '<td class="num">' + (r.med_plays == null ? nullCell('no plays exposed') : num(r.med_plays)) + '</td>' +
        '<td class="num">' + (r.hit_rate == null ? nullCell('group is empty') : esc(fixed(r.hit_rate, 1)) + '%') + '</td>' +
        '<td>' + best + '</td></tr>';
    }).join('');
  }

  /* -------------------------------------------------- coded + creators --- */
  function renderCoded() {
    $('coded-body').innerHTML = (D.coded_terms || []).map(function (c) {
      return '<tr><td class="group-key">' + esc(c.term) + (c.bar ? '' : '<span class="thin-flag">thin</span>') +
        '</td><td>' + esc(c.means) + '</td><td class="num">' + num(c.n) + '</td><td class="num">' + num(c.creators) +
        '</td><td class="num">' + (c.med_out30 == null ? nullCell('no age-matched video carries this term') : esc(fixed(c.med_out30, 2)) + '×') +
        '</td><td class="num">' + num(c.ranked_n) + '</td></tr>';
    }).join('');
  }

  function renderCreators() {
    $('creator-note').textContent =
      'Individual civilians with a verified peptide affiliate link. Sampling is capped at 10 videos per creator, ' +
      'so "videos" is a collection cap, not a feed.';
    $('creator-body').innerHTML = (D.creators || []).map(function (c) {
      var dest = c.vendor_links && c.vendor_links.length ? c.vendor_links[0] : (c.bio_link || c.lane_vendor);
      return '<tr><td class="group-key">' + link(c.url, '@' + c.h) +
        (c.code ? '<span class="cell-sub">code ' + esc(c.code) + '</span>' : '') + '</td>' +
        '<td>' + esc(laneLabel(c.lane)) + '</td>' +
        '<td class="num">' + (c.f == null ? nullCell('follower count not exposed') : num(c.f)) + '</td>' +
        '<td class="num">' + num(c.n) + '</td>' +
        '<td class="num">' + num(c.n30) + '</td>' +
        '<td class="num">' + (c.base30 == null ? missing('none in window', 'no post inside the census window') : num(c.base30)) + '</td>' +
        '<td class="num">' + num(c.max_plays) + '</td>' +
        '<td class="num">' + num(c.reta) + '</td>' +
        '<td class="num">' + num(c.blocked) + '</td>' +
        '<td>' + (dest ? link(dest, String(dest).replace(/^https?:\/\//, '').slice(0, 46)) : '<span class="null-cell">none observed</span>') + '</td></tr>';
    }).join('');
  }

  /* ------------------------------------------------------------ events --- */
  function refresh() { renderControls(); renderTable(); }

  $('sort-set').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-sort]');
    if (!b) return;
    var id = b.getAttribute('data-sort');
    if (state.sort === id) state.desc = !state.desc;
    else { state.sort = id; state.desc = true; }
    refresh();
  });

  Array.prototype.forEach.call(document.querySelectorAll('.th-sort'), function (b) {
    b.addEventListener('click', function () {
      var id = b.getAttribute('data-sort');
      if (state.sort === id) state.desc = !state.desc;
      else { state.sort = id; state.desc = id !== 'diff'; }
      refresh();
    });
  });

  $('sort-dir').addEventListener('click', function () { state.desc = !state.desc; refresh(); });

  GROUPS.forEach(function (g) {
    $(g.el).addEventListener('click', function (e) {
      var b = e.target.closest('button[data-opt]');
      if (!b) return;
      var id = b.getAttribute('data-opt');
      state.sel[g.id][id] = !state.sel[g.id][id];
      refresh();
    });
  });

  var qt = null;
  $('q').addEventListener('input', function (e) {
    var val = e.target.value.trim().toLowerCase();
    clearTimeout(qt);
    qt = setTimeout(function () { state.q = val; refresh(); }, 90);
  });

  $('ranked-only').addEventListener('change', function (e) { state.ranked = e.target.checked; refresh(); });

  function resetAll() {
    state.q = '';
    state.ranked = false;
    state.sort = 'out30';
    state.desc = true;
    GROUPS.forEach(function (g) { state.sel[g.id] = {}; });
    $('q').value = '';
    $('ranked-only').checked = false;
    refresh();
  }
  $('reset').addEventListener('click', resetAll);
  $('empty-reset').addEventListener('click', resetAll);

  $('census-body').addEventListener('click', function (e) {
    var tr = e.target.closest('tr[data-id]');
    if (tr) openDrawer(tr.getAttribute('data-id'));
  });

  $('rollup-tabs').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-roll]');
    if (!b) return;
    rollupState = b.getAttribute('data-roll');
    renderRollups();
  });

  $('drawer-close').addEventListener('click', closeDrawer);
  scrim.addEventListener('click', closeDrawer);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !drawer.hidden) closeDrawer();
  });

  /* -------------------------------------------------------------- boot --- */
  buildControls();
  renderCoverage();
  renderFindings();
  renderLeads();
  renderRollups();
  renderCoded();
  renderCreators();
  refresh();

  // exposed for QA: lets a test recompute a filtered count independently
  window.__CENSUS = {
    rows: function () { return lastRows.map(function (v) { return v.id; }); },
    state: state
  };
})();
