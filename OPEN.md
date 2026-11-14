# Open

1. **Treasury = vault only.** MetaDAO's own "Treasury" figure also counts the futarchy AMM and other wallets (e.g. Umbra: $2.4M total vs ~$989K USDC in the vault). Decide which wallets count, and label the figure exactly.
2. **Which DAO is which company.** Onchain there are 100 DAOs; MetaDAO lists 29 companies. Map DAO → name through token metadata (Metaplex token metadata) and/or the Launch accounts.
3. **GitHub links per team.** Not onchain. Waiting on MetaDAO/Star permission or founder claims. Umbra's own website links only X, not GitHub.
4. **Decode Proposal and Launch accounts** (proposal.rs, launchpad state) from the raw files.
5. **Public RPC limits from GitHub Actions IPs** are unknown until the first run. Fallback: `RPC_URL` secret with a free provider key.
6. **Repo size.** About 100–200 KB a day compressed (estimate, to measure after the first week).
