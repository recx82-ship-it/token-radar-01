// Token Launch Radar — renders the board, the live view and every protocol's detail view from
// window.RADAR (data.js, written by main.ts from the same board the gate checks). No network.
(function () {
  'use strict';
  var D = window.RADAR;
  if (!D) { document.getElementById('board').innerHTML = '<p class="empty">No radar data found.</p>'; return; }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function money(n) {
    if (n == null) return '—';
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + Math.round(n);
  }
  function pct(n) {
    if (n == null) return '—';
    var cls = n > 0 ? 'up' : n < 0 ? 'down' : 'flat';
    var sign = n > 0 ? '+' : '';
    return '<span class="' + cls + '">' + sign + n.toFixed(1) + '%</span>';
  }
  function ageText(days) {
    if (days == null) return 'unknown';
    if (days < 30) return days + 'd';
    if (days < 365) return Math.round(days / 30) + 'mo';
    return (days / 365).toFixed(1) + 'y';
  }
  function bucketLabel(b) {
    var lo = money(b.tvl_lo);
    var hi = b.tvl_hi == null ? '∞' : money(b.tvl_hi);
    return lo + ' – ' + hi;
  }

  // ---- header meta + model card -------------------------------------------------
  var meta = document.getElementById('meta');
  meta.innerHTML =
    '<span>Snapshot <b>' + esc(D.as_of) + '</b></span>' +
    '<span>Model <b>' + esc(D.model_version) + '</b></span>' +
    '<span><b>' + D.board_size + '</b> ranked</span>' +
    '<span><b>' + D.watchlist_size + '</b> watchlist</span>' +
    '<span><b>' + D.early_size + '</b> early finds</span>';

  var calRows = D.calibration.buckets.map(function (b) {
    return '<tr><td>' + esc(bucketLabel(b)) + '</td><td>' + money(b.centre_tvl) + '</td><td><b>' + b.multiple.toFixed(3) + '</b></td><td>' + b.count + '</td></tr>';
  }).join('');
  document.getElementById('model').innerHTML =
    '<h2>How the radar scores — model ' + esc(D.model_version) + '</h2>' +
    '<p>Implied value = TVL × <b>size multiple</b> × growth × maturity × breakout. The size multiple is not asserted: it is calibrated from the snapshot&rsquo;s own live-token protocols, bucketed by TVL. Small protocols earn a far higher multiple than giants — the market pays about <b>' + D.calibration.buckets[0].multiple.toFixed(2) + '× TVL</b> for protocols under $100M and about <b>' + D.calibration.buckets[D.calibration.buckets.length - 1].multiple.toFixed(3) + '×</b> for the giants above $10B.</p>' +
    '<table class="calib"><thead><tr><th>TVL bucket</th><th>Centre</th><th>Median mcap / TVL</th><th>Live protocols</th></tr></thead><tbody>' + calRows + '</tbody></table>' +
    '<p>Growth is the 7-day TVL change, clamped to −40%…+60% and weighted 0.5. Maturity runs 0.70 for a new listing to 1.00 at three years. Breakout ×1.15 applies when a protocol is under a year old and growing over 5% in a week. Live-token protocols are shown separately at the market&rsquo;s own values, never mixed into the ranking.</p>';

  // ---- controls ------------------------------------------------------------------
  var qEl = document.getElementById('q');
  var catEl = document.getElementById('category');
  var chainEl = document.getElementById('chain');
  var tvlEl = document.getElementById('mintvl');
  var sortEl = document.getElementById('sort');
  var countEl = document.getElementById('count');
  var mainEl = document.getElementById('board');
  var detailEl = document.getElementById('detail');
  var tabBoard = document.getElementById('tab-board');
  var tabLive = document.getElementById('tab-live');

  var cats = {};
  var chains = {};
  D.rows.forEach(function (r) {
    if (r.category) cats[r.category] = true;
    r.chains.forEach(function (c) { chains[c] = true; });
  });
  Object.keys(cats).sort().forEach(function (c) {
    var o = document.createElement('option'); o.value = c; o.textContent = c; catEl.appendChild(o);
  });
  Object.keys(chains).sort().forEach(function (c) {
    var o = document.createElement('option'); o.value = c; o.textContent = c; chainEl.appendChild(o);
  });

  function parseHash() {
    var h = location.hash || '#/board';
    var m = h.match(/^#\/protocol\/([A-Za-z0-9._-]+)/);
    if (m) return { view: 'protocol', slug: m[1] };
    if (h.indexOf('#/live') === 0) return { view: 'live' };
    var params = {};
    var qm = h.match(/^#\/board\?(.*)$/);
    if (qm) {
      qm[1].split('&').forEach(function (pair) {
        var kv = pair.split('=');
        if (kv[0]) params[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1] || '');
      });
    }
    return { view: 'board', params: params };
  }
  function boardHash() {
    var parts = [];
    if (qEl.value) parts.push('search=' + encodeURIComponent(qEl.value));
    if (catEl.value) parts.push('category=' + encodeURIComponent(catEl.value));
    if (chainEl.value) parts.push('chain=' + encodeURIComponent(chainEl.value));
    if (tvlEl.value !== '0') parts.push('minTvl=' + tvlEl.value);
    if (sortEl.value !== 'value') parts.push('sort=' + sortEl.value);
    return '#/board' + (parts.length ? '?' + parts.join('&') : '');
  }
  function applyParams(p) {
    qEl.value = p.search || '';
    catEl.value = p.category || '';
    chainEl.value = p.chain || '';
    tvlEl.value = p.minTvl || '0';
    sortEl.value = p.sort || 'value';
  }
  function filteredRows() {
    var q = qEl.value.trim().toLowerCase();
    var cat = catEl.value;
    var chain = chainEl.value;
    var minTvl = Number(tvlEl.value) || 0;
    var rows = D.rows.filter(function (r) {
      if (cat && r.category !== cat) return false;
      if (chain && r.chains.indexOf(chain) < 0) return false;
      if (r.tvl_usd < minTvl) return false;
      if (q && r.name.toLowerCase().indexOf(q) < 0 && r.slug.toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    var sort = sortEl.value;
    var by = {
      value: function (a, b) { return b.implied_value_usd - a.implied_value_usd; },
      tvl: function (a, b) { return b.tvl_usd - a.tvl_usd; },
      growth: function (a, b) { return (b.change_7d == null ? -1e9 : b.change_7d) - (a.change_7d == null ? -1e9 : a.change_7d); },
      age: function (a, b) { return (b.age_days == null ? -1 : b.age_days) - (a.age_days == null ? -1 : a.age_days); },
      name: function (a, b) { return a.name < b.name ? -1 : a.name > b.name ? 1 : 0; }
    }[sort] || by.value;
    return rows.slice().sort(by);
  }
  function tagFor(r) {
    return r.watchlist
      ? '<span class="pill watch">Watchlist</span>'
      : '<span class="pill early">Early find</span>';
  }
  function boardTable(rows) {
    if (!rows.length) return '<p class="empty">No protocols match these filters. Clear a filter to see the board again.</p>';
    var html = '<table class="board"><thead><tr><th class="num">#</th><th>Protocol</th><th>Category</th><th>Chains</th><th class="num">TVL</th><th class="num">7d</th><th class="num">Age</th><th class="num">Implied value</th></tr></thead><tbody>';
    rows.forEach(function (r) {
      html += '<tr tabindex="0" data-slug="' + esc(r.slug) + '">' +
        '<td class="num">' + r.rank + '</td>' +
        '<td><span class="name">' + esc(r.name) + '</span><span class="sub">' + esc(r.slug) + ' · ' + tagFor(r) + '</span></td>' +
        '<td>' + esc(r.category || '—') + '</td>' +
        '<td>' + esc(r.chains.slice(0, 3).join(', ') || '—') + (r.chains.length > 3 ? ' +' + (r.chains.length - 3) : '') + '</td>' +
        '<td class="num">' + money(r.tvl_usd) + '</td>' +
        '<td class="num">' + pct(r.change_7d) + '</td>' +
        '<td class="num">' + ageText(r.age_days) + '</td>' +
        '<td class="num value">' + money(r.implied_value_usd) + '</td></tr>';
    });
    return html + '</tbody></table>';
  }
  function liveTable() {
    var html = '<table class="board"><thead><tr><th>Protocol</th><th>Category</th><th>Chains</th><th class="num">TVL</th><th class="num">Market cap</th><th class="num">7d</th></tr></thead><tbody>';
    D.live.forEach(function (r) {
      html += '<tr>' +
        '<td><span class="name">' + esc(r.name) + '</span><span class="sub">' + esc(r.slug) + '</span></td>' +
        '<td>' + esc(r.category || '—') + '</td>' +
        '<td>' + esc(r.chains.slice(0, 3).join(', ') || '—') + '</td>' +
        '<td class="num">' + money(r.tvl_usd) + '</td>' +
        '<td class="num value">' + money(r.mcap_usd) + '</td>' +
        '<td class="num">' + pct(r.change_7d) + '</td></tr>';
    });
    return html + '</tbody></table>';
  }
  function renderDetail(slug) {
    var r = null;
    D.rows.forEach(function (row) { if (row.slug === slug) r = row; });
    if (!r) { detailEl.hidden = true; return; }
    var base = r.tvl_usd * r.size_multiple;
    detailEl.innerHTML =
      '<button type="button" class="back" id="back">← Back to the board</button>' +
      '<h2>#' + r.rank + ' — ' + esc(r.name) + '</h2>' +
      '<p>' + tagFor(r) + ' <span class="pill">' + esc(r.category || 'Uncategorised') + '</span> <span class="pill">' + esc(r.chains.join(' · ') || 'No chains listed') + '</span></p>' +
      '<dl class="kv">' +
      '<div><dt>Implied value</dt><dd>' + money(r.implied_value_usd) + '<small>rank ' + r.rank + ' of ' + D.board_size + '</small></dd></div>' +
      '<div><dt>TVL</dt><dd>' + money(r.tvl_usd) + '<small>7d ' + (r.change_7d == null ? 'n/a' : (r.change_7d > 0 ? '+' : '') + r.change_7d.toFixed(1) + '%') + '</small></dd></div>' +
      '<div><dt>Size multiple</dt><dd>' + r.size_multiple.toFixed(3) + '×<small>base ' + money(base) + '</small></dd></div>' +
      '<div><dt>Growth × maturity</dt><dd>' + r.growth_multiplier.toFixed(2) + ' × ' + r.maturity_multiplier.toFixed(2) + '<small>age ' + ageText(r.age_days) + (r.breakout_multiplier > 1 ? ' · breakout ×1.15' : '') + '</small></dd></div>' +
      '</dl>' +
      '<h3>How to farm it</h3>' +
      '<ol class="steps">' + r.farm_steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol>';
    detailEl.hidden = false;
    document.getElementById('back').addEventListener('click', function () { location.hash = '#/board'; });
    detailEl.scrollIntoView();
  }
  function render() {
    var state = parseHash();
    tabBoard.setAttribute('aria-pressed', state.view === 'board' || state.view === 'protocol' ? 'true' : 'false');
    tabLive.setAttribute('aria-pressed', state.view === 'live' ? 'true' : 'false');
    document.getElementById('controls').style.display = state.view === 'live' ? 'none' : 'flex';
    if (state.view === 'live') {
      detailEl.hidden = true;
      mainEl.innerHTML = liveTable();
      countEl.textContent = D.live_size + ' protocols whose token already trades, shown at the market\u2019s own values — kept apart from the ranking.';
      return;
    }
    if (state.view === 'protocol') {
      var rows = filteredRows();
      mainEl.innerHTML = boardTable(rows);
      countEl.textContent = 'Showing ' + rows.length + ' of ' + D.board_size + ' ranked protocols.';
      renderDetail(state.slug);
      return;
    }
    detailEl.hidden = true;
    applyParams(state.params || {});
    var rows2 = filteredRows();
    mainEl.innerHTML = boardTable(rows2);
    countEl.textContent = 'Showing ' + rows2.length + ' of ' + D.board_size + ' ranked protocols. Click a row for its farm plan and model breakdown.';
  }
  function syncHash() {
    if (parseHash().view !== 'board') { location.hash = boardHash(); return; }
    var want = boardHash();
    if (location.hash !== want) { history.replaceState(null, '', want); render(); }
    else render();
  }
  [qEl, catEl, chainEl, tvlEl, sortEl].forEach(function (el) {
    el.addEventListener('input', syncHash);
    el.addEventListener('change', syncHash);
  });
  document.getElementById('clear').addEventListener('click', function () {
    qEl.value = ''; catEl.value = ''; chainEl.value = ''; tvlEl.value = '0'; sortEl.value = 'value';
    location.hash = '#/board';
  });
  tabBoard.addEventListener('click', function () { location.hash = '#/board'; });
  tabLive.addEventListener('click', function () { location.hash = '#/live'; });
  mainEl.addEventListener('click', function (e) {
    var tr = e.target.closest ? e.target.closest('tr[data-slug]') : null;
    if (tr) location.hash = '#/protocol/' + tr.getAttribute('data-slug');
  });
  mainEl.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter') return;
    var tr = e.target.closest ? e.target.closest('tr[data-slug]') : null;
    if (tr) location.hash = '#/protocol/' + tr.getAttribute('data-slug');
  });
  window.addEventListener('hashchange', render);
  render();
})();
