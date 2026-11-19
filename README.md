# raise-tracker

Open-source, free public record of teams that raise money onchain on Solana. The site counts each raise, what is left in the treasury, what the team is allowed to spend, and whether the team has public code. Built for the Solana Foundation Request for Startups #10, "Discovery and trading for onchain startup fundraising".

Site: https://nikolaskahris-png.github.io/raise-tracker

## At a glance (scan of 18 Nov 2026, 23:33 UTC)

- **33** raises through MetaDAO's launchpad, **$40.0M** raised in total.
- **$9.7M** is still in the 31 treasuries we could read; 2 could not be read.
- **10 of the 33** teams have a public code repository we could find, and 6 of them had a commit in the last 90 days. "No public repo found" does not mean no work: some teams keep their code private.

Figures on the site link to their source: a Solana account or transaction, a GitHub page, or the formula behind them. These numbers change with each scan; the site shows the current ones.

**Check one yourself:** `node scripts/verify-launch.mjs <launch account address>` reads the launch account straight from Solana and prints what the site shows for that raise (details below).

**Read first:** the collector takes a daily snapshot into a new dated folder and never edits old ones. Whatever is offchain (GitHub activity, releases) cannot be found again for a day that was not collected. Onchain figures can be rebuilt from the transaction history with an archival RPC, at a cost. The daily collection keeps both ready and checked.

## Three parts

| Part | Code | Workflow, schedule (UTC) | Writes |
|---|---|---|---|
| **Daily snapshot** | `collector/` (Python, standard library only) | `collect.yml` (daily-snapshot), 03:17 | `data/YYYY/MM/YYYY-MM-DD/`, append-only |
| **Raise and treasury scan** | `scripts/scan.mjs`, `scripts/treasury.mjs` (Node 22, no dependencies) | `scan.yml` (scan-raises), 05:17, 11:41, 17:41 and 23:11 (a scheduled run stops at once when the data is under 5 hours old) | `data/raises.*`, `data/treasury*.csv`, `data/*-report.md`, replaced on every scan; earlier versions stay in the git history |
| **Public site** | `site/` (see `site/README.md`) | `site.yml`, after every scan on `main` and daily at 09:23 | GitHub Pages. If any check fails, nothing is deployed and the previous version stays online |

GitHub starts scheduled runs late on this repo, by up to about 8 hours (the 03:17 snapshot started at 11:01 on 15 Nov and 11:31 on 16 Nov 2026). That is why the scan has four times a day. Both data workflows share one concurrency group, so two pushes never race.

## Status (2026-11-19)

Figures are from `data/` as committed on 18–19 Nov 2026 (scan 18 Nov 23:33 UTC, treasury read 18 Nov 23:54 UTC). They change with each scan.

| Part | Status |
|---|---|
| Daily snapshot | ✅ runs on schedule. Last run (17 Nov): 100 DAOs (0 decode errors), 184 proposals, 221 launch accounts, 100/100 treasury vaults read |
| Raise scan | ✅ v0.6 and v0.7 launches decoded (41 + 173), 0 decode errors, 0 rows failing a check. 13 older launches (v0.5: 7, v0.4.1: 6) are counted but not decoded. 33 completed raises of at least $10,000 with a DAO, $40.0M raised in total |
| Treasury movements | ✅ 925 USDC movements classified (in and out) for the treasuries read; each admin-key movement is linked to the vote before it, or marked as having none. Last scan: 31 of 33 treasuries read, 31/31 reconcile (movements sum exactly to today's balance); $9.7M in those 31. Not checked: whether the logs the RPC returns are complete |
| Company names | ✅ from each token's onchain metadata. One project name (Ranger Finance) is added by short quotation with source (`registry/names.json`) |
| GitHub activity | ⚠️ partial. `registry/projects.json` lists 37 teams: a public repo is found for 14 (10 of the 33 raising companies; 6 with commits in the last 90 days, 4 quiet), none found for 21, one says "open source" but no repo was found, one says "private". Each repo found comes from a source DECISIONS.md allows. `data/shipped.csv` (read 19 Nov): 75 repositories of 10 teams, of which 4 repositories (2 teams) have published a release since the raise |
| Public site | ✅ online, built only from `data/` and checked before every deploy. A bar on every page warns when the latest scan failed, or when no scan has finished for more than 48 hours |

## Roadmap

Planned in three milestones, subject to funding (applying to the Solana Foundation). Weeks count from the start of the grant.

| Milestone | Week | What |
|---|---|---|
| **M1. More launchpads** | 6 | Star, Metaplex Genesis (official API) and Backable's funded raises; Star read from the chain, not from its site. Open dataset (CC BY 4.0) with a schema. At least 90 consecutive days of daily snapshots in this repo |
| **M2. Founder claims** | 14 | A founder proves control (a signature from the DAO or launch wallet, or the team's GitHub organization) and adds links. Each claim is stored as "claim → source". Open alerts (RSS, Telegram) for treasury withdrawals and for 60 days without a public commit |
| **M3. 180 days** | 26 | A 180-day report across the launchpads. The share of teams with public commits 30, 90 and 180 days after the raise is given only if at least 20 teams with a known repo have passed 180 days; otherwise per team, without a percentage. At least 180 consecutive days of snapshots, a runbook so anyone can run it, RPC and hosting paid for 12 months |

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
