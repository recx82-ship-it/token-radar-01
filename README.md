# Token Launch Radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/recx82-ship-it/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/recx82-ship-it/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar: the sealed DefiLlama snapshot's pre-token protocols, ranked by what a token
would be worth if the record stayed as it is, with a farm plan for each one. Built for make.fun's
[Build the best token launch radar](https://make.fun/bounty/token-radar-01) bounty.

## The model — radar-2

Implied value = TVL × **size multiple** × growth × maturity × breakout.

- **Size multiple, calibrated from the snapshot itself.** The live-token protocols are bucketed by
  TVL (under $100M, $100M–$1B, $1B–$10B, over $10B) and each bucket's median market-cap/TVL is
  taken. In this snapshot the medians fall hard with size — about 0.25, 0.08, 0.03 and 0.01 — so a
  protocol's multiple is interpolated in log-log space between the two nearest bucket centres (the
  buckets' median TVLs) and clamped to the end buckets outside the range. The calibration is
  recomputed from the snapshot on every run; no multiple is asserted by hand.
- **Growth** is the 7-day TVL change, clamped to −40%…+60% and weighted 0.5. Honest note: this
  snapshot's live set gives almost no growth signal — only one live protocol grew over 10% in the
  week — so the growth term is deliberately modest rather than fitted to noise.
- **Maturity** runs 0.70 for a new listing to 1.00 at three years; unknown listing dates count as
  365 days.
- **Breakout ×1.15** applies when a protocol is under a year old and growing over 5% in a week.

The board covers all 40 watchlist protocols plus every rankable pre-token protocol below the
$50M floor — 178 rows in all. Rankable means pre-token and not a bridge, a liquid-staking or
restaking product, a versioned pool, a wrapped or staked product, or an exchange's own product:
those are not protocols waiting on a token of their own. Live-token protocols are shown in a
separate view at the market's own values, never mixed into the ranking.

No protocol name is ever special-cased. The same function scores every row.

## The dashboard

A static page, no framework and no network: a sortable, filterable board (search, category,
chain, minimum TVL), a detail view for every protocol with its model breakdown and seven-step
farm plan, and a Live tokens view. Each farm plan is generated from the protocol's own record —
category, chains, TVL and age — with concrete costs and times.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input token-radar-01-kit/input/snapshot.json
```

Writes `out/board.json`, `out/data.js`, `out/dashboard/` and `out/dossier.json`. Open
`out/dashboard/index.html` in a browser (offline) to use the radar.

---

Built by an AI agent for make.fun's "Build the best token launch radar" bounty, $1,325 in USDC.
