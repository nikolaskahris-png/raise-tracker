# raise-tracker

Open-source, free public record of what teams that raise money onchain on Solana promised, and what they did with it afterwards. Built for the Solana Foundation Request for Startups #10, "Discovery and trading for onchain startup fundraising".

Site: https://nikolaskahris-png.github.io/raise-tracker

**Read first:** the collector takes a daily snapshot into a new dated folder and never edits old ones. A day that isn't collected can't be recovered later, so the snapshot history is what makes the project valuable.

## Three parts

| Part | Code | Workflow, schedule (UTC) | Writes |
|---|---|---|---|
| **Daily snapshot** | `collector/` (Python, standard library only) | `collect.yml` (daily-snapshot), 03:17 | `data/YYYY/MM/YYYY-MM-DD/`, append-only |
| **Raise and treasury scan** | `scripts/scan.mjs`, `scripts/treasury.mjs` (Node 22, no dependencies) | `scan.yml` (scan-raises), 05:17 and 17:41 | `data/raises.*`, `data/treasury*.csv`, `data/*-report.md`, replaced on every scan; earlier versions stay in the git history |
| **Public site** | `site/` (see `site/README.md`) | `site.yml`, after every scan on `main` and daily at 09:23 | GitHub Pages. If any check fails, nothing is deployed and the previous version stays online |

GitHub starts scheduled runs late on this repo, by up to about 8 hours (the 03:17 snapshot started at 11:01 on 15 Nov and 11:31 on 16 Nov 2026). That is why the scan has a second time. Both data workflows share one concurrency group, so two pushes never race.

## Status (2026-11-16)

| Part | Status |
|---|---|
| Daily snapshot | ✅ runs on schedule. Last run (16 Nov): 100 DAOs (0 decode errors), 183 proposals, 221 launch accounts, 100/100 treasury vaults read |
| Raise scan | ✅ v0.6 and v0.7 launches decoded (41 + 173). 13 older launches (v0.5: 7, v0.4.1: 6) are counted but not decoded |
| Treasury movements | ✅ every USDC movement in and out of each treasury classified, each admin-key movement linked to the vote before it. Last scan: 31 of 33 treasuries read, 31/31 reconcile (movements sum exactly to today's balance) |
| Company names | ✅ from each token's onchain metadata. One project name (Ranger Finance) is added by short quotation with source (`registry/names.json`) |
| GitHub activity | ⚠️ MetaDAO's own org only. Teams' repos need a permitted source (see DECISIONS.md) |
| Public site | ✅ online, built only from `data/` and checked before every deploy |

## What the snapshot collects, daily

| File | What | Source |
|---|---|---|
| `futarchy_daos.jsonl.gz` | Every MetaDAO DAO: raw account + decoded treasury vault, token, monthly spending limit, team address | Solana RPC |
| `futarchy_proposals_raw.jsonl.gz` | Every governance proposal (raw) | Solana RPC |
| `launches_raw.jsonl.gz` | Every MetaDAO launchpad raise v0.5–v0.8 (raw) | Solana RPC |
| `treasuries.jsonl` | SOL + token balances of each DAO's treasury vault | Solana RPC |
| `github.jsonl` | Public repos and commits in the last 30 days, for owners in `registry/projects.json` | GitHub API |
| `health.json` | What ran, how long, what failed. A failed look is recorded as failed, never as zero | — |

Not collected on purpose: investor funding records, stake accounts and LP positions, because they are private individuals' wallets.

## Check a figure yourself

```
node scripts/verify-launch.mjs <launch account address>
```

Reads the launch account straight from Solana and prints every figure the site shows for that raise. No dependencies; Node 18 or later.

## Secrets

`HELIUS_API_KEY` (scan) and the optional `RPC_URL` (snapshot) live in GitHub Secrets only, never in the repo.

## Tests

- Snapshot decoder: `python tests/test_decode.py` → `PASS`
- Scripts: `node --test scripts/test/*.test.mjs` (also run by the site's `npm test`)
- Site: see `site/README.md`

## Sources and what is missing

Every source the code uses, and what allows it: DECISIONS.md. Open questions: OPEN.md.
