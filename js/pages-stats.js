/* Lottery Intelligence Pro — analysis pages: Dashboard, Hot & Cold, Patterns, About & Data. */
(function () {
  'use strict';

  const L = window.LIP;
  const { C, esc, fmt, ball, balls, columns, state, store } = L;

  function rankList(items, line) {
    if (!items.length) return '<p class="muted small">Not enough drawings in this period.</p>';
    return '<ol class="rank">' + items.map((s, i) =>
      '<li><span class="pos">' + (i + 1) + '</span>' + line(s) + '</li>').join('') + '</ol>';
  }
  const freqLine = (special) => (s) =>
    ball(s.n, special ? 'special sm' : 'sm') +
    '<span class="meta"><b>' + s.count + '×</b> · ' + fmt.fix(s.ratio, 2) + '× expected</span>';
  const comboLine = (c) =>
    '<span class="balls">' + c.nums.map((n) => ball(n, 'sm')).join('') + '</span>' +
    '<span class="meta"><b>' + c.count + '×</b> · last ' + esc(fmt.shortDate(c.last)) + '</span>';

  function freqChart(stats, special, label) {
    const items = stats.filter((s) => s.validNow).map((s) => ({
      label: s.n, value: s.count, tone: fmt.tone(s.z), expected: s.expected,
      title: (special ? label + ' ' : 'Number ') + s.n + ': drawn ' + s.count + ' times, expected ' + s.expected.toFixed(1) + ' (z = ' + fmt.signed(s.z, 2) + ')',
    }));
    return columns(items, { wide: items.length <= 30, values: items.length <= 30, label: label + ' frequency chart' });
  }

  // ------------------------------------------------------------ Dashboard

  L.pages.dashboard = {
    render(v) {
      const g = C.GAMES[v.game];
      const latest = v.all[v.all.length - 1];
      const next = C.nextDraw(v.game);
      const raw = L.RAW[v.game] || {};
      const jack = raw.nextJackpot && raw.nextJackpot.asOf && raw.nextJackpot.asOf.slice(0, 10) > latest.d ? raw.nextJackpot : null;
      const verified = fmt.sources(latest.src);
      const recent = (store.get('recent', []) || []).filter((t) => t.game === v.game).slice(0, 5);

      const head =
        '<div class="grid g4">' +
        '<div class="card span2"><h3>Latest winning numbers</h3>' + balls(latest, 'lg') +
        '<p style="margin-top:10px">' + esc(fmt.date(latest.d)) + (latest.m ? ' · ' + esc(g.multiplier) + ' ' + latest.m + '×' : '') +
        (latest.j ? ' · Jackpot ' + esc(fmt.money(latest.j)) : '') + '</p>' +
        '<p class="small muted">' + (latest.src === 'ny-live'
          ? '<span class="tag warn">Awaiting second source</span> Reported by the New York Gaming Commission.'
          : '<span class="tag ok">Verified</span> Confirmed by ' + verified.length + ' official sources: ' + esc(verified.join(', ')) + '.') + '</p></div>' +
        '<div class="card"><h3>Next drawing</h3>' +
        (next ? '<div class="big">' + esc(fmt.date(next.date, { year: undefined })) + '</div><p class="muted">' + esc(next.time) + (next.daysAway === 0 ? ' · today' : next.daysAway === 1 ? ' · tomorrow' : '') + '</p>' : '<p class="muted">—</p>') +
        (jack ? '<p>Estimated jackpot <strong>' + esc(fmt.money(jack.amount)) + '</strong>' + (jack.cash ? ' <span class="muted">(cash ' + esc(fmt.money(jack.cash)) + ')</span>' : '') +
          '</p><p class="small muted">From ' + esc(jack.source) + ', ' + esc(fmt.shortDate(jack.asOf.slice(0, 10))) + '.</p>'
          : '<p class="small muted">See <a href="' + g.official + '" target="_blank" rel="noopener">' + esc(g.official.replace('https://www.', '')) + '</a> for the current jackpot.</p>') +
        '</div>' +
        '<div class="card"><h3>Drawings analyzed</h3><div class="big">' + fmt.int(v.draws.length) + '</div>' +
        '<p class="muted">' + esc(L.periodLabel()) + '</p>' +
        '<p class="small muted">' + esc(fmt.shortDate(v.draws[0].d)) + ' – ' + esc(fmt.shortDate(v.draws[v.draws.length - 1].d)) + ' · ' + v.eras.length + ' game format' + (v.eras.length > 1 ? 's' : '') + '</p></div>' +
        '</div>';

      const lists =
        '<div class="grid g4">' +
        '<div class="card"><h3>Top 10 hot numbers</h3>' + rankList(L.ranked(v.white, 'hot', 10), freqLine(false)) + '</div>' +
        '<div class="card"><h3>Top 10 cold numbers</h3>' + rankList(L.ranked(v.white, 'cold', 10), freqLine(false)) + '</div>' +
        '<div class="card"><h3>Top 5 hot ' + esc(g.special) + 's</h3>' + rankList(L.ranked(v.special, 'hot', 5), freqLine(true)) +
        '<h3 style="margin-top:16px">Top 5 cold ' + esc(g.special) + 's</h3>' + rankList(L.ranked(v.special, 'cold', 5), freqLine(true)) + '</div>' +
        '<div class="card"><h3>Longest current absence</h3>' + rankList(L.ranked(v.white, 'overdue', 10), (s) =>
          ball(s.n, 'sm') + '<span class="meta"><b>' + (s.drawsSince < 0 ? 'never' : s.drawsSince + ' drawings') + '</b>' + (s.lastSeen ? ' · ' + esc(fmt.shortDate(s.lastSeen)) : '') + '</span>') + '</div>' +
        '</div>';

      const charts =
        '<div class="grid g3">' +
        '<div class="card span2"><h3>Main number frequency</h3>' + freqChart(v.white, false, 'Main number') + L.TONE_LEGEND + '</div>' +
        '<div class="card"><h3>' + esc(g.special) + ' frequency</h3>' + freqChart(v.special, true, g.special) + '</div>' +
        '</div>';

      const combos =
        '<div class="grid g3">' +
        '<div class="card"><h3>Most common pairs</h3>' + rankList(v.pairs.slice(0, 8), comboLine) + '</div>' +
        '<div class="card"><h3>Most common triplets</h3>' + rankList(v.triplets.slice(0, 8), comboLine) + '</div>' +
        '<div class="card"><h3>Recently generated</h3>' +
        (recent.length ? recent.map((t) => '<p>' + balls(t, 'sm') + '<br><span class="small muted">' + esc((C.strategyByKey(t.strategy) || {}).name || '') + '</span></p>').join('')
          : '<p class="muted small">Nothing yet.</p>') +
        '<a class="btn primary" href="#generator">Open the number generator</a></div>' +
        '</div>';

      return '<div class="page-head"><h2>' + esc(g.name) + ' dashboard</h2><p>' + esc(L.periodLabel()) + ' · ' + fmt.int(v.draws.length) + ' drawings</p></div>' +
        L.multiEraNote(v) + head + lists + charts + combos +
        '<div class="note"><strong>Hot</strong> and <strong>cold</strong> describe what already happened. Each drawing is independent, so a hot number is not “due to continue” and an absent number is not “due to appear”.</div>';
    },
  };

  // ------------------------------------------------------------ Hot & Cold

  const hc = { kind: 'white', sort: 'ratio', dir: -1, retired: false };
  const HC_COLUMNS = [
    ['n', '#', 'Ball number'], ['count', 'Drawn', 'Times drawn in the period'], ['pct', '% draws', 'Share of drawings (in which it was eligible) that included it'],
    ['expected', 'Expected', 'Expected count for a fair drawing under the rules in force'], ['diff', 'Diff', 'Drawn minus expected'],
    ['ratio', 'Obs/Exp', 'Observed divided by expected (1.00 = exactly as expected)'], ['z', 'z-score', 'Standard deviations above or below expected'],
    ['last25', 'L25', 'Times drawn in the last 25 drawings of the period'], ['last50', 'L50', 'Last 50 drawings'], ['last100', 'L100', 'Last 100 drawings'], ['last500', 'L500', 'Last 500 drawings'],
    ['drawsSince', 'Since', 'Drawings since it last appeared (whole history)'], ['lastSeen', 'Last seen', 'Date it last appeared'],
    ['longestGap', 'Longest gap', 'Longest run of drawings without it in the period'], ['avgGap', 'Avg gap', 'Average drawings between appearances'],
    ['trend', 'Trend', 'Recent observed/expected minus whole-period observed/expected'],
  ];

  function hcRows(v) {
    const stats = (hc.kind === 'white' ? v.white : v.special).filter((s) => (hc.retired || s.validNow) && s.eligible > 0);
    const key = hc.sort;
    return stats.slice().sort((a, b) => {
      const x = a[key] == null ? -Infinity : a[key];
      const y = b[key] == null ? -Infinity : b[key];
      return (x < y ? -1 : x > y ? 1 : 0) * hc.dir || a.n - b.n;
    });
  }

  function hcTags(s, cut) {
    let t = '';
    if (!s.validNow) return '<span class="tag">retired</span>';
    if (s.last50 >= cut.recent && s.last50 > 0) t += '<span class="tag hot" title="Among the most drawn in the last 50 drawings">recent hot</span>';
    if (s.ratio >= cut.high) t += '<span class="tag hot" title="Among the most drawn over the whole period">long-term</span>';
    if (s.ratio <= cut.low) t += '<span class="tag cold" title="Among the least drawn over the whole period">cold</span>';
    return t;
  }

  L.pages['hot-cold'] = {
    render(v) {
      const g = C.GAMES[v.game];
      const special = hc.kind === 'special';
      const stats = special ? v.special : v.white;
      const usable = stats.filter((s) => s.validNow && s.eligible > 0);
      const rows = hcRows(v);
      const tenth = Math.max(1, Math.round(usable.length / 10));
      const byRatio = usable.slice().sort((a, b) => b.ratio - a.ratio);
      const byRecent = usable.slice().sort((a, b) => b.last50 - a.last50);
      const cut = { high: byRatio[tenth - 1].ratio, low: byRatio[byRatio.length - tenth].ratio, recent: byRecent[tenth - 1].last50 };
      const bonferroni = 0.05 / usable.length;
      const test = C.uniformityTest(usable);
      const sm = special ? 'special sm' : 'sm';
      const trendN = usable[0].trendWindow;

      const cards =
        '<div class="grid g4">' +
        '<div class="card"><h3>Recently hot · last 50 drawings</h3>' + rankList(L.ranked(stats, 'recent', 8), (s) => ball(s.n, sm) + '<span class="meta"><b>' + s.last50 + '×</b> in last 50</span>') + '</div>' +
        '<div class="card"><h3>Long-term frequent · whole period</h3>' + rankList(L.ranked(stats, 'hot', 8), freqLine(special)) + '</div>' +
        '<div class="card"><h3>Fastest rising</h3>' + rankList(L.ranked(stats, 'rising', 8), (s) => ball(s.n, sm) + '<span class="meta"><b>' + fmt.signed(s.trend, 2) + '</b> vs. period</span>') +
        '<p class="small muted" style="margin-top:8px">Last ' + trendN + ' drawings compared with the whole period.</p></div>' +
        '<div class="card"><h3>Closest to expected</h3>' + rankList(L.ranked(stats, 'near', 8), (s) => ball(s.n, sm) + '<span class="meta"><b>' + s.count + '×</b> vs ' + fmt.fix(s.expected, 1) + ' expected</span>') + '</div>' +
        '</div>';

      const heat = '<div class="card" style="margin-bottom:14px"><h3>' + (special ? esc(g.special) : 'Main number') + ' heatmap — tap a number for details</h3><div class="heat">' +
        stats.filter((s) => (hc.retired || s.validNow) && s.eligible > 0).map((s) =>
          '<button type="button" data-action="hc-detail" data-n="' + s.n + '" class="' + fmt.tone(s.z) + (s.validNow ? '' : ' retired') + '" title="Drawn ' + s.count + ' times, expected ' + s.expected.toFixed(1) + '">' +
          '<b>' + s.n + '</b><span>' + s.count + '×</span></button>').join('') +
        '</div>' + L.TONE_LEGEND + '</div>';

      const table = '<div class="table-wrap" style="max-height:70vh;overflow:auto"><table><thead><tr>' +
        HC_COLUMNS.map((c) => '<th scope="col" title="' + esc(c[2]) + '"' + (hc.sort === c[0] ? ' aria-sort="' + (hc.dir < 0 ? 'descending' : 'ascending') + '"' : '') + '>' +
          '<button type="button" data-action="hc-sort" data-key="' + c[0] + '">' + esc(c[1]) + (hc.sort === c[0] ? (hc.dir < 0 ? ' ▼' : ' ▲') : '') + '</button></th>').join('') +
        '</tr></thead><tbody>' +
        rows.map((s) => {
          const sig = s.p < bonferroni ? '**' : s.p < 0.05 ? '*' : '';
          return '<tr><td>' + ball(s.n, sm) + hcTags(s, cut) + '</td><td>' + s.count + '</td><td>' + fmt.fix(s.pct, 2) + '%</td><td>' + fmt.fix(s.expected, 1) + '</td>' +
            '<td class="' + (s.diff > 0 ? 'pos' : 'neg') + '">' + fmt.signed(s.diff, 1) + '</td><td>' + fmt.fix(s.ratio, 2) + '</td>' +
            '<td class="' + (s.z > 0 ? 'pos' : 'neg') + '">' + fmt.signed(s.z, 2) + sig + '</td>' +
            '<td>' + s.last25 + '</td><td>' + s.last50 + '</td><td>' + s.last100 + '</td><td>' + s.last500 + '</td>' +
            '<td>' + (s.drawsSince < 0 ? '—' : s.drawsSince) + '</td><td>' + esc(s.lastSeen ? fmt.shortDate(s.lastSeen) : '—') + '</td>' +
            '<td>' + s.longestGap + '</td><td>' + fmt.fix(s.avgGap, 1) + '</td>' +
            '<td class="' + (s.trend > 0 ? 'pos' : 'neg') + '">' + (s.trend > 0.15 ? '▲ ' : s.trend < -0.15 ? '▼ ' : '') + fmt.signed(s.trend, 2) + '</td></tr>';
        }).join('') + '</tbody></table></div>';

      const flagged = usable.filter((s) => s.p < 0.05).length;
      const strong = usable.filter((s) => s.p < bonferroni).length;
      const sigNote = '<div class="note"><strong>Reading the significance marks.</strong> <code>*</code> = more than about 2 standard deviations from expected (p &lt; 0.05 for that number alone); ' +
        '<code>**</code> = still unusual after allowing for the fact that ' + usable.length + ' numbers are being compared at once. ' +
        'With ' + usable.length + ' numbers, roughly ' + Math.max(1, Math.round(usable.length * 0.05)) + ' can be expected to earn a <code>*</code> by chance alone; this period has ' + flagged + ' (and ' + strong + ' with <code>**</code>). ' +
        (test ? 'Overall uniformity test: χ² = ' + test.stat.toFixed(1) + ' on ' + test.df + ' degrees of freedom, p = ' + test.p.toFixed(3) + ' — ' +
          (test.p >= 0.05 ? 'consistent with fair, random drawings.' : 'lower than usual, but a small p-value on past data still says nothing about which numbers come next.') : '') +
        ' Even a real past imbalance would not make any number more likely in the next drawing.</div>';

      return '<div class="page-head"><h2>Hot &amp; cold numbers</h2><p>' + esc(g.name) + ' · ' + esc(L.periodLabel()) + ' · ' + fmt.int(v.draws.length) + ' drawings</p></div>' +
        L.multiEraNote(v) +
        '<div class="toolbar"><div class="seg" role="group" aria-label="Ball type">' +
        '<button type="button" data-action="hc-kind" data-kind="white" aria-pressed="' + !special + '">Main numbers</button>' +
        '<button type="button" data-action="hc-kind" data-kind="special" aria-pressed="' + special + '">' + esc(g.special) + '</button></div>' +
        '<label class="small muted"><input type="checkbox" data-change="hc-retired"' + (hc.retired ? ' checked' : '') + '> Show numbers no longer in play</label>' +
        '<span class="spacer"></span><button type="button" class="btn" data-action="hc-export">Export table (CSV)</button></div>' +
        cards + heat + table + sigNote;
    },
  };

  L.actions['hc-kind'] = (el) => { hc.kind = el.dataset.kind; L.render(); };
  L.actions['hc-sort'] = (el) => {
    const key = el.dataset.key;
    if (hc.sort === key) hc.dir = -hc.dir;
    else { hc.sort = key; hc.dir = key === 'n' ? 1 : -1; }
    L.render();
  };
  L.changes['hc-retired'] = (el) => { hc.retired = el.checked; L.render(); };
  L.actions['hc-export'] = () => {
    const v = L.view();
    const rows = hcRows(v).map((s) => [s.n, s.validNow ? 'yes' : 'no', s.count, s.eligible, s.pct.toFixed(3), s.expected.toFixed(2), s.diff.toFixed(2), s.ratio.toFixed(4), s.z.toFixed(3), s.p.toFixed(4),
      s.last25, s.last50, s.last100, s.last500, s.drawsSince < 0 ? '' : s.drawsSince, s.lastSeen || '', s.longestGap, s.avgGap == null ? '' : s.avgGap.toFixed(2), s.trend.toFixed(4)]);
    L.download(v.game + '-' + hc.kind + '-number-stats.csv', C.toCsv(
      ['Number', 'In play today', 'Times drawn', 'Eligible drawings', '% of drawings', 'Expected', 'Difference', 'Observed/Expected', 'z-score', 'p-value',
        'Last 25', 'Last 50', 'Last 100', 'Last 500', 'Drawings since last seen', 'Last seen', 'Longest gap', 'Average gap', 'Trend'], rows));
  };
  L.actions['hc-detail'] = (el) => {
    const v = L.view();
    const g = C.GAMES[v.game];
    const special = hc.kind === 'special';
    const s = (special ? v.special : v.white).filter((x) => x.n === +el.dataset.n)[0];
    if (!s) return;
    const partners = special ? C.whitesWithSpecial(v.draws, s.n, 6).rows
      : v.pairs.filter((p) => p.nums.indexOf(s.n) !== -1).slice(0, 6).map((p) => ({ n: p.nums[0] === s.n ? p.nums[1] : p.nums[0], count: p.count }));
    L.openDialog(
      '<div class="row" style="justify-content:space-between"><h2>' + ball(s.n, special ? 'special lg' : 'lg') + ' &nbsp;' + (special ? esc(g.special) : 'Main number') + ' ' + s.n + '</h2>' +
      '<button type="button" class="btn" data-action="close-dialog">Close</button></div>' +
      '<p class="muted">' + esc(L.periodLabel()) + (s.validNow ? '' : ' · no longer in play') + '</p>' +
      '<dl class="kv"><dt>Times drawn</dt><dd>' + s.count + ' of ' + s.eligible + ' eligible drawings (' + fmt.fix(s.pct, 2) + '%)</dd>' +
      '<dt>Expected</dt><dd>' + fmt.fix(s.expected, 1) + ' → difference ' + fmt.signed(s.diff, 1) + ' (z = ' + fmt.signed(s.z, 2) + ', p = ' + s.p.toFixed(3) + ')</dd>' +
      '<dt>Recent</dt><dd>' + s.last25 + ' in last 25 · ' + s.last50 + ' in last 50 · ' + s.last100 + ' in last 100 · ' + s.last500 + ' in last 500</dd>' +
      '<dt>Last seen</dt><dd>' + (s.lastSeen ? esc(fmt.date(s.lastSeen)) + ' — ' + s.drawsSince + ' drawing' + (s.drawsSince === 1 ? '' : 's') + ' ago' : 'not in this history') + '</dd>' +
      '<dt>Gaps</dt><dd>longest ' + s.longestGap + ' drawings · average ' + fmt.fix(s.avgGap, 1) + '</dd>' +
      '<dt>Trend</dt><dd>' + fmt.signed(s.trend, 2) + ' (last ' + s.trendWindow + ' drawings vs. the whole period)</dd>' +
      '<dt>Most often drawn with</dt><dd><span class="balls">' + (partners.length ? partners.map((p) => '<span class="ballcap">' + ball(p.n, 'sm') + '<small>' + p.count + '×</small></span>').join('') : '—') + '</span></dd></dl>');
  };

  // ------------------------------------------------------------ Patterns

  const pt = { special: 1 };

  function distChart(dist, labelFn, total, wide) {
    return columns(dist.map((count, i) => ({
      label: labelFn(i), value: count, show: total ? Math.round((100 * count) / total) + '%' : '0%',
      title: labelFn(i) + ': ' + count + ' drawings', tone: 't-accent',
    })), { wide: wide !== false, label: 'Distribution chart' });
  }

  L.pages.patterns = {
    render(v) {
      const g = C.GAMES[v.game];
      const p = v.patterns;
      const n = p.draws;
      const cur = C.currentEra(v.game);
      if (pt.special > cur.specialMax) pt.special = 1;
      const companions = C.whitesWithSpecial(v.draws, pt.special, 10);
      const repeats = C.repeatedCombos(v.draws);
      const windows = [25, 50, 100, 500].filter((w) => w < n).map((w) => ({ label: 'Last ' + w, st: C.patternStats(v.draws.slice(-w), v.game) }));
      windows.push({ label: 'Whole period (' + n + ')', st: p });
      const modal = (dist) => dist.indexOf(Math.max.apply(null, dist));
      const comboTable = (list, cols) => '<div class="table-wrap" style="max-height:420px;overflow:auto"><table><thead><tr><th scope="col">' + cols + '</th><th scope="col">Drawn together</th><th scope="col">Last time</th></tr></thead><tbody>' +
        list.map((c) => '<tr><td><span class="balls">' + c.nums.map((x) => ball(x, 'sm')).join('') + '</span></td><td>' + c.count + '</td><td>' + esc(fmt.shortDate(c.last)) + '</td></tr>').join('') + '</tbody></table></div>';

      return '<div class="page-head"><h2>Number patterns</h2><p>' + esc(g.name) + ' · ' + esc(L.periodLabel()) + ' · ' + fmt.int(n) + ' drawings</p></div>' +
        '<div class="note"><strong>Descriptive statistics, not predictions.</strong> These charts summarise what was drawn. Pairs and triplets are real co-occurrences counted from the results; with thousands of possible pairs, some will always lead by chance.</div>' +
        L.multiEraNote(v) +

        '<div class="grid g3">' +
        '<div class="card"><h3>Odd vs. even</h3>' + distChart(p.oddDist, (i) => i + ' odd', n) + '<p class="small muted">Number of odd main numbers per drawing.</p></div>' +
        '<div class="card"><h3>Low vs. high</h3>' + distChart(p.lowDist, (i) => i + ' low', n) + '<p class="small muted">“Low” is the bottom half of the range in force (today 1–' + Math.floor(cur.whiteMax / 2) + ').</p></div>' +
        '<div class="card"><h3>Repeats from the previous drawing</h3>' + distChart(p.repeatDist, (i) => i + '', p.repeatBase) + '<p class="small muted">Main numbers that also appeared in the drawing before.</p></div>' +
        '</div>' +

        '<div class="grid g2">' +
        '<div class="card"><h3>Sum of the five main numbers</h3>' + columns(p.sum.histogram.map((b) => ({ label: b.from, value: b.count, title: 'Sum ' + b.label + ': ' + b.count + ' drawings', tone: 't-accent' })), { label: 'Sum distribution' }) +
        '<p class="small muted">Average ' + fmt.fix(p.sum.mean, 1) + ' · median ' + p.sum.median + ' · lowest ' + p.sum.min + ' · highest ' + p.sum.max + '. Bars are 20-wide groups.</p></div>' +
        '<div class="card"><h3>Spread (largest minus smallest)</h3>' + columns(p.spread.histogram.map((b) => ({ label: b.from, value: b.count, title: 'Spread ' + b.label + ': ' + b.count + ' drawings', tone: 't-accent' })), { wide: true, label: 'Spread distribution' }) +
        '<p class="small muted">Average spread ' + fmt.fix(p.spread.mean, 1) + '.</p></div>' +
        '</div>' +

        '<div class="grid g3">' +
        '<div class="card"><h3>Consecutive numbers</h3><div class="big">' + fmt.pct(n ? p.withConsecutive / n : 0, 1) + '</div><p class="muted">of drawings had at least one consecutive pair (e.g. 23–24).</p>' +
        distChart(p.consecDist.slice(0, 4), (i) => i + ' pair' + (i === 1 ? '' : 's'), n) + '</div>' +
        '<div class="card"><h3>Frequency by decade</h3>' + columns(p.decades.map((d) => ({ label: d.label, value: d.count, tone: 't-accent' })), { wide: true, label: 'Decade frequency' }) + '</div>' +
        '<div class="card"><h3>Frequency by last digit</h3>' + columns(p.lastDigit.map((c, i) => ({ label: 'x' + i, value: c, title: 'Numbers ending in ' + i + ': ' + c, tone: 't-accent' })), { wide: true, label: 'Last digit frequency' }) + '</div>' +
        '</div>' +

        '<div class="grid g2">' +
        '<div class="card"><h3>Most frequent pairs</h3>' + comboTable(v.pairs.slice(0, 25), 'Pair') + '</div>' +
        '<div class="card"><h3>Most frequent triplets</h3>' + comboTable(v.triplets.slice(0, 25), 'Triplet') + '</div>' +
        '</div>' +

        '<div class="grid g2">' +
        '<div class="card"><h3>Pair co-occurrence matrix</h3><canvas id="matrix" aria-label="Pair co-occurrence matrix"></canvas><p class="small muted" id="matrix-tip">Brighter = drawn together more often. Move over the grid to read a pair.</p></div>' +
        '<div class="card"><h3>Main numbers drawn with a given ' + esc(g.special) + '</h3>' +
        '<div class="row" style="margin-bottom:10px"><label for="pt-special">' + esc(g.special) + '</label><select id="pt-special" data-change="pt-special">' +
        Array.from({ length: cur.specialMax }, (_, i) => '<option value="' + (i + 1) + '"' + (pt.special === i + 1 ? ' selected' : '') + '>' + (i + 1) + '</option>').join('') + '</select>' +
        '<span class="muted small">drawn ' + companions.draws + ' times in this period</span></div>' +
        (companions.rows.length ? '<span class="balls">' + companions.rows.map((r) => '<span class="ballcap">' + ball(r.n) + '<small>' + r.count + '×</small></span>').join('') + '</span>' : '<p class="muted">Not drawn in this period.</p>') +
        '<h3 style="margin-top:18px">Repeated five-number combinations</h3>' +
        (repeats.length ? repeats.map((r) => '<p>' + r.nums.map((x) => ball(x, 'sm')).join(' ') + ' <span class="small muted">' + r.dates.map(fmt.shortDate).join(', ') + '</span></p>').join('')
          : '<p class="muted">None — no set of five main numbers was drawn twice in this period.</p>') +
        '</div></div>' +

        '<div class="grid g2">' +
        '<div class="card"><h3>Recent windows compared</h3><div class="table-wrap"><table><thead><tr><th scope="col">Window</th><th scope="col">Avg sum</th><th scope="col">Most common split</th><th scope="col">With consecutive</th><th scope="col">Avg spread</th></tr></thead><tbody>' +
        windows.map((w) => '<tr><td>' + esc(w.label) + '</td><td>' + fmt.fix(w.st.sum.mean, 1) + '</td><td>' + modal(w.st.oddDist) + ' odd / ' + (5 - modal(w.st.oddDist)) + ' even</td><td>' +
          fmt.pct(w.st.draws ? w.st.withConsecutive / w.st.draws : 0, 0) + '</td><td>' + fmt.fix(w.st.spread.mean, 1) + '</td></tr>').join('') +
        '</tbody></table></div>' +
        '<h3 style="margin-top:18px">By month</h3><div class="table-wrap"><table><thead><tr><th scope="col">Month</th><th scope="col">Drawings</th><th scope="col">Avg sum</th></tr></thead><tbody>' +
        p.byMonth.map((m) => '<tr><td>' + new Date(Date.UTC(2020, m.month - 1, 1)).toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' }) + '</td><td>' + m.draws + '</td><td>' + (m.draws ? fmt.fix(m.avgSum, 1) : '—') + '</td></tr>').join('') +
        '</tbody></table></div></div>' +
        '<div class="card"><h3>Year by year</h3><div class="table-wrap" style="max-height:640px;overflow:auto"><table><thead><tr><th scope="col">Year</th><th scope="col">Drawings</th><th scope="col">Avg sum</th><th scope="col">Most drawn main</th><th scope="col">Most drawn ' + esc(g.special) + '</th></tr></thead><tbody>' +
        p.byYear.slice().reverse().map((y) => '<tr><td>' + y.year + '</td><td>' + y.draws + '</td><td>' + fmt.fix(y.avgSum, 1) + '</td><td>' + ball(y.topWhite.n, 'sm') + ' ' + y.topWhite.count + '×</td><td>' + ball(y.topSpecial.n, 'special sm') + ' ' + y.topSpecial.count + '×</td></tr>').join('') +
        '</tbody></table></div></div>' +
        '</div>';
    },

    after(main, v) {
      const canvas = L.$('#matrix', main);
      if (!canvas) return;
      const max = C.currentEra(v.game).whiteMax;
      const pm = C.pairMatrix(v.draws, max);
      const cell = 6;
      canvas.width = canvas.height = max * cell;
      const ctx = canvas.getContext('2d');
      let top = 1;
      for (let i = 0; i < pm.m.length; i++) if (pm.m[i] > top) top = pm.m[i];
      const accent = getComputedStyle(document.body).getPropertyValue('--accent').trim() || '#e63946';
      ctx.fillStyle = '#0e1626';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = accent;
      for (let a = 1; a <= max; a++) {
        for (let b = 1; b <= max; b++) {
          const c = pm.m[a * pm.n + b];
          if (!c) continue;
          ctx.globalAlpha = 0.15 + 0.85 * (c / top);
          ctx.fillRect((b - 1) * cell, (a - 1) * cell, cell - 1, cell - 1);
        }
      }
      ctx.globalAlpha = 1;
      const tip = L.$('#matrix-tip', main);
      canvas.addEventListener('mousemove', (e) => {
        const r = canvas.getBoundingClientRect();
        const b = Math.floor(((e.clientX - r.left) / r.width) * max) + 1;
        const a = Math.floor(((e.clientY - r.top) / r.height) * max) + 1;
        if (a < 1 || b < 1 || a > max || b > max) return;
        tip.textContent = a === b ? 'Number ' + a : a + ' & ' + b + ': drawn together ' + pm.m[a * pm.n + b] + ' time' + (pm.m[a * pm.n + b] === 1 ? '' : 's') + ' in this period.';
      });
    },
  };

  L.changes['pt-special'] = (el) => { pt.special = +el.value; L.render(); };

  // ------------------------------------------------------------ About & Data

  L.pages.about = {
    needsPeriod: false,
    render(v) {
      const g = C.GAMES[v.game];
      const raw = L.RAW[v.game] || {};
      const cov = C.coverage(v.game, v.all);
      const live = v.all.filter((x) => x.src === 'ny-live').length;
      const sources = raw.sources || {};
      const conflicts = raw.conflicts || [];

      const sourceRows = Object.keys(sources).map((key) => {
        const s = sources[key];
        return '<tr><td class="l"><a href="' + esc(s.url) + '" target="_blank" rel="noopener">' + esc(s.name) + '</a></td><td>' + (s.records != null ? fmt.int(s.records) : '—') + '</td>' +
          '<td>' + (s.first ? esc(fmt.shortDate(s.first)) + ' – ' + esc(fmt.shortDate(s.last)) : '—') + '</td>' +
          '<td>' + (s.ok ? '<span class="tag ok">ok</span>' : '<span class="tag warn" title="' + esc(s.error || '') + '">unreachable at last update</span>') + '</td></tr>';
      }).join('');

      const eraRows = g.eras.slice().reverse().map((era) => {
        const t = C.theoreticalReturn(era);
        const inData = v.all.filter((x) => C.eraFor(v.game, x.d) === era).length;
        return '<tr><td class="l">' + esc(fmt.shortDate(era.from)) + '</td><td>5 of ' + era.whiteMax + '</td><td>1 of ' + era.specialMax + '</td><td>$' + era.price + '</td>' +
          '<td>1 in ' + fmt.int(t.jackpotOdds) + '</td><td>1 in ' + fmt.fix(1 / t.anyPrize, 1) + '</td><td>' + fmt.int(inData) + '</td></tr>';
      }).join('');

      return '<div class="page-head"><h2>About &amp; data</h2><p>' + esc(g.name) + '</p></div>' +
        '<div class="grid g4">' +
        '<div class="card"><h3>Drawings on file</h3><div class="big">' + fmt.int(cov.count) + '</div><p class="muted">' + esc(fmt.shortDate(cov.first)) + ' – ' + esc(fmt.shortDate(cov.last)) + '</p></div>' +
        '<div class="card"><h3>Verified by 2+ sources</h3><div class="big">' + fmt.int(v.all.filter((x) => x.src.split(',').length > 1).length) + '</div><p class="muted">' + (live ? live + ' newer drawing' + (live > 1 ? 's' : '') + ' awaiting a second source' : 'every drawing on file') + '</p></div>' +
        '<div class="card"><h3>Missing scheduled dates</h3><div class="big">' + cov.missing.length + '</div><p class="muted">' + (cov.missing.length ? esc(cov.missing.slice(0, 6).join(', ')) : 'none — complete schedule') + '</p></div>' +
        '<div class="card"><h3>Snapshot updated</h3><div class="big" style="font-size:20px">' + (raw.generatedAt ? esc(fmt.date(raw.generatedAt.slice(0, 10))) : '—') + '</div><p class="muted">Use ↻ Refresh for anything newer.</p></div>' +
        '</div>' +

        '<div class="card" style="margin-bottom:14px"><h3>Where the numbers come from</h3>' +
        '<p>Every drawing is downloaded from official lottery sources and kept only if the sources agree. Nothing on this page is simulated or made up.</p>' +
        '<div class="table-wrap"><table><thead><tr><th scope="col">Source</th><th scope="col">Records used</th><th scope="col">Covers</th><th scope="col">Status</th></tr></thead><tbody>' + sourceRows + '</tbody></table></div>' +
        (v.game === 'powerball'
          ? '<p class="small muted" style="margin-top:10px">Texas and New York only joined Powerball in 2010, so drawings from October 2006 to January 2010 are verified against the North Carolina Education Lottery, powerball.com’s own results pages, and powerball.com’s original winning-numbers file (as preserved by the Internet Archive).</p>'
          : '<p class="small muted" style="margin-top:10px">Jackpot amounts come from the North Carolina Education Lottery, which joined Mega Millions in 2010 — earlier jackpots are left blank rather than guessed.</p>') +
        (conflicts.length
          ? '<h3 style="margin-top:14px">Disagreements between sources</h3><p class="small muted">When sources disagree, the published record is never silently replaced. The majority reading is kept and the difference is listed here.</p>' +
            '<div class="table-wrap"><table><thead><tr><th scope="col">Date</th><th scope="col">Kept</th><th scope="col">Confirmed by</th><th scope="col">Differing value</th><th scope="col">From</th></tr></thead><tbody>' +
            conflicts.map((c) => '<tr><td class="l">' + esc(fmt.shortDate(c.d)) + '</td><td>' + esc(c.kept || 'unresolved') + '</td><td>' + esc(fmt.sources(c.keptSources).join(', ')) + '</td><td>' + esc(c.differs) + '</td><td>' + esc(fmt.sources(c.sources).join(', ')) + '</td></tr>').join('') +
            '</tbody></table></div>'
          : '<p class="small muted">No disagreements between sources.</p>') +
        '</div>' +

        '<div class="card" style="margin-bottom:14px"><h3>Game formats over time</h3>' +
        '<div class="table-wrap"><table><thead><tr><th scope="col">First drawing</th><th scope="col">Main numbers</th><th scope="col">' + esc(g.special) + '</th><th scope="col">Ticket</th><th scope="col">Jackpot odds</th><th scope="col">Any prize</th><th scope="col">Drawings on file</th></tr></thead><tbody>' + eraRows + '</tbody></table></div>' +
        '<p class="small muted" style="margin-top:10px">Each drawing is checked and analysed under the rules in force on its date. The generator only ever produces numbers that are valid in today’s format.</p></div>' +

        '<div class="grid g2">' +
        '<div class="card"><h3>How the statistics are calculated</h3>' +
        '<p><strong>Expected count.</strong> For each drawing in which a number was eligible, add its chance of being drawn: 5 ÷ pool size for a main number, 1 ÷ pool size for the ' + esc(g.special) + '. Summing drawing by drawing handles format changes exactly.</p>' +
        '<p><strong>Observed ÷ expected.</strong> Times drawn divided by the expected count. 1.00 means exactly as expected; hot/cold rankings use this ratio.</p>' +
        '<p><strong>z-score.</strong> (drawn − expected) ÷ √(Σ p·(1−p)), the number of standard deviations from expected.</p>' +
        '<p><strong>Gaps.</strong> Counted in drawings. “Since” is drawings since the last appearance; “longest gap” includes the current absence.</p>' +
        '<p><strong>Trend.</strong> Observed ÷ expected in the most recent drawings (up to 50) minus the same ratio over the whole period.</p>' +
        '<p><strong>Pairs and triplets.</strong> Counted directly from numbers drawn in the same drawing.</p></div>' +
        '<div class="card"><h3>What this page can and cannot do</h3>' +
        '<p>Lottery drawings are independent: the machine has no memory. A number that came up often is not more likely next time, and a number that has been absent is not “due”.</p>' +
        '<p>Every valid ticket has exactly the same chance of winning the jackpot — today 1 in ' + fmt.int(C.theoreticalReturn(C.currentEra(v.game)).jackpotOdds) + ' for ' + esc(g.name) + '. The generator’s strategies change <em>which</em> numbers you play, never your odds. The Backtest tab lets you check this against 20 years of real results.</p>' +
        '<p>Nothing here is machine learning or prediction; the “strategies” are simple, documented weightings of historical counts.</p>' +
        '<p class="muted small">Prize amounts are the standard published base prizes (no add-on multiplier). Actual prizes can differ — for example California pays pari-mutuel amounts — and jackpots are shared between winners.</p></div>' +
        '</div>' +

        '<div class="card"><h3>Keeping the data current</h3>' +
        '<p>A scheduled GitHub Action runs <code>node scripts/update-data.js</code> twice a day, re-downloads every source, cross-checks them and commits any new drawings. Between runs, the ↻ Refresh button (and each page load) asks New York’s open-data service for anything newer; those drawings are marked “awaiting verification” until the next scheduled update confirms them.</p>' +
        '<p class="muted small">Saved tickets and settings live only in this browser. Not affiliated with or endorsed by any lottery.</p></div>';
    },
  };
})();
