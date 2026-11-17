# Token Radar

[![Token Launch Radar](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?ref=kc2xf2b1)
[![Rank](https://make.fun/badge/token-radar-01/myruldev/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01?ref=kc2xf2b1)
[![Reward](https://make.fun/badge/token-radar-01/myruldev/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?ref=kc2xf2b1)

Pre-token protocols, ranked by implied value — an entry for the [make.fun](https://make.fun/r/kc2xf2b1) Token Launch Radar bounty.

## What it does

`main.ts` (Node 22, standard library only) reads a DefiLlama protocol snapshot at `/input/snapshot.json` and writes:

- `/output/board.json` — the ranked board (198 pre-token protocols, strongest implied value first)
- `/output/data.js` — the dashboard's data
- `/output/dashboard/` — a static, filterable dashboard with a detail view and a farm plan per protocol
- `/output/screenshots/` — three screenshots of the dashboard
- `/output/dossier.json` — the submission dossier

## The model (radar-2)

Implied value = TVL × category multiple × growth × maturity × chain reach.

- **Category multiple**: the median market-cap-to-TVL ratio of live protocols in the same category, computed from the snapshot at run time (global median when a category has too few live comparables). A category the market prices richly lifts its pre-token protocols.
- **Growth**: 1 + (clamped 7-day TVL change / 100) × 0.5, clamped to −60…+120%.
- **Maturity**: 0.6 + min(age, 1095 days) / 1095 × 0.4 — how long the protocol has run with no token.
- **Chain reach**: 1 + 0.02 × min(chains − 1, 10).

The board is every pre-token protocol the watchlist rule keeps, at any TVL. The watchlist (40 protocols, TVL ≥ $50M, no token) is the floor, never the ceiling.

## Farm plans

Each row carries concrete steps with costs and times, derived from the protocol's own record (category, chains, TVL, age) — never from a hand-written list of names. Multi-chain protocols get one more step: repeat the position on a second chain.

## Run it

```sh
node main.ts --input <snapshot.json|directory>
```

The output directory defaults to `out/`; set `MAKEFUN_OUTPUT_DIR` to change it.
