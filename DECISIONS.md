# Decisions

## 2026-11-16: every source the code or the site uses, and what allows it

Every host the code contacts must be in this table; `site/test/sources.test.ts` fails otherwise.

| Source | Used for | Allowed? | Basis |
|---|---|---|---|
| Solana mainnet RPC (`api.mainnet-beta.solana.com`, `mainnet.helius-rpc.com`) | Every raise, balance, movement, slot; token metadata and decimals | ✅ | Public blockchain. Helius under its free plan's rate limits, key in GitHub Secrets only |
| Token metadata (Metaplex metadata accounts, read over RPC) | Company names and symbols | ✅ | Onchain data. Names are shown as declared by whoever controls the metadata |
| `market-api.metadao.fi` (MetaDAO market API) | Was: names and tickers | ❌ **removed 16 Nov 2026** | metadao.fi's terms forbid robots and spiders "for monitoring or copying" without prior written consent (row above, 14 Nov), and a daily call is monitoring; no written consent. metadao.fi also answers automated requests with HTTP 429. Nothing is lost: every name it gave is in the onchain metadata |
| `github.com/metaDAOproject/programs`, `github.com/Squads-Protocol/v4` | Account layouts; the code lines the methodology links (fixed commits) | ✅ | Public source code, read and linked, not copied into the site |
| `api.github.com` | Repo activity in the collector | ✅ | API use within rate limits |
| SolanaFloor (`solanafloor.com`), "Ranger Finance winds down" (published 15 May 2026) | One sentence, quoted verbatim, for the project name "Ranger Finance" | ✅ as a short quotation with source and link | Read by hand, once. No automated collection. The site publishes no terms of use (only Privacy, Financial Disclosures and Ethics pages, checked 16 Nov 2026); a short attributed quotation is an ordinary citation |
| Solana Compass (`solanacompass.com`), "…ZKFG-008 passes" (published 20 Jun 2026) | **Link only**, for reading, on the ZKFG page. Not quoted, not used for the name or any figure | ✅ link only (changed 16 Nov 2026) | The site has no terms page (`/terms` returns 404) and refuses automated requests, so we cannot show that quoting is allowed. The quote and the project name "Zinc" were removed; the token shows its onchain name "ZKFG" |
| Personal notes on defi-kai.github.io | Was: the name "Paystream" | ❌ removed 16 Nov 2026 | Not a publication, and the page returns 404. The token's onchain metadata names it "Paystream" |
| `explorer.solana.com` | Links from every figure | ✅ | Links only; nothing is fetched |
| Google Fonts (`fonts.googleapis.com`, `fonts.gstatic.com`) | Typefaces, loaded by the visitor's browser | ⚠️ | Not a data source. It sends visitors' IP addresses to Google; self-hosting the fonts would remove that |

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
