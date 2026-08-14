/* Content Intel (view 09) — renders window.PEPTIDE_INTEL.
   Rules this file enforces:
   - A null metric renders as an explicit "not exposed" note, never 0 and never
     a bare dash that could be misread as zero.
   - Every control is wired. No control is rendered if it has no data behind it.
   - hand_collected records are visually marked wherever they appear. */
(function () {
  'use strict';

  var D = window.PEPTIDE_INTEL;
  var $ = function (id) { return document.getElementById(id); };

  if (!D || !Array.isArray(D.posts)) {
    document.querySelector('.page-shell').insertAdjacentHTML(
      'afterbegin',
      '<p class="empty-state">Dataset failed to load. <code>intel-data.js</code> did not set <code>window.PEPTIDE_INTEL</code>. Regenerate it with <code>node analyze.mjs</code>.</p>'
    );
    return;
  }

  /* ------------------------------------------------------------ utils --- */
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };

  var num = function (n) {
    return n == null ? null : n.toLocaleString('en-US');
  };

  // The only place a missing metric is turned into text. Always says why.
  var metric = function (value, label, nullReason) {
    if (value == null) {
      return '<span class="m"><span class="m-null" title="' + esc(nullReason || 'not exposed by this platform') +
        '">' + esc(label) + ': not exposed</span></span>';
    }
    return '<span class="m"><span class="m-label">' + esc(label) + '</span> ' + num(value) + '</span>';
  };

  var cell = function (value, suffix) {
    if (value == null) return '<span class="null-cell">not exposed</span>';
    return num(Math.round(value)) + (suffix || '');
  };

  var plat = function (p) { return p.charAt(0).toUpperCase() + p.slice(1); };

  // Bios arrive from two collectors. The Apify-sourced ones keep literal "\n"
  // and "\u002F" two-character escapes, which rendered as visible backslash-n
  // inside the table. Normalise to single-line text for display.
  var flat = function (s) {
    return String(s == null ? '' : s)
      .replace(/\\u002F/gi, '/')
      .replace(/\\u0026/gi, '&')
      .replace(/\\r\\n|\\n|\\r/g, ' ')
      .replace(/[\r\n]+/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
  };

  // Captions, descriptions and bios are third-party content. Anything that ends
  // up in an href or src must be a real http(s) URL, or we drop it - otherwise a
  // "javascript:" value in a scraped caption would survive HTML-escaping.
  var safeUrl = function (u) {
    if (!u) return null;
    try {
      var parsed = new URL(String(u), 'https://example.invalid');
      return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : null;
    } catch (e) {
      return null;
    }
  };

  var link = function (url, text, cls) {
    var u = safeUrl(url);
    var label = esc(text == null ? url : text);
    if (!u) return '<span class="null-cell">' + label + '</span>';
    return '<a' + (cls ? ' class="' + cls + '"' : '') + ' href="' + esc(u) +
      '" target="_blank" rel="noopener noreferrer">' + label + '</a>';
  };

  /* -------------------------------------------------------- coverage --- */
  function renderCoverage() {
    var t = D.coverage.totals;
    var items = [
      { k: 'Posts measured', v: t.api_collected, u: '' },
      { k: 'On topic', v: t.on_topic, u: 'of ' + t.api_collected, gap: t.on_topic < t.api_collected * 0.2 },
      { k: 'Creators', v: t.creators, u: '' },
      { k: 'Recurring mechanics', v: t.affiliate_mechanics, u: (t.mechanics_one_off_urls ? '+' + t.mechanics_one_off_urls + ' one-off' : '') },
      { k: 'Hand-collected', v: t.hand_collected, u: 'earlier recon' }
    ];
    $('coverage-strip').innerHTML = items.map(function (i) {
      return '<div><dt>' + esc(i.k) + '</dt><dd' + (i.gap ? ' class="is-gap"' : '') + '>' +
        num(i.v) + (i.u ? '<span class="unit">' + esc(i.u) + '</span>' : '') + '</dd></div>';
    }).join('');

    var pp = D.coverage.per_platform || {};
    var rows = Object.keys(pp).map(function (k) {
      var v = pp[k];
      return '<li><b>' + plat(k) + '</b>: ' + v.posts + ' posts from ' + v.creators +
        ' creator(s); ' + v.with_views + ' with view counts, ' + v.with_shares +
        ' with share counts, ' + v.with_duration + ' with duration' +
        (v.date_range && v.date_range[0] ? '. Published ' + v.date_range[0] + ' to ' + v.date_range[1] : '') + '.</li>';
    }).join('');

    var gaps = (D.coverage.known_gaps || []).map(function (g) {
      return '<li class="gap-item">' + esc(g) + '</li>';
    }).join('');

    var caveats = (D.coverage.hand_collected_caveats || []).map(function (c) {
      return '<li>' + esc(c) + '</li>';
    }).join('');

    var fails = D.coverage.collector_failures || {};
    var failCount = Object.keys(fails).reduce(function (a, k) {
      return a + ((fails[k] || []).length);
    }, 0);

    var sm = D.scoring_model || {};
    $('method-body').innerHTML =
      '<h4>Where the numbers come from</h4><ul>' + rows + '</ul>' +
      '<h4>How the score works</h4>' +
      '<p>Weighted composite, ' + Object.keys(sm.weights || {}).map(function (k) {
        return sm.weights[k] + ' ' + k.replace(/_/g, ' ');
      }).join(' / ') + '. ' + esc((sm.dimensions && sm.dimensions.outlier && sm.dimensions.outlier.why) || '') +
      ' Where a platform does not expose a dimension, the composite is renormalised over the ' +
      'dimensions that remain, so no platform is silently penalised.</p>' +
      '<h4>Known gaps (' + (D.coverage.known_gaps || []).length + ')</h4><ul>' + gaps + '</ul>' +
      '<h4>Caveats on the hand-collected records</h4><ul>' + caveats + '</ul>' +
      '<h4>Collector failures</h4><p>' + failCount + ' handle/query failures were recorded rather than hidden. ' +
      'Accounts that do not resolve are listed as unresolved, never as zero-post accounts.</p>';

    $('footer-note').textContent =
      'Generated ' + (D.generated_at || '').replace('T', ' ').slice(0, 16) + ' UTC. ' +
      t.api_collected + ' API-measured posts, ' + t.hand_collected + ' hand-collected. ' +
      'No ScrapeCreators (out of credits). Collected with yt-dlp and the public Instagram endpoint.';
  }

  /* --------------------------------------------------------- filters --- */
  var state = { platform: null, verdict: null, hook: null, topic: 'on', sort: 'score', q: '' };

  function countBy(fn, posts) {
    var m = {};
    posts.forEach(function (p) {
      var k = fn(p);
      if (k == null) return;
      m[k] = (m[k] || 0) + 1;
    });
    return m;
  }

  function buildChips(containerId, key, counts, labelFn) {
    var keys = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; });
    if (!keys.length) {
      $(containerId).closest('.control-row').hidden = true;
      return;
    }
    var html = '<button type="button" class="chip" data-key="' + key + '" data-val="" aria-pressed="' +
      (state[key] === null) + '">All<span class="n">' +
      keys.reduce(function (a, k) { return a + counts[k]; }, 0) + '</span></button>';
    html += keys.map(function (k) {
      return '<button type="button" class="chip" data-key="' + key + '" data-val="' + esc(k) +
        '" aria-pressed="false">' + esc(labelFn ? labelFn(k) : k) +
        '<span class="n">' + counts[k] + '</span></button>';
    }).join('');
    $(containerId).innerHTML = html;
  }

  function buildTopicChips() {
    var on = D.posts.filter(function (p) { return p.on_topic; }).length;
    var off = D.posts.length - on;
    $('filter-topic').innerHTML =
      '<button type="button" class="chip" data-key="topic" data-val="on" aria-pressed="true">' +
      'Peptide topic<span class="n">' + on + '</span></button>' +
      '<button type="button" class="chip" data-key="topic" data-val="off" aria-pressed="false">' +
      'Account general<span class="n">' + off + '</span></button>' +
      '<button type="button" class="chip" data-key="topic" data-val="" aria-pressed="false">' +
      'Both<span class="n">' + D.posts.length + '</span></button>';
  }

  function applyFilters() {
    return D.posts.filter(function (p) {
      if (state.topic === 'on' && !p.on_topic) return false;
      if (state.topic === 'off' && p.on_topic) return false;
      if (state.platform && p.platform !== state.platform) return false;
      if (state.verdict && p.verdict !== state.verdict) return false;
      if (state.hook && p.hook_archetype !== state.hook) return false;
      if (state.q) {
        var hay = [p.hook, p.creator, p.caption, (p.affiliate_signals || []).map(function (s) { return s.value; }).join(' ')]
          .join(' ').toLowerCase();
        if (hay.indexOf(state.q.toLowerCase()) === -1) return false;
      }
      return true;
    }).sort(function (a, b) {
      switch (state.sort) {
        case 'views': return (b.views || 0) - (a.views || 0);
        case 'outlier': return (b.outlier_multiple || 0) - (a.outlier_multiple || 0);
        case 'recent': return String(b.published_at || '').localeCompare(String(a.published_at || ''));
        case 'fit': return (b.replication_fit || 0) - (a.replication_fit || 0);
        default: return (b.score == null ? -1 : b.score) - (a.score == null ? -1 : a.score);
      }
    });
  }

  /* ------------------------------------------------------- post list --- */
  var shown = [];

  function thumb(p) {
    var u = safeUrl(p.thumbnail);
    if (!u) {
      return '<div class="post-thumb-fallback" aria-hidden="true">no<br>thumb</div>';
    }
    // No inline onerror handler; failures are caught by a delegated capture
    // listener below. Platform CDNs hotlink-block often, so this WILL fire.
    return '<img class="post-thumb" src="' + esc(u) + '" alt="" loading="lazy" referrerpolicy="no-referrer">';
  }

  // Delegated, capturing: 'error' does not bubble, so capture is required.
  document.addEventListener(
    'error',
    function (e) {
      var img = e.target;
      if (!img || img.tagName !== 'IMG' || !img.classList.contains('post-thumb')) return;
      var ph = document.createElement('div');
      ph.className = 'post-thumb-fallback';
      ph.setAttribute('aria-hidden', 'true');
      ph.innerHTML = 'thumb<br>blocked';
      if (img.parentNode) img.parentNode.replaceChild(ph, img);
    },
    true
  );

  function renderList() {
    shown = applyFilters();
    var list = $('post-list');
    $('result-count').textContent = shown.length + ' of ' + D.posts.length + ' posts';
    $('empty-state').hidden = shown.length > 0;

    list.innerHTML = shown.map(function (p, i) {
      var viewsHtml = metric(p.views, 'views', p.views_note);
      var outlier = p.outlier_multiple != null
        ? '<span class="m"><span class="m-label">outlier</span> ' + p.outlier_multiple + '&times;</span>'
        : '<span class="m"><span class="m-null" title="no usable baseline for this creator">outlier: no baseline</span></span>';
      var eng = p.comments != null
        ? '<span class="m"><span class="m-label">comments</span> ' + num(p.comments) + '</span>'
        : metric(null, 'comments', 'not exposed');

      return '<li><button type="button" class="post-row" data-i="' + i + '" aria-haspopup="dialog">' +
        '<span class="post-rank">' + (i + 1) + '</span>' +
        thumb(p) +
        '<span class="post-main">' +
          '<span class="post-hook">' + esc(p.hook || '(no title captured)') + '</span>' +
          '<span class="post-meta">' +
            '<span class="creator">' + esc(p.creator || 'unknown') + '</span>' +
            '<span class="tag tag-platform">' + esc(p.platform) + '</span>' +
            '<span class="tag">' + esc(p.hook_archetype) + '</span>' +
            (p.duration_band ? '<span class="tag">' + esc(p.duration_band) + '</span>' : '') +
            (p.provenance === 'hand_collected' ? '<span class="badge-hand">hand-collected</span>' : '') +
            (!p.on_topic ? '<span class="tag">off topic</span>' : '') +
            (p.published_at ? '<span>' + esc(p.published_at) + '</span>' : '') +
          '</span>' +
        '</span>' +
        '<span class="post-metrics">' + viewsHtml + outlier + eng + '</span>' +
        '<span class="post-verdict">' +
          '<span class="verdict-chip verdict-' + esc(p.verdict) + '">' + esc(p.verdict) + '</span>' +
          '<span class="score-block">score <span class="score-num">' +
            (p.score == null ? '&ndash;' : p.score) + '</span>' +
            '<span class="coverage-bar" title="metric coverage ' +
            Math.round((p.metric_coverage || 0) * 100) + '%"><i style="width:' +
            Math.round((p.metric_coverage || 0) * 100) + '%"></i></span>' +
          '</span>' +
        '</span>' +
        (p.rank_note ? '<span class="held-note">' + esc(p.rank_note) + '</span>' : '') +
        '</button></li>';
    }).join('');
  }

  /* ---------------------------------------------------------- drawer --- */
  var lastFocus = null;

  function openDrawer(i) {
    var p = shown[i];
    if (!p) return;
    lastFocus = document.activeElement;
    var s = p.replication_spec;

    var html = '<h3 id="drawer-title">' + esc(p.hook || '(no title captured)') + '</h3>';

    html += '<p class="post-meta" style="margin-bottom:4px">' +
      '<span class="creator">' + esc(p.creator || 'unknown') + '</span>' +
      '<span class="tag tag-platform">' + esc(p.platform) + '</span>' +
      (p.published_at ? '<span>' + esc(p.published_at) + '</span>' : '') +
      (p.provenance === 'hand_collected' ? '<span class="badge-hand">hand-collected</span>' : '') +
      '</p>';

    html += '<p><span class="verdict-chip verdict-' + esc(p.verdict) + '">' + esc(p.verdict) +
      '</span></p><p style="font-size:13.5px;margin:0 0 4px">' + esc(p.verdict_rationale || '') + '</p>' +
      '<p class="basis-note">Verdict assigned by rule: ' + esc(p.verdict_source || 'n/a') + '</p>';

    html += '<dl class="drawer-metrics">' +
      '<div><dt>Views</dt><dd' + (p.views == null ? ' class="null-cell"' : '') + '>' +
        (p.views == null ? esc(p.views_note || 'not exposed') : num(p.views)) + '</dd></div>' +
      '<div><dt>Outlier</dt><dd' + (p.outlier_multiple == null ? ' class="null-cell"' : '') + '>' +
        (p.outlier_multiple == null ? 'no baseline' : p.outlier_multiple + '×') + '</dd></div>' +
      '<div><dt>Likes</dt><dd' + (p.likes == null ? ' class="null-cell"' : '') + '>' +
        (p.likes == null ? 'not exposed' : num(p.likes)) + '</dd></div>' +
      '<div><dt>Comments</dt><dd' + (p.comments == null ? ' class="null-cell"' : '') + '>' +
        (p.comments == null ? 'not exposed' : num(p.comments)) + '</dd></div>' +
      '<div><dt>Shares</dt><dd' + (p.shares == null ? ' class="null-cell"' : '') + '>' +
        (p.shares == null ? esc(p.shares_note || 'not exposed') : num(p.shares)) + '</dd></div>' +
      '<div><dt>Duration</dt><dd' + (p.duration == null ? ' class="null-cell"' : '') + '>' +
        (p.duration == null ? esc(p.duration_note || 'not exposed') : Math.round(p.duration) + 's') + '</dd></div>' +
      '</dl>';

    // score breakdown
    if (p.sub_scores) {
      var w = (D.scoring_model && D.scoring_model.weights) || {};
      html += '<div class="spec-block"><p class="spec-label">Score ' + (p.score == null ? '' : p.score) +
        ' / 100 &mdash; coverage ' + Math.round((p.metric_coverage || 0) * 100) + '%</p><table class="subscore-table">';
      Object.keys(w).forEach(function (k) {
        var v = p.sub_scores[k];
        html += '<tr><td>' + esc(k.replace(/_/g, ' ')) + ' <span class="w">w' + w[k] + '</span></td><td>' +
          (v == null ? '<span class="null-cell">n/a</span>' : v) + '</td></tr>';
      });
      html += '</table>';
      if (p.score_renormalised_over && p.score_renormalised_over.length < Object.keys(w).length) {
        html += '<p class="basis-note">Renormalised over ' + p.score_renormalised_over.length + ' of ' +
          Object.keys(w).length + ' dimensions because this platform does not expose the rest.</p>';
      }
      html += '</div>';
    }

    if (s) {
      html += '<div class="spec-block"><p class="spec-label">Hook, verbatim</p>' +
        '<p class="hook-quote">' + esc(s.hook_verbatim) + '</p>' +
        '<p class="post-meta"><span class="tag">' + esc(s.hook_archetype) + '</span>' +
        '<span class="tag">' + esc(s.format) + '</span>' +
        (s.duration_band ? '<span class="tag">' + esc(s.duration_band) + '</span>' : '') + '</p></div>';

      html += '<div class="spec-block"><p class="spec-label">What to steal</p><ul>' +
        (s.what_to_steal || []).map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') +
        '</ul></div>';

      html += '<div class="spec-block"><p class="spec-label">What must change for Biologix</p>' +
        '<p>' + esc(s.what_to_change_for_biologix) + '</p></div>';

      html += '<div class="spec-block"><p class="spec-label">Executable brief</p>' +
        '<p class="basis-note">' + esc(s.structure_beats_basis) + '</p>' +
        '<ol class="brief-list">' +
        (s.executable_brief || []).map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') +
        '</ol></div>';

      html += '<div class="spec-block"><p class="spec-label">Affiliate mechanic observed</p><ul>' +
        (s.affiliate_mechanic || []).map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') +
        '</ul></div>';

      if ((s.claim_risks_to_avoid || []).length) {
        html += '<div class="spec-block"><p class="spec-label">Claim risks present in the source</p><p>' +
          s.claim_risks_to_avoid.map(function (r) { return '<span class="risk-chip">' + esc(r) + '</span>'; }).join('') +
          '</p></div>';
      }
    } else {
      html += '<div class="spec-block"><p class="spec-label">Replication spec</p>' +
        '<p class="basis-note">No spec generated. Specs are produced for the top 40 rank-eligible ' +
        'API-collected posts only, so that a spec is never written on top of a weak or unverifiable record.</p></div>';
    }

    if ((p.replication_fit_reasons || []).length) {
      html += '<div class="spec-block"><p class="spec-label">Replication fit ' + p.replication_fit + ' / 100</p><ul>' +
        p.replication_fit_reasons.map(function (r) { return '<li>' + esc(r) + '</li>'; }).join('') + '</ul></div>';
    }

    html += '<div class="drawer-actions">' + link(p.url, 'Open the original post \u2192', 'ext-link') + '</div>';

    $('drawer-body').innerHTML = html;
    $('drawer-kicker').textContent = plat(p.platform) + ' · ' + (p.provenance === 'hand_collected' ? 'hand-collected' : 'API-measured');
    $('drawer').hidden = false;
    $('scrim').hidden = false;
    $('drawer-close').focus();
    document.body.style.overflow = 'hidden';
  }

  function closeDrawer() {
    $('drawer').hidden = true;
    $('scrim').hidden = true;
    document.body.style.overflow = '';
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  /* --------------------------------------------------------- rollups --- */
  var rollupKeys = Object.keys(D.rollups || {}).filter(function (k) {
    return (D.rollups[k] || []).length > 0;
  });
  var activeRollup = rollupKeys[0];

  function renderRollupTabs() {
    $('rollup-tabs').innerHTML = rollupKeys.map(function (k) {
      return '<button type="button" class="chip" role="tab" data-rollup="' + k + '" aria-selected="' +
        (k === activeRollup) + '" aria-pressed="' + (k === activeRollup) + '">' +
        esc(k.replace('by_', '').replace(/_/g, ' ')) + '</button>';
    }).join('');
  }

  function renderRollup() {
    var rows = D.rollups[activeRollup] || [];
    $('rollup-body').innerHTML = rows.map(function (r) {
      var v = r.verdicts || {};
      var vm = ['COPY', 'ADAPT', 'REJECT'].filter(function (k) { return v[k]; }).map(function (k) {
        return '<span class="vm-' + k + '"><b>' + v[k] + '</b> ' + k.toLowerCase() + '</span>';
      }).join(' &middot; ');
      return '<tr>' +
        '<td><span class="group-key">' + esc(r.key) + '</span>' +
          (r.thin_evidence ? '<span class="thin-flag" title="' + esc(r.evidence_note || '') + '">thin</span>' : '') + '</td>' +
        '<td class="num">' + r.n_posts + '</td>' +
        '<td class="num">' + cell(r.median_views) + '</td>' +
        '<td class="num">' + (r.median_outlier_multiple == null ? '<span class="null-cell">n/a</span>' : r.median_outlier_multiple + '×') + '</td>' +
        '<td><span class="verdict-mini">' + (vm || '<span class="null-cell">none</span>') + '</span></td>' +
        '<td>' + (r.best_example
          ? link(r.best_example.url, String(r.best_example.hook || '').slice(0, 54))
          : '<span class="null-cell">none eligible</span>') + '</td>' +
        '</tr>';
    }).join('');
  }

  /* ----------------------------------------------------- static tables --- */
  function renderTopic() {
    var rows = D.topic_comparison || [];
    if (!rows.length) {
      $('topic-section').hidden = true;
      return;
    }
    $('topic-body').innerHTML = rows.map(function (r) {
      return '<tr>' +
        '<td><span class="group-key">' + esc(r.creator) + '</span>' +
          (r.thin_evidence ? '<span class="thin-flag" title="fewer than 3 posts on one side">thin</span>' : '') + '</td>' +
        '<td>' + esc(plat(r.platform)) + '</td>' +
        '<td class="num">' + cell(r.median_views_on_topic) + ' <span class="w">(' + r.n_on_topic + ')</span></td>' +
        '<td class="num">' + cell(r.median_views_off_topic) + ' <span class="w">(' + r.n_off_topic + ')</span></td>' +
        '<td class="num">' + (r.ratio == null ? '<span class="null-cell">n/a</span>' : r.ratio + '×') + '</td>' +
        '<td style="font-size:12.5px">' + esc(r.reading) + '</td>' +
        '</tr>';
    }).join('');
  }

  function renderMechanics() {
    var rows = D.affiliate_mechanics || [];
    $('mech-body').innerHTML = rows.length ? rows.slice(0, 80).map(function (m) {
      var val = esc(String(m.value).slice(0, 160));
      var isUrl = /^https?:\/\//i.test(m.value);
      return '<tr>' +
        '<td><span class="group-key">' + esc(m.kind) + '</span></td>' +
        '<td><span class="mech-value">' + (isUrl
          ? link(m.value, String(m.value).slice(0, 160))
          : val) + '</span></td>' +
        '<td class="num">' + m.times_seen + '</td>' +
        '<td>' + esc((m.platforms || []).join(', ')) + '</td>' +
        '<td>' + esc((m.creators || []).slice(0, 3).join(', ')) +
          ((m.creators || []).length > 3 ? ' +' + (m.creators.length - 3) : '') + '</td>' +
        '</tr>';
    }).join('') : '<tr><td colspan="5"><span class="null-cell">No affiliate signals were found in the collected captions.</span></td></tr>';

    var f = D.bio_funnels || [];
    $('funnel-body').innerHTML = f.length ? f.map(function (b) {
      return '<tr>' +
        '<td><span class="group-key">' + esc(b.handle) + '</span></td>' +
        '<td><span class="mech-value">' + esc(b.bio_link || '') + '</span></td>' +
        '<td><span class="mech-value">' + (b.resolved_url
          ? link(b.resolved_url)
          : '<span class="null-cell">did not resolve</span>') + '</span></td>' +
        '<td class="num">' + (b.http_status == null ? '<span class="null-cell">n/a</span>' : b.http_status) + '</td>' +
        '</tr>';
    }).join('') : '<tr><td colspan="4"><span class="null-cell">No bio links were resolved.</span></td></tr>';
  }

  function renderCreators() {
    $('creator-body').innerHTML = (D.creators || []).map(function (c) {
      return '<tr>' +
        '<td><span class="group-key">' + (c.url ? link(c.url, c.handle) : esc(c.handle)) + '</span></td>' +
        '<td>' + esc(plat(c.platform)) + '</td>' +
        '<td>' + esc(c.lane) + '</td>' +
        '<td class="num">' + (c.followers == null
          ? '<span class="null-cell" title="' + esc(c.followers_note || 'blocked by platform') + '">blocked</span>'
          : num(c.followers)) + '</td>' +
        '<td class="num">' + c.posts_collected + '</td>' +
        '<td class="num">' + cell(c.median_views) +
          (c.baseline_confidence === 'low' ? '<span class="thin-flag">thin</span>' : '') + '</td>' +
        '<td>' + (c.best_post
          ? link(c.best_post.url, String(c.best_post.hook || '').slice(0, 44))
          : '<span class="null-cell">none eligible</span>') + '</td>' +
        '</tr>';
    }).join('');
  }

  function renderPatterns() {
    $('pattern-grid').innerHTML = (D.content_patterns || []).map(function (p) {
      return '<article class="pattern-card">' +
        '<p class="pattern-rank">Pattern ' + p.rank + ' &middot; <span class="vm-' + esc(p.verdict) + '">' + esc(p.verdict) + '</span></p>' +
        '<h3>' + esc(p.pattern_name) + '</h3>' +
        '<p class="observed">Observed: ' + esc(p.observed) + '</p>' +
        '<p class="why">' + esc(p.why_it_works) + '</p>' +
        ((p.biologix_adaptation || []).length
          ? '<p class="sub-label">Biologix substitution</p><ul>' +
            p.biologix_adaptation.map(function (a) { return '<li>' + esc(a) + '</li>'; }).join('') + '</ul>'
          : '') +
        (p.constraint ? '<p class="constraint">' + esc(p.constraint) + '</p>' : '') +
        '</article>';
    }).join('');
  }

  /* ----------------------------------------------------------- wiring --- */
  function rebuildChips() {
    var pool = D.posts;
    buildChips('filter-platform', 'platform', countBy(function (p) { return p.platform; }, pool), plat);
    buildChips('filter-verdict', 'verdict', countBy(function (p) { return p.verdict; }, pool));
    buildChips('filter-hook', 'hook', countBy(function (p) { return p.hook_archetype; }, pool));
    buildTopicChips();
  }

  document.addEventListener('click', function (e) {
    var chip = e.target.closest('.chip[data-key]');
    if (chip) {
      var key = chip.dataset.key;
      var val = chip.dataset.val;
      state[key] = val === '' ? null : val;
      chip.parentElement.querySelectorAll('.chip').forEach(function (c) {
        c.setAttribute('aria-pressed', String(c === chip));
      });
      renderList();
      return;
    }

    var tab = e.target.closest('[data-rollup]');
    if (tab) {
      activeRollup = tab.dataset.rollup;
      renderRollupTabs();
      renderRollup();
      return;
    }

    var row = e.target.closest('.post-row');
    if (row) { openDrawer(Number(row.dataset.i)); return; }

    if (e.target.id === 'drawer-close' || e.target.id === 'scrim') { closeDrawer(); return; }

    if (e.target.id === 'reset' || e.target.id === 'empty-reset') {
      state = { platform: null, verdict: null, hook: null, topic: 'on', sort: 'score', q: '' };
      $('sort-by').value = 'score';
      $('q').value = '';
      rebuildChips();
      renderList();
    }
  });

  $('sort-by').addEventListener('change', function (e) { state.sort = e.target.value; renderList(); });

  var qt;
  $('q').addEventListener('input', function (e) {
    clearTimeout(qt);
    var v = e.target.value;
    qt = setTimeout(function () { state.q = v; renderList(); }, 130);
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !$('drawer').hidden) closeDrawer();
  });

  function renderFindings() {
    var f = D.findings || [];
    if (!f.length) {
      var sec = document.getElementById('findings-list');
      if (sec && sec.closest('.intel-section')) sec.closest('.intel-section').hidden = true;
      return;
    }
    $('findings-list').innerHTML = f.map(function (x) {
      return '<article class="finding">' +
        '<h3>' + esc(x.headline) + '</h3>' +
        '<p class="detail">' + esc(x.detail) + '</p>' +
        '<p class="so-what"><b>So what</b>' + esc(x.so_what) + '</p>' +
        '<p class="n">evidence base: ' + esc(String(x.evidence_n)) + ' posts</p>' +
        '</article>';
    }).join('');
  }

  var KLASS_LABEL = {
    documented_peptide_program: 'documented program',
    known_seller_or_aggregator: 'known seller',
    suspected_peptide_vendor: 'suspected vendor (heuristic)',
    affiliate_network: 'affiliate network',
    own_offer_platform: 'own offer platform',
    adjacent_product: 'adjacent product',
    reference_or_media: 'citation / media',
    social: 'social',
    other: 'unclassified'
  };

  function renderBrands() {
    var doms = (D.linked_domains || []).filter(function (d) {
      return /documented_peptide_program|known_seller_or_aggregator|suspected_peptide_vendor|affiliate_network|adjacent_product/.test(d.klass);
    });
    $('brands-body').innerHTML = doms.length ? doms.slice(0, 60).map(function (d) {
      return '<tr><td><span class="group-key">' + esc(d.host) + '</span>' +
        (d.klass === 'suspected_peptide_vendor' ? '<span class="thin-flag">heuristic</span>' : '') + '</td>' +
        '<td>' + esc(KLASS_LABEL[d.klass] || d.klass) + '</td>' +
        '<td class="num">' + d.times_seen + '</td>' +
        '<td style="font-size:12px">' + esc((d.creators || []).slice(0, 4).join(', ')) +
        ((d.creators || []).length > 4 ? ' +' + (d.creators.length - 4) : '') + '</td></tr>';
    }).join('') : '<tr><td colspan="4"><span class="null-cell">No vendor or network domains resolved.</span></td></tr>';

    var withPosture = (D.creators || []).filter(function (c) {
      return c.affiliate && c.affiliate.posture !== 'none_observed';
    });
    $('posture-body').innerHTML = withPosture.length ? withPosture.map(function (c) {
      var a = c.affiliate;
      var vend = (a.vendor_brands || []).concat(a.suspected_vendor_domains || []);
      return '<tr><td><span class="group-key">' + (c.url ? link(c.url, c.handle) : esc(c.handle)) + '</span></td>' +
        '<td>' + esc(a.posture.replace(/_/g, ' ')) + '</td>' +
        '<td style="font-size:12px">' + (vend.length ? esc(vend.slice(0, 3).join(', ')) : '<span class="null-cell">none</span>') + '</td>' +
        '<td style="font-size:12px">' + ((a.codes || []).length ? esc(a.codes.slice(0, 3).join(', ')) : '<span class="null-cell">none</span>') + '</td>' +
        '<td style="font-size:12px">' + ((a.own_offer_platforms || []).length ? esc(a.own_offer_platforms.slice(0, 2).join(', ')) : '<span class="null-cell">none</span>') + '</td></tr>';
    }).join('') : '<tr><td colspan="5"><span class="null-cell">No monetisation posture resolved.</span></td></tr>';

    var progs = D.affiliate_programs || [];
    var matched = (D.linked_domains || []).filter(function (d) { return d.klass === 'documented_peptide_program'; }).length;
    $('program-match-note').textContent = matched === 0
      ? progs.length + ' programs documented in the research. ZERO of them appear in any link posted by any creator we collected. The programs and the creators are two separate populations.'
      : matched + ' of ' + progs.length + ' documented programs were actually observed in collected links.';
    $('program-body').innerHTML = progs.map(function (pr) {
      return '<tr><td><span class="group-key">' + esc(pr.brand) + '</span>' +
        (pr.sells_retatrutide ? '<span class="thin-flag">sells reta</span>' : '') + '</td>' +
        '<td style="font-size:12px">' + esc(pr.commission || '') + '</td>' +
        '<td style="font-size:12px">' + esc(pr.attribution || '') + '</td>' +
        '<td style="font-size:12px">' + esc(pr.restrictions || '') + '</td>' +
        '<td style="font-size:12px">' + (pr.risk_note ? '<span style="color:var(--reject)">' + esc(pr.risk_note) + '</span>' : '<span class="null-cell">none noted</span>') + '</td></tr>';
    }).join('');
  }

  function renderCohort() {
    var C = D.civilian_cohort;
    var sec = document.getElementById('cohort-section');
    if (!C || !(C.creators || []).length) { if (sec) sec.hidden = true; return; }
    var verified = C.creators.filter(function (c) { return c.affiliate_verified; });
    var rest = C.creators.filter(function (c) { return !c.affiliate_verified; });

    $('cohort-count').textContent = verified.length + ' verified of ' + C.probed + ' probed';
    $('cohort-note').textContent = C.discovery_note + ' Verified means a peptide or GLP-1 vendor URL was actually found behind the bio link, with link aggregators crawled one level down, or a discount code is stated in the bio. Simply having a linktr.ee is not evidence.';

    $('cohort-body').innerHTML = verified.map(function (c) {
      var dest = (c.peptide_vendor_links || []).slice(0, 2);
      return '<tr>' +
        '<td><span class="group-key">' + link(c.url || ('https://www.tiktok.com/@' + c.handle), '@' + c.handle) + '</span></td>' +
        '<td class="num">' + (c.followers == null ? '<span class="null-cell">n/a</span>' : num(c.followers)) + '</td>' +
        '<td style="font-size:12px;max-width:260px">' + esc(flat(c.bio).slice(0, 130)) + '</td>' +
        '<td><span class="mech-value">' + (dest.length
            ? dest.map(function (u) { return link(/^https?:/i.test(u) ? u : 'https://' + u, String(u).slice(0, 62)); }).join('<br>')
            : (c.code_in_bio ? 'code <b>' + esc(c.code_in_bio) + '</b>' : '<span class="null-cell">via code only</span>')) +
          '</span></td>' +
        '<td style="font-size:11.5px">' + esc(c.verification || c.affiliate_evidence || '') + '</td>' +
        '</tr>';
    }).join('');

    $('cohort-excluded').innerHTML = rest.slice(0, 60).map(function (c) {
      var why = (c.exclusion_reasons || []).length ? c.exclusion_reasons.join('; ')
        : (c.verification || 'no peptide vendor found behind the bio link');
      return '<tr><td>@' + esc(c.handle) + '</td>' +
        '<td class="num">' + (c.followers == null ? '<span class="null-cell">n/a</span>' : num(c.followers)) + '</td>' +
        '<td style="font-size:12px">' + esc(why) + '</td></tr>';
    }).join('');
  }

  function renderPlaybook() {
    var P = D.affiliate_playbook;
    var sec = document.getElementById('playbook-section');
    if (!P || !P.brief) { if (sec) sec.hidden = true; return; }
    var g = P.generated_from || {};
    $('pb-basis').textContent = g.posts_scored + ' posts from ' + g.creators +
      ' civilian affiliates \u00b7 ' + P.on_topic_posts + ' on topic';

    $('pb-directives').innerHTML = (P.brief.directives || []).map(function (x) {
      return '<article class="finding">' +
        '<h3>' + esc(x.rule) + '</h3>' +
        '<p class="detail">' + esc(x.evidence) + '</p>' +
        '<p class="so-what"><b>' + (x.directive ? 'Brief it as' : 'Evidence') + '</b>' +
          (x.directive ? esc(x.directive) + ' ' : '') +
          (x.example ? link(x.example, 'best example') : (x.directive ? '' : 'Aggregate across the cohort; no single exemplar.')) + '</p>' +
        '</article>';
    }).join('') || '<p class="empty-state">No directive cleared the evidence bar.</p>';

    $('pb-leads').innerHTML = (P.brief.leads_to_test || []).map(function (x) {
      return '<tr><td><span class="group-key">' + esc(x.angle) + '</span><span class="thin-flag">thin</span></td>' +
        '<td class="num">' + (x.median_outlier == null ? '<span class="null-cell">n/a</span>' : Math.round(x.median_outlier * 100) / 100 + '\u00d7') + '</td>' +
        '<td class="num">' + x.n_posts + '</td><td class="num">' + x.n_creators + '</td>' +
        '<td>' + (x.example ? link(x.example, 'example') : '<span class="null-cell">none</span>') + '</td></tr>';
    }).join('') || '<tr><td colspan="5"><span class="null-cell">none</span></td></tr>';

    $('pb-alias').innerHTML = (P.brief.coded_aliases_in_live_use || []).map(function (x) {
      return '<tr><td><span class="group-key">' + esc(x.tag) + '</span></td>' +
        '<td class="num">' + x.n_posts + '</td><td class="num">' + x.n_creators + '</td>' +
        '<td class="num">' + (x.median_outlier == null ? '<span class="null-cell">n/a</span>' : x.median_outlier + '\u00d7') + '</td></tr>';
    }).join('') || '<tr><td colspan="4"><span class="null-cell">none observed</span></td></tr>';

    $('pb-breakouts').innerHTML = (P.breakouts || []).slice(0, 20).map(function (b) {
      return '<tr>' +
        '<td><span class="group-key">' + link('https://www.tiktok.com/@' + b.handle, '@' + b.handle) + '</span>' +
          (b.followers != null ? '<br><span class="w" style="font-family:var(--mono);font-size:10px;color:var(--ink-3)">' + num(b.followers) + ' followers</span>' : '') + '</td>' +
        '<td class="num">' + (b.plays == null ? '<span class="null-cell">n/a</span>' : num(b.plays)) + '</td>' +
        '<td class="num">' + (b.outlier == null ? '<span class="null-cell">n/a</span>' : b.outlier + '\u00d7') + '</td>' +
        '<td style="font-size:12px">' + esc(String(b.hook || '').replace(/-/g, ' ')) +
          (b.band ? '<br><span class="w" style="font-family:var(--mono);font-size:10px;color:var(--ink-3)">' + esc(b.band) + '</span>' : '') + '</td>' +
        '<td style="font-size:12px;max-width:300px">' + link(b.url, String(b.desc || '(no caption)').slice(0, 110)) + '</td>' +
        '</tr>';
    }).join('');

    $('pb-compliance').textContent = P.brief.compliance_flag || '';
  }

  /* ------------------------------------------------------------- init --- */
  renderPlaybook();
  renderCohort();
  renderBrands();
  renderFindings();
  renderCoverage();
  rebuildChips();
  renderList();
  renderRollupTabs();
  renderRollup();
  renderTopic();
  renderMechanics();
  renderCreators();
  renderPatterns();
})();
