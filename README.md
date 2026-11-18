# raise-tracker

Open-source, free public record of teams that raise money onchain on Solana. The site counts each raise, what is left in the treasury, what the team is allowed to spend, and whether the team has public code. Built for the Solana Foundation Request for Startups #10, "Discovery and trading for onchain startup fundraising".

Site: https://nikolaskahris-png.github.io/raise-tracker

**Read first:** the collector takes a daily snapshot into a new dated folder and never edits old ones. Whatever is offchain (GitHub activity, releases) cannot be found again for a day that was not collected. Onchain figures can be rebuilt from the transaction history with an archival RPC, at a cost. The daily collection keeps both ready and checked.

## Three parts

| Part | Code | Workflow, schedule (UTC) | Writes |
|---|---|---|---|
| **Daily snapshot** | `collector/` (Python, standard library only) | `collect.yml` (daily-snapshot), 03:17 | `data/YYYY/MM/YYYY-MM-DD/`, append-only |
| **Raise and treasury scan** | `scripts/scan.mjs`, `scripts/treasury.mjs` (Node 22, no dependencies) | `scan.yml` (scan-raises), 05:17 and 17:41 | `data/raises.*`, `data/treasury*.csv`, `data/*-report.md`, replaced on every scan; earlier versions stay in the git history |
| **Public site** | `site/` (see `site/README.md`) | `site.yml`, after every scan on `main` and daily at 09:23 | GitHub Pages. If any check fails, nothing is deployed and the previous version stays online |

GitHub starts scheduled runs late on this repo, by up to about 8 hours (the 03:17 snapshot started at 11:01 on 15 Nov and 11:31 on 16 Nov 2026). That is why the scan has a second time. Both data workflows share one concurrency group, so two pushes never race.

## Status (2026-11-18)

Figures are from `data/` as committed on 17–18 Nov 2026 (scan 17 Nov 23:56 UTC, treasury read 18 Nov 00:17 UTC). They change with every scan.

| Part | Status |
|---|---|
| Daily snapshot | ✅ runs on schedule. Last run (17 Nov): 100 DAOs (0 decode errors), 184 proposals, 221 launch accounts, 100/100 treasury vaults read |
| Raise scan | ✅ v0.6 and v0.7 launches decoded (41 + 173), 0 decode errors, 0 rows failing a check. 13 older launches (v0.5: 7, v0.4.1: 6) are counted but not decoded. 33 completed raises of at least $10,000 with a DAO, $40.0M raised in total |
| Treasury movements | ✅ 925 USDC movements classified (in and out) for the treasuries read; each admin-key movement is linked to the vote before it, or marked as having none. Last scan: 31 of 33 treasuries read, 31/31 reconcile (movements sum exactly to today's balance); $9.7M in those 31. Not checked: whether the logs the RPC returns are complete |
| Company names | ✅ from each token's onchain metadata. One project name (Ranger Finance) is added by short quotation with source (`registry/names.json`) |
| GitHub activity | ⚠️ partial. `registry/projects.json` lists 37 teams: a public repo is found for 15 (11 of the 33 raising companies; 7 with commits in the last 90 days, 4 quiet), none found for 20, one says "open source" but no repo was found, one says "private". Each repo found comes from a source DECISIONS.md allows. `data/shipped.csv` (read 17 Nov): 80 repositories of 11 teams, of which 5 repositories (3 teams) have published a release since the raise |
| Public site | ✅ online, built only from `data/` and checked before every deploy. A bar on every page warns when the latest scan failed, or when no scan has finished for more than 48 hours |

## What the snapshot collects, daily

| File | What | Source |
|---|---|---|
| `futarchy_daos.jsonl.gz` | The MetaDAO DAOs found: raw account + decoded treasury vault, token, monthly spending limit, team address | Solana RPC |
| `futarchy_proposals_raw.jsonl.gz` | The governance proposals found (raw) | Solana RPC |
| `launches_raw.jsonl.gz` | The MetaDAO launchpad raises of v0.5–v0.8 found (raw) | Solana RPC |
| `treasuries.jsonl` | SOL + token balances of each DAO's treasury vault | Solana RPC |
| `github.jsonl` | Public repos and commits in the last 30 days, for owners in `registry/projects.json` | GitHub API |
| `health.json` | What ran, how long, what failed. A failed look is recorded as failed, never as zero | — |

Not collected on purpose: investor funding records, stake accounts and LP positions, because they are private individuals' wallets.

## Check a figure yourself

```
node scripts/verify-launch.mjs <launch account address>
```

Reads the launch account straight from Solana and prints the figures the site shows for that raise. No dependencies; Node 18 or later.

## Secrets

`HELIUS_API_KEY` (scan) and the optional `RPC_URL` (snapshot) live in GitHub Secrets only, never in the repo.

## Tests

- Snapshot decoder: `python tests/test_decode.py` → `PASS`
- Scripts: `node --test scripts/test/*.test.mjs` (also run by the site's `npm test`)
- Site: see `site/README.md`

## Sources and what is missing

The sources the code uses, and what allows each: DECISIONS.md. Open questions: OPEN.md.

## License

- **Code:** Apache-2.0, see [LICENSE](LICENSE).
- **Data** (`data/`): CC BY 4.0, see [data/LICENSE](data/LICENSE). Credit "raise-tracker" and link to this repository.
- **Onchain figures** come from the Solana blockchain, which this project does not own. Where a file has a short quotation from another source, it is given only with a link to that source and stays with its author.
