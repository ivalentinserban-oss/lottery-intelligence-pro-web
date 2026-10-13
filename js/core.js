/*!
 * Lottery Intelligence Pro — core logic (game rules, statistics, generator, backtest).
 * No DOM access. The page loads it as window.LotteryCore; Node (tests, data script) uses require().
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LotteryCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // ---------------------------------------------------------------- game rules

  const JACKPOT = 'JACKPOT';

  // Base-game prizes (no Power Play / Megaplier) keyed by "<white matches>+<special match 0|1>".
  function prizeTable(p5, p41, p4, p31, p3, p21, p11, p01) {
    return { '5+1': JACKPOT, '5+0': p5, '4+1': p41, '4+0': p4, '3+1': p31, '3+0': p3, '2+1': p21, '1+1': p11, '0+1': p01 };
  }

  // `from` is the first drawing held under each matrix. Eras are listed oldest first.
  const GAMES = {
    powerball: {
      key: 'powerball',
      name: 'Powerball',
      special: 'Powerball',
      multiplier: 'Power Play',
      official: 'https://www.powerball.com',
      drawTimeET: [22, 59],
      schedule: [
        { from: '1992-04-22', days: [3, 6] },
        { from: '2021-08-23', days: [1, 3, 6] },
      ],
      eras: [
        { id: 'pb-2005', from: '2005-08-31', whiteMax: 55, specialMax: 42, price: 1, prizes: prizeTable(200000, 10000, 100, 100, 7, 7, 4, 3) },
        { id: 'pb-2009', from: '2009-01-07', whiteMax: 59, specialMax: 39, price: 1, prizes: prizeTable(200000, 10000, 100, 100, 7, 7, 4, 3) },
        { id: 'pb-2012', from: '2012-01-18', whiteMax: 59, specialMax: 35, price: 2, prizes: prizeTable(1000000, 10000, 100, 100, 7, 7, 4, 4) },
        { id: 'pb-2015', from: '2015-10-07', whiteMax: 69, specialMax: 26, price: 2, prizes: prizeTable(1000000, 50000, 100, 100, 7, 7, 4, 4) },
      ],
    },
    megamillions: {
      key: 'megamillions',
      name: 'Mega Millions',
      special: 'Mega Ball',
      multiplier: 'Megaplier',
      official: 'https://www.megamillions.com',
      drawTimeET: [23, 0],
      schedule: [{ from: '2002-05-17', days: [2, 5] }],
      eras: [
        { id: 'mm-2005', from: '2005-06-24', whiteMax: 56, specialMax: 46, price: 1, prizes: prizeTable(250000, 10000, 150, 150, 7, 10, 3, 2) },
        { id: 'mm-2013', from: '2013-10-22', whiteMax: 75, specialMax: 15, price: 1, prizes: prizeTable(1000000, 5000, 500, 50, 5, 5, 2, 1) },
        { id: 'mm-2017', from: '2017-10-31', whiteMax: 70, specialMax: 25, price: 2, prizes: prizeTable(1000000, 10000, 500, 200, 10, 10, 4, 2) },
        // Since April 2025 every $5 ticket carries a random 2X-10X multiplier applied to all non-jackpot prizes.
        {
          id: 'mm-2025', from: '2025-04-08', whiteMax: 70, specialMax: 24, price: 5,
          prizes: prizeTable(1000000, 10000, 500, 200, 10, 10, 7, 5),
          builtInMultiplier: [[2, 15 / 32], [3, 10 / 32], [4, 4 / 32], [5, 2 / 32], [10, 1 / 32]],
        },
      ],
    },
  };

  function eraFor(game, date) {
    const eras = GAMES[game].eras;
    let era = eras[0];
    for (let i = 1; i < eras.length; i++) if (eras[i].from <= date) era = eras[i];
    return era;
  }

  function currentEra(game) {
    const eras = GAMES[game].eras;
    return eras[eras.length - 1];
  }

  function eraLabel(game, era) {
    const eras = GAMES[game].eras;
    const next = eras[eras.indexOf(era) + 1];
    const until = next ? addDays(next.from, -1).slice(0, 4) : 'now';
    return '5 of ' + era.whiteMax + ' + 1 of ' + era.specialMax + ' (' + era.from.slice(0, 4) + '–' + until + ')';
  }

  // ---------------------------------------------------------------- dates

  function parseDate(s) {
    return Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
  }
  function formatDate(ms) {
    return new Date(ms).toISOString().slice(0, 10);
  }
  function addDays(s, n) {
    return formatDate(parseDate(s) + n * 86400000);
  }
  function dayOfWeek(s) {
    return new Date(parseDate(s)).getUTCDay();
  }
  function isValidDate(s) {
    return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && formatDate(parseDate(s)) === s;
  }
  function addYears(s, n) {
    const y = +s.slice(0, 4) + n;
    const candidate = y + s.slice(4);
    return isValidDate(candidate) ? candidate : y + '-02-28';
  }

  function scheduledDays(game, date) {
    const sched = GAMES[game].schedule;
    let days = sched[0].days;
    for (let i = 1; i < sched.length; i++) if (sched[i].from <= date) days = sched[i].days;
    return days;
  }

  /** Every date a drawing was scheduled between `from` and `to` (inclusive). */
  function expectedDates(game, from, to) {
    const out = [];
    for (let d = from; d <= to; d = addDays(d, 1)) {
      if (scheduledDays(game, d).indexOf(dayOfWeek(d)) !== -1) out.push(d);
    }
    return out;
  }

  /** Coverage report: scheduled dates with no record, and records on unscheduled dates. */
  function coverage(game, draws) {
    if (!draws.length) return { first: null, last: null, count: 0, missing: [], unexpected: [] };
    const first = draws[0].d;
    const last = draws[draws.length - 1].d;
    const have = new Set(draws.map((x) => x.d));
    const expected = expectedDates(game, first, last);
    const expectedSet = new Set(expected);
    return {
      first, last, count: draws.length,
      missing: expected.filter((d) => !have.has(d)),
      unexpected: draws.map((x) => x.d).filter((d) => !expectedSet.has(d)),
    };
  }

  /** Next scheduled drawing in US Eastern time, as { date, label }. */
  function nextDraw(game, now) {
    const g = GAMES[game];
    const parts = {};
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(now || new Date()).forEach((p) => { parts[p.type] = p.value; });
    const today = parts.year + '-' + parts.month + '-' + parts.day;
    const minutesNow = +parts.hour * 60 + +parts.minute;
    const drawMinutes = g.drawTimeET[0] * 60 + g.drawTimeET[1];
    for (let i = 0; i < 8; i++) {
      const d = addDays(today, i);
      if (scheduledDays(game, d).indexOf(dayOfWeek(d)) === -1) continue;
      if (i === 0 && minutesNow >= drawMinutes) continue;
      const h = g.drawTimeET[0] % 12 || 12;
      const mm = String(g.drawTimeET[1]).padStart(2, '0');
      return { date: d, daysAway: i, time: h + ':' + mm + ' PM ET' };
    }
    return null;
  }

  // ---------------------------------------------------------------- records

  /** Unpack a compact data row [date, w1..w5, special, multiplier, jackpot, sources]. */
  function unpackDraw(row) {
    return { d: row[0], w: [row[1], row[2], row[3], row[4], row[5]], s: row[6], m: row[7], j: row[8], src: row[9] || '' };
  }
  function packDraw(x) {
    return [x.d, x.w[0], x.w[1], x.w[2], x.w[3], x.w[4], x.s, x.m == null ? null : x.m, x.j == null ? null : x.j, x.src || ''];
  }

  /** Returns a list of problems with a draw record under the rules in force on its date (empty = valid). */
  function validateDraw(game, rec) {
    const errors = [];
    if (!GAMES[game]) return ['unknown game'];
    if (!rec || !isValidDate(rec.d)) return ['invalid date'];
    const era = eraFor(game, rec.d);
    if (rec.d < GAMES[game].eras[0].from) errors.push('date precedes supported rules');
    if (!Array.isArray(rec.w) || rec.w.length !== 5) errors.push('expected 5 main numbers');
    else {
      const seen = new Set();
      rec.w.forEach((n) => {
        if (!Number.isInteger(n) || n < 1 || n > era.whiteMax) errors.push('main number ' + n + ' outside 1-' + era.whiteMax);
        if (seen.has(n)) errors.push('duplicate main number ' + n);
        seen.add(n);
      });
    }
    if (!Number.isInteger(rec.s) || rec.s < 1 || rec.s > era.specialMax) {
      errors.push(GAMES[game].special + ' ' + rec.s + ' outside 1-' + era.specialMax);
    }
    return errors;
  }

  function drawSignature(rec) {
    return rec.w.slice().sort((a, b) => a - b).join('-') + '|' + rec.s;
  }

  /** Parse one NY Open Data (Socrata) row. Returns a draw record or null. */
  function parseNyRow(game, row) {
    if (!row || !row.draw_date || !row.winning_numbers) return null;
    const nums = String(row.winning_numbers).trim().split(/\s+/).map(Number);
    let special;
    let whites;
    if (game === 'powerball') {
      if (nums.length !== 6) return null;
      whites = nums.slice(0, 5);
      special = nums[5];
    } else {
      if (nums.length !== 5 || row.mega_ball == null) return null;
      whites = nums;
      special = Number(row.mega_ball);
    }
    const mult = row.multiplier == null || row.multiplier === '' ? null : Number(row.multiplier);
    return {
      d: String(row.draw_date).slice(0, 10),
      w: whites.sort((a, b) => a - b),
      s: special,
      m: Number.isFinite(mult) && mult > 0 ? mult : null,
      j: null,
    };
  }

  // ---------------------------------------------------------------- filters

  /**
   * filter: {type:'all'} | {type:'last', n} | {type:'years', n} | {type:'current'} | {type:'range', from, to}
   * `draws` must be sorted oldest first. "years" counts back from the newest drawing.
   */
  function applyFilter(draws, filter, game) {
    if (!filter || !draws.length) return draws.slice();
    switch (filter.type) {
      case 'last':
        return draws.slice(-Math.max(1, filter.n | 0));
      case 'years': {
        const cutoff = addYears(draws[draws.length - 1].d, -filter.n);
        return draws.filter((x) => x.d > cutoff);
      }
      case 'current': {
        const from = currentEra(game).from;
        return draws.filter((x) => x.d >= from);
      }
      case 'range':
        return draws.filter((x) => (!filter.from || x.d >= filter.from) && (!filter.to || x.d <= filter.to));
      default:
        return draws.slice();
    }
  }

  // ---------------------------------------------------------------- math helpers

  function erf(x) {
    const sign = x < 0 ? -1 : 1;
    const ax = Math.abs(x);
    const t = 1 / (1 + 0.3275911 * ax);
    const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-ax * ax);
    return sign * y;
  }
  function normalCdf(z) {
    return 0.5 * (1 + erf(z / Math.SQRT2));
  }
  function twoSidedP(z) {
    return Math.min(1, 2 * (1 - normalCdf(Math.abs(z))));
  }

  function logGamma(x) {
    const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
    let y = x;
    let tmp = x + 5.5;
    tmp -= (x + 0.5) * Math.log(tmp);
    let ser = 1.000000000190015;
    for (let j = 0; j < 6; j++) ser += c[j] / ++y;
    return -tmp + Math.log((2.5066282746310005 * ser) / x);
  }
  /** Upper regularized incomplete gamma Q(a, x). */
  function gammaQ(a, x) {
    if (x <= 0) return 1;
    if (x < a + 1) {
      let ap = a;
      let sum = 1 / a;
      let del = sum;
      for (let n = 0; n < 500; n++) {
        ap += 1;
        del *= x / ap;
        sum += del;
        if (Math.abs(del) < Math.abs(sum) * 1e-12) break;
      }
      return 1 - sum * Math.exp(-x + a * Math.log(x) - logGamma(a));
    }
    let b = x + 1 - a;
    let c = 1 / 1e-300;
    let d = 1 / b;
    let h = d;
    for (let i = 1; i < 500; i++) {
      const an = -i * (i - a);
      b += 2;
      d = an * d + b;
      if (Math.abs(d) < 1e-300) d = 1e-300;
      c = b + an / c;
      if (Math.abs(c) < 1e-300) c = 1e-300;
      d = 1 / d;
      const del = d * c;
      h *= del;
      if (Math.abs(del - 1) < 1e-12) break;
    }
    return Math.exp(-x + a * Math.log(x) - logGamma(a)) * h;
  }
  /** P(chi-square with k degrees of freedom > x). */
  function chiSquareSf(x, k) {
    return k > 0 ? gammaQ(k / 2, x / 2) : 1;
  }

  function choose(n, k) {
    if (k < 0 || k > n) return 0;
    let r = 1;
    for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
    return Math.round(r);
  }

  // ---------------------------------------------------------------- number statistics

  /**
   * Per-number statistics for the white balls (kind 'white') or the special ball (kind 'special').
   *
   * `draws`  — the analysed window, oldest first.
   * `history`— optional full history (oldest first) used only for "last seen" recency.
   *
   * Rule changes are handled per drawing: a number only counts as eligible in drawings whose
   * matrix included it, and its expected count is the sum of its per-drawing probabilities
   * (5/pool for a white ball, 1/pool for the special ball).
   */
  function numberStats(draws, game, kind, history) {
    const k = kind === 'white' ? 5 : 1;
    const cur = currentEra(game);
    const curMax = kind === 'white' ? cur.whiteMax : cur.specialMax;
    let maxN = curMax;
    const pools = new Array(draws.length);
    for (let i = 0; i < draws.length; i++) {
      const era = eraFor(game, draws[i].d);
      pools[i] = kind === 'white' ? era.whiteMax : era.specialMax;
      if (pools[i] > maxN) maxN = pools[i];
    }
    const n = draws.length;
    const size = maxN + 1;
    const count = new Float64Array(size);
    const eligible = new Float64Array(size);
    const expected = new Float64Array(size);
    const variance = new Float64Array(size);
    const sinceHit = new Int32Array(size).fill(-1); // -1 = not seen yet in the window
    const longest = new Int32Array(size);
    const gapSum = new Float64Array(size);
    const gapCount = new Int32Array(size);
    const recentSizes = [25, 50, 100, 500];
    const recent = recentSizes.map(() => new Int32Array(size));
    const trendN = Math.min(50, Math.max(5, Math.floor(n / 3)));
    const trendCount = new Float64Array(size);
    const trendExpected = new Float64Array(size);

    for (let i = 0; i < n; i++) {
      const pool = pools[i];
      const p = k / pool;
      const fromEnd = n - i; // 1 = newest drawing
      for (let num = 1; num <= pool; num++) {
        eligible[num]++;
        expected[num] += p;
        variance[num] += p * (1 - p);
        if (sinceHit[num] >= 0) sinceHit[num]++;
        if (fromEnd <= trendN) trendExpected[num] += p;
      }
      const hits = kind === 'white' ? draws[i].w : [draws[i].s];
      for (let h = 0; h < hits.length; h++) {
        const num = hits[h];
        count[num]++;
        if (sinceHit[num] > 0) {
          gapSum[num] += sinceHit[num];
          gapCount[num]++;
          if (sinceHit[num] > longest[num]) longest[num] = sinceHit[num];
        }
        sinceHit[num] = 0;
        for (let r = 0; r < recentSizes.length; r++) if (fromEnd <= recentSizes[r]) recent[r][num]++;
        if (fromEnd <= trendN) trendCount[num]++;
      }
    }

    // Recency from the full history, so "last seen" stays truthful for short windows.
    const hist = history && history.length ? history : draws;
    const lastSeen = new Array(size).fill(null);
    const drawsSince = new Int32Array(size).fill(-1);
    for (let i = hist.length - 1, found = 0; i >= 0 && found < maxN; i--) {
      const hits = kind === 'white' ? hist[i].w : [hist[i].s];
      for (let h = 0; h < hits.length; h++) {
        const num = hits[h];
        if (num <= maxN && lastSeen[num] === null) {
          lastSeen[num] = hist[i].d;
          drawsSince[num] = hist.length - 1 - i;
          found++;
        }
      }
    }

    const out = [];
    for (let num = 1; num <= maxN; num++) {
      const sd = Math.sqrt(variance[num]);
      const z = sd > 0 ? (count[num] - expected[num]) / sd : 0;
      const ratio = expected[num] > 0 ? count[num] / expected[num] : 0;
      const recentRatio = trendExpected[num] > 0 ? trendCount[num] / trendExpected[num] : 0;
      const openGap = sinceHit[num] >= 0 ? sinceHit[num] : eligible[num];
      out.push({
        n: num,
        validNow: num <= curMax,
        count: count[num],
        eligible: eligible[num],
        pct: eligible[num] ? (100 * count[num]) / eligible[num] : 0,
        expected: expected[num],
        diff: count[num] - expected[num],
        ratio,
        z,
        p: twoSidedP(z),
        last25: recent[0][num], last50: recent[1][num], last100: recent[2][num], last500: recent[3][num],
        drawsSince: drawsSince[num],
        lastSeen: lastSeen[num],
        longestGap: Math.max(longest[num], openGap),
        avgGap: gapCount[num] ? gapSum[num] / gapCount[num] : null,
        trend: recentRatio - ratio,
        trendWindow: trendN,
      });
    }
    return out;
  }

  /**
   * Approximate chi-square test of "all numbers equally likely" across the analysed window.
   * For k balls drawn without replacement from N, (N-1)/N * sum(z^2) is ~ chi-square(N-1).
   */
  function uniformityTest(stats) {
    const used = stats.filter((s) => s.eligible > 0 && s.expected > 0);
    if (used.length < 2) return null;
    const N = used.length;
    const stat = ((N - 1) / N) * used.reduce((a, s) => a + s.z * s.z, 0);
    return { stat, df: N - 1, p: chiSquareSf(stat, N - 1) };
  }

  // ---------------------------------------------------------------- combinations

  /** Most frequent `size`-number groups (2 = pairs, 3 = triplets) drawn together. Real co-occurrences only. */
  function comboCounts(draws, size, limit) {
    const map = new Map();
    for (let i = 0; i < draws.length; i++) {
      const w = draws[i].w;
      const d = draws[i].d;
      const bump = (key) => {
        const e = map.get(key);
        if (e) { e.c++; e.last = d; } else map.set(key, { c: 1, last: d });
      };
      for (let a = 0; a < 5; a++) {
        for (let b = a + 1; b < 5; b++) {
          if (size === 2) bump(w[a] * 100 + w[b]);
          else for (let c = b + 1; c < 5; c++) bump(w[a] * 10000 + w[b] * 100 + w[c]);
        }
      }
    }
    const rows = [];
    map.forEach((e, key) => {
      const nums = size === 2 ? [Math.floor(key / 100), key % 100] : [Math.floor(key / 10000), Math.floor(key / 100) % 100, key % 100];
      rows.push({ nums, count: e.c, last: e.last });
    });
    rows.sort((x, y) => y.count - x.count || (x.last < y.last ? 1 : x.last > y.last ? -1 : 0) || x.nums[0] - y.nums[0]);
    return limit ? rows.slice(0, limit) : rows;
  }

  /** Symmetric co-occurrence counts between white balls: matrix.m[a * matrix.n + b]. */
  function pairMatrix(draws, maxN) {
    const n = maxN + 1;
    const m = new Uint16Array(n * n);
    for (let i = 0; i < draws.length; i++) {
      const w = draws[i].w;
      for (let a = 0; a < 5; a++) {
        for (let b = a + 1; b < 5; b++) {
          if (w[a] <= maxN && w[b] <= maxN) { m[w[a] * n + w[b]]++; m[w[b] * n + w[a]]++; }
        }
      }
    }
    return { n, m };
  }

  /** Full five-number main combinations that were drawn more than once. */
  function repeatedCombos(draws) {
    const map = new Map();
    draws.forEach((x) => {
      const key = x.w.join('-');
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(x.d);
    });
    const out = [];
    map.forEach((dates, key) => { if (dates.length > 1) out.push({ nums: key.split('-').map(Number), dates }); });
    return out;
  }

  // ---------------------------------------------------------------- pattern statistics

  function describeNumbers(w, whiteMax) {
    const lowMax = Math.floor(whiteMax / 2);
    let odd = 0;
    let low = 0;
    let sum = 0;
    let consecutive = 0;
    for (let i = 0; i < w.length; i++) {
      if (w[i] % 2) odd++;
      if (w[i] <= lowMax) low++;
      sum += w[i];
      if (i > 0 && w[i] - w[i - 1] === 1) consecutive++;
    }
    return { odd, even: w.length - odd, low, high: w.length - low, sum, spread: w[w.length - 1] - w[0], consecutive, lowMax };
  }

  /** Descriptive pattern statistics for a window of drawings (oldest first). */
  function patternStats(draws, game) {
    const n = draws.length;
    const oddDist = new Array(6).fill(0);
    const lowDist = new Array(6).fill(0);
    const repeatDist = new Array(6).fill(0);
    const consecDist = new Array(5).fill(0);
    const decades = {};
    const lastDigit = new Array(10).fill(0);
    const sums = [];
    const spreads = [];
    const byYear = {};
    const byMonth = new Array(12).fill(null).map(() => ({ draws: 0, sum: 0 }));
    let prev = null;
    let repeatBase = 0;
    for (let i = 0; i < n; i++) {
      const x = draws[i];
      const era = eraFor(game, x.d);
      const info = describeNumbers(x.w, era.whiteMax);
      oddDist[info.odd]++;
      lowDist[info.low]++;
      consecDist[info.consecutive]++;
      sums.push(info.sum);
      spreads.push(info.spread);
      x.w.forEach((num) => {
        const dec = Math.floor((num - 1) / 10);
        decades[dec] = (decades[dec] || 0) + 1;
        lastDigit[num % 10]++;
      });
      if (prev) {
        let rep = 0;
        x.w.forEach((num) => { if (prev.w.indexOf(num) !== -1) rep++; });
        repeatDist[rep]++;
        repeatBase++;
      }
      prev = x;
      const year = x.d.slice(0, 4);
      const y = byYear[year] || (byYear[year] = { year, draws: 0, sum: 0, counts: {}, specials: {} });
      y.draws++;
      y.sum += info.sum;
      x.w.forEach((num) => { y.counts[num] = (y.counts[num] || 0) + 1; });
      y.specials[x.s] = (y.specials[x.s] || 0) + 1;
      const mo = byMonth[+x.d.slice(5, 7) - 1];
      mo.draws++;
      mo.sum += info.sum;
    }
    const top = (obj) => {
      let best = null;
      Object.keys(obj).forEach((key) => { if (best === null || obj[key] > obj[best] || (obj[key] === obj[best] && +key < +best)) best = key; });
      return best === null ? null : { n: +best, count: obj[best] };
    };
    const sorted = sums.slice().sort((a, b) => a - b);
    const mean = n ? sums.reduce((a, b) => a + b, 0) / n : 0;
    const histogram = {};
    sums.forEach((s) => { const b = Math.floor(s / 20) * 20; histogram[b] = (histogram[b] || 0) + 1; });
    const spreadHist = {};
    spreads.forEach((s) => { const b = Math.floor(s / 10) * 10; spreadHist[b] = (spreadHist[b] || 0) + 1; });
    return {
      draws: n,
      oddDist, lowDist, repeatDist, repeatBase, consecDist,
      withConsecutive: n - consecDist[0],
      decades: Object.keys(decades).map(Number).sort((a, b) => a - b).map((d) => ({ label: d * 10 + 1 + '–' + (d * 10 + 10), count: decades[d] })),
      lastDigit,
      sum: {
        mean, min: sorted[0] || 0, max: sorted[n - 1] || 0, median: n ? sorted[Math.floor(n / 2)] : 0,
        histogram: Object.keys(histogram).map(Number).sort((a, b) => a - b).map((b) => ({ label: b + '–' + (b + 19), from: b, count: histogram[b] })),
      },
      spread: {
        mean: n ? spreads.reduce((a, b) => a + b, 0) / n : 0,
        histogram: Object.keys(spreadHist).map(Number).sort((a, b) => a - b).map((b) => ({ label: b + '–' + (b + 9), from: b, count: spreadHist[b] })),
      },
      byYear: Object.keys(byYear).sort().map((year) => {
        const y = byYear[year];
        return { year, draws: y.draws, avgSum: y.sum / y.draws, topWhite: top(y.counts), topSpecial: top(y.specials) };
      }),
      byMonth: byMonth.map((mo, i) => ({ month: i + 1, draws: mo.draws, avgSum: mo.draws ? mo.sum / mo.draws : 0 })),
    };
  }

  /** White balls most often drawn in the same drawing as a given special ball. */
  function whitesWithSpecial(draws, special, limit) {
    const counts = {};
    let total = 0;
    draws.forEach((x) => {
      if (x.s !== special) return;
      total++;
      x.w.forEach((num) => { counts[num] = (counts[num] || 0) + 1; });
    });
    const rows = Object.keys(counts).map((key) => ({ n: +key, count: counts[key] }));
    rows.sort((a, b) => b.count - a.count || a.n - b.n);
    return { draws: total, rows: limit ? rows.slice(0, limit) : rows };
  }

  // ---------------------------------------------------------------- random sources

  /** Cryptographically secure RNG. int(n) uses rejection sampling, so there is no modulo bias. */
  function cryptoRng() {
    const c = typeof crypto !== 'undefined' && crypto.getRandomValues ? crypto : require('crypto').webcrypto;
    const buf = new Uint32Array(2);
    return {
      secure: true,
      int(n) {
        const limit = Math.floor(4294967296 / n) * n;
        let x;
        do { c.getRandomValues(buf); x = buf[0]; } while (x >= limit);
        return x % n;
      },
      float() {
        c.getRandomValues(buf);
        return ((buf[0] >>> 5) * 67108864 + (buf[1] >>> 6)) / 9007199254740992;
      },
    };
  }

  /** Deterministic RNG (mulberry32) for reproducible backtests and tests. Not for real picks. */
  function seededRng(seed) {
    let a = seed >>> 0;
    const next = () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    return { secure: false, float: next, int: (n) => Math.floor(next() * n) };
  }

  // ---------------------------------------------------------------- generator

  const STRATEGIES = [
    { key: 'hot', name: 'Hot Numbers', desc: 'Favors numbers drawn more often than expected in the selected period. Weight = ((count + 1) / (expected + 1)) ^ intensity.' },
    { key: 'cold', name: 'Cold Numbers', desc: 'Favors numbers drawn less often than expected in the selected period. Weight = ((expected + 1) / (count + 1)) ^ intensity.' },
    { key: 'mix', name: 'Hot & Cold Mix', desc: 'Splits numbers into hot, average and cold thirds by observed/expected frequency, then takes a set number from each third.' },
    { key: 'recent', name: 'Recent Trends', desc: 'Weights each number by how often it appeared in the most recent 25, 50 or 100 drawings. Weight = (recent count + 0.5) ^ intensity.' },
    { key: 'longterm', name: 'Long-Term Frequency', desc: 'Weights by observed/expected frequency over the last 5, 10 or 20 years, where "expected" accounts for the rules in force at each drawing.' },
    { key: 'balanced', name: 'Balanced Combinations', desc: 'Uniform random picks that are kept only if they meet your odd/even, low/high, spread and sum limits.' },
    { key: 'pairing', name: 'Number Pairing', desc: 'Starts from a pair or triplet that was historically drawn together, then fills the ticket with numbers that most often appeared alongside them.' },
    { key: 'random', name: 'Pure Random', desc: 'Unbiased Quick Pick using the browser\'s cryptographically secure random generator. Ignores all history.' },
    { key: 'custom', name: 'Custom Weighted', desc: 'Your own weights: boost favourites, lock numbers into every ticket, and exclude numbers entirely.' },
    { key: 'ensemble', name: 'Ensemble', desc: 'Blends the weight tables of several strategies using the mix you set.' },
  ];

  function strategyByKey(key) {
    return STRATEGIES.filter((s) => s.key === key)[0] || null;
  }

  function statsByNumber(draws, game, kind) {
    const idx = [];
    numberStats(draws, game, kind).forEach((s) => { idx[s.n] = s; });
    return idx;
  }

  function ratioWeight(stat) {
    return stat ? (stat.count + 1) / (stat.expected + 1) : 1;
  }

  /**
   * Builds the sampling context for one target drawing.
   *   period — drawings the hot/cold/mix/pairing strategies learn from
   *   all    — everything known before the target drawing (recent/long-term windows are cut from it)
   *   era    — rules the generated tickets must satisfy (defaults to the current game matrix)
   */
  function makeContext(game, all, period, opts, era) {
    return { game, all: all || [], period: period || all || [], opts: opts || {}, era: era || currentEra(game), cache: {} };
  }

  function cached(ctx, key, fn) {
    if (!(key in ctx.cache)) ctx.cache[key] = fn();
    return ctx.cache[key];
  }

  /** Static weight table (index = ball number) for the weight-based strategies. */
  function weightTable(strategy, ctx, kind) {
    return cached(ctx, 'w:' + strategy + ':' + kind, () => {
      const max = kind === 'white' ? ctx.era.whiteMax : ctx.era.specialMax;
      const o = ctx.opts;
      const w = new Float64Array(max + 1);
      const intensity = Math.max(0.1, +o.intensity || 3);
      let stats;
      switch (strategy) {
        case 'hot':
        case 'cold':
          stats = cached(ctx, 'period:' + kind, () => statsByNumber(ctx.period, ctx.game, kind));
          for (let i = 1; i <= max; i++) {
            const r = ratioWeight(stats[i]);
            w[i] = Math.pow(strategy === 'hot' ? r : 1 / r, intensity);
          }
          break;
        case 'recent': {
          const recentN = +o.recentN || 50;
          stats = cached(ctx, 'recent:' + recentN + ':' + kind, () => statsByNumber(ctx.all.slice(-recentN), ctx.game, kind));
          for (let i = 1; i <= max; i++) w[i] = Math.pow((stats[i] ? stats[i].count : 0) + 0.5, +o.recentIntensity || 2);
          break;
        }
        case 'longterm': {
          const years = +o.years || 20;
          stats = cached(ctx, 'long:' + years + ':' + kind, () => statsByNumber(applyFilter(ctx.all, { type: 'years', n: years }, ctx.game), ctx.game, kind));
          for (let i = 1; i <= max; i++) w[i] = Math.pow(ratioWeight(stats[i]), +o.longIntensity || 2);
          break;
        }
        case 'custom': {
          const src = (kind === 'white' ? o.whiteWeights : o.specialWeights) || {};
          for (let i = 1; i <= max; i++) w[i] = src[i] == null ? 1 : Math.max(0, +src[i]);
          break;
        }
        default:
          for (let i = 1; i <= max; i++) w[i] = 1;
      }
      return w;
    });
  }

  function getPairMatrix(ctx) {
    return cached(ctx, 'pairs', () => pairMatrix(ctx.period, ctx.era.whiteMax));
  }

  /** Affinity of each white ball to the already-selected ones: 1 + sum of co-occurrence counts. */
  function affinityWeights(ctx, selected) {
    const max = ctx.era.whiteMax;
    const pm = getPairMatrix(ctx);
    const w = new Float64Array(max + 1);
    for (let i = 1; i <= max; i++) {
      let a = 1;
      for (let s = 0; s < selected.length; s++) a += pm.m[selected[s] * pm.n + i];
      w[i] = a;
    }
    return w;
  }

  function pickWeighted(weights, blocked, rng) {
    let total = 0;
    for (let i = 1; i < weights.length; i++) if (!blocked[i]) total += weights[i];
    if (total <= 0) return 0;
    let r = rng.float() * total;
    let lastOk = 0;
    for (let i = 1; i < weights.length; i++) {
      if (blocked[i] || weights[i] <= 0) continue;
      lastOk = i;
      r -= weights[i];
      if (r < 0) return i;
    }
    return lastOk;
  }

  function pickUniform(max, count, rng, blocked) {
    const pool = [];
    for (let i = 1; i <= max; i++) if (!blocked || !blocked[i]) pool.push(i);
    const out = [];
    for (let i = 0; i < count && pool.length; i++) {
      const j = rng.int(pool.length);
      out.push(pool[j]);
      pool[j] = pool[pool.length - 1];
      pool.pop();
    }
    return out;
  }

  function normalized(weights) {
    let total = 0;
    for (let i = 1; i < weights.length; i++) total += weights[i];
    const out = new Float64Array(weights.length);
    if (total > 0) for (let i = 1; i < weights.length; i++) out[i] = weights[i] / total;
    return out;
  }

  /** Draw the remaining white balls one at a time; `weightsAt(selected)` may depend on earlier picks. */
  function sampleWhites(ctx, rng, weightsAt, preset, excluded) {
    const blocked = new Uint8Array(ctx.era.whiteMax + 1);
    (excluded || []).forEach((n) => { if (n >= 1 && n <= ctx.era.whiteMax) blocked[n] = 1; });
    const selected = [];
    (preset || []).forEach((n) => {
      if (selected.length < 5 && n >= 1 && n <= ctx.era.whiteMax && selected.indexOf(n) === -1) { selected.push(n); blocked[n] = 1; }
    });
    while (selected.length < 5) {
      let n = pickWeighted(weightsAt(selected), blocked, rng);
      if (!n) {
        // Every remaining weight is zero: fall back to a uniform pick among allowed numbers.
        const rest = pickUniform(ctx.era.whiteMax, 1, rng, blocked);
        if (!rest.length) return null;
        n = rest[0];
      }
      selected.push(n);
      blocked[n] = 1;
    }
    return selected;
  }

  function sampleSpecial(ctx, rng, weights, excluded) {
    const blocked = new Uint8Array(ctx.era.specialMax + 1);
    (excluded || []).forEach((n) => { if (n >= 1 && n <= ctx.era.specialMax) blocked[n] = 1; });
    const n = pickWeighted(weights, blocked, rng);
    if (n) return n;
    const rest = pickUniform(ctx.era.specialMax, 1, rng, blocked);
    return rest.length ? rest[0] : 0;
  }

  /** Theoretical mean and standard deviation of the sum of five numbers from 1..max. */
  function sumMoments(max) {
    return { mean: (5 * (max + 1)) / 2, sd: Math.sqrt((5 * (max + 1) * (max - 5)) / 12) };
  }

  function defaultBalance(era) {
    const m = sumMoments(era.whiteMax);
    return {
      oddMin: 2, oddMax: 3, lowMin: 2, lowMax: 3,
      sumMin: Math.round(m.mean - m.sd), sumMax: Math.round(m.mean + m.sd),
      spreadMin: 20, spreadMax: era.whiteMax - 1,
    };
  }

  function meetsBalance(w, era, b) {
    const info = describeNumbers(w, era.whiteMax);
    return info.odd >= b.oddMin && info.odd <= b.oddMax && info.low >= b.lowMin && info.low <= b.lowMax &&
      info.sum >= b.sumMin && info.sum <= b.sumMax && info.spread >= b.spreadMin && info.spread <= b.spreadMax;
  }

  /** Generates one ticket ({w: sorted whites, s: special}) or null when the settings cannot be satisfied. */
  function generateOne(strategy, ctx, rng) {
    const era = ctx.era;
    const o = ctx.opts;
    let whites = null;
    let special = 0;
    const byNum = (a, b) => a - b;

    switch (strategy) {
      case 'random':
        whites = pickUniform(era.whiteMax, 5, rng);
        special = 1 + rng.int(era.specialMax);
        break;

      case 'balanced': {
        const b = Object.assign(defaultBalance(era), o.balance || {});
        for (let attempt = 0; attempt < 20000 && !whites; attempt++) {
          const cand = pickUniform(era.whiteMax, 5, rng).sort(byNum);
          if (meetsBalance(cand, era, b)) whites = cand;
        }
        special = 1 + rng.int(era.specialMax);
        break;
      }

      case 'mix': {
        const stats = cached(ctx, 'period:white', () => statsByNumber(ctx.period, ctx.game, 'white'));
        const groups = cached(ctx, 'mixgroups', () => {
          const order = [];
          for (let i = 1; i <= era.whiteMax; i++) order.push(i);
          order.sort((a, b) => ratioWeight(stats[b]) - ratioWeight(stats[a]) || a - b);
          const third = Math.floor(order.length / 3);
          return { hot: order.slice(0, third), cold: order.slice(order.length - third), mid: order.slice(third, order.length - third) };
        });
        const nHot = Math.min(5, Math.max(0, o.mixHot == null ? 2 : +o.mixHot));
        const nCold = Math.min(5 - nHot, Math.max(0, o.mixCold == null ? 2 : +o.mixCold));
        const take = (arr, count) => {
          const copy = arr.slice();
          const out = [];
          for (let i = 0; i < count && copy.length; i++) out.push(copy.splice(rng.int(copy.length), 1)[0]);
          return out;
        };
        whites = take(groups.hot, nHot).concat(take(groups.cold, nCold), take(groups.mid, 5 - nHot - nCold));
        const sStats = cached(ctx, 'period:special', () => statsByNumber(ctx.period, ctx.game, 'special'));
        const sOrder = [];
        for (let i = 1; i <= era.specialMax; i++) sOrder.push(i);
        sOrder.sort((a, b) => ratioWeight(sStats[b]) - ratioWeight(sStats[a]) || a - b);
        const sThird = Math.max(1, Math.floor(sOrder.length / 3));
        const which = rng.int(3);
        const sGroup = which === 0 ? sOrder.slice(0, sThird) : which === 1 ? sOrder.slice(sOrder.length - sThird) : sOrder.slice(sThird, sOrder.length - sThird);
        special = sGroup[rng.int(sGroup.length)];
        break;
      }

      case 'pairing': {
        const size = o.pairSize === 3 ? 3 : 2;
        const seeds = cached(ctx, 'seeds:' + size, () =>
          comboCounts(ctx.period, size).filter((c) => c.nums.every((n) => n <= era.whiteMax)).slice(0, 40));
        let preset = [];
        if (seeds.length) {
          const seedWeights = new Float64Array(seeds.length + 1);
          seeds.forEach((c, i) => { seedWeights[i + 1] = c.count; });
          const pick = pickWeighted(seedWeights, new Uint8Array(seeds.length + 1), rng);
          preset = seeds[Math.max(1, pick) - 1].nums.slice();
        }
        whites = sampleWhites(ctx, rng, (sel) => affinityWeights(ctx, sel), preset);
        // Special ball: mildly favors the ones seen more often than expected in the same period.
        special = sampleSpecial(ctx, rng, cached(ctx, 'pair:special', () => {
          const sStats = cached(ctx, 'period:special', () => statsByNumber(ctx.period, ctx.game, 'special'));
          const sw = new Float64Array(era.specialMax + 1);
          for (let i = 1; i <= era.specialMax; i++) sw[i] = ratioWeight(sStats[i]);
          return sw;
        }));
        break;
      }

      case 'ensemble': {
        const mix = o.ensemble || { hot: 1, recent: 1, random: 1 };
        const keys = Object.keys(mix).filter((key) => mix[key] > 0 && key !== 'pairing');
        const total = Object.keys(mix).reduce((a, key) => a + Math.max(0, +mix[key] || 0), 0);
        if (total <= 0) return generateOne('random', ctx, rng);
        const blendStatic = (kind) => cached(ctx, 'ens:' + kind, () => {
          const max = kind === 'white' ? era.whiteMax : era.specialMax;
          const out = new Float64Array(max + 1);
          keys.forEach((key) => {
            const part = normalized(weightTable(key, ctx, kind));
            for (let i = 1; i <= max; i++) out[i] += (mix[key] / total) * part[i];
          });
          return out;
        });
        const pairShare = Math.max(0, +mix.pairing || 0) / total;
        whites = sampleWhites(ctx, rng, (sel) => {
          const base = blendStatic('white');
          if (!pairShare) return base;
          const aff = normalized(affinityWeights(ctx, sel));
          const out = new Float64Array(base.length);
          for (let i = 1; i < base.length; i++) out[i] = base[i] + pairShare * aff[i];
          return out;
        });
        const sw = blendStatic('special');
        let any = false;
        for (let i = 1; i < sw.length; i++) if (sw[i] > 0) any = true;
        special = any ? sampleSpecial(ctx, rng, sw) : 1 + rng.int(era.specialMax);
        break;
      }

      case 'custom': {
        const ww = weightTable('custom', ctx, 'white');
        whites = sampleWhites(ctx, rng, () => ww, o.locks, o.excludes);
        special = o.lockSpecial && o.lockSpecial >= 1 && o.lockSpecial <= era.specialMax
          ? o.lockSpecial
          : sampleSpecial(ctx, rng, weightTable('custom', ctx, 'special'), o.excludeSpecials);
        break;
      }

      default: {
        const ww = weightTable(strategy, ctx, 'white');
        whites = sampleWhites(ctx, rng, () => ww);
        special = sampleSpecial(ctx, rng, weightTable(strategy, ctx, 'special'));
      }
    }

    if (!whites || whites.length !== 5 || !special) return null;
    return { w: whites.sort(byNum), s: special };
  }

  function ticketKey(t) {
    return t.w.join('-') + '+' + t.s;
  }

  /**
   * Generates a batch of tickets valid under ctx.era.
   * With unique=true duplicates are re-drawn; otherwise they are kept and flagged with dup=true.
   */
  function generateTickets(strategy, ctx, count, rng, unique) {
    const tickets = [];
    const seen = new Set();
    let failed = 0;
    for (let i = 0; i < count; i++) {
      let t = null;
      for (let attempt = 0; attempt < 200; attempt++) {
        t = generateOne(strategy, ctx, rng);
        if (!t) break;
        if (!unique || !seen.has(ticketKey(t))) break;
        t = null;
      }
      if (!t) { failed++; continue; }
      const key = ticketKey(t);
      t.dup = seen.has(key);
      t.strategy = strategy;
      seen.add(key);
      tickets.push(t);
    }
    return { tickets, failed };
  }

  // ---------------------------------------------------------------- ticket checking

  function scoreTicket(ticket, draw) {
    let white = 0;
    for (let i = 0; i < 5; i++) if (draw.w.indexOf(ticket.w[i]) !== -1) white++;
    return { white, special: ticket.s === draw.s, tier: white + '+' + (ticket.s === draw.s ? 1 : 0) };
  }

  /**
   * Base-game prize for a result under the rules in force on `date`.
   * Returns null for no prize, {jackpot:true} for the top prize, or {amount, max} in dollars.
   */
  function prizeFor(game, date, score) {
    const era = eraFor(game, date);
    const value = era.prizes[score.tier];
    if (value == null) return null;
    if (value === JACKPOT) return { jackpot: true, tier: score.tier };
    if (era.builtInMultiplier) return { amount: value * 2, max: value * 10, base: value, tier: score.tier };
    return { amount: value, max: value, base: value, tier: score.tier };
  }

  /** Whether a ticket's numbers were playable under the rules in force on `date`. */
  function ticketValidOn(game, date, ticket) {
    const era = eraFor(game, date);
    return ticket.w.every((n) => n >= 1 && n <= era.whiteMax) && ticket.s >= 1 && ticket.s <= era.specialMax;
  }

  /** Chance of each prize tier for one ticket, plus the expected non-jackpot return per ticket. */
  function theoreticalReturn(era) {
    const N = era.whiteMax;
    const M = era.specialMax;
    const totalWhite = choose(N, 5);
    const avgMult = era.builtInMultiplier ? era.builtInMultiplier.reduce((a, x) => a + x[0] * x[1], 0) : 1;
    let expected = 0;
    let anyPrize = 0;
    const tiers = [];
    for (let k = 5; k >= 0; k--) {
      for (let sp = 1; sp >= 0; sp--) {
        const tier = k + '+' + sp;
        const value = era.prizes[tier];
        if (value == null) continue;
        const prob = ((choose(5, k) * choose(N - 5, 5 - k)) / totalWhite) * (sp ? 1 / M : (M - 1) / M);
        anyPrize += prob;
        if (value !== JACKPOT) expected += prob * value * avgMult;
        tiers.push({ tier, prob, odds: 1 / prob, prize: value });
      }
    }
    return { tiers, expected, price: era.price, roi: expected / era.price - 1, anyPrize, jackpotOdds: totalWhite * M };
  }

  // ---------------------------------------------------------------- backtest

  /**
   * Replays a strategy over past drawings. For target drawing i the strategy only ever receives
   * draws[0..i-1] (`all`) and the last `trainWindow` of those (`period`) — never drawing i itself.
   *
   * params: { game, draws (oldest first), strategy, opts, testCount, ticketsPerDraw, trainWindow, trials, seed }
   * Returns per-trial totals for the strategy and for pure random tickets bought in the same drawings.
   */
  function backtest(params) {
    const game = params.game;
    const draws = params.draws;
    const trials = Math.max(1, params.trials | 0 || 1);
    const perDraw = Math.max(1, params.ticketsPerDraw | 0 || 1);
    const testCount = Math.min(Math.max(1, params.testCount | 0), Math.max(0, draws.length - 1));
    const start = draws.length - testCount;
    const seed = params.seed == null ? 12345 : params.seed;
    const newTotals = () => ({ tickets: 0, cost: 0, won: 0, wins: 0, tiers: {}, jackpots: 0 });
    const arms = { strategy: [], random: [] };
    const rngs = { strategy: [], random: [] };
    for (let t = 0; t < trials; t++) {
      arms.strategy.push(newTotals());
      arms.random.push(newTotals());
      rngs.strategy.push(seededRng(seed + t * 7919));
      rngs.random.push(seededRng(seed + 104729 + t * 7919));
    }
    let theoretical = 0;
    let theoreticalCost = 0;

    for (let i = start; i < draws.length; i++) {
      const target = draws[i];
      const era = eraFor(game, target.d);
      const known = draws.slice(0, i); // strictly earlier drawings only
      const period = params.trainWindow ? known.slice(-params.trainWindow) : known;
      const ctx = makeContext(game, known, period, params.opts, era);
      if (params.onContext) params.onContext(ctx, target);
      const th = theoreticalReturn(era);
      theoretical += th.expected * perDraw;
      theoreticalCost += era.price * perDraw;

      ['strategy', 'random'].forEach((arm) => {
        for (let t = 0; t < trials; t++) {
          const rng = rngs[arm][t];
          const totals = arms[arm][t];
          for (let n = 0; n < perDraw; n++) {
            const ticket = generateOne(arm === 'random' ? 'random' : params.strategy, ctx, rng) || generateOne('random', ctx, rng);
            totals.tickets++;
            totals.cost += era.price;
            const score = scoreTicket(ticket, target);
            const value = era.prizes[score.tier];
            if (value == null) continue;
            totals.wins++;
            totals.tiers[score.tier] = (totals.tiers[score.tier] || 0) + 1;
            if (value === JACKPOT) {
              totals.jackpots++;
              totals.won += target.j || 0;
            } else if (era.builtInMultiplier) {
              let r = rng.float();
              let mult = era.builtInMultiplier[0][0];
              for (let m = 0; m < era.builtInMultiplier.length; m++) {
                r -= era.builtInMultiplier[m][1];
                if (r < 0) { mult = era.builtInMultiplier[m][0]; break; }
              }
              totals.won += value * mult;
            } else totals.won += value;
          }
        }
      });
    }

    const summarize = (list) => {
      const rois = list.map((x) => (x.cost ? x.won / x.cost - 1 : 0)).sort((a, b) => a - b);
      const mean = (f) => list.reduce((a, x) => a + f(x), 0) / list.length;
      const q = (p) => rois[Math.min(rois.length - 1, Math.max(0, Math.round(p * (rois.length - 1))))];
      const tiers = {};
      list.forEach((x) => Object.keys(x.tiers).forEach((key) => { tiers[key] = (tiers[key] || 0) + x.tiers[key] / list.length; }));
      return {
        tickets: mean((x) => x.tickets), cost: mean((x) => x.cost), won: mean((x) => x.won), wins: mean((x) => x.wins),
        net: mean((x) => x.won - x.cost), roi: mean((x) => (x.cost ? x.won / x.cost - 1 : 0)),
        // The median is the "typical" trial; the mean can be lifted by one rare large prize.
        roiMedian: q(0.5), roiLow: q(0.05), roiHigh: q(0.95), roiMin: rois[0], roiMax: rois[rois.length - 1],
        jackpots: list.reduce((a, x) => a + x.jackpots, 0), tiers,
      };
    };

    return {
      game, strategy: params.strategy, trials, ticketsPerDraw: perDraw,
      drawsTested: draws.length - start,
      from: draws[start] ? draws[start].d : null,
      to: draws.length ? draws[draws.length - 1].d : null,
      strategyResult: summarize(arms.strategy),
      randomResult: summarize(arms.random),
      theoreticalRoi: theoreticalCost ? theoretical / theoreticalCost - 1 : 0,
    };
  }

  // ---------------------------------------------------------------- export helpers

  function csvCell(v) {
    const s = v == null ? '' : String(v);
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function toCsv(headers, rows) {
    return [headers].concat(rows).map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
  }
  function drawsToCsv(game, draws) {
    const g = GAMES[game];
    return toCsv(
      ['Game', 'Draw Date', 'N1', 'N2', 'N3', 'N4', 'N5', g.special, g.multiplier, 'Jackpot (USD)', 'Verified By'],
      draws.map((x) => [g.name, x.d, x.w[0], x.w[1], x.w[2], x.w[3], x.w[4], x.s, x.m, x.j, x.src])
    );
  }

  return {
    JACKPOT, GAMES, STRATEGIES, strategyByKey,
    eraFor, currentEra, eraLabel,
    parseDate, formatDate, addDays, addYears, dayOfWeek, isValidDate,
    scheduledDays, expectedDates, coverage, nextDraw,
    unpackDraw, packDraw, validateDraw, drawSignature, parseNyRow,
    applyFilter,
    normalCdf, twoSidedP, chiSquareSf, choose,
    numberStats, uniformityTest,
    comboCounts, pairMatrix, repeatedCombos,
    describeNumbers, patternStats, whitesWithSpecial,
    cryptoRng, seededRng,
    makeContext, weightTable, defaultBalance, meetsBalance, sumMoments,
    generateOne, generateTickets, ticketKey,
    scoreTicket, prizeFor, ticketValidOn, theoreticalReturn,
    backtest,
    toCsv, drawsToCsv,
  };
});
