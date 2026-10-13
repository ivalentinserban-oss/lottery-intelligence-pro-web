#!/usr/bin/env node
/**
 * Downloads Powerball and Mega Millions results from official sources, cross-checks them,
 * and rewrites data/powerball.js and data/megamillions.js.
 *
 *   node scripts/update-data.js           regular update (run by the scheduled GitHub Action)
 *   node scripts/update-data.js --full    also re-verifies pre-2010 Powerball against powerball.com
 *
 * Needs Node 18+ (built-in fetch). No dependencies. Exits 0 even if some sources are down,
 * as long as the published history is intact; exits 1 only if nothing could be fetched.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const core = require('../js/core.js');
const pipe = require('./pipeline.js');

const DATA_DIR = path.join(__dirname, '..', 'data');
const USER_AGENT = 'Mozilla/5.0 (compatible; LotteryIntelligencePro/1.0; personal statistics page)';
const FULL = process.argv.includes('--full');

async function fetchText(url, init) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60000);
    try {
      const res = await fetch(url, Object.assign({ signal: controller.signal, redirect: 'follow' }, init, {
        headers: Object.assign({ 'User-Agent': USER_AGENT, Accept: '*/*' }, init && init.headers),
      }));
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.text();
    } catch (err) {
      lastError = err;
      await new Promise((r) => setTimeout(r, 1500 * attempt));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
}

function fetchSource(game, key) {
  const url = pipe.SOURCE_URLS[game][key];
  if (key === 'mm') return fetchText(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  return fetchText(url);
}

/** Pre-2010 Powerball straight from powerball.com, two months per request (max 26 results per page). */
async function fetchPowerballSiteHistory(from, to) {
  const records = [];
  let start = from;
  while (start <= to) {
    const y = +start.slice(0, 4);
    const m = +start.slice(5, 7);
    const nextMonth = m + 2 > 12 ? (y + 1) + '-' + String(m + 2 - 12).padStart(2, '0') + '-01' : y + '-' + String(m + 2).padStart(2, '0') + '-01';
    const end = core.addDays(nextMonth, -1) < to ? core.addDays(nextMonth, -1) : to;
    const html = await fetchText('https://www.powerball.com/previous-results?gc=powerball&sd=' + start + '&ed=' + end);
    pipe.PARSERS.pbc('powerball', html).forEach((r) => records.push(r));
    start = nextMonth;
    await new Promise((r) => setTimeout(r, 400));
  }
  return records;
}

/** Advertised jackpot for the next drawing, straight from the official game sites (best effort). */
async function fetchNextJackpot(game, mmLatestText) {
  try {
    if (game === 'powerball') {
      const html = await fetchText('https://www.powerball.com/');
      const found = [];
      const re = /game-jackpot-number[^>]*>\s*\$([\d.,]+)\s*(Million|Billion)/gi;
      let m;
      while ((m = re.exec(html))) found.push(Math.round(parseFloat(m[1].replace(/,/g, '')) * (/b/i.test(m[2]) ? 1e9 : 1e6)));
      if (!found.length) return null;
      return { amount: found[0], cash: found[1] || null, source: 'powerball.com', asOf: new Date().toISOString() };
    }
    const outer = JSON.parse(mmLatestText || (await fetchSource('megamillions', 'mm')));
    const data = typeof outer.d === 'string' ? JSON.parse(outer.d) : outer;
    if (!data.Jackpot || !data.Jackpot.NextPrizePool) return null;
    return { amount: data.Jackpot.NextPrizePool, cash: data.Jackpot.NextCashValue || null, source: 'megamillions.com', asOf: new Date().toISOString() };
  } catch (err) {
    return null;
  }
}

async function updateGame(game) {
  const file = path.join(DATA_DIR, game + '.js');
  let previous = null;
  if (fs.existsSync(file)) previous = pipe.parseDataFile(fs.readFileSync(file, 'utf8'));
  const existing = previous ? previous.draws : [];

  const bySource = {};
  const sourceReport = {};
  const raw = {};
  for (const key of Object.keys(pipe.SOURCE_URLS[game])) {
    const info = { name: pipe.SOURCE_URLS[game][key] && pipe.SOURCES[key].name, url: pipe.SOURCE_URLS[game][key] };
    try {
      raw[key] = await fetchSource(game, key);
      const records = pipe.PARSERS[key](game, raw[key]).filter((r) => r.d >= pipe.HISTORY_START);
      if (!records.length) throw new Error('no records parsed');
      records.sort((a, b) => (a.d < b.d ? -1 : 1));
      bySource[key] = records;
      Object.assign(info, { ok: true, records: records.length, first: records[0].d, last: records[records.length - 1].d });
    } catch (err) {
      Object.assign(info, { ok: false, error: String(err && err.message ? err.message : err) });
    }
    sourceReport[key] = info;
    console.log('  ' + key.padEnd(4) + (info.ok ? 'ok   ' + String(info.records).padStart(5) + ' records  ' + info.first + ' → ' + info.last : 'FAILED  ' + info.error));
  }

  if (FULL && game === 'powerball') {
    try {
      const site = await fetchPowerballSiteHistory(pipe.HISTORY_START, '2010-02-02');
      bySource.pbc = (bySource.pbc || []).concat(site);
      console.log('  pbc  backfill ' + site.length + ' pre-2010 records from powerball.com');
    } catch (err) {
      console.log('  pbc  backfill FAILED  ' + err.message);
    }
  }

  if (!Object.keys(bySource).length && !existing.length) throw new Error('no source reachable and no existing data for ' + game);

  const merged = pipe.mergeSources(game, existing, bySource);
  const cov = core.coverage(game, merged.draws);
  const single = merged.draws.filter((x) => x.src.split(',').length < 2).length;
  // Keep the stored jackpot object (and its timestamp) unless the advertised amount actually changed.
  let nextJackpot = await fetchNextJackpot(game, raw.mm);
  const oldJackpot = (previous && previous.nextJackpot) || null;
  if (!nextJackpot || (oldJackpot && oldJackpot.amount === nextJackpot.amount && oldJackpot.cash === nextJackpot.cash)) nextJackpot = oldJackpot;

  // Keep each source's last known-good stats when it is temporarily down.
  if (previous && previous.sources) {
    Object.keys(sourceReport).forEach((key) => {
      if (!sourceReport[key].ok && previous.sources[key]) {
        sourceReport[key] = Object.assign({}, previous.sources[key], { ok: false, error: sourceReport[key].error });
      }
    });
  }

  const payload = {
    game,
    generatedAt: previous ? previous.generatedAt : new Date().toISOString(),
    historyStart: pipe.HISTORY_START,
    count: merged.draws.length,
    first: cov.first,
    last: cov.last,
    verifiedByTwoOrMore: merged.draws.length - single,
    singleSource: single,
    missingDates: cov.missing,
    unexpectedDates: cov.unexpected,
    conflicts: merged.conflicts,
    rejected: merged.rejected.slice(0, 50),
    nextJackpot,
    sources: sourceReport,
    fields: ['date', 'n1', 'n2', 'n3', 'n4', 'n5', 'special', 'multiplier', 'jackpot', 'sources'],
    draws: merged.draws,
  };
  // Only touch the file (and its timestamp) when something really changed, so scheduled runs
  // that find nothing new produce no commit.
  const unchanged = previous && fs.readFileSync(file, 'utf8') === pipe.renderDataFile(game, payload);
  if (!unchanged) {
    payload.generatedAt = new Date().toISOString();
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(file, pipe.renderDataFile(game, payload));
  }
  console.log('  ' + (unchanged ? 'no changes' : 'wrote ' + path.relative(process.cwd(), file)));

  console.log('  => ' + merged.draws.length + ' draws ' + cov.first + ' → ' + cov.last + ' | +' + merged.added + ' new, ' + merged.confirmed +
    ' newly confirmed | ' + (merged.draws.length - single) + ' verified by 2+ sources, ' + single + ' single-source | ' +
    cov.missing.length + ' missing, ' + merged.conflicts.length + ' conflicts, ' + merged.rejected.length + ' rejected');
  return { ok: Object.keys(bySource).length > 0, payload };
}

(async () => {
  let anyOk = false;
  for (const game of Object.keys(core.GAMES)) {
    console.log(core.GAMES[game].name);
    try {
      const res = await updateGame(game);
      anyOk = anyOk || res.ok;
    } catch (err) {
      console.error('  ERROR ' + err.message);
    }
  }
  process.exit(anyOk ? 0 : 1);
})();
