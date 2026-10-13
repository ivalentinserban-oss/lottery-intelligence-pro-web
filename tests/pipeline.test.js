'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const C = require('../js/core.js');
const pipe = require('../scripts/pipeline.js');

const rec = (d, w, s, m, j) => ({ d, w: w.slice().sort((a, b) => a - b), s, m: m == null ? null : m, j: j == null ? null : j });

// ---------------------------------------------------------------- source parsers

test('North Carolina download: skips Double Play rows and the legal footer', () => {
  const text = [
    '"Date","SubName","Ball 1","Ball 2","Ball 3","Ball 4","Ball 5","Powerball","Power Play","Jackpot"',
    '"10/12/2026","","22","38","69","28","51","9","3","540700000.0000"',
    '"10/12/2026","DoubleDraw","25","53","23","54","51","16","",""',
    '"10/04/2006","","39","27","7","3","40","8","5","15000000.0000"',
    '',
    '"Every effort has been made to ensure that the winning numbers posted in this file are accurate; however, no valid claim may be based on it, see 10/12/2026. "',
  ].join('\r\n');
  assert.deepEqual(pipe.parseNc('powerball', text), [
    rec('2026-10-12', [22, 28, 38, 51, 69], 9, 3, 540700000),
    rec('2006-10-04', [3, 7, 27, 39, 40], 8, 5, 15000000),
  ]);
  const mm = '"Date","Number 1","Number 2","Number 3","Number 4","Number 5","Megaball","Megaplier","Jackpot"\n"10/09/2026","7","16","70","2","63","8","","364000000.0000"\n';
  assert.deepEqual(pipe.parseNc('megamillions', mm), [rec('2026-10-09', [2, 7, 16, 63, 70], 8, null, 364000000)]);
});

test('New York open data rows for both games', () => {
  const pb = JSON.stringify([{ draw_date: '2026-10-12T00:00:00.000', winning_numbers: '22 28 38 51 69 09', multiplier: '3' }, { draw_date: '2026-10-10T00:00:00.000', winning_numbers: 'bad' }]);
  assert.deepEqual(pipe.parseNy('powerball', pb), [rec('2026-10-12', [22, 28, 38, 51, 69], 9, 3)]);
  const mm = JSON.stringify([{ draw_date: '2026-10-09T00:00:00.000', winning_numbers: '02 07 16 63 70', mega_ball: '08' }]);
  assert.deepEqual(pipe.parseNy('megamillions', mm), [rec('2026-10-09', [2, 7, 16, 63, 70], 8)]);
  assert.throws(() => pipe.parseNy('powerball', '{"error":true}'));
});

test('Texas CSV and the powerball.com text file', () => {
  const tx = 'Powerball,2,3,2010,37,52,22,36,17,24,2\r\nMega Millions,10,9,2026,7,16,70,2,63,8,\r\nnot,a,row\r\n';
  assert.deepEqual(pipe.parseTexas('powerball', tx), [rec('2010-02-03', [17, 22, 36, 37, 52], 24, 2), rec('2026-10-09', [2, 7, 16, 63, 70], 8)]);
  const archive = 'Draw Date   WB1 WB2 WB3 WB4 WB5 PB  PP\r\n10/07/2006  04  31  45  03  08  12  5\r\n11/01/1997  37  28  33  22  25  20  \r\n';
  assert.deepEqual(pipe.parsePowerballArchive('powerball', archive), [rec('2006-10-07', [3, 4, 8, 31, 45], 12, 5), rec('1997-11-01', [22, 25, 28, 33, 37], 20)]);
});

test('powerball.com result cards and the megamillions.com latest drawing', () => {
  const ballHtml = (n) => '<div class="form-control col white-balls item-powerball">\n<div>\n' + n + '    </div>\n</div>';
  const card = '<a class="card" href="https://www.powerball.com/draw-result?gc=powerball&sd=2006-10-01&ed=2006-12-31&date=2006-12-30"><h5 class="card-title">Sat, Dec 30, 2006</h5>' +
    [9, 23, 28, 31, 36].map(ballHtml).join('') + '<div class="form-control col powerball item-powerball">\n<div>\n26    </div></div>' +
    '<span class="power-play">Power Play <span class="multiplier">5x</span></span></a>';
  assert.deepEqual(pipe.parsePowerballSite('powerball', '<html>' + card + '<a class="card" href="?date=2006-12-27">broken</a></html>'), [rec('2006-12-30', [9, 23, 28, 31, 36], 26, 5)]);
  const api = JSON.stringify({ d: JSON.stringify({ Drawing: { PlayDate: '2026-10-09T00:00:00', N1: 2, N2: 7, N3: 16, N4: 63, N5: 70, MBall: 8, Megaplier: -1 }, Jackpot: { PlayDate: '2026-10-09T00:00:00', CurrentPrizePool: 364000000, NextPrizePool: 385000000 } }) });
  assert.deepEqual(pipe.parseMegaMillionsLatest('megamillions', api), [rec('2026-10-09', [2, 7, 16, 63, 70], 8, null, 364000000)]);
});

// ---------------------------------------------------------------- merging, dedup, conflicts

test('agreeing sources merge into one record per date', () => {
  const a = [rec('2026-10-10', [1, 4, 19, 33, 51], 15, 2, 519200000), rec('2026-10-12', [22, 28, 38, 51, 69], 9, 3)];
  const b = [rec('2026-10-12', [69, 22, 51, 28, 38], 9), rec('2026-10-10', [1, 4, 19, 33, 51], 15)];
  const merged = pipe.mergeSources('powerball', [], { nc: a, ny: b, tx: [a[1]] });
  assert.equal(merged.draws.length, 2);
  assert.equal(merged.added, 2);
  assert.deepEqual(merged.draws.map((x) => x.d), ['2026-10-10', '2026-10-12'], 'sorted oldest first');
  assert.equal(merged.draws[0].src, 'nc,ny');
  assert.equal(merged.draws[1].src, 'nc,ny,tx');
  assert.equal(merged.draws[0].j, 519200000, 'jackpot taken from the source that has it');
  assert.equal(merged.draws[1].m, 3);
  assert.deepEqual(merged.conflicts, []);
});

test('duplicate rows are stored once and re-running an import changes nothing', () => {
  const rows = [rec('2026-10-12', [22, 28, 38, 51, 69], 9, 3), rec('2026-10-12', [22, 28, 38, 51, 69], 9, 3), rec('2026-10-10', [1, 4, 19, 33, 51], 15, 2)];
  const first = pipe.mergeSources('powerball', [], { nc: rows, ny: rows });
  assert.equal(first.draws.length, 2);
  const second = pipe.mergeSources('powerball', first.draws, { nc: rows, ny: rows });
  assert.equal(second.added, 0);
  assert.equal(second.confirmed, 0);
  assert.deepEqual(second.draws, first.draws);
  const third = pipe.mergeSources('powerball', second.draws, { tx: rows });
  assert.equal(third.added, 0);
  assert.equal(third.confirmed, 2, 'a new agreeing source is recorded as extra verification');
  assert.equal(third.draws[0].src, 'nc,ny,tx');
});

test('records that break the rules of their date are rejected', () => {
  const merged = pipe.mergeSources('powerball', [], {
    nc: [rec('2014-06-04', [1, 2, 3, 4, 65], 5), rec('2026-10-12', [22, 28, 38, 51, 69], 30), rec('2026-10-10', [1, 1, 19, 33, 51], 15), rec('2026-10-07', [11, 13, 14, 21, 65], 19)],
  });
  assert.equal(merged.draws.length, 1);
  assert.equal(merged.draws[0].d, '2026-10-07');
  assert.equal(merged.rejected.length, 3);
  assert.ok(merged.rejected.every((r) => r.source === 'nc' && r.reason));
});

test('anything before the history start date is ignored', () => {
  const merged = pipe.mergeSources('powerball', [], { nc: [rec('2006-09-30', [6, 15, 30, 32, 39], 5), rec('2006-10-04', [3, 7, 27, 39, 40], 8)] });
  assert.deepEqual(merged.draws.map((x) => x.d), ['2006-10-04']);
});

test('a published drawing is never replaced when a source disagrees', () => {
  const published = [{ d: '2022-05-10', w: [15, 19, 20, 61, 70], s: 9, m: 3, j: 86000000, src: 'nc,tx' }];
  const merged = pipe.mergeSources('megamillions', published, { ny: [rec('2022-05-10', [15, 19, 20, 61, 70], 6, 3)] });
  assert.equal(merged.draws.length, 1);
  assert.deepEqual(merged.draws[0], published[0], 'record unchanged');
  assert.equal(merged.conflicts.length, 1);
  assert.equal(merged.conflicts[0].d, '2022-05-10');
  assert.equal(merged.conflicts[0].kept, '15-19-20-61-70|9');
  assert.equal(merged.conflicts[0].differs, '15-19-20-61-70|6');
  assert.equal(merged.conflicts[0].sources, 'ny');
  assert.equal(merged.added, 0);
});

test('for a new date a strict majority wins and the disagreement is logged; ties are not stored', () => {
  const good = rec('2011-09-23', [21, 27, 32, 40, 52], 36, 4);
  const bad = rec('2011-09-23', [27, 31, 32, 40, 52], 36, 4);
  const majority = pipe.mergeSources('megamillions', [], { tx: [good], nc: [good], ny: [bad] });
  assert.equal(majority.draws.length, 1);
  assert.deepEqual(majority.draws[0].w, [21, 27, 32, 40, 52]);
  assert.equal(majority.draws[0].src, 'nc,tx');
  assert.equal(majority.conflicts.length, 1);
  const tie = pipe.mergeSources('megamillions', [], { tx: [good], ny: [bad] });
  assert.equal(tie.draws.length, 0, 'an unresolved disagreement is not published');
  assert.equal(tie.conflicts.length, 1);
  assert.equal(tie.conflicts[0].kept, null);
});

test('existing drawings survive a source outage', () => {
  const published = [{ d: '2026-10-10', w: [1, 4, 19, 33, 51], s: 15, m: 2, j: null, src: 'nc,ny,tx' }];
  const merged = pipe.mergeSources('powerball', published, {});
  assert.deepEqual(merged.draws, published);
  const partial = pipe.mergeSources('powerball', published, { ny: [rec('2026-10-12', [22, 28, 38, 51, 69], 9, 3)] });
  assert.equal(partial.draws.length, 2);
  assert.equal(partial.draws[0].src, 'nc,ny,tx');
  assert.equal(partial.draws[1].src, 'ny', 'a single-source drawing is stored but marked as such');
});

test('missing multiplier or jackpot is filled in without touching the numbers', () => {
  const published = [{ d: '2026-10-10', w: [1, 4, 19, 33, 51], s: 15, m: null, j: null, src: 'ny' }];
  const merged = pipe.mergeSources('powerball', published, { nc: [rec('2026-10-10', [1, 4, 19, 33, 51], 15, 2, 519200000)] });
  assert.deepEqual(merged.draws[0], { d: '2026-10-10', w: [1, 4, 19, 33, 51], s: 15, m: 2, j: 519200000, src: 'nc,ny' });
});

test('data file round-trips through render and parse', () => {
  const draws = [{ d: '2026-10-10', w: [1, 4, 19, 33, 51], s: 15, m: 2, j: 519200000, src: 'nc,ny' }, { d: '2026-10-12', w: [22, 28, 38, 51, 69], s: 9, m: null, j: null, src: 'ny' }];
  const text = pipe.renderDataFile('powerball', { game: 'powerball', count: 2, conflicts: [], draws });
  assert.ok(text.indexOf('globalThis.LOTTERY_DATA.powerball = {') !== -1);
  const back = pipe.parseDataFile(text);
  assert.equal(back.count, 2);
  assert.deepEqual(back.draws, draws);
  assert.deepEqual(C.packDraw(draws[1]), ['2026-10-12', 22, 28, 38, 51, 69, 9, null, null, 'ny']);
});

// ---------------------------------------------------------------- the published data itself

['powerball', 'megamillions'].forEach((game) => {
  const file = path.join(__dirname, '..', 'data', game + '.js');
  test('published ' + game + ' history is complete, valid and verified', { skip: !fs.existsSync(file) }, () => {
    const data = pipe.parseDataFile(fs.readFileSync(file, 'utf8'));
    const draws = data.draws;
    assert.ok(draws.length > 2000, 'expected 20 years of drawings, found ' + draws.length);
    assert.ok(draws[0].d <= '2006-10-07', 'history should start in October 2006, starts ' + draws[0].d);
    assert.ok(draws[draws.length - 1].d >= '2026-10-01');
    assert.equal(new Set(draws.map((x) => x.d)).size, draws.length, 'one record per date');
    for (let i = 1; i < draws.length; i++) assert.ok(draws[i - 1].d < draws[i].d, 'sorted by date');
    draws.forEach((x) => {
      assert.deepEqual(C.validateDraw(game, x), [], game + ' ' + x.d + ' breaks the rules of its date');
      assert.deepEqual(x.w, x.w.slice().sort((a, b) => a - b));
      assert.ok(x.src.split(',').length >= 2, game + ' ' + x.d + ' has only one source');
    });
    const cov = C.coverage(game, draws);
    assert.deepEqual(cov.missing, [], 'no scheduled drawing is missing');
    assert.deepEqual(cov.unexpected, [], 'no drawing on an unscheduled date');
    assert.equal(data.count, draws.length);
  });
});

test('published history matches well-known drawings', { skip: !fs.existsSync(path.join(__dirname, '..', 'data', 'powerball.js')) }, () => {
  const load = (game) => pipe.parseDataFile(fs.readFileSync(path.join(__dirname, '..', 'data', game + '.js'), 'utf8')).draws;
  const find = (list, d) => list.filter((x) => x.d === d)[0];
  const pb = load('powerball');
  const mm = load('megamillions');
  assert.deepEqual([find(pb, '2016-01-13').w, find(pb, '2016-01-13').s], [[4, 8, 19, 27, 34], 10]); // $1.586 billion
  assert.deepEqual([find(pb, '2022-11-07').w, find(pb, '2022-11-07').s], [[10, 33, 41, 47, 56], 10]); // $2.04 billion
  const record = find(pb, '2022-11-07').j;
  assert.ok(record >= 2.04e9 && record < 2.05e9, 'record jackpot should read about $2.04 billion, got ' + record);
  assert.deepEqual([find(mm, '2018-10-23').w, find(mm, '2018-10-23').s], [[5, 28, 62, 65, 70], 5]); // $1.537 billion
  assert.deepEqual([find(mm, '2023-08-08').w, find(mm, '2023-08-08').s], [[13, 19, 20, 32, 33], 14]); // $1.58 billion
  assert.equal(find(mm, '2022-05-10').s, 9, 'the Mega Ball misread on air as 6 is recorded with its official value');
});
