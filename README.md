# Lottery Intelligence Pro

A simple, fast web page for exploring **20 years of real Powerball and Mega Millions results** (October 2006 → today): hot and cold numbers, number patterns, a configurable number generator, a ticket checker and a backtester.

It is a plain static site — HTML, CSS and JavaScript. No server, no database, no build step, no dependencies. It runs from GitHub Pages or by double-clicking `index.html`.

> For information and entertainment only. Lottery drawings are independent random events: past results do not predict future ones, and no strategy here improves anyone's odds. Not affiliated with any lottery.

## What's in it

| Tab | What it does |
| --- | --- |
| **Dashboard** | Latest verified numbers, next drawing, top hot/cold numbers, longest absences, frequency charts, most common pairs and triplets |
| **Hot & Cold** | Heatmap and sortable table for every number: times drawn, expected, difference, z-score, last 25/50/100/500 drawings, gaps, trend. CSV export |
| **Patterns** | Odd/even, low/high, sums, spread, consecutive numbers, repeats, decades, last digits, pair matrix, year-by-year tables |
| **Generator** | 1–100 tickets from 10 strategies (hot, cold, mix, recent, long-term, balanced, pairing, pure random, custom weights/locks/exclusions, ensemble). Save, copy, print, export |
| **Results** | Search every drawing by date, year or numbers; drawing details; compare two years; CSV export |
| **Backtest** | Replays a strategy against past drawings using only earlier data, next to pure random tickets |
| **My Tickets** | Save or type in tickets and check them against any drawing (stored in your browser only) |
| **About & Data** | Sources, verification status, game-format history and how every figure is calculated |

Use the **Powerball / Mega Millions** switch and the **Analyze** menu (last 10–500 drawings, 1–20 years, current format only, or a custom date range) at the top; every statistic recalculates instantly.

## Open it

- **On your computer:** double-click `index.html`. Or run `node scripts/serve.js` and open <http://localhost:4173>.
- **On GitHub Pages:** push this folder to a GitHub repository, then in the repository go to **Settings → Pages**, choose **Deploy from a branch**, pick `main` and `/ (root)`, and save. Your page appears at `https://<your-user>.github.io/<repo>/` a minute later.

## The data

All results are downloaded from official sources and kept only when sources agree. Nothing is simulated.

| Source | Powerball | Mega Millions |
| --- | --- | --- |
| North Carolina Education Lottery (includes jackpots) | 2006 → now | 2010 → now |
| New York Gaming Commission, data.ny.gov | 2010 → now | 2006 → now |
| Texas Lottery | 2010 → now | 2006 → now |
| powerball.com results pages | 2006 – 2010 and recent | — |
| powerball.com winning-numbers file (Internet Archive copy) | 2006 – 2016 | — |
| megamillions.com | — | latest drawing and jackpot |

Texas and New York only joined Powerball in 2010, so the 2006–2009 Powerball drawings are verified against North Carolina plus two independent copies of powerball.com's own records.

Current snapshot: **2,359 Powerball** and **2,090 Mega Millions** drawings, every one confirmed by at least two sources, with no scheduled drawing missing. Two Mega Millions dates where New York's file disagrees with the other sources are kept at the majority value and listed on the About tab.

Known limits, stated plainly:

- Mega Millions jackpot amounts before February 2010 are blank (no verified source). Jackpot-winner details are not included.
- Prize estimates use the standard published base prizes for the format in force at each drawing. Real prizes can differ (California pays pari-mutuel amounts; add-on multipliers are not modelled).

### Game formats

Number ranges changed over the years, and every drawing is validated and analysed under the rules of its own date. The generator only produces numbers valid today.

| Powerball from | Main | Powerball | | Mega Millions from | Main | Mega Ball |
| --- | --- | --- | --- | --- | --- | --- |
| Aug 2005 | 1–55 | 1–42 | | Jun 2005 | 1–56 | 1–46 |
| Jan 2009 | 1–59 | 1–39 | | Oct 2013 | 1–75 | 1–15 |
| Jan 2012 | 1–59 | 1–35 | | Oct 2017 | 1–70 | 1–25 |
| Oct 2015 | 1–69 | 1–26 | | Apr 2025 | 1–70 | 1–24 |

When a period spans several formats, rankings use **observed ÷ expected**, where "expected" is summed drawing by drawing (5 ÷ pool size for a main number, 1 ÷ pool size for the special ball).

## Keeping it up to date

- **Automatically (GitHub):** `.github/workflows/update-data.yml` runs twice a day, re-downloads every source, cross-checks them, runs the tests and commits any new drawings. Nothing to configure; you can also start it by hand from the repository's **Actions** tab.
- **In the browser:** on each visit, and when you press **↻ Refresh**, the page asks New York's open-data service for drawings newer than the saved snapshot. Those show as "awaiting verification" until the scheduled update confirms them with a second source.
- **By hand:** `node scripts/update-data.js` (add `--full` to also re-verify 2006–2009 Powerball against powerball.com).

The updater never overwrites a published drawing. If a source disagrees, the record stays as it is and the difference is logged in the data file. Everything is free; no API keys or paid services are used.

## Tests

```bash
npm test
```

42 tests, no dependencies (Node 18+). They cover number validation, every historical rule change, frequency/gap/pair/triplet maths, generator validity and uniformity, duplicate handling, backtesting without future-data leakage, source parsing, de-duplication and conflict handling, CSV export, and the integrity of the published data files.

## Files

```
index.html              the page
styles.css              dark theme (Powerball red, Mega Millions gold)
js/core.js              rules, statistics, generator, backtest — no DOM, fully tested
js/ui.js                page shell, filters, live refresh
js/pages-stats.js       Dashboard, Hot & Cold, Patterns, About
js/pages-tools.js       Generator, Results, Backtest, My Tickets
data/powerball.js       verified results (generated)
data/megamillions.js    verified results (generated)
scripts/update-data.js  downloads + cross-checks the sources
scripts/pipeline.js     source parsers and merge rules
scripts/serve.js        optional local preview server
tests/                  automated tests
```

Saved tickets and settings are kept in your browser's local storage only. A saved ticket is a note, not a lottery entry.
