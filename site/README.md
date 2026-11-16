# raise-tracker site

Static site built from `data/` and published to GitHub Pages by `.github/workflows/site.yml` after every scan.

- **No runtime dependencies.** TypeScript runs through Node's type stripping (Node 22.18+); tests use `node:test`. TypeScript itself is installed only to typecheck.
- **No number typed by hand.** Every number is printed through `fig()` (`src/fig.ts`) with its source: a transaction, an account, a sum or a formula. After the build, `src/check-html.ts` fails if any digit inside `<main>` is outside a linked figure, a `<time>`, an address chip or a labelled constant.
- **Exact money.** Amounts are integers of micro-USDC (`bigint`, `src/money.ts`). No floating point touches an amount.
- **Publication gate.** `src/invariants.ts` cross-checks every file before anything is rendered. `test/gate.test.ts` changes one value in a copy of the data for each check and proves the build refuses it.
- **Chain re-check.** `src/spot-check.ts` re-reads a random sample of movements and treasury accounts from Solana before deploying.

```
cd site
npx tsc -p .          # typecheck (needs typescript and @types/node)
npm test              # tests on the frozen data in test/fixtures
BASE_PATH=/ npm run build   # builds dist/ from ../data
```
