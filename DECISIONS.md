# Decisions

## 2026-11-14: sources only where the terms allow automated collection

| Source | Allowed? | Basis |
|---|---|---|
| Solana mainnet (RPC) | ✅ | Public blockchain |
| Metaplex Genesis | ✅ via official API only | Terms forbid scrapers "not provided by us"; the Genesis API is provided |
| GitHub REST API | ✅ | API use within rate limits |
| Electric Capital Open Dev Data | ✅ | CC BY 4.0, with attribution |
| metadao.fi pages | ❌ until written permission | Terms forbid robots/spiders "for monitoring or copying" without prior written consent; permission requested |
| star.fun | ❌ until permission | Terms forbid crawlers/bots to "access, obtain, copy or monitor"; permission requested |
| Colosseum | ❌ | Terms forbid screen scraping and republishing content and others' personal information |
| Superteam Earn | ⚠️ aggregates only, or with the person's consent | Terms forbid revealing identifiable information about other users without permission |

Consequence: a founder's history (Superteam, Colosseum, past projects) comes from the founder claiming their own page and adding links, which we then verify. It is never compiled about them without asking.

## 2026-11-14: MetaDAO data read onchain, not from their site

Program IDs come from github.com/metaDAOproject/programs (README, Deployments). The Dao layout comes from programs/futarchy/src/state/dao.rs. Borsh enums/Options are variable length, so the decoder walks the bytes instead of using fixed offsets.

## 2026-11-14: raw is always stored

Proposal and Launch accounts are stored raw before they are decoded, so a decoder bug can be fixed and recomputed without losing history.
