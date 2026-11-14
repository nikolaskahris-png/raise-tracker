# raise-tracker

Open-source, free public record of what teams that raise money onchain on Solana promised, and what they shipped afterwards. Built for the Solana Foundation Request for Startups #10, "Discovery and trading for onchain startup fundraising".

**Read first:** the collector takes a daily snapshot, adds a new dated folder each run and never edits old ones. A day that isn't collected can't be recovered later, so the snapshot history is what makes the project valuable.

## Status (2026-11-14)

| Part | Status |
|---|---|
| Decoder for MetaDAO futarchy v0.6 `Dao` | ✅ tested offline on Umbra's real DAO (token, treasury, $100K/month limit match) |
| RPC calls (DAOs, proposals, launches, treasury balances) | ✅ same calls tested live: 100 DAOs, 182 proposals, 173 v0.7 launches, Umbra vault 989,308 USDC |
| Full collector run in GitHub Actions | ⏳ not run yet |
| GitHub activity | ⚠️ only MetaDAO's own org so far: project GitHub links need a permitted source (see DECISIONS.md) |
| Proposal and Launch decoding | ❌ stored raw only, decoded later from the same raw files |
| Public site | ❌ not started |

## What it collects, daily

| File | What | Source |
|---|---|---|
| `futarchy_daos.jsonl.gz` | Every MetaDAO DAO: raw account + decoded treasury vault, token, monthly spending limit, team address | Solana RPC |
| `futarchy_proposals_raw.jsonl.gz` | Every governance proposal (raw) | Solana RPC |
| `launches_raw.jsonl.gz` | Every MetaDAO launchpad raise v0.5–v0.8 (raw) | Solana RPC |
| `treasuries.jsonl` | SOL + token balances of each DAO's treasury vault | Solana RPC |
| `github.jsonl` | Public repos and commits in the last 30 days, for owners in `registry/projects.json` | GitHub API |
| `health.json` | What ran, how long, what failed. A failed look is recorded as failed, never as zero | — |

Not collected on purpose: investor funding records, stake accounts and LP positions, because they are private individuals' wallets.

## How it runs

GitHub Actions, `.github/workflows/collect.yml`, every day at 03:17 UTC, and also by hand ("Run workflow"). Python standard library only, a timeout on every request, retries with backoff. Optional secret `RPC_URL` (e.g. a free Helius key) if the public RPC starts refusing.

Offline test: `python tests/test_decode.py` → `PASS`.

## What is missing

See OPEN.md.
