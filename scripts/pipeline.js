/**
 * Data pipeline helpers: parse each official source and merge them into one verified history.
 * Pure functions (no network, no disk) so they can be unit-tested.
 */
'use strict';

const core = require('../js/core.js');

/** First drawing included in the published history. */
const HISTORY_START = '2006-10-01';

const SOURCES = {
  nc: { name: 'North Carolina Education Lottery', official: true },
  ny: { name: 'New York Gaming Commission (data.ny.gov)', official: true },
  tx: { name: 'Texas Lottery', official: true },
  pb: { name: 'powerball.com winning-numbers file (Internet Archive copy)', official: true },
  pbc: { name: 'powerball.com previous results', official: true },
  mm: { name: 'megamillions.com latest drawing', official: true },
};

const SOURCE_URLS = {
  powerball: {
    nc: 'https://nclottery.com/powerball-download',
    ny: 'https://data.ny.gov/resource/d6yy-54nr.json?$limit=50000&$order=draw_date',
    tx: 'https://www.texaslottery.com/export/sites/lottery/Games/Powerball/Winning_Numbers/powerball.csv',
    pb: 'https://web.archive.org/web/2016id_/http://www.powerball.com/powerball/winnums-text.txt',
    pbc: 'https://www.powerball.com/previous-results?gc=powerball',
  },
  megamillions: {
    ny: 'https://data.ny.gov/resource/5xaw-6ayf.json?$limit=50000&$order=draw_date',
    tx: 'https://www.texaslottery.com/export/sites/lottery/Games/Mega_Millions/Winning_Numbers/megamillions.csv',
    nc: 'https://nclottery.com/mega-millions-download',
    mm: 'https://www.megamillions.com/cmspages/utilservice.asmx/GetLatestDrawData',
  },
};

function pad(n) {
  return String(n).padStart(2, '0');
}

function usDate(s) {
  const m = /^\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\s*$/.exec(s || '');
  return m ? m[3] + '-' + pad(m[1]) + '-' + pad(m[2]) : null;
}

function toInt(s) {
  const t = String(s == null ? '' : s).trim();
  return /^\d+$/.test(t) ? parseInt(t, 10) : null;
}

function record(date, whites, special, multiplier, jackpot) {
  if (!date || whites.some((n) => n === null) || special === null) return null;
  return {
    d: date,
    w: whites.slice().sort((a, b) => a - b),
    s: special,
    m: multiplier && multiplier > 0 ? multiplier : null,
    j: jackpot && jackpot > 0 ? Math.round(jackpot) : null,
  };
}

/** Minimal RFC-4180 line splitter (quoted fields may contain commas). */
function splitCsvLine(line) {
  const out = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') quoted = false; else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { out.push(cur); cur = ''; } else cur += ch;
  }
  out.push(cur);
  return out;
}

/**
 * North Carolina Education Lottery download.
 * Powerball:      "Date","SubName","Ball 1".."Ball 5","Powerball","Power Play","Jackpot"
 * Mega Millions:  "Date","Number 1".."Number 5","Megaball","Megaplier","Jackpot"
 * Rows with a SubName (e.g. "DoubleDraw") are separate add-on drawings and are skipped.
 */
function parseNc(game, text) {
  const out = [];
  text.split(/\r?\n/).forEach((line) => {
    const f = splitCsvLine(line);
    const date = usDate(f[0]);
    if (!date) return;
    let offset = 1;
    if (game === 'powerball') {
      if ((f[1] || '').trim() !== '') return;
      offset = 2;
    }
    if (f.length < offset + 8) return;
    const jackpot = parseFloat(f[offset + 7]);
    const rec = record(date, f.slice(offset, offset + 5).map(toInt), toInt(f[offset + 5]), toInt(f[offset + 6]), Number.isFinite(jackpot) ? jackpot : null);
    if (rec) out.push(rec);
  });
  return out;
}

/** NY Open Data (Socrata) JSON export. */
function parseNy(game, text) {
  const rows = JSON.parse(text);
  if (!Array.isArray(rows)) throw new Error('unexpected NY Open Data response');
  return rows.map((row) => core.parseNyRow(game, row)).filter(Boolean);
}

/** Texas Lottery CSV: Game Name, Month, Day, Year, Num1..Num5, special ball, multiplier. */
function parseTexas(game, text) {
  const out = [];
  text.split(/\r?\n/).forEach((line) => {
    const f = line.split(',');
    if (f.length < 10) return;
    const mo = toInt(f[1]);
    const day = toInt(f[2]);
    const year = toInt(f[3]);
    if (mo === null || day === null || year === null) return;
    const rec = record(year + '-' + pad(mo) + '-' + pad(day), f.slice(4, 9).map(toInt), toInt(f[9]), toInt(f[10]), null);
    if (rec) out.push(rec);
  });
  return out;
}

/** powerball.com "winnums-text.txt": "MM/DD/YYYY  WB1 WB2 WB3 WB4 WB5 PB  PP" (Powerball only). */
function parsePowerballArchive(game, text) {
  const out = [];
  text.split(/\r?\n/).forEach((line) => {
    const f = line.trim().split(/\s+/);
    const date = usDate(f[0]);
    if (!date || f.length < 7) return;
    const rec = record(date, f.slice(1, 6).map(toInt), toInt(f[6]), toInt(f[7]), null);
    if (rec) out.push(rec);
  });
  return out;
}

/** powerball.com "previous results" page: one <a class="card"> per drawing. */
function parsePowerballSite(game, html) {
  const out = [];
  html.split('<a class="card"').slice(1).forEach((chunk) => {
    const date = /[?&]date=(\d{4}-\d{2}-\d{2})/.exec(chunk);
    const whites = [];
    const re = /white-balls item-powerball">\s*<div>\s*(\d+)\s*<\/div>/g;
    let m;
    while ((m = re.exec(chunk)) && whites.length < 5) whites.push(parseInt(m[1], 10));
    const special = /col powerball item-powerball">\s*<div>\s*(\d+)\s*<\/div>/.exec(chunk);
    const mult = /class="multiplier">\s*(\d+)\s*x/i.exec(chunk);
    if (!date || whites.length !== 5 || !special) return;
    const rec = record(date[1], whites, parseInt(special[1], 10), mult ? parseInt(mult[1], 10) : null, null);
    if (rec) out.push(rec);
  });
  return out;
}

/** megamillions.com GetLatestDrawData response: the latest drawing plus jackpot figures. */
function parseMegaMillionsLatest(game, text) {
  const outer = JSON.parse(text);
  const data = typeof outer.d === 'string' ? JSON.parse(outer.d) : outer;
  const dr = data.Drawing;
  if (!dr || !dr.PlayDate) return [];
  const jackpot = data.Jackpot && String(data.Jackpot.PlayDate).slice(0, 10) === String(dr.PlayDate).slice(0, 10) ? data.Jackpot.CurrentPrizePool : null;
  const rec = record(String(dr.PlayDate).slice(0, 10), [dr.N1, dr.N2, dr.N3, dr.N4, dr.N5].map(toInt), toInt(dr.MBall), dr.Megaplier > 0 ? dr.Megaplier : null, jackpot);
  return rec ? [rec] : [];
}

const PARSERS = { nc: parseNc, ny: parseNy, tx: parseTexas, pb: parsePowerballArchive, pbc: parsePowerballSite, mm: parseMegaMillionsLatest };

/** Source keys as a stable, sorted, comma-separated list (keeps the data file identical between runs). */
function sorted(keys) {
  return keys.slice().sort().join(',');
}

function union(a, b) {
  const set = new Set((a ? a.split(',') : []).concat(b ? b.split(',') : []).filter(Boolean));
  return Array.from(set).sort().join(',');
}

/**
 * Merge source records into one history.
 *
 *   existing — previously published draws [{d,w,s,m,j,src}] (may be empty)
 *   bySource — { sourceKey: [records] } for the sources that were fetched successfully
 *
 * Rules:
 *   - a record that breaks the game rules for its date is rejected, never stored
 *   - one record per (game, date); sources that agree are listed in `src`
 *   - a published draw is never changed: a source that disagrees is logged as a conflict
 *   - for a new date where sources disagree, the majority wins only if it is a strict majority
 *   - draws missing from today's sources (outage) are kept as they are
 */
function mergeSources(game, existing, bySource) {
  const rejected = [];
  const conflicts = [];
  const byDate = new Map();

  Object.keys(bySource).forEach((src) => {
    const seen = new Set();
    bySource[src].forEach((rec) => {
      if (rec.d < HISTORY_START) return;
      const problems = core.validateDraw(game, rec);
      if (problems.length) { rejected.push({ d: rec.d, source: src, reason: problems.join('; ') }); return; }
      if (seen.has(rec.d)) return; // duplicate row inside one source
      seen.add(rec.d);
      if (!byDate.has(rec.d)) byDate.set(rec.d, {});
      byDate.get(rec.d)[src] = rec;
    });
  });

  const result = new Map();
  (existing || []).forEach((x) => result.set(x.d, { d: x.d, w: x.w.slice(), s: x.s, m: x.m, j: x.j, src: x.src || '' }));
  let added = 0;
  let confirmed = 0;

  byDate.forEach((recs, date) => {
    const groups = {};
    Object.keys(recs).forEach((src) => {
      const sig = core.drawSignature(recs[src]);
      (groups[sig] = groups[sig] || []).push(src);
    });
    const sigs = Object.keys(groups).sort((a, b) => groups[b].length - groups[a].length);
    const prior = result.get(date);
    let chosen = null;

    if (prior) {
      const priorSig = core.drawSignature(prior);
      sigs.forEach((sig) => {
        if (sig !== priorSig) conflicts.push({ d: date, kept: priorSig, keptSources: prior.src, differs: sig, sources: sorted(groups[sig]) });
      });
      if (!groups[priorSig]) return;
      chosen = priorSig;
    } else if (sigs.length === 1 || groups[sigs[0]].length > groups[sigs[1]].length) {
      chosen = sigs[0];
      sigs.slice(1).forEach((sig) => {
        conflicts.push({ d: date, kept: chosen, keptSources: sorted(groups[chosen]), differs: sig, sources: sorted(groups[sig]) });
      });
    } else {
      conflicts.push({ d: date, kept: null, keptSources: '', differs: sigs.slice().sort().join(' vs '), sources: sorted(Object.keys(recs)) });
      return;
    }

    const agreeing = groups[chosen];
    const first = recs[agreeing[0]];
    const pickField = (field) => {
      for (let i = 0; i < agreeing.length; i++) if (recs[agreeing[i]][field] != null) return recs[agreeing[i]][field];
      return null;
    };
    if (prior) {
      const before = prior.src;
      prior.src = union(prior.src, agreeing.join(','));
      if (prior.m == null) prior.m = pickField('m');
      if (prior.j == null) prior.j = pickField('j');
      if (prior.src !== before) confirmed++;
    } else {
      result.set(date, { d: date, w: first.w.slice(), s: first.s, m: pickField('m'), j: pickField('j'), src: agreeing.slice().sort().join(',') });
      added++;
    }
  });

  const draws = Array.from(result.values()).sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0));
  return { draws, added, confirmed, conflicts, rejected };
}

/** Serialise the published data file (one drawing per line keeps git diffs readable). */
function renderDataFile(game, payload) {
  const head = Object.assign({}, payload);
  delete head.draws;
  const lines = payload.draws.map((x) => JSON.stringify(core.packDraw(x)));
  const json = JSON.stringify(head, null, 1).replace(/\n}$/, ',\n "draws": [\n' + lines.join(',\n') + '\n ]\n}');
  return '/* Generated by scripts/update-data.js — do not edit by hand. */\n' +
    'globalThis.LOTTERY_DATA = globalThis.LOTTERY_DATA || {};\n' +
    'globalThis.LOTTERY_DATA.' + game + ' = ' + json + ';\n';
}

/** Read a published data file back into { ...meta, draws: [records] }. */
function parseDataFile(text) {
  const start = text.indexOf('= {', text.indexOf('LOTTERY_DATA.'));
  if (start === -1) throw new Error('unrecognised data file');
  const payload = JSON.parse(text.slice(start + 2).replace(/;\s*$/, ''));
  payload.draws = payload.draws.map(core.unpackDraw);
  return payload;
}

module.exports = {
  HISTORY_START, SOURCES, SOURCE_URLS, PARSERS,
  splitCsvLine, parseNc, parseNy, parseTexas, parsePowerballArchive, parsePowerballSite, parseMegaMillionsLatest,
  mergeSources, renderDataFile, parseDataFile,
};
