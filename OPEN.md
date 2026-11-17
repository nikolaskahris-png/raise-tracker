# Open

1. **Treasury = vault only.** We follow only the USDC in each DAO's treasury vault. MetaDAO's own "Treasury" figure also counts the futarchy AMM and other wallets (e.g. Umbra: $2.4M total vs ~$989K USDC in the vault). The site must say exactly what the figure counts.
2. **68 of the 100 futarchy DAOs are not tied to a known company.** Which project each belongs to is not identified yet (possibly Backable raises or tests).
3. **GitHub links per team.** Not onchain. Waiting on permission from MetaDAO (asked 14 Nov) and Blockworks (asked 15 Nov), or on founder claims. Umbra's own website links only X, not GitHub.
4. **GitHub repo count.** The collector reads `/users/metaDAOproject/repos` and gets 11 repos; the organisation page shows 56. Switch to `/orgs/{org}/repos?type=public` with paging, and count commits on all branches.
5. **Launch money that does not reach the treasury.** The launch transaction sends part of the raise to other accounts, shown on the site as "not identified yet". Example: Ranger, 400,000 USDC to an account owned by another address, not identified yet. The other 1,600,000 USDC of the launch's non-treasury money went to the DAO's own market as liquidity (the same transaction runs futarchy ProvideLiquidity), so the site does not call it unidentified.
6. **2 of 33 treasuries not read in the last scan.** Find out why, and whether it repeats.
7. **Older launches.** v0.5 (7) and v0.4.1 (6) launch accounts use an older layout and are not decoded.
8. **Admin-key approvals rely on an instruction name.** 5 of the 9 admin-key movements were approved by an instruction that is not in the MetaDAO code we cite, or in any branch checked. For those we rely on the instruction's name, not its code. The methodology page must say so.
9. **Truncated transaction logs.** The classification reads transaction logs, which RPC providers can truncate (seen on the public RPC). The gate does not check for it yet.
10. **Team-budget "allowed" uses the launch limit.** In Umbra and Laso the market later voted a higher limit. The page says so, but the number still uses the original limit.
11. **One unclassified movement.** Futardio, 2,976 USDC, class `other_out`.
12. **Schedule.** Scheduled runs start about 8 hours late, and the 17:41 scan on 16 Nov did not run at all. Watch whether each day still gets at least one scan.
13. **Repo size.** About 100–200 KB a day compressed (estimate, to measure after the first week, from 21 Nov).
