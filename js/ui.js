/* Lottery Intelligence Pro — page shell: state, helpers, routing and live data refresh. */
(function () {
  'use strict';

  const C = window.LotteryCore;
  const RAW = window.LOTTERY_DATA || {};

  const $ = (sel, el) => (el || document).querySelector(sel);
  const $$ = (sel, el) => Array.from((el || document).querySelectorAll(sel));
  const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (ch) => ESCAPES[ch]);

  // Everything the page remembers lives in this browser's localStorage under the "lip." prefix.
  const store = {
    get(key, fallback) {
      try {
        const v = localStorage.getItem('lip.' + key);
        return v == null ? fallback : JSON.parse(v);
      } catch (e) { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem('lip.' + key, JSON.stringify(value)); } catch (e) { /* storage unavailable */ }
    },
  };

  const TABS = [
    ['dashboard', 'Dashboard'], ['hot-cold', 'Hot & Cold'], ['patterns', 'Patterns'], ['generator', 'Generator'],
    ['results', 'Results'], ['backtest', 'Backtest'], ['tickets', 'My Tickets'], ['about', 'About & Data'],
  ];
  const PERIODS = [
    ['years:20', 'Last 20 years'], ['years:10', 'Last 10 years'], ['years:5', 'Last 5 years'], ['years:1', 'Last 1 year'],
    ['current', 'Current game format only'],
    ['last:500', 'Last 500 drawings'], ['last:250', 'Last 250 drawings'], ['last:100', 'Last 100 drawings'],
    ['last:50', 'Last 50 drawings'], ['last:25', 'Last 25 drawings'], ['last:10', 'Last 10 drawings'],
    ['range', 'Custom date range…'],
  ];

  const state = {
    game: store.get('game', 'powerball'),
    period: store.get('period', 'years:20'),
    from: store.get('from', ''),
    to: store.get('to', ''),
    tab: 'dashboard',
  };
  if (!C.GAMES[state.game]) state.game = 'powerball';
  if (!PERIODS.some((p) => p[0] === state.period)) state.period = 'years:20';

  // ------------------------------------------------------------ data

  const bundled = {};
  const history = {};

  function loadHistory(game) {
    const raw = RAW[game];
    bundled[game] = raw && raw.draws ? raw.draws.map(C.unpackDraw) : [];
    const last = bundled[game].length ? bundled[game][bundled[game].length - 1].d : '';
    const live = (store.get('live.' + game, []) || []).filter((x) => x && x.d > last && C.validateDraw(game, x).length === 0);
    history[game] = bundled[game].concat(live);
  }
  Object.keys(C.GAMES).forEach(loadHistory);

  function filterSpec() {
    if (state.period === 'current') return { type: 'current' };
    if (state.period === 'range') return { type: 'range', from: state.from, to: state.to };
    const parts = state.period.split(':');
    return { type: parts[0], n: +parts[1] };
  }

  function periodLabel() {
    if (state.period === 'range') return (state.from || 'start') + ' to ' + (state.to || 'latest');
    return PERIODS.filter((p) => p[0] === state.period)[0][1];
  }

  // All statistics for the current game + period, computed on first use and cached until either changes.
  let memo = { key: null, v: null };
  function view() {
    const all = history[state.game];
    const key = [state.game, state.period, state.from, state.to, all.length].join('|');
    if (memo.key === key) return memo.v;
    const game = state.game;
    const draws = C.applyFilter(all, filterSpec(), game);
    const v = { game, all, draws };
    const lazy = (name, fn) => {
      let value;
      let done = false;
      Object.defineProperty(v, name, { get() { if (!done) { value = fn(); done = true; } return value; } });
    };
    lazy('white', () => C.numberStats(draws, game, 'white', all));
    lazy('special', () => C.numberStats(draws, game, 'special', all));
    lazy('pairs', () => C.comboCounts(draws, 2));
    lazy('triplets', () => C.comboCounts(draws, 3));
    lazy('patterns', () => C.patternStats(draws, game));
    lazy('eras', () => {
      const seen = [];
      draws.forEach((x) => { const e = C.eraFor(game, x.d); if (seen.indexOf(e) === -1) seen.push(e); });
      return seen;
    });
    memo = { key, v };
    return v;
  }

  /** Top-n numbers by a named ranking, restricted to numbers playable today. */
  function ranked(stats, mode, n) {
    const usable = stats.filter((s) => s.validNow && s.eligible > 0);
    const since = (s) => (s.drawsSince < 0 ? Infinity : s.drawsSince);
    const cmp = {
      hot: (a, b) => b.ratio - a.ratio || b.count - a.count || a.n - b.n,
      cold: (a, b) => a.ratio - b.ratio || a.count - b.count || a.n - b.n,
      recent: (a, b) => b.last50 - a.last50 || b.last25 - a.last25 || a.n - b.n,
      overdue: (a, b) => since(b) - since(a) || a.n - b.n,
      rising: (a, b) => b.trend - a.trend || a.n - b.n,
      near: (a, b) => Math.abs(a.z) - Math.abs(b.z) || a.n - b.n,
    }[mode];
    return usable.slice().sort(cmp).slice(0, n);
  }

  // ------------------------------------------------------------ formatting

  const fmt = {
    date(s, opts) {
      if (!s) return '—';
      return new Date(C.parseDate(s)).toLocaleDateString('en-US', Object.assign({ timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }, opts));
    },
    shortDate(s) {
      return fmt.date(s, { weekday: undefined });
    },
    money(n) {
      if (n == null) return '—';
      const trim = (x) => String(+x.toFixed(x < 10 ? 2 : 1));
      if (n >= 1e9) return '$' + trim(n / 1e9) + ' Billion';
      if (n >= 1e6) return '$' + trim(n / 1e6) + ' Million';
      return '$' + Math.round(n).toLocaleString('en-US');
    },
    dollars(n) {
      return (n < 0 ? '−$' : '$') + Math.abs(Math.round(n)).toLocaleString('en-US');
    },
    int(n) {
      return Math.round(n).toLocaleString('en-US');
    },
    fix(n, d) {
      return n == null ? '—' : n.toFixed(d == null ? 1 : d);
    },
    signed(n, d) {
      return (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n).toFixed(d == null ? 1 : d);
    },
    pct(n, d) {
      return (n * 100).toFixed(d == null ? 1 : d) + '%';
    },
    /** Colour class for an observed-vs-expected z-score: warm = more often than expected, cool = less. */
    tone(z) {
      if (z >= 2) return 't-hot3';
      if (z >= 1) return 't-hot2';
      if (z >= 0.5) return 't-hot1';
      if (z <= -2) return 't-cold3';
      if (z <= -1) return 't-cold2';
      if (z <= -0.5) return 't-cold1';
      return '';
    },
    sources(src) {
      const names = { nc: 'North Carolina Education Lottery', ny: 'New York Gaming Commission', tx: 'Texas Lottery', pb: 'powerball.com (archived file)', pbc: 'powerball.com', mm: 'megamillions.com', 'ny-live': 'New York Gaming Commission (live, awaiting a second source)' };
      return String(src || '').split(',').filter(Boolean).map((k) => names[k] || k);
    },
  };

  // ------------------------------------------------------------ small HTML builders

  function ball(n, cls, title) {
    return '<span class="ball ' + (cls || '') + '"' + (title ? ' title="' + esc(title) + '"' : '') + '>' + n + '</span>';
  }
  function balls(draw, size, marks) {
    const cls = size ? ' ' + size : '';
    const mark = (n, special) => {
      if (!marks) return '';
      return (special ? marks.s === n : marks.w.indexOf(n) !== -1) ? ' hit' : ' miss';
    };
    return '<span class="balls">' + draw.w.map((n) => ball(n, cls + mark(n, false))).join('') + ball(draw.s, 'special' + cls + mark(draw.s, true)) + '</span>';
  }

  /** Column chart. items: [{label, value, show, title, tone, expected}] */
  function columns(items, opts) {
    const o = opts || {};
    let max = 1;
    items.forEach((i) => { max = Math.max(max, i.value, i.expected || 0); });
    return '<div class="chart-scroll"><div class="cols' + (o.wide ? ' wide' : '') + '" role="img" aria-label="' + esc(o.label || 'Chart') + '">' +
      items.map((i) =>
        '<div class="col" title="' + esc(i.title || i.label + ': ' + i.value) + '">' +
        (o.values === false ? '' : '<span class="col-val">' + esc(i.show == null ? i.value : i.show) + '</span>') +
        '<div class="col-track"><span class="col-bar ' + (i.tone || '') + '" style="height:' + ((100 * i.value) / max).toFixed(1) + '%"></span>' +
        (i.expected != null ? '<span class="col-exp" style="bottom:' + ((100 * i.expected) / max).toFixed(1) + '%"></span>' : '') +
        '</div><span class="col-lab">' + esc(i.label) + '</span></div>').join('') +
      '</div></div>';
  }

  const TONE_LEGEND = '<div class="legend"><span><i class="t-hot3"></i>well above expected</span><span><i class="t-hot2"></i>above</span>' +
    '<span><i></i>near expected</span><span><i class="t-cold2"></i>below</span><span><i class="t-cold3"></i>well below expected</span>' +
    '<span><i class="line"></i>expected for a fair drawing</span></div>';

  function multiEraNote(v) {
    if (v.eras.length < 2) return '';
    return '<div class="note"><strong>This period spans ' + v.eras.length + ' game formats.</strong> The number ranges changed over the years, so raw counts are not directly comparable. ' +
      'Rankings here use <strong>observed ÷ expected</strong>, where “expected” is worked out drawing by drawing from the rules in force at the time. ' +
      'Choose <em>Current game format only</em> for a like-for-like view.</div>';
  }

  let toastTimer;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
  }

  function download(filename, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type: type || 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function copy(text, label) {
    const done = () => toast((label || 'Copied') + ' to clipboard');
    const fallback = () => {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); done(); } catch (e) { toast('Could not copy — select and copy manually'); }
      ta.remove();
    };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, fallback);
    else fallback();
  }

  function openDialog(html) {
    const d = $('#dialog');
    d.innerHTML = html;
    if (!d.open) d.showModal();
  }

  // ------------------------------------------------------------ rendering & routing

  const pages = {};
  const actions = {};
  const changes = {};

  function updateStatus(text) {
    const el = $('#data-status');
    if (text) { el.innerHTML = text; return; }
    const all = history[state.game];
    if (!all.length) { el.textContent = 'No data loaded'; return; }
    const extra = all.length - bundled[state.game].length;
    el.innerHTML = 'Results through <strong>' + esc(fmt.date(all[all.length - 1].d)) + '</strong>' + (extra ? ' · ' + extra + ' new, awaiting verification' : '');
  }

  function render() {
    document.body.dataset.game = state.game;
    $$('.game-switch button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.game === state.game)));
    const sel = $('#period');
    if (!sel.options.length) sel.innerHTML = PERIODS.map((p) => '<option value="' + p[0] + '">' + esc(p[1]) + '</option>').join('');
    sel.value = state.period;
    $('#custom-range').hidden = state.period !== 'range';
    $('#range-from').value = state.from;
    $('#range-to').value = state.to;
    $('#tabs').innerHTML = TABS.map((t) => '<a href="#' + t[0] + '"' + (t[0] === state.tab ? ' aria-current="page"' : '') + '>' + esc(t[1]) + '</a>').join('');
    updateStatus();

    const main = $('#view');
    const page = pages[state.tab] || pages.dashboard;
    const v = view();
    if (!v.all.length) {
      main.innerHTML = '<div class="empty"><p><strong>No results data found.</strong></p><p>Run <code>node scripts/update-data.js</code> to download the official results, then reload this page.</p></div>';
      return;
    }
    if (!v.draws.length && page.needsPeriod !== false) {
      main.innerHTML = '<div class="empty"><p><strong>No drawings in this period.</strong></p><p>Pick a different period in the “Analyze” menu above.</p></div>';
      return;
    }
    try {
      main.innerHTML = page.render(v);
      if (page.after) page.after(main, v);
    } catch (err) {
      console.error(err);
      main.innerHTML = '<div class="empty"><p><strong>Something went wrong showing this section.</strong></p><p>' + esc(err.message) + '</p></div>';
    }
  }

  function route() {
    const id = location.hash.replace(/^#/, '');
    state.tab = TABS.some((t) => t[0] === id) ? id : 'dashboard';
    render();
    window.scrollTo(0, 0);
  }

  actions.game = (el) => {
    state.game = el.dataset.game;
    store.set('game', state.game);
    render();
  };
  actions.refresh = () => refreshLive(true);
  actions['close-dialog'] = () => $('#dialog').close();
  changes.period = (el) => {
    state.period = el.value;
    store.set('period', state.period);
    render();
  };
  changes.range = () => {
    state.from = $('#range-from').value;
    state.to = $('#range-to').value;
    store.set('from', state.from);
    store.set('to', state.to);
    render();
  };

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el || el.disabled) return;
    const fn = actions[el.dataset.action];
    if (fn) fn(el, e);
  });
  document.addEventListener('change', (e) => {
    const el = e.target.closest('[data-change]');
    if (!el) return;
    const fn = changes[el.dataset.change];
    if (fn) fn(el, e);
  });
  // Clicking the dimmed area outside a dialog closes it.
  document.addEventListener('click', (e) => { if (e.target === $('#dialog')) $('#dialog').close(); });

  // ------------------------------------------------------------ live refresh

  // The bundled history is refreshed by the scheduled GitHub Action. Between runs, the page asks
  // New York's open-data API (which allows browser requests) for any drawings newer than the bundle.
  const NY_DATASET = { powerball: 'd6yy-54nr', megamillions: '5xaw-6ayf' };

  async function fetchNewer(game) {
    const base = bundled[game];
    const last = base.length ? base[base.length - 1].d : '2006-10-01';
    const where = "draw_date > '" + last + "T00:00:00'";
    const url = 'https://data.ny.gov/resource/' + NY_DATASET[game] + '.json?$order=draw_date&$limit=500&$where=' + encodeURIComponent(where);
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const rows = await res.json();
    const fresh = rows.map((r) => C.parseNyRow(game, r))
      .filter((x) => x && x.d > last && C.validateDraw(game, x).length === 0)
      .map((x) => Object.assign(x, { src: 'ny-live' }));
    store.set('live.' + game, fresh);
    loadHistory(game);
    return fresh.length;
  }

  let refreshing = false;
  async function refreshLive(manual) {
    if (refreshing) return;
    refreshing = true;
    const btn = $('#refresh-btn');
    btn.disabled = true;
    updateStatus('<span class="spin" aria-hidden="true"></span> Checking for new results…');
    try {
      const counts = await Promise.all(Object.keys(C.GAMES).map(fetchNewer));
      store.set('checked', Date.now());
      const total = counts.reduce((a, b) => a + b, 0);
      if (manual) toast(total ? total + ' newer drawing' + (total > 1 ? 's' : '') + ' found' : 'Already up to date');
      render();
    } catch (err) {
      updateStatus();
      if (manual) toast('Could not reach the results service — showing saved data');
    } finally {
      refreshing = false;
      btn.disabled = false;
    }
  }

  window.LIP = {
    C, RAW, $, $$, esc, store, state, TABS, PERIODS, history, bundled,
    view, ranked, periodLabel, filterSpec, fmt, ball, balls, columns, TONE_LEGEND, multiEraNote,
    toast, download, copy, openDialog, pages, actions, changes, render,
  };

  window.addEventListener('hashchange', route);
  document.addEventListener('DOMContentLoaded', () => {
    route();
    if (Date.now() - store.get('checked', 0) > 30 * 60 * 1000) refreshLive(false);
  });
})();
