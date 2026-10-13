'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../js/core.js');

const draw = (d, w, s, extra) => Object.assign({ d, w: w.slice().sort((a, b) => a - b), s, m: null, j: null, src: 'test' }, extra);

/** `count` synthetic Powerball drawings on consecutive days in the current format. */
function series(rows, start) {
  return rows.map((r, i) => draw(C.addDays(start || '2020-01-01', i), r[0], r[1]));
}

// ---------------------------------------------------------------- validation & rule changes

test('validateDraw accepts a valid drawing and rejects bad ones', () => {
  assert.deepEqual(C.validateDraw('powerball', draw('2024-03-02', [1, 15, 33, 52, 69], 26)), []);
  assert.ok(C.validateDraw('powerball', draw('2024-03-02', [1, 15, 33, 52, 70], 5)).length, 'main number above range');
  assert.ok(C.validateDraw('powerball', draw('2024-03-02', [0, 15, 33, 52, 60], 5)).length, 'zero is not a ball');
  assert.ok(C.validateDraw('powerball', draw('2024-03-02', [1, 15, 33, 52, 60], 27)).length, 'Powerball above range');
  assert.ok(C.validateDraw('powerball', draw('2024-03-02', [7, 7, 33, 52, 60], 5)).length, 'duplicate main number');
  assert.ok(C.validateDraw('powerball', draw('2024-03-02', [1, 15, 33, 52], 5)).length, 'only four main numbers');
  assert.ok(C.validateDraw('powerball', { d: '2024-02-30', w: [1, 2, 3, 4, 5], s: 1 }).length, 'impossible date');
  assert.ok(C.validateDraw('powerball', { d: '03/02/2024', w: [1, 2, 3, 4, 5], s: 1 }).length, 'wrong date format');
  assert.ok(C.validateDraw('powerball', draw('2024-03-02', [1, 2.5, 3, 4, 5], 1)).length, 'non-integer');
  assert.ok(C.validateDraw('bingo', draw('2024-03-02', [1, 2, 3, 4, 5], 1)).length, 'unknown game');
});

test('Powerball rules follow the format in force on each date', () => {
  const pool = (d) => { const e = C.eraFor('powerball', d); return [e.whiteMax, e.specialMax, e.price]; };
  assert.deepEqual(pool('2006-10-04'), [55, 42, 1]);
  assert.deepEqual(pool('2009-01-03'), [55, 42, 1]);
  assert.deepEqual(pool('2009-01-07'), [59, 39, 1]);
  assert.deepEqual(pool('2012-01-14'), [59, 39, 1]);
  assert.deepEqual(pool('2012-01-18'), [59, 35, 2]);
  assert.deepEqual(pool('2015-10-03'), [59, 35, 2]);
  assert.deepEqual(pool('2015-10-07'), [69, 26, 2]);
  assert.deepEqual(pool('2026-10-12'), [69, 26, 2]);
  // 60 only exists since October 2015; Powerball 40 only existed before 2012.
  assert.ok(C.validateDraw('powerball', draw('2014-06-04', [1, 2, 3, 4, 60], 5)).length);
  assert.deepEqual(C.validateDraw('powerball', draw('2016-06-04', [1, 2, 3, 4, 60], 5)), []);
  assert.deepEqual(C.validateDraw('powerball', draw('2008-06-04', [1, 2, 3, 4, 55], 40)), []);
  assert.ok(C.validateDraw('powerball', draw('2013-06-05', [1, 2, 3, 4, 55], 40)).length);
});

test('Mega Millions rules follow the format in force on each date', () => {
  const pool = (d) => { const e = C.eraFor('megamillions', d); return [e.whiteMax, e.specialMax, e.price]; };
  assert.deepEqual(pool('2006-10-03'), [56, 46, 1]);
  assert.deepEqual(pool('2013-10-18'), [56, 46, 1]);
  assert.deepEqual(pool('2013-10-22'), [75, 15, 1]);
  assert.deepEqual(pool('2017-10-27'), [75, 15, 1]);
  assert.deepEqual(pool('2017-10-31'), [70, 25, 2]);
  assert.deepEqual(pool('2025-04-04'), [70, 25, 2]);
  assert.deepEqual(pool('2025-04-08'), [70, 24, 5]);
  // Mega Ball 25 was retired in April 2025; main numbers 71-75 were only valid 2013-2017.
  assert.deepEqual(C.validateDraw('megamillions', draw('2024-12-31', [1, 2, 3, 4, 5], 25)), []);
  assert.ok(C.validateDraw('megamillions', draw('2025-04-08', [1, 2, 3, 4, 5], 25)).length);
  assert.deepEqual(C.validateDraw('megamillions', draw('2015-01-02', [1, 2, 3, 4, 75], 15)), []);
  assert.ok(C.validateDraw('megamillions', draw('2018-01-02', [1, 2, 3, 4, 75], 15)).length);
});

test('current format matches the published game matrices and odds', () => {
  assert.equal(C.currentEra('powerball').whiteMax, 69);
  assert.equal(C.currentEra('powerball').specialMax, 26);
  assert.equal(C.currentEra('megamillions').whiteMax, 70);
  assert.equal(C.currentEra('megamillions').specialMax, 24);
  assert.equal(C.theoreticalReturn(C.currentEra('powerball')).jackpotOdds, 292201338);
  assert.equal(C.theoreticalReturn(C.currentEra('megamillions')).jackpotOdds, 290472336);
  const anyPrize = 1 / C.theoreticalReturn(C.currentEra('powerball')).anyPrize;
  assert.ok(Math.abs(anyPrize - 24.87) < 0.01, 'overall Powerball odds are 1 in 24.87, got ' + anyPrize);
});

// ---------------------------------------------------------------- frequency, gaps, combinations

test('numberStats counts, percentages and expected values', () => {
  const draws = series([
    [[1, 2, 3, 4, 5], 1], [[1, 2, 3, 10, 11], 2], [[1, 20, 30, 40, 50], 1], [[6, 7, 8, 9, 10], 3],
  ]);
  const white = C.numberStats(draws, 'powerball', 'white');
  const special = C.numberStats(draws, 'powerball', 'special');
  assert.equal(white.length, 69);
  assert.equal(special.length, 26);
  const w = (n) => white[n - 1];
  assert.equal(w(1).count, 3);
  assert.equal(w(10).count, 2);
  assert.equal(w(69).count, 0);
  assert.equal(w(1).eligible, 4);
  assert.equal(w(1).pct, 75);
  assert.ok(Math.abs(w(1).expected - (4 * 5) / 69) < 1e-12);
  assert.ok(Math.abs(w(1).diff - (3 - 20 / 69)) < 1e-12);
  assert.equal(special[0].count, 2);
  assert.ok(Math.abs(special[0].expected - 4 / 26) < 1e-12);
  assert.equal(white.reduce((a, s) => a + s.count, 0), 20);
  assert.ok(Math.abs(white.reduce((a, s) => a + s.expected, 0) - 20) < 1e-9, 'expected counts sum to 5 per drawing');
  assert.ok(Math.abs(special.reduce((a, s) => a + s.expected, 0) - 4) < 1e-9, 'special expected sums to 1 per drawing');
});

test('numberStats handles a period that spans two formats', () => {
  // Two drawings under 5/59+35 and two under 5/69+26.
  const draws = [
    draw('2015-09-30', [1, 2, 3, 4, 59], 35), draw('2015-10-03', [1, 2, 3, 4, 5], 1),
    draw('2015-10-07', [1, 60, 61, 62, 69], 1), draw('2015-10-10', [5, 6, 7, 8, 9], 26),
  ];
  const white = C.numberStats(draws, 'powerball', 'white');
  const special = C.numberStats(draws, 'powerball', 'special');
  assert.equal(white[0].eligible, 4);
  assert.ok(Math.abs(white[0].expected - (2 * 5 / 59 + 2 * 5 / 69)) < 1e-12);
  assert.equal(white[59].eligible, 2, '60 was only eligible in the two later drawings');
  assert.ok(Math.abs(white[59].expected - (2 * 5) / 69) < 1e-12);
  assert.equal(special.length, 35, 'retired Powerballs still appear for the old drawings');
  assert.equal(special[34].validNow, false);
  assert.equal(special[34].eligible, 2);
  assert.equal(special[25].validNow, true);
  assert.ok(Math.abs(white.reduce((a, s) => a + s.expected, 0) - 20) < 1e-9);
});

test('gap statistics: longest gap, average gap and drawings since last seen', () => {
  // Number 7 appears at index 0, 3, 4 and 9 of 12 drawings.
  const rows = [];
  for (let i = 0; i < 12; i++) rows.push([[0, 3, 4, 9].indexOf(i) !== -1 ? [7, 21, 22, 23, 24] : [31, 32, 33, 34, 35], 1]);
  const stats = C.numberStats(series(rows), 'powerball', 'white');
  const seven = stats[6];
  assert.equal(seven.count, 4);
  assert.equal(seven.drawsSince, 2);
  assert.equal(seven.lastSeen, C.addDays('2020-01-01', 9));
  assert.equal(seven.longestGap, 5);
  assert.ok(Math.abs(seven.avgGap - (3 + 1 + 5) / 3) < 1e-12);
  const never = stats[0];
  assert.equal(never.count, 0);
  assert.equal(never.drawsSince, -1);
  assert.equal(never.lastSeen, null);
  assert.equal(never.longestGap, 12, 'an unseen number has an open gap covering the whole period');
  assert.equal(stats[30].drawsSince, 0, '31 is in the newest drawing');
});

test('recency uses the full history even when the analysed window is short', () => {
  const rows = [];
  for (let i = 0; i < 30; i++) rows.push([i === 2 ? [7, 21, 22, 23, 24] : [31, 32, 33, 34, 35], 1]);
  const all = series(rows);
  const stats = C.numberStats(all.slice(-10), 'powerball', 'white', all);
  assert.equal(stats[6].count, 0);
  assert.equal(stats[6].drawsSince, 27);
  assert.equal(stats[6].lastSeen, all[2].d);
});

test('pair and triplet counts come from real co-occurrences', () => {
  const draws = series([
    [[1, 2, 3, 4, 5], 1], [[1, 2, 3, 40, 50], 1], [[1, 2, 30, 41, 51], 1], [[10, 20, 30, 41, 51], 1],
  ]);
  const pairs = C.comboCounts(draws, 2);
  const triplets = C.comboCounts(draws, 3);
  const find = (list, nums) => list.filter((c) => c.nums.join('-') === nums.join('-'))[0];
  assert.equal(pairs[0].nums.join('-'), '1-2');
  assert.equal(pairs[0].count, 3);
  assert.equal(find(pairs, [1, 3]).count, 2);
  assert.equal(find(pairs, [41, 51]).count, 2);
  assert.equal(find(pairs, [1, 50]).count, 1);
  assert.equal(find(pairs, [5, 10]), undefined, 'numbers never drawn together are absent');
  assert.equal(pairs.reduce((a, c) => a + c.count, 0), 4 * 10, '10 pairs per drawing');
  // Two triplets tie on 2; the one seen most recently is listed first.
  assert.equal(triplets[0].count, 2);
  assert.equal(triplets[0].nums.join('-'), '30-41-51');
  assert.equal(find(triplets, [1, 2, 3]).count, 2);
  assert.equal(find(triplets, [1, 2, 4]).count, 1);
  assert.equal(triplets.reduce((a, c) => a + c.count, 0), 4 * 10, '10 triplets per drawing');
  const pm = C.pairMatrix(draws, 69);
  assert.equal(pm.m[1 * pm.n + 2], 3);
  assert.equal(pm.m[2 * pm.n + 1], 3);
  assert.equal(pm.m[5 * pm.n + 10], 0);
  assert.equal(C.repeatedCombos(draws.concat([draw('2021-01-01', [1, 2, 3, 4, 5], 9)])).length, 1);
});

test('pattern statistics', () => {
  const draws = series([[[1, 2, 3, 40, 50], 1], [[1, 11, 21, 31, 41], 2], [[10, 20, 30, 40, 50], 3]]);
  const p = C.patternStats(draws, 'powerball');
  assert.equal(p.draws, 3);
  assert.equal(p.oddDist[2], 1);
  assert.equal(p.oddDist[5], 1);
  assert.equal(p.oddDist[0], 1);
  assert.equal(p.withConsecutive, 1);
  assert.equal(p.consecDist[2], 1, '1-2-3 contains two consecutive pairs');
  assert.equal(p.repeatDist[1], 1, 'second drawing repeats the 1');
  assert.equal(p.repeatBase, 2);
  assert.equal(p.sum.min, 96);
  assert.equal(p.sum.max, 150);
  assert.equal(p.lastDigit[0], 7);
  const info = C.describeNumbers([1, 2, 34, 35, 69], 69);
  assert.deepEqual([info.odd, info.even, info.low, info.high, info.sum, info.spread, info.consecutive], [3, 2, 3, 2, 141, 68, 2]);
});

// ---------------------------------------------------------------- filters & export

test('period filters', () => {
  const rows = [];
  for (let i = 0; i < 40; i++) rows.push([[1, 2, 3, 4, 5], 1]);
  const draws = rows.map((r, i) => draw(C.addDays('2015-09-01', i * 7), r[0], r[1]));
  assert.equal(C.applyFilter(draws, { type: 'last', n: 10 }, 'powerball').length, 10);
  assert.equal(C.applyFilter(draws, { type: 'last', n: 500 }, 'powerball').length, 40);
  assert.equal(C.applyFilter(draws, { type: 'all' }, 'powerball').length, 40);
  const current = C.applyFilter(draws, { type: 'current' }, 'powerball');
  assert.ok(current.length > 0 && current.every((x) => x.d >= '2015-10-07'));
  assert.equal(current.length, draws.filter((x) => x.d >= '2015-10-07').length);
  const range = C.applyFilter(draws, { type: 'range', from: '2015-10-01', to: '2015-10-31' }, 'powerball');
  assert.ok(range.length > 0 && range.every((x) => x.d >= '2015-10-01' && x.d <= '2015-10-31'));
  const long = [draw('2020-06-01', [1, 2, 3, 4, 5], 1), draw('2025-06-01', [1, 2, 3, 4, 5], 1), draw('2026-05-31', [1, 2, 3, 4, 5], 1), draw('2026-06-01', [1, 2, 3, 4, 5], 1)];
  assert.equal(C.applyFilter(long, { type: 'years', n: 1 }, 'powerball').length, 2);
  assert.equal(C.applyFilter(long, { type: 'years', n: 5 }, 'powerball').length, 3);
  assert.equal(C.applyFilter(long, { type: 'years', n: 20 }, 'powerball').length, 4);
});

test('CSV export escapes and lays out rows', () => {
  assert.equal(C.toCsv(['a', 'b'], [[1, 'x,y'], ['say "hi"', null]]), 'a,b\r\n1,"x,y"\r\n"say ""hi""",\r\n');
  const csv = C.drawsToCsv('powerball', [draw('2022-11-07', [10, 33, 41, 47, 56], 10, { m: 2, j: 2040000000, src: 'nc,ny,tx' })]);
  const lines = csv.trim().split('\r\n');
  assert.equal(lines.length, 2);
  assert.equal(lines[0], 'Game,Draw Date,N1,N2,N3,N4,N5,Powerball,Power Play,Jackpot (USD),Verified By');
  assert.equal(lines[1], 'Powerball,2022-11-07,10,33,41,47,56,10,2,2040000000,"nc,ny,tx"');
});

test('drawing schedule, missing-date detection and next drawing', () => {
  assert.deepEqual(C.scheduledDays('powerball', '2021-08-21'), [3, 6]);
  assert.deepEqual(C.scheduledDays('powerball', '2021-08-23'), [1, 3, 6]);
  assert.deepEqual(C.expectedDates('megamillions', '2026-10-01', '2026-10-13'), ['2026-10-02', '2026-10-06', '2026-10-09', '2026-10-13']);
  const dates = C.expectedDates('powerball', '2026-09-01', '2026-09-30');
  const draws = dates.filter((d) => d !== '2026-09-14').map((d) => draw(d, [1, 2, 3, 4, 5], 1));
  draws.push(draw('2026-09-29', [1, 2, 3, 4, 5], 1)); // a Tuesday: not a Powerball night
  draws.sort((a, b) => (a.d < b.d ? -1 : 1));
  const cov = C.coverage('powerball', draws);
  assert.deepEqual(cov.missing, ['2026-09-14']);
  assert.deepEqual(cov.unexpected, ['2026-09-29']);
  // Tuesday 13 Oct 2026, noon Eastern: Mega Millions draws tonight, Powerball tomorrow.
  const noon = new Date('2026-10-13T16:00:00Z');
  assert.equal(C.nextDraw('megamillions', noon).date, '2026-10-13');
  assert.equal(C.nextDraw('powerball', noon).date, '2026-10-14');
  // 11:30 pm Eastern the same day: tonight's Mega Millions drawing has happened.
  assert.equal(C.nextDraw('megamillions', new Date('2026-10-14T03:30:00Z')).date, '2026-10-16');
});

// ---------------------------------------------------------------- generator

function history(n, seed) {
  const rng = C.seededRng(seed || 99);
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = C.generateOne('random', C.makeContext('powerball', [], [], {}), rng);
    out.push(draw(C.addDays('2016-01-02', i * 3), t.w, t.s));
  }
  return out;
}

test('every strategy produces valid, sorted tickets inside today\'s ranges', () => {
  const draws = history(400);
  ['powerball', 'megamillions'].forEach((game) => {
    const era = C.currentEra(game);
    const ctx = C.makeContext(game, game === 'powerball' ? draws : [], game === 'powerball' ? draws.slice(-200) : [], {});
    C.STRATEGIES.forEach((s) => {
      const res = C.generateTickets(s.key, ctx, 200, C.seededRng(7), false);
      assert.equal(res.tickets.length, 200, s.key + ' for ' + game);
      res.tickets.forEach((t) => {
        assert.equal(t.w.length, 5);
        assert.equal(new Set(t.w).size, 5, 'five distinct main numbers');
        assert.deepEqual(t.w, t.w.slice().sort((a, b) => a - b), 'sorted ascending');
        assert.ok(t.w.every((n) => Number.isInteger(n) && n >= 1 && n <= era.whiteMax), s.key + ' main number out of range');
        assert.ok(Number.isInteger(t.s) && t.s >= 1 && t.s <= era.specialMax, s.key + ' special ball out of range');
        assert.deepEqual(C.validateDraw(game, { d: '2026-10-01', w: t.w, s: t.s }), []);
      });
    });
  });
});

test('pure random tickets are uniform (chi-square) and use the secure generator', () => {
  const rng = C.cryptoRng();
  assert.equal(rng.secure, true);
  const ctx = C.makeContext('powerball', [], [], {});
  const N = 30000;
  const white = new Array(70).fill(0);
  const special = new Array(27).fill(0);
  for (let i = 0; i < N; i++) {
    const t = C.generateOne('random', ctx, rng);
    t.w.forEach((n) => white[n]++);
    special[t.s]++;
  }
  const chi = (counts, from, to, expected) => { let x = 0; for (let i = from; i <= to; i++) x += Math.pow(counts[i] - expected, 2) / expected; return x; };
  // Whites are drawn without replacement: scale by (N-1)/(N-k) to get a chi-square(68) statistic.
  const whiteStat = chi(white, 1, 69, (N * 5) / 69) * (68 / 64);
  const specialStat = chi(special, 1, 26, N / 26);
  assert.ok(C.chiSquareSf(whiteStat, 68) > 1e-4, 'white balls look non-uniform: chi2=' + whiteStat.toFixed(1));
  assert.ok(C.chiSquareSf(specialStat, 25) > 1e-4, 'special balls look non-uniform: chi2=' + specialStat.toFixed(1));
  // Rejection sampling keeps int(n) inside range for awkward sizes.
  for (let i = 0; i < 5000; i++) { const v = rng.int(69); assert.ok(v >= 0 && v < 69); }
});

test('chi-square and normal helpers are numerically sane', () => {
  assert.ok(Math.abs(C.chiSquareSf(3.841, 1) - 0.05) < 1e-3);
  assert.ok(Math.abs(C.chiSquareSf(88.25, 68) - 0.05) < 2e-3);
  assert.ok(Math.abs(C.twoSidedP(1.96) - 0.05) < 1e-3);
  assert.ok(Math.abs(C.normalCdf(0) - 0.5) < 1e-9);
  assert.equal(C.choose(69, 5), 11238513);
  assert.equal(C.choose(70, 5), 12103014);
});

test('seeded generator is reproducible', () => {
  const ctx = C.makeContext('powerball', [], [], {});
  const a = C.generateTickets('random', ctx, 25, C.seededRng(42), false).tickets.map(C.ticketKey);
  const b = C.generateTickets('random', ctx, 25, C.seededRng(42), false).tickets.map(C.ticketKey);
  const c = C.generateTickets('random', ctx, 25, C.seededRng(43), false).tickets.map(C.ticketKey);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
});

test('duplicate-free batches and duplicate flagging', () => {
  const ctx = C.makeContext('powerball', [], [], {});
  const unique = C.generateTickets('random', ctx, 100, C.seededRng(5), true).tickets;
  assert.equal(new Set(unique.map(C.ticketKey)).size, 100);
  assert.ok(unique.every((t) => t.dup === false));
  // Everything locked: only one ticket is possible.
  const locked = C.makeContext('powerball', [], [], { locks: [3, 14, 15, 9, 26], lockSpecial: 5 });
  const flagged = C.generateTickets('custom', locked, 4, C.seededRng(1), false);
  assert.equal(flagged.tickets.length, 4);
  assert.deepEqual(flagged.tickets.map((t) => t.dup), [false, true, true, true]);
  assert.deepEqual(flagged.tickets[0].w, [3, 9, 14, 15, 26]);
  const forced = C.generateTickets('custom', locked, 4, C.seededRng(1), true);
  assert.equal(forced.tickets.length, 1, 'a duplicate-free batch cannot repeat the only possible ticket');
  assert.equal(forced.failed, 3);
});

test('custom strategy honours locks, exclusions and weights', () => {
  const excludes = [];
  for (let n = 11; n <= 69; n++) excludes.push(n);
  const ctx = C.makeContext('powerball', [], [], { locks: [2, 4], excludes, excludeSpecials: [1, 2, 3], whiteWeights: { 10: 50 } });
  const tickets = C.generateTickets('custom', ctx, 300, C.seededRng(11), false).tickets;
  assert.ok(tickets.every((t) => t.w.indexOf(2) !== -1 && t.w.indexOf(4) !== -1), 'locked numbers are on every ticket');
  assert.ok(tickets.every((t) => t.w.every((n) => n <= 10)), 'excluded numbers never appear');
  assert.ok(tickets.every((t) => t.s > 3));
  const withTen = tickets.filter((t) => t.w.indexOf(10) !== -1).length;
  assert.ok(withTen > 270, 'a heavily boosted number appears on nearly every ticket, got ' + withTen);
  const impossible = C.makeContext('powerball', [], [], { excludes: excludes.concat([5, 6, 7, 8, 9, 10]) });
  assert.equal(C.generateTickets('custom', impossible, 3, C.seededRng(1), false).tickets.length, 0);
});

test('hot and cold strategies lean the way they claim', () => {
  // 1-5 drawn in every drawing, everything else never.
  const rows = [];
  for (let i = 0; i < 300; i++) rows.push([[1, 2, 3, 4, 5], 1]);
  const draws = series(rows, '2016-01-02');
  const ctx = C.makeContext('powerball', draws, draws, { intensity: 3 });
  const share = (strategy) => {
    const t = C.generateTickets(strategy, ctx, 400, C.seededRng(3), false).tickets;
    return t.reduce((a, x) => a + x.w.filter((n) => n <= 5).length, 0) / (t.length * 5);
  };
  assert.ok(share('hot') > 0.9, 'hot share ' + share('hot'));
  assert.ok(share('cold') < 0.01, 'cold share ' + share('cold'));
  assert.ok(share('recent') > 0.9);
  const special = C.generateTickets('hot', ctx, 200, C.seededRng(3), false).tickets.filter((t) => t.s === 1).length;
  assert.ok(special > 180, 'hot special ball share ' + special);
});

test('balanced strategy respects its limits', () => {
  const era = C.currentEra('megamillions');
  const balance = { oddMin: 3, oddMax: 3, lowMin: 2, lowMax: 2, sumMin: 150, sumMax: 200, spreadMin: 30, spreadMax: 60 };
  const ctx = C.makeContext('megamillions', [], [], { balance });
  const tickets = C.generateTickets('balanced', ctx, 150, C.seededRng(8), false).tickets;
  assert.equal(tickets.length, 150);
  tickets.forEach((t) => {
    const d = C.describeNumbers(t.w, era.whiteMax);
    assert.equal(d.odd, 3);
    assert.equal(d.low, 2);
    assert.ok(d.sum >= 150 && d.sum <= 200 && d.spread >= 30 && d.spread <= 60);
  });
  const none = C.makeContext('megamillions', [], [], { balance: Object.assign({}, balance, { sumMin: 349, sumMax: 350, spreadMin: 4, spreadMax: 5 }) });
  assert.equal(C.generateTickets('balanced', none, 2, C.seededRng(8), false).failed, 2, 'impossible limits fail cleanly');
});

// ---------------------------------------------------------------- scoring & prizes

test('ticket scoring and prize tiers follow the format of the drawing', () => {
  const drawn = draw('2022-11-07', [10, 33, 41, 47, 56], 10);
  const score = (w, s) => C.scoreTicket({ w, s }, drawn);
  assert.deepEqual(score([10, 33, 41, 47, 56], 10), { white: 5, special: true, tier: '5+1' });
  assert.deepEqual(score([10, 33, 41, 47, 1], 2), { white: 4, special: false, tier: '4+0' });
  assert.equal(C.prizeFor('powerball', '2022-11-07', score([10, 33, 41, 47, 56], 10)).jackpot, true);
  assert.equal(C.prizeFor('powerball', '2022-11-07', score([10, 33, 41, 47, 56], 1)).amount, 1000000);
  assert.equal(C.prizeFor('powerball', '2022-11-07', score([10, 33, 41, 47, 1], 10)).amount, 50000);
  assert.equal(C.prizeFor('powerball', '2022-11-07', score([1, 2, 3, 4, 5], 10)).amount, 4);
  assert.equal(C.prizeFor('powerball', '2022-11-07', score([10, 33, 3, 4, 5], 1)), null, 'two main numbers alone win nothing');
  // Same matches under older formats pay the older prizes.
  assert.equal(C.prizeFor('powerball', '2010-06-02', { tier: '5+0' }).amount, 200000);
  assert.equal(C.prizeFor('powerball', '2013-06-05', { tier: '4+1' }).amount, 10000);
  assert.equal(C.prizeFor('powerball', '2008-06-04', { tier: '0+1' }).amount, 3);
  assert.equal(C.prizeFor('megamillions', '2012-03-30', { tier: '5+0' }).amount, 250000);
  assert.equal(C.prizeFor('megamillions', '2016-01-05', { tier: '4+1' }).amount, 5000);
  assert.equal(C.prizeFor('megamillions', '2020-01-03', { tier: '3+1' }).amount, 200);
  // Since April 2025 the built-in multiplier makes every non-jackpot prize a 2x-10x range.
  assert.deepEqual([C.prizeFor('megamillions', '2026-01-02', { tier: '0+1' }).amount, C.prizeFor('megamillions', '2026-01-02', { tier: '0+1' }).max], [10, 50]);
  assert.equal(C.ticketValidOn('powerball', '2012-06-06', { w: [1, 2, 3, 4, 65], s: 5 }), false);
  assert.equal(C.ticketValidOn('powerball', '2016-06-04', { w: [1, 2, 3, 4, 65], s: 5 }), true);
});

// ---------------------------------------------------------------- backtest

test('backtest never shows a strategy the drawing it is tested on, or anything later', () => {
  const draws = history(160, 5);
  const seen = [];
  const result = C.backtest({
    game: 'powerball', draws, strategy: 'hot', opts: {}, testCount: 40, ticketsPerDraw: 2, trainWindow: 50, trials: 3, seed: 1,
    onContext(ctx, target) {
      seen.push(target.d);
      assert.ok(ctx.all.every((x) => x.d < target.d), 'full history leaked a drawing dated ' + target.d + ' or later');
      assert.ok(ctx.period.every((x) => x.d < target.d), 'training window leaked');
      assert.equal(ctx.all.length, draws.findIndex((x) => x.d === target.d), 'history must hold exactly the earlier drawings');
      assert.ok(ctx.period.length <= 50);
      assert.equal(ctx.period[ctx.period.length - 1].d, draws[draws.findIndex((x) => x.d === target.d) - 1].d);
      assert.equal(ctx.era, C.eraFor('powerball', target.d));
    },
  });
  assert.equal(seen.length, 40);
  assert.deepEqual(seen, draws.slice(-40).map((x) => x.d));
  assert.equal(result.drawsTested, 40);
  assert.equal(result.strategyResult.tickets, 80);
  assert.equal(result.strategyResult.cost, 160);
  assert.equal(result.randomResult.tickets, 80);
});

test('a strategy that could only win by seeing the future does not win', () => {
  // Each drawing repeats the PREVIOUS drawing's numbers shifted by one, so "copy the latest known
  // drawing" never matches the target unless the target itself leaked into the training data.
  const draws = [];
  for (let i = 0; i < 80; i++) {
    const base = 1 + (i * 5) % 60;
    draws.push(draw(C.addDays('2016-01-02', i * 3), [base, base + 1, base + 2, base + 3, base + 4], 1 + (i % 26)));
  }
  const result = C.backtest({ game: 'powerball', draws, strategy: 'recent', opts: { recentN: 1, recentIntensity: 12 }, testCount: 30, ticketsPerDraw: 1, trainWindow: 1, trials: 2, seed: 9 });
  assert.equal(result.strategyResult.jackpots, 0);
  assert.equal(result.strategyResult.tiers['5+0'] || 0, 0);
  assert.equal(result.strategyResult.tiers['5+1'] || 0, 0);
});

test('backtest uses the rules and prices of each drawing\'s own format', () => {
  const draws = [];
  for (let i = 0; i < 12; i++) draws.push(draw(C.addDays('2015-09-02', i * 7), [1, 2, 3, 4, 5], 1));
  const eras = [];
  const result = C.backtest({
    game: 'powerball', draws, strategy: 'random', opts: {}, testCount: 8, ticketsPerDraw: 50, trainWindow: 0, trials: 1, seed: 3,
    onContext(ctx, target) { eras.push([target.d, ctx.era.whiteMax]); },
  });
  assert.ok(eras.some((e) => e[1] === 59) && eras.some((e) => e[1] === 69), 'test window should straddle the October 2015 change');
  eras.forEach((e) => assert.equal(e[1], e[0] < '2015-10-07' ? 59 : 69));
  assert.equal(result.strategyResult.cost, 8 * 50 * 2);
  assert.ok(result.theoreticalRoi < -0.7 && result.theoreticalRoi > -0.95);
  assert.ok(result.strategyResult.roiLow <= result.strategyResult.roiMedian && result.strategyResult.roiMedian <= result.strategyResult.roiHigh);
});

test('backtest results are reproducible for a given seed', () => {
  const draws = history(120, 2);
  const run = (seed) => C.backtest({ game: 'powerball', draws, strategy: 'ensemble', opts: {}, testCount: 30, ticketsPerDraw: 3, trainWindow: 60, trials: 4, seed });
  assert.deepEqual(run(10).strategyResult, run(10).strategyResult);
  assert.deepEqual(run(10).randomResult, run(10).randomResult);
});
