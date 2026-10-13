/* Lottery Intelligence Pro — tool pages: Generator, Results, Backtest, My Tickets. */
(function () {
  'use strict';

  const L = window.LIP;
  const { C, $, esc, fmt, ball, balls, columns, state, store } = L;

  const pad2 = (n) => String(n).padStart(2, '0');
  const today = () => new Date().toISOString().slice(0, 10);
  const strategyName = (key) => (key === 'manual' ? 'Entered by hand' : (C.strategyByKey(key) || { name: key }).name);
  const ticketText = (game, t) => t.w.map(pad2).join(' ') + '  ' + C.GAMES[game].special + ' ' + pad2(t.s);

  function tierLabel(game, tier) {
    const parts = tier.split('+');
    const sp = C.GAMES[game].special;
    if (parts[0] === '0') return sp + ' only';
    return parts[0] + (parts[1] === '1' ? ' + ' + sp : '');
  }
  function prizeText(prize) {
    if (!prize) return 'No prize';
    if (prize.jackpot) return 'JACKPOT';
    return prize.amount === prize.max ? fmt.dollars(prize.amount) : fmt.dollars(prize.amount) + '–' + fmt.dollars(prize.max);
  }

  // ------------------------------------------------------------ saved tickets (shared)

  const getSaved = () => store.get('tickets', []) || [];
  const setSaved = (list) => store.set('tickets', list);
  const isSaved = (game, t) => getSaved().some((x) => x.game === game && C.ticketKey(x) === C.ticketKey(t));
  function saveTicket(game, t, name) {
    if (isSaved(game, t)) return false;
    const list = getSaved();
    list.unshift({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      game, w: t.w.slice(), s: t.s, name: name || '', fav: false, strategy: t.strategy || 'manual', saved: today(),
    });
    setSaved(list);
    return true;
  }

  // ------------------------------------------------------------ Generator

  const gen = Object.assign({
    strategy: 'hot', count: 5, unique: true, intensity: 3, mixHot: 2, mixCold: 2, recentN: 50, years: 20, pairSize: 2,
    ensemble: { hot: 3, cold: 0, recent: 3, longterm: 2, pairing: 1, random: 2 }, balance: {}, custom: {},
  }, store.get('gen', {}));
  if (!C.strategyByKey(gen.strategy)) gen.strategy = 'hot';
  const saveGen = () => store.set('gen', gen);
  let batch = null;

  function customFor(game) {
    if (!gen.custom[game]) gen.custom[game] = { white: {}, special: {} };
    return gen.custom[game];
  }

  /** Translate the generator settings into the option object the core expects. */
  function coreOpts(game) {
    const cu = customFor(game);
    const o = {
      intensity: gen.intensity, mixHot: gen.mixHot, mixCold: gen.mixCold, recentN: gen.recentN, years: gen.years,
      pairSize: gen.pairSize, ensemble: gen.ensemble, balance: gen.balance[game],
      whiteWeights: {}, locks: [], excludes: [], specialWeights: {}, excludeSpecials: [], lockSpecial: 0,
    };
    Object.keys(cu.white).forEach((n) => {
      if (cu.white[n] === 'boost') o.whiteWeights[n] = 3;
      if (cu.white[n] === 'lock') o.locks.push(+n);
      if (cu.white[n] === 'exclude') o.excludes.push(+n);
    });
    Object.keys(cu.special).forEach((n) => {
      if (cu.special[n] === 'boost') o.specialWeights[n] = 3;
      if (cu.special[n] === 'lock') o.lockSpecial = +n;
      if (cu.special[n] === 'exclude') o.excludeSpecials.push(+n);
    });
    return o;
  }

  function numInput(key, value, min, max, label) {
    return '<label>' + esc(label) + ' <input type="number" min="' + min + '" max="' + max + '" value="' + value + '" data-change="gen-set" data-key="' + key + '"></label>';
  }
  function choice(key, value, options) {
    return '<select data-change="gen-set" data-key="' + key + '">' + options.map((o) => '<option value="' + o[0] + '"' + (String(o[0]) === String(value) ? ' selected' : '') + '>' + esc(o[1]) + '</option>').join('') + '</select>';
  }
  function pickGrid(kind, max, map) {
    return '<div class="pick">' + Array.from({ length: max }, (_, i) => {
      const n = i + 1;
      const st = map[n] || '';
      return '<button type="button" class="' + st + '" data-action="gen-pick" data-kind="' + kind + '" data-n="' + n + '" title="' + (st || 'normal') + '" aria-label="' + n + ' ' + (st || 'normal') + '">' + n + '</button>';
    }).join('') + '</div>';
  }

  function strategyOptions(v) {
    const era = C.currentEra(v.game);
    const g = C.GAMES[v.game];
    const learns = '<p class="small muted">Learns from: <strong>' + esc(L.periodLabel()) + '</strong> (' + fmt.int(v.draws.length) + ' drawings) — change it in the “Analyze” menu at the top.</p>';
    switch (gen.strategy) {
      case 'hot':
      case 'cold':
        return '<div class="field"><label for="g-int">Strength: ' + gen.intensity + ' <span class="muted">(1 = gentle lean, 6 = strong)</span></label>' +
          '<input id="g-int" type="range" min="1" max="6" step="0.5" value="' + gen.intensity + '" data-change="gen-set" data-key="intensity"></div>' + learns;
      case 'mix':
        return '<div class="field"><div class="row">' + numInput('mixHot', gen.mixHot, 0, 5, 'Hot') + numInput('mixCold', gen.mixCold, 0, 5, 'Cold') +
          '<span class="small muted">+ ' + Math.max(0, 5 - gen.mixHot - gen.mixCold) + ' average</span></div></div>' + learns;
      case 'recent':
        return '<div class="field"><label>Look at the most recent</label>' + choice('recentN', gen.recentN, [[25, '25 drawings'], [50, '50 drawings'], [100, '100 drawings']]) + '</div>';
      case 'longterm':
        return '<div class="field"><label>History to use</label>' + choice('years', gen.years, [[5, 'Last 5 years'], [10, 'Last 10 years'], [20, 'Last 20 years']]) + '</div>' +
          '<p class="small muted">Counts are compared with what was expected under the rules in force at each drawing, so numbers added later are not penalised.</p>';
      case 'balanced': {
        const b = Object.assign(C.defaultBalance(era), gen.balance[v.game] || {});
        return '<div class="field"><div class="lab">Odd numbers per ticket</div><div class="row">' + numInput('balance.oddMin', b.oddMin, 0, 5, 'min') + numInput('balance.oddMax', b.oddMax, 0, 5, 'max') + '</div></div>' +
          '<div class="field"><div class="lab">Low numbers (1–' + Math.floor(era.whiteMax / 2) + ') per ticket</div><div class="row">' + numInput('balance.lowMin', b.lowMin, 0, 5, 'min') + numInput('balance.lowMax', b.lowMax, 0, 5, 'max') + '</div></div>' +
          '<div class="field"><div class="lab">Sum of the five numbers</div><div class="row">' + numInput('balance.sumMin', b.sumMin, 15, 400, 'min') + numInput('balance.sumMax', b.sumMax, 15, 400, 'max') + '</div></div>' +
          '<div class="field"><div class="lab">Spread (largest − smallest)</div><div class="row">' + numInput('balance.spreadMin', b.spreadMin, 4, era.whiteMax - 1, 'min') + numInput('balance.spreadMax', b.spreadMax, 4, era.whiteMax - 1, 'max') + '</div></div>' +
          '<button type="button" class="btn ghost" data-action="gen-reset-balance">Reset limits</button>';
      }
      case 'pairing':
        return '<div class="field"><label>Start each ticket from a frequent</label>' + choice('pairSize', gen.pairSize, [[2, 'Pair'], [3, 'Triplet']]) + '</div>' + learns;
      case 'custom': {
        const cu = customFor(v.game);
        return '<p class="small muted">Tap a number to cycle: normal → <span style="color:#ff9a76">boosted ×3</span> → <span style="color:var(--good)">locked in</span> → <s>excluded</s>.</p>' +
          '<div class="field"><div class="lab">Main numbers</div>' + pickGrid('white', era.whiteMax, cu.white) + '</div>' +
          '<div class="field"><div class="lab">' + esc(g.special) + '</div>' + pickGrid('special', era.specialMax, cu.special) + '</div>' +
          '<button type="button" class="btn ghost" data-action="gen-reset-custom">Clear all</button>';
      }
      case 'ensemble':
        return [['hot', 'Hot numbers'], ['cold', 'Cold numbers'], ['recent', 'Recent trends'], ['longterm', 'Long-term frequency'], ['pairing', 'Pairing'], ['random', 'Pure random']].map((s) =>
          '<div class="field"><label>' + s[1] + ': ' + (gen.ensemble[s[0]] || 0) + '</label><input type="range" min="0" max="5" step="1" value="' + (gen.ensemble[s[0]] || 0) + '" data-change="gen-set" data-key="ensemble.' + s[0] + '"></div>').join('') + learns;
      default:
        return '';
    }
  }

  function ticketRow(v, t, i, ctx) {
    const info = C.describeNumbers(t.w, C.currentEra(v.game).whiteMax);
    const cap = (n, stats, cls) => '<span class="ballcap">' + ball(n, cls) + '<small>' + (stats[n] ? stats[n].count : 0) + '×</small></span>';
    const past = ctx.past[t.w.join('-')];
    const saved = isSaved(v.game, t);
    return '<div class="ticket' + (t.dup ? ' dup' : '') + '"><span class="num">#' + (i + 1) + '</span>' +
      '<span class="balls">' + t.w.map((n) => cap(n, ctx.w, '')).join('') + cap(t.s, ctx.s, 'special') + '</span>' +
      '<span class="info">' + (batch.mode === 'each' ? '<strong>' + esc(strategyName(t.strategy)) + '</strong><br>' : '') +
      info.odd + ' odd / ' + info.even + ' even · ' + info.low + ' low / ' + info.high + ' high · sum ' + info.sum +
      (t.dup ? '<br><span class="tag warn">Duplicate in this batch</span>' : '') +
      (past ? '<br><span class="tag">These five were drawn ' + esc(fmt.shortDate(past)) + '</span>' : '') + '</span>' +
      '<span class="actions no-print"><button type="button" class="btn icon' + (saved ? ' on' : '') + '" data-action="gen-save" data-i="' + i + '">' + (saved ? '★ Saved' : '☆ Save') + '</button>' +
      '<button type="button" class="btn icon" data-action="gen-copy" data-i="' + i + '">Copy</button></span></div>';
  }

  L.pages.generator = {
    render(v) {
      const g = C.GAMES[v.game];
      const era = C.currentEra(v.game);
      const strat = C.strategyByKey(gen.strategy);
      const odds = C.theoreticalReturn(era).jackpotOdds;
      const active = batch && batch.game === v.game ? batch : null;
      let results;
      if (active) {
        const ctx = { w: [], s: [], past: {} };
        v.white.forEach((s) => { ctx.w[s.n] = s; });
        v.special.forEach((s) => { ctx.s[s.n] = s; });
        v.all.forEach((x) => { ctx.past[x.w.join('-')] = x.d; });
        results =
          '<div class="toolbar no-print"><button type="button" class="btn primary" data-action="gen-again">↻ Generate again</button>' +
          '<span class="spacer"></span><button type="button" class="btn" data-action="gen-save-all">Save all</button>' +
          '<button type="button" class="btn" data-action="gen-copy-all">Copy all</button><button type="button" class="btn" data-action="gen-export">Export CSV</button>' +
          '<button type="button" class="btn" data-action="gen-print">Print</button></div>' +
          '<p class="small muted">' + esc(g.name) + ' · ' + (active.mode === 'each' ? 'one ticket from each strategy' : esc(strategyName(active.strategy))) + ' · small figures show how often each number was drawn in “' + esc(active.period) + '”.</p>' +
          (active.failed ? '<div class="note"><strong>' + active.failed + ' ticket' + (active.failed > 1 ? 's' : '') + ' could not be generated.</strong> Your limits leave too few valid combinations — loosen them and try again.</div>' : '') +
          active.tickets.map((t, i) => ticketRow(v, t, i, ctx)).join('');
      } else {
        results = '<div class="empty"><p><strong>No tickets yet.</strong></p><p>Choose a strategy on the left and press Generate.</p></div>';
      }

      return '<div class="page-head"><h2>Smart number generator</h2><p>' + esc(g.name) + ' · 5 numbers from 1–' + era.whiteMax + ' plus 1 ' + esc(g.special) + ' from 1–' + era.specialMax + '</p></div>' +
        '<div class="note"><strong>Every valid combination has the same chance of winning the jackpot: 1 in ' + fmt.int(odds) + '.</strong> A strategy changes which numbers you pick, not how likely they are to be drawn.</div>' +
        '<div class="gen">' +
        '<div class="card no-print"><div class="field"><label for="g-strategy">Strategy</label><select id="g-strategy" data-change="gen-set" data-key="strategy" data-str="1">' +
        C.STRATEGIES.map((s) => '<option value="' + s.key + '"' + (s.key === gen.strategy ? ' selected' : '') + '>' + esc(s.name) + '</option>').join('') + '</select></div>' +
        '<p class="small muted">' + esc(strat.desc) + '</p>' + strategyOptions(v) +
        '<div class="field" style="margin-top:14px"><div class="lab">How many tickets</div><div class="seg" role="group" aria-label="Number of tickets">' +
        [1, 5, 10, 20, 50, 100].map((n) => '<button type="button" data-action="gen-count" data-n="' + n + '" aria-pressed="' + (gen.count === n) + '">' + n + '</button>').join('') + '</div></div>' +
        '<div class="field"><label><input type="checkbox" data-change="gen-set" data-key="unique"' + (gen.unique ? ' checked' : '') + '> No duplicate tickets in a batch</label></div>' +
        '<div class="row"><button type="button" class="btn primary big" data-action="gen-run">Generate</button>' +
        '<button type="button" class="btn" data-action="gen-each" title="One ticket from every strategy, side by side">One of each strategy</button></div></div>' +
        '<div class="card" id="gen-results"><h3>Your tickets</h3>' + results + '</div>' +
        '</div>';
    },
  };

  function runGenerator(mode) {
    const v = L.view();
    if (!v.draws.length) return;
    const game = v.game;
    const ctx = C.makeContext(game, v.all, v.draws, coreOpts(game), C.currentEra(game));
    const rng = C.cryptoRng();
    let tickets = [];
    let failed = 0;
    if (mode === 'each') {
      const seen = new Set();
      C.STRATEGIES.forEach((s) => {
        const r = C.generateTickets(s.key, ctx, 1, rng, false);
        failed += r.failed;
        r.tickets.forEach((t) => { t.dup = seen.has(C.ticketKey(t)); seen.add(C.ticketKey(t)); tickets.push(t); });
      });
    } else {
      const r = C.generateTickets(gen.strategy, ctx, gen.count, rng, gen.unique);
      tickets = r.tickets;
      failed = r.failed;
    }
    batch = { game, tickets, failed, mode: mode === 'each' ? 'each' : 'one', strategy: gen.strategy, period: L.periodLabel() };
    const recent = tickets.slice(0, 5).map((t) => ({ game, w: t.w, s: t.s, strategy: t.strategy })).concat(store.get('recent', []) || []).slice(0, 30);
    store.set('recent', recent);
    L.render();
  }

  L.actions['gen-run'] = () => runGenerator('one');
  L.actions['gen-again'] = () => runGenerator(batch && batch.mode === 'each' ? 'each' : 'one');
  L.actions['gen-each'] = () => runGenerator('each');
  L.actions['gen-count'] = (el) => { gen.count = +el.dataset.n; saveGen(); L.render(); };
  L.changes['gen-set'] = (el) => {
    const key = el.dataset.key;
    const value = el.type === 'checkbox' ? el.checked : el.dataset.str ? el.value : +el.value;
    if (key.indexOf('balance.') === 0) {
      const b = gen.balance[state.game] || (gen.balance[state.game] = {});
      b[key.slice(8)] = value;
    } else if (key.indexOf('ensemble.') === 0) gen.ensemble[key.slice(9)] = value;
    else gen[key] = value;
    if (key === 'mixHot' || key === 'mixCold') {
      gen.mixHot = Math.min(5, Math.max(0, gen.mixHot | 0));
      gen.mixCold = Math.min(5 - gen.mixHot, Math.max(0, gen.mixCold | 0));
    }
    saveGen();
    L.render();
  };
  L.actions['gen-reset-balance'] = () => { delete gen.balance[state.game]; saveGen(); L.render(); };
  L.actions['gen-reset-custom'] = () => { gen.custom[state.game] = { white: {}, special: {} }; saveGen(); L.render(); };
  L.actions['gen-pick'] = (el) => {
    const cu = customFor(state.game);
    const map = cu[el.dataset.kind];
    const n = el.dataset.n;
    const order = ['', 'boost', 'lock', 'exclude'];
    let next = order[(order.indexOf(map[n] || '') + 1) % order.length];
    if (next === 'lock') {
      const locked = Object.keys(map).filter((k) => map[k] === 'lock');
      if (el.dataset.kind === 'white' && locked.length >= 5) { next = 'exclude'; L.toast('Five numbers are already locked'); }
      if (el.dataset.kind === 'special') locked.forEach((k) => { delete map[k]; });
    }
    if (next) map[n] = next; else delete map[n];
    saveGen();
    L.render();
  };
  L.actions['gen-save'] = (el) => {
    const t = batch && batch.tickets[+el.dataset.i];
    if (!t) return;
    L.toast(saveTicket(batch.game, t) ? 'Saved to My Tickets' : 'Already in My Tickets');
    L.render();
  };
  L.actions['gen-save-all'] = () => {
    if (!batch) return;
    const added = batch.tickets.filter((t) => saveTicket(batch.game, t)).length;
    L.toast(added + ' ticket' + (added === 1 ? '' : 's') + ' saved to My Tickets');
    L.render();
  };
  L.actions['gen-copy'] = (el) => {
    const t = batch && batch.tickets[+el.dataset.i];
    if (t) L.copy(ticketText(batch.game, t), 'Ticket copied');
  };
  L.actions['gen-copy-all'] = () => {
    if (batch) L.copy(batch.tickets.map((t) => ticketText(batch.game, t)).join('\n'), batch.tickets.length + ' tickets copied');
  };
  L.actions['gen-export'] = () => {
    if (!batch) return;
    const g = C.GAMES[batch.game];
    const max = C.currentEra(batch.game).whiteMax;
    L.download(batch.game + '-tickets-' + today() + '.csv', C.toCsv(
      ['Game', 'Strategy', 'N1', 'N2', 'N3', 'N4', 'N5', g.special, 'Odd', 'Even', 'Low', 'High', 'Sum', 'Duplicate'],
      batch.tickets.map((t) => {
        const d = C.describeNumbers(t.w, max);
        return [g.name, strategyName(t.strategy)].concat(t.w, [t.s, d.odd, d.even, d.low, d.high, d.sum, t.dup ? 'yes' : 'no']);
      })));
  };
  L.actions['gen-print'] = () => window.print();

  // ------------------------------------------------------------ Results

  const rs = { year: '', date: '', nums: '', special: '', page: 0, a: '', b: '' };
  const PAGE = 50;
  const parseNums = (text) => (String(text).match(/\d+/g) || []).map(Number).filter((n) => n > 0).slice(0, 5);

  function resultRows(v) {
    const want = parseNums(rs.nums);
    const sp = parseInt(rs.special, 10);
    return v.all.filter((x) =>
      (!rs.year || x.d.slice(0, 4) === rs.year) && (!rs.date || x.d === rs.date) &&
      want.every((n) => x.w.indexOf(n) !== -1) && (!sp || x.s === sp)).reverse();
  }

  function yearSummary(v, year) {
    const draws = v.all.filter((x) => x.d.slice(0, 4) === year);
    const count = (pick) => {
      const c = {};
      draws.forEach((x) => pick(x).forEach((n) => { c[n] = (c[n] || 0) + 1; }));
      return Object.keys(c).map((n) => ({ n: +n, count: c[n] })).sort((p, q) => q.count - p.count || p.n - q.n);
    };
    const jackpots = draws.map((x) => x.j).filter(Boolean);
    return {
      draws: draws.length,
      avgSum: draws.length ? draws.reduce((a, x) => a + x.w.reduce((p, q) => p + q, 0), 0) / draws.length : 0,
      whites: count((x) => x.w).slice(0, 5),
      specials: count((x) => [x.s]).slice(0, 3),
      topJackpot: jackpots.length ? Math.max.apply(null, jackpots) : null,
      formats: draws.reduce((set, x) => set.add(C.eraFor(v.game, x.d).id), new Set()).size,
    };
  }

  L.pages.results = {
    needsPeriod: false,
    render(v) {
      const g = C.GAMES[v.game];
      const years = Array.from(new Set(v.all.map((x) => x.d.slice(0, 4)))).reverse();
      if (years.indexOf(rs.year) === -1) rs.year = '';
      if (years.indexOf(rs.a) === -1) rs.a = years[0];
      if (years.indexOf(rs.b) === -1) rs.b = years[1] || years[0];
      const rows = resultRows(v);
      const pages = Math.max(1, Math.ceil(rows.length / PAGE));
      rs.page = Math.min(rs.page, pages - 1);
      const slice = rows.slice(rs.page * PAGE, rs.page * PAGE + PAGE);
      const want = parseNums(rs.nums);
      const yearOpts = (sel) => years.map((y) => '<option' + (y === sel ? ' selected' : '') + '>' + y + '</option>').join('');
      const A = yearSummary(v, rs.a);
      const B = yearSummary(v, rs.b);
      const cmpRow = (label, fn) => '<tr><td class="l">' + label + '</td><td>' + fn(A) + '</td><td>' + fn(B) + '</td></tr>';
      const capList = (list, cls) => '<span class="balls" style="justify-content:flex-end">' + list.map((x) => '<span class="ballcap">' + ball(x.n, cls) + '<small>' + x.count + '×</small></span>').join('') + '</span>';

      return '<div class="page-head"><h2>Historical results</h2><p>' + esc(g.name) + ' · ' + fmt.int(v.all.length) + ' verified drawings since ' + esc(fmt.shortDate(v.all[0].d)) + '</p></div>' +
        '<div class="toolbar">' +
        '<label class="small muted">Year <select data-change="rs-set" data-key="year"><option value="">All years</option>' + yearOpts(rs.year) + '</select></label>' +
        '<label class="small muted">Exact date <input type="date" value="' + esc(rs.date) + '" data-change="rs-set" data-key="date"></label>' +
        '<label class="small muted">Contains main numbers <input type="text" inputmode="numeric" placeholder="e.g. 7 21 33" value="' + esc(rs.nums) + '" data-change="rs-set" data-key="nums" style="width:150px"></label>' +
        '<label class="small muted">' + esc(g.special) + ' <input type="number" min="1" max="46" value="' + esc(rs.special) + '" data-change="rs-set" data-key="special"></label>' +
        '<button type="button" class="btn ghost" data-action="rs-clear">Clear</button><span class="spacer"></span>' +
        '<button type="button" class="btn" data-action="rs-export">Export ' + fmt.int(rows.length) + ' to CSV</button></div>' +
        (rows.length
          ? '<div class="table-wrap"><table><thead><tr><th scope="col">Date</th><th scope="col" class="l">Winning numbers</th><th scope="col">' + esc(g.multiplier) + '</th><th scope="col">Jackpot</th><th scope="col">Format</th><th scope="col">Sources</th></tr></thead><tbody>' +
            slice.map((x) => {
              const era = C.eraFor(v.game, x.d);
              return '<tr class="click" data-action="rs-open" data-d="' + x.d + '" tabindex="0"><td>' + esc(fmt.date(x.d)) + '</td><td class="l">' + balls(x, 'sm', want.length ? { w: want, s: parseInt(rs.special, 10) || -1 } : null) + '</td>' +
                '<td>' + (x.m ? x.m + '×' : '—') + '</td><td>' + esc(fmt.money(x.j)) + '</td><td>' + era.whiteMax + ' / ' + era.specialMax + '</td>' +
                '<td>' + (x.src === 'ny-live' ? '<span class="tag warn">1 · pending</span>' : '<span class="tag ok">' + x.src.split(',').length + '</span>') + '</td></tr>';
            }).join('') + '</tbody></table></div>' +
            '<div class="pager"><button type="button" class="btn" data-action="rs-page" data-step="-1"' + (rs.page === 0 ? ' disabled' : '') + '>← Newer</button>' +
            '<span class="muted small">Page ' + (rs.page + 1) + ' of ' + pages + ' · ' + fmt.int(rows.length) + ' drawings</span>' +
            '<button type="button" class="btn" data-action="rs-page" data-step="1"' + (rs.page >= pages - 1 ? ' disabled' : '') + '>Older →</button></div>'
          : '<div class="empty"><p><strong>No drawings match.</strong></p><p>Try fewer numbers or clear the filters.</p></div>') +

        '<div class="card" style="margin-top:18px"><h3>Compare two years</h3><div class="row" style="margin-bottom:10px">' +
        '<select data-change="rs-set" data-key="a" aria-label="First year">' + yearOpts(rs.a) + '</select><span class="muted">vs</span>' +
        '<select data-change="rs-set" data-key="b" aria-label="Second year">' + yearOpts(rs.b) + '</select></div>' +
        '<div class="table-wrap"><table><thead><tr><th scope="col"></th><th scope="col">' + rs.a + '</th><th scope="col">' + rs.b + '</th></tr></thead><tbody>' +
        cmpRow('Drawings', (s) => s.draws) + cmpRow('Game formats in use', (s) => s.formats) + cmpRow('Average sum of main numbers', (s) => fmt.fix(s.avgSum, 1)) +
        cmpRow('Most drawn main numbers', (s) => capList(s.whites, 'sm')) + cmpRow('Most drawn ' + esc(g.special), (s) => capList(s.specials, 'special sm')) +
        cmpRow('Largest jackpot on file', (s) => esc(fmt.money(s.topJackpot))) + '</tbody></table></div></div>';
    },
  };

  L.changes['rs-set'] = (el) => { rs[el.dataset.key] = el.value.trim(); rs.page = 0; L.render(); };
  L.actions['rs-clear'] = () => { rs.year = rs.date = rs.nums = rs.special = ''; rs.page = 0; L.render(); };
  L.actions['rs-page'] = (el) => { rs.page = Math.max(0, rs.page + +el.dataset.step); L.render(); };
  L.actions['rs-export'] = () => {
    const v = L.view();
    L.download(v.game + '-results.csv', C.drawsToCsv(v.game, resultRows(v)));
  };
  L.actions['rs-open'] = (el) => {
    const v = L.view();
    const g = C.GAMES[v.game];
    const idx = v.all.findIndex((x) => x.d === el.dataset.d);
    if (idx === -1) return;
    const x = v.all[idx];
    const era = C.eraFor(v.game, x.d);
    const info = C.describeNumbers(x.w, era.whiteMax);
    const context = x.w.map((n) => {
      let before = 0;
      let gap = null;
      for (let i = idx - 1; i >= 0; i--) {
        if (v.all[i].w.indexOf(n) !== -1) { before++; if (gap === null) gap = idx - i; }
      }
      return '<tr><td>' + ball(n, 'sm') + '</td><td>' + before + '</td><td>' + (gap === null ? 'first time on file' : gap + ' drawing' + (gap === 1 ? '' : 's')) + '</td></tr>';
    }).join('');
    const same = v.all.filter((y) => y.d !== x.d && y.w.join('-') === x.w.join('-')).map((y) => fmt.shortDate(y.d));
    L.openDialog(
      '<div class="row" style="justify-content:space-between"><h2>' + esc(g.name) + ' · ' + esc(fmt.date(x.d)) + '</h2><button type="button" class="btn" data-action="close-dialog">Close</button></div>' +
      '<p style="margin:14px 0">' + balls(x, 'lg') + '</p>' +
      '<dl class="kv"><dt>' + esc(g.multiplier) + '</dt><dd>' + (x.m ? x.m + '×' : 'not applicable / not drawn') + '</dd>' +
      '<dt>Jackpot</dt><dd>' + (x.j ? esc(fmt.money(x.j)) + ' (advertised)' : 'not available from a verified source') + '</dd>' +
      '<dt>Game format</dt><dd>' + esc(C.eraLabel(v.game, era)) + ' · $' + era.price + ' per play</dd>' +
      '<dt>Shape</dt><dd>' + info.odd + ' odd / ' + info.even + ' even · ' + info.low + ' low / ' + info.high + ' high · sum ' + info.sum + ' · spread ' + info.spread + (info.consecutive ? ' · ' + info.consecutive + ' consecutive pair' + (info.consecutive > 1 ? 's' : '') : '') + '</dd>' +
      '<dt>Verified by</dt><dd>' + esc(fmt.sources(x.src).join('; ')) + '</dd>' +
      '<dt>Same five numbers</dt><dd>' + (same.length ? 'also drawn ' + esc(same.join(', ')) : 'never drawn on any other date on file') + '</dd></dl>' +
      '<h3 style="margin:16px 0 8px">At the time of this drawing</h3>' +
      '<div class="table-wrap"><table><thead><tr><th scope="col">Number</th><th scope="col">Times drawn before</th><th scope="col">Since its previous appearance</th></tr></thead><tbody>' + context + '</tbody></table></div>' +
      '<div class="row" style="margin-top:14px;justify-content:space-between">' +
      (idx > 0 ? '<button type="button" class="btn" data-action="rs-open" data-d="' + v.all[idx - 1].d + '">← Previous drawing</button>' : '<span></span>') +
      (idx < v.all.length - 1 ? '<button type="button" class="btn" data-action="rs-open" data-d="' + v.all[idx + 1].d + '">Next drawing →</button>' : '<span></span>') + '</div>');
  };
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.matches && e.target.matches('tr[data-action="rs-open"]')) L.actions['rs-open'](e.target);
  });

  // ------------------------------------------------------------ Backtest

  const bt = { strategy: 'hot', test: 250, perDraw: 5, train: 500, trials: 20, runs: [], busy: false, progress: '' };
  const BT_KEYS = C.STRATEGIES.map((s) => s.key).filter((k) => k !== 'random');

  function runBacktests(keys) {
    if (bt.busy) return;
    const v = L.view();
    const game = v.game;
    const queue = keys.slice();
    const settings = { test: bt.test, perDraw: bt.perDraw, train: bt.train, trials: bt.trials };
    bt.busy = true;
    const step = () => {
      const key = queue.shift();
      if (!key) { bt.busy = false; bt.progress = ''; L.render(); return; }
      bt.progress = 'Simulating ' + strategyName(key) + '… ' + (keys.length - queue.length) + ' of ' + keys.length;
      L.render();
      // Yield to the browser so the progress message paints before the heavy loop starts.
      setTimeout(() => {
        const r = C.backtest({
          game, draws: v.all, strategy: key, opts: coreOpts(game),
          testCount: settings.test, ticketsPerDraw: settings.perDraw, trainWindow: settings.train, trials: settings.trials, seed: 20061004,
        });
        r.settings = settings;
        bt.runs = bt.runs.filter((x) => !(x.game === game && x.strategy === key)).concat([r]);
        step();
      }, 40);
    };
    step();
  }

  function verdict(r) {
    const s = r.strategyResult;
    const b = r.randomResult;
    if (s.roiMedian <= b.roiHigh) return '<span class="tag warn">Did not beat random</span>';
    return '<span class="tag" title="About 1 run in 20 lands above the random range by luck alone. This is not evidence of an edge.">Above random range (chance)</span>';
  }

  L.pages.backtest = {
    needsPeriod: false,
    render(v) {
      const g = C.GAMES[v.game];
      const runs = bt.runs.filter((r) => r.game === v.game);
      const last = runs[runs.length - 1];
      const opt = (key, value, options) => '<select data-change="bt-set" data-key="' + key + '"' + (bt.busy ? ' disabled' : '') + '>' +
        options.map((o) => '<option value="' + o[0] + '"' + (String(o[0]) === String(value) ? ' selected' : '') + '>' + esc(o[1]) + '</option>').join('') + '</select>';
      const range = (x) => fmt.pct(x.roiLow, 0) + ' to ' + fmt.pct(x.roiHigh, 0);

      let out = '';
      if (runs.length) {
        out += '<div class="table-wrap"><table><thead><tr><th scope="col">Strategy</th><th scope="col">Drawings</th><th scope="col">Tickets</th><th scope="col">Spent</th><th scope="col">Won (avg)</th><th scope="col">Net (avg)</th>' +
          '<th scope="col" title="Median trial">Typical return</th><th scope="col">90% of trials</th><th scope="col" title="Median trial of pure random tickets">Random typical</th><th scope="col">Random 90%</th><th scope="col">Verdict</th></tr></thead><tbody>' +
          runs.map((r) => {
            const s = r.strategyResult;
            const lucky = s.roi - s.roiMedian > 0.25 ? ' <span class="tag" title="The average is lifted by a rare large prize in a single trial. The typical (median) trial is shown in the next columns.">rare big win</span>' : '';
            return '<tr><td class="l">' + esc(strategyName(r.strategy)) + '</td><td>' + r.drawsTested + '</td><td>' + fmt.int(s.tickets) + '</td><td>' + fmt.dollars(s.cost) + '</td><td>' + fmt.dollars(s.won) + lucky + '</td>' +
              '<td class="' + (s.net < 0 ? 'neg' : 'pos') + '">' + fmt.dollars(s.net) + '</td><td>' + fmt.pct(s.roiMedian, 1) + '</td><td>' + range(s) + '</td><td>' + fmt.pct(r.randomResult.roiMedian, 1) + '</td><td>' + range(r.randomResult) + '</td><td>' + verdict(r) + '</td></tr>';
          }).join('') + '</tbody></table></div>' +
          '<p class="small muted" style="margin-top:8px">Return = winnings ÷ spend − 1, so −100% means nothing came back. “Typical” is the median trial; averages can be lifted by one rare large prize. ' +
          'The theoretical average return for any ticket over these drawings, leaving out the jackpot, is ' + fmt.pct(last.theoreticalRoi, 1) +
          ' — typical runs land below it because that average includes prizes too rare to show up. Tested ' + esc(fmt.shortDate(last.from)) + ' – ' + esc(fmt.shortDate(last.to)) + '.</p>';

        const cents = (roi) => Math.max(0, 100 * (1 + roi));
        const items = [];
        runs.forEach((r) => {
          items.push({ label: strategyName(r.strategy).split(' ')[0], value: cents(r.strategyResult.roiMedian), show: Math.round(cents(r.strategyResult.roiMedian)) + '¢', expected: cents(r.theoreticalRoi), tone: 't-accent', title: strategyName(r.strategy) + ': ' + Math.round(cents(r.strategyResult.roiMedian)) + '¢ back per $1 in the typical trial' });
        });
        items.push({ label: 'Random', value: cents(last.randomResult.roiMedian), show: Math.round(cents(last.randomResult.roiMedian)) + '¢', expected: cents(last.theoreticalRoi), title: 'Pure random tickets, typical trial' });
        const tiers = Object.keys(Object.assign({}, last.strategyResult.tiers, last.randomResult.tiers)).sort().reverse();
        out = '<div class="grid g2"><div class="card"><h3>Money back per $1 spent · typical trial</h3>' + columns(items, { wide: true, label: 'Return per dollar by strategy' }) +
          '<div class="legend"><span><i class="t-accent"></i>strategy</span><span><i></i>pure random</span><span><i class="line"></i>theoretical average</span></div></div>' +
          '<div class="card"><h3>Prizes won — ' + esc(strategyName(last.strategy)) + ' vs. random</h3>' +
          (tiers.length ? '<div class="table-wrap"><table><thead><tr><th scope="col">Match</th><th scope="col">Strategy (avg per trial)</th><th scope="col">Random (avg per trial)</th></tr></thead><tbody>' +
            tiers.map((t) => '<tr><td class="l">' + esc(tierLabel(v.game, t)) + '</td><td>' + fmt.fix(last.strategyResult.tiers[t] || 0, 1) + '</td><td>' + fmt.fix(last.randomResult.tiers[t] || 0, 1) + '</td></tr>').join('') + '</tbody></table></div>'
            : '<p class="muted">No prizes in this simulation.</p>') +
          '</div></div>' + out;
      } else if (!bt.busy) {
        out = '<div class="empty"><p><strong>No simulations yet.</strong></p><p>Pick a strategy and press Run, or compare them all at once.</p></div>';
      }

      return '<div class="page-head"><h2>Backtest</h2><p>' + esc(g.name) + ' · replay a strategy against real past drawings</p></div>' +
        '<div class="note"><strong>How it works.</strong> For each past drawing, tickets are generated using <em>only the drawings that came before it</em>, under the rules in force that day, and then scored against the real result with that format’s prize table. ' +
        'The same number of pure random tickets is played alongside for comparison, and the whole thing is repeated over many trials to show the spread. Expect every strategy to land inside the random range.</div>' +
        '<div class="card" style="margin-bottom:14px"><div class="toolbar" style="margin:0">' +
        '<label class="small muted">Strategy ' + opt('strategy', bt.strategy, BT_KEYS.map((k) => [k, strategyName(k)])) + '</label>' +
        '<label class="small muted">Test the last ' + opt('test', bt.test, [[50, '50 drawings'], [100, '100 drawings'], [250, '250 drawings'], [500, '500 drawings'], [1000, '1,000 drawings']]) + '</label>' +
        '<label class="small muted">Tickets per drawing ' + opt('perDraw', bt.perDraw, [[1, '1'], [5, '5'], [10, '10']]) + '</label>' +
        '<label class="small muted">Learn from the previous ' + opt('train', bt.train, [[100, '100 drawings'], [250, '250 drawings'], [500, '500 drawings'], [0, 'all earlier drawings']]) + '</label>' +
        '<label class="small muted">Trials ' + opt('trials', bt.trials, [[10, '10'], [20, '20'], [50, '50']]) + '</label>' +
        '<span class="spacer"></span>' +
        '<button type="button" class="btn primary" data-action="bt-run"' + (bt.busy ? ' disabled' : '') + '>Run</button>' +
        '<button type="button" class="btn" data-action="bt-all"' + (bt.busy ? ' disabled' : '') + '>Compare all strategies</button>' +
        (runs.length ? '<button type="button" class="btn ghost" data-action="bt-clear"' + (bt.busy ? ' disabled' : '') + '>Clear</button>' : '') + '</div>' +
        (bt.busy ? '<p style="margin:12px 0 0"><span class="spin" aria-hidden="true"></span> ' + esc(bt.progress) + '</p>' : '') + '</div>' + out;
    },
  };

  L.changes['bt-set'] = (el) => { bt[el.dataset.key] = el.dataset.key === 'strategy' ? el.value : +el.value; L.render(); };
  L.actions['bt-run'] = () => runBacktests([bt.strategy]);
  L.actions['bt-all'] = () => runBacktests(BT_KEYS);
  L.actions['bt-clear'] = () => { bt.runs = bt.runs.filter((r) => r.game !== state.game); L.render(); };

  // ------------------------------------------------------------ My Tickets

  const tk = { open: null, scope: 'since', both: false };

  function checkTicket(t, scope) {
    const all = L.history[t.game];
    const draws = scope === 'since' ? all.filter((x) => x.d >= t.saved) : scope === 'last100' ? all.slice(-100) : all;
    const res = { checked: 0, skipped: 0, tiers: {}, won: 0, cost: 0, jackpots: 0, wins: [] };
    draws.forEach((x) => {
      if (!C.ticketValidOn(t.game, x.d, t)) { res.skipped++; return; }
      res.checked++;
      res.cost += C.eraFor(t.game, x.d).price;
      const score = C.scoreTicket(t, x);
      const prize = C.prizeFor(t.game, x.d, score);
      if (!prize) return;
      res.tiers[score.tier] = (res.tiers[score.tier] || 0) + 1;
      if (prize.jackpot) res.jackpots++; else res.won += prize.amount;
      res.wins.push({ x, score, prize });
    });
    return res;
  }

  function checkPanel(t) {
    const all = L.history[t.game];
    const latest = all[all.length - 1];
    const score = C.scoreTicket(t, latest);
    const prize = C.ticketValidOn(t.game, latest.d, t) ? C.prizeFor(t.game, latest.d, score) : null;
    const res = checkTicket(t, tk.scope);
    const scopes = [['since', 'Drawings since I saved it'], ['last100', 'Last 100 drawings'], ['all', 'Whole history on file']];
    return '<div style="width:100%;border-top:1px solid var(--border);padding-top:12px;margin-top:4px">' +
      '<p><strong>Latest drawing, ' + esc(fmt.date(latest.d)) + ':</strong> ' + balls(latest, 'sm', t) + '</p>' +
      '<p>' + score.white + ' main number' + (score.white === 1 ? '' : 's') + (score.special ? ' + ' + esc(C.GAMES[t.game].special) : '') + ' matched → <strong>' + esc(prizeText(prize)) + '</strong></p>' +
      '<div class="row" style="margin:10px 0"><label class="small muted">Also check against <select data-change="tk-scope">' +
      scopes.map((s) => '<option value="' + s[0] + '"' + (tk.scope === s[0] ? ' selected' : '') + '>' + s[1] + '</option>').join('') + '</select></label></div>' +
      (res.checked
        ? '<p class="small">Played in all ' + fmt.int(res.checked) + ' drawings it would have cost <strong>' + fmt.dollars(res.cost) + '</strong> and won at least <strong>' + fmt.dollars(res.won) + '</strong>' +
          (res.jackpots ? ' plus <strong>' + res.jackpots + ' jackpot' + (res.jackpots > 1 ? 's' : '') + '</strong>' : '') + ' across ' + res.wins.length + ' winning drawing' + (res.wins.length === 1 ? '' : 's') + '.' +
          (res.skipped ? ' <span class="muted">' + fmt.int(res.skipped) + ' older drawings skipped because these numbers were not playable under the format then in force.</span>' : '') + '</p>' +
          (res.wins.length ? '<div class="table-wrap" style="max-height:260px;overflow:auto"><table><thead><tr><th scope="col">Drawing</th><th scope="col" class="l">Numbers drawn</th><th scope="col">Matched</th><th scope="col">Base prize</th></tr></thead><tbody>' +
            res.wins.slice().reverse().slice(0, 60).map((w) => '<tr><td>' + esc(fmt.shortDate(w.x.d)) + '</td><td class="l">' + balls(w.x, 'sm', t) + '</td><td>' + esc(tierLabel(t.game, w.score.tier)) + '</td><td>' + esc(prizeText(w.prize)) + '</td></tr>').join('') +
            '</tbody></table></div>' : '')
        : '<p class="small muted">No drawings in that range yet.</p>') +
      '<p class="small muted" style="margin-top:8px">Prize figures are the standard base prizes for the format in force at each drawing (no add-on multiplier). They are estimates, not claims — only your official lottery can confirm a prize.</p></div>';
  }

  L.pages.tickets = {
    needsPeriod: false,
    render(v) {
      const g = C.GAMES[v.game];
      const era = C.currentEra(v.game);
      const list = getSaved().filter((t) => tk.both || t.game === v.game).sort((a, b) => (b.fav ? 1 : 0) - (a.fav ? 1 : 0));
      const numBox = (id, max, label) => '<input type="number" id="' + id + '" min="1" max="' + max + '" aria-label="' + label + '" placeholder="' + label + '" style="width:64px">';

      return '<div class="page-head"><h2>My tickets</h2><p>Saved in this browser only</p></div>' +
        '<div class="note"><strong>These are notes, not lottery entries.</strong> A ticket saved here has not been purchased and cannot win anything. Clearing your browser data removes them.</div>' +
        '<div class="card" style="margin-bottom:14px"><h3>Add a ' + esc(g.name) + ' ticket by hand</h3><div class="row">' +
        [1, 2, 3, 4, 5].map((i) => numBox('tk-n' + i, era.whiteMax, '#' + i)).join('') + '<span class="plus">+</span>' + numBox('tk-s', era.specialMax, g.special === 'Powerball' ? 'PB' : 'MB') +
        '<input type="text" id="tk-name" maxlength="40" placeholder="Name (optional)" aria-label="Ticket name" style="width:180px">' +
        '<button type="button" class="btn primary" data-action="tk-add">Add ticket</button></div>' +
        '<p class="small muted" style="margin:8px 0 0">Main numbers 1–' + era.whiteMax + ', ' + esc(g.special) + ' 1–' + era.specialMax + '.</p></div>' +
        '<div class="toolbar"><label class="small muted"><input type="checkbox" data-change="tk-both"' + (tk.both ? ' checked' : '') + '> Show both games</label><span class="spacer"></span>' +
        (list.length ? '<button type="button" class="btn" data-action="tk-export">Export CSV</button>' : '') + '</div>' +
        (list.length ? list.map((t) =>
          '<div class="ticket" data-game-scope="' + esc(t.game) + '"><button type="button" class="btn icon' + (t.fav ? ' on' : '') + '" data-action="tk-fav" data-id="' + esc(t.id) + '" aria-label="Favourite" aria-pressed="' + !!t.fav + '">' + (t.fav ? '★' : '☆') + '</button>' +
          balls(t) +
          '<input type="text" maxlength="40" value="' + esc(t.name) + '" placeholder="Name this ticket" aria-label="Ticket name" data-change="tk-name" data-id="' + esc(t.id) + '" style="width:170px">' +
          '<span class="info">' + esc(C.GAMES[t.game].name) + ' · ' + esc(strategyName(t.strategy)) + '<br>saved ' + esc(fmt.shortDate(t.saved)) + '</span>' +
          '<span class="actions"><button type="button" class="btn icon" data-action="tk-check" data-id="' + esc(t.id) + '">' + (tk.open === t.id ? 'Hide results' : 'Check results') + '</button>' +
          '<button type="button" class="btn icon" data-action="tk-copy" data-id="' + esc(t.id) + '">Copy</button>' +
          '<button type="button" class="btn icon" data-action="tk-delete" data-id="' + esc(t.id) + '" aria-label="Delete ticket">✕</button></span>' +
          (tk.open === t.id ? checkPanel(t) : '') + '</div>').join('')
          : '<div class="empty"><p><strong>No saved tickets' + (tk.both ? '' : ' for ' + esc(g.name)) + ' yet.</strong></p><p>Save tickets from the <a href="#generator">generator</a> or add your own numbers above.</p></div>');
    },
    after(main) {
      // A saved ticket keeps its own game's ball colour even when the other game is selected.
      main.querySelectorAll('[data-game-scope="megamillions"] .ball.special').forEach((el) => { el.style.background = 'radial-gradient(circle at 32% 28%, #ffe38a, #f5b70a 70%)'; el.style.color = '#1a1300'; });
      main.querySelectorAll('[data-game-scope="powerball"] .ball.special').forEach((el) => { el.style.background = 'radial-gradient(circle at 32% 28%, #ff7b85, #e63946 70%)'; el.style.color = '#fff'; });
    },
  };

  const findTicket = (id) => getSaved().filter((t) => t.id === id)[0];
  const updateTicket = (id, fn) => { const list = getSaved(); list.forEach((t) => { if (t.id === id) fn(t); }); setSaved(list); };

  L.actions['tk-add'] = () => {
    const game = state.game;
    const era = C.currentEra(game);
    const w = [1, 2, 3, 4, 5].map((i) => parseInt($('#tk-n' + i).value, 10));
    const s = parseInt($('#tk-s').value, 10);
    const problems = C.validateDraw(game, { d: today() < era.from ? era.from : today(), w, s });
    if (problems.length) { L.toast('Check your numbers: ' + problems[0].replace('NaN', '(blank)')); return; }
    const ok = saveTicket(game, { w: w.slice().sort((a, b) => a - b), s, strategy: 'manual' }, $('#tk-name').value.trim());
    L.toast(ok ? 'Ticket saved' : 'That ticket is already saved');
    L.render();
  };
  L.actions['tk-fav'] = (el) => { updateTicket(el.dataset.id, (t) => { t.fav = !t.fav; }); L.render(); };
  L.actions['tk-check'] = (el) => { tk.open = tk.open === el.dataset.id ? null : el.dataset.id; L.render(); };
  L.actions['tk-copy'] = (el) => { const t = findTicket(el.dataset.id); if (t) L.copy(ticketText(t.game, t), 'Ticket copied'); };
  L.actions['tk-delete'] = (el) => {
    const t = findTicket(el.dataset.id);
    if (!t || !window.confirm('Remove this saved ticket?\n' + ticketText(t.game, t))) return;
    setSaved(getSaved().filter((x) => x.id !== el.dataset.id));
    L.render();
  };
  L.actions['tk-export'] = () => {
    const list = getSaved().filter((t) => tk.both || t.game === state.game);
    L.download('saved-tickets.csv', C.toCsv(['Game', 'Name', 'N1', 'N2', 'N3', 'N4', 'N5', 'Special ball', 'Favourite', 'Source', 'Saved'],
      list.map((t) => [C.GAMES[t.game].name, t.name].concat(t.w, [t.s, t.fav ? 'yes' : 'no', strategyName(t.strategy), t.saved]))));
  };
  L.changes['tk-name'] = (el) => updateTicket(el.dataset.id, (t) => { t.name = el.value.trim().slice(0, 40); });
  L.changes['tk-scope'] = (el) => { tk.scope = el.value; L.render(); };
  L.changes['tk-both'] = (el) => { tk.both = el.checked; L.render(); };
})();
