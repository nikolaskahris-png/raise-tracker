// Records the real chain answers that scripts/test/classify.test.mjs replays offline.
// Run once from the repo root:  node scripts/test/record-classify.mjs
// Uses the public RPC (or Helius when HELIUS_API_KEY is set; the key is never written to the fixtures).
// For each case it classifies one real treasury movement through a recording rpc, then stores every answer it needed:
// the transaction itself, the Squads proposal history and the futarchy proposals' FinalizeProposal transactions.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { makeRpc } from '../rpc.mjs';
import { FUTARCHY, PROPOSAL_DISCRIMINATOR, indexProposals, ixNames, makeClassifier } from '../classify.mjs';

const C = JSON.parse(readFileSync(new URL('../../constants.json', import.meta.url), 'utf8'));
const OUT = new URL('./fixtures/classify/', import.meta.url);
const url = process.env.HELIUS_API_KEY ? `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}` : 'https://api.mainnet-beta.solana.com';
const { rpc: live } = makeRpc(url, { minGapMs: 250, attempts: 10, backoffMs: 3000 });

const csv = (p) => {
  const [h, ...rows] = readFileSync(p, 'utf8').replace(/\r/g, '').trim().split('\n');
  const cols = h.split(',');
  // these files quote no field the cases use, so a plain split is enough here
  return rows.map((l) => Object.fromEntries(l.split(',').map((v, i) => [cols[i], v])));
};
const treasuries = csv('data/treasury.csv');
const flows = csv('site/test/fixtures/2026-11-16/treasury-flows.csv');
const first = (ticker, cls) => flows.find((f) => f.ticker === ticker && f.class === cls)?.signature;
const want = [
  ['UMBRA', 'launch_funding'], ['UMBRA', 'team_budget'], ['UMBRA', 'market_approved'], ['UMBRA', 'inflow_other'],
  ['FUTARDIO', 'admin_after_vote'], ['FUTARDIO', 'other_out'],
];
const cases = want.map(([ticker, cls]) => {
  const t = treasuries.find((x) => x.ticker === ticker);
  return { ticker, expect: cls, signature: first(ticker, cls), ata: t.treasury_usdc_account, multisig: t.squads_multisig, dao: t.dao };
});

// The futarchy proposals of these DAOs (the DAO sits at byte 117 of a non-Draft Proposal account).
const accounts = [];
for (const dao of [...new Set(cases.map((c) => c.dao))]) {
  accounts.push(...await live('getProgramAccounts', [FUTARCHY, { encoding: 'base64', filters: [{ memcmp: { offset: 0, bytes: PROPOSAL_DISCRIMINATOR } }, { memcmp: { offset: 117, bytes: dao } }] }]));
}
const proposals = indexProposals(accounts);
if (proposals.errors) throw new Error(`proposal decode errors: ${proposals.errors}`);

// Answers already stored are reused, so a re-run only asks the chain for what is new.
const stored = existsSync(new URL('rpc.json', OUT)) ? JSON.parse(readFileSync(new URL('rpc.json', OUT), 'utf8')) : {};
const answers = {};
// Saved after every case, so an interrupted run keeps what it has read (the last save keeps only what was used).
mkdirSync(OUT, { recursive: true });
const save = (o) => writeFileSync(new URL('rpc.json', OUT), JSON.stringify(o) + '\n');
const rpc = async (method, params) => { const key = `${method} ${JSON.stringify(params)}`; const r = key in stored ? stored[key] : await live(method, params); answers[key] = r; return r; };
const k = makeClassifier({ rpc, proposals, adminVoteWindowS: C.admin_vote_window_days * 86400 });
for (const c of cases) {
  const tx = await k.getTx(c.signature);
  const m = await k.classify({ tx, ata: c.ata, multisig: c.multisig, dao: c.dao });
  console.log(c.ticker, c.expect, '->', m?.cls, c.signature.slice(0, 8));
  // For the market vote, also the FinalizeProposal of its futarchy proposal: the test that turns it into an
  // admin-approved movement times it against that proposal. Its history has thousands of trades, so it is searched
  // from the newest end (a proposal is finalized once) and only that transaction is stored.
  if (c.expect === 'market_approved') {
    const keep = new Set(Object.keys(answers)); // what the classification itself read
    const own = proposals.bySquads.get(m.approval.match(/proposal=(\w+)/)[1]);
    let before, found = null;
    while (!found) {
      const page = await live('getSignaturesForAddress', [own.address, { limit: 100, ...(before ? { before } : {}) }]);
      for (const s of page) { if (s.err) continue; const t = await k.getTx(s.signature); if (ixNames(t.meta.logMessages).includes('futarchy:FinalizeProposal')) { found = s; break; } }
      if (page.length < 100) break; before = page.at(-1).signature;
    }
    if (!found) throw new Error('no FinalizeProposal found');
    c.finalize = { proposal: own.address, signature: found.signature };
    // keep only the finalize transaction among those read here
    for (const key of Object.keys(answers)) if (key.startsWith('getTransaction ') && !key.includes(found.signature) && !keep.has(key)) delete answers[key];
    console.log('  finalize', found.signature.slice(0, 8));
  }
  save({ ...stored, ...answers });
}
writeFileSync(new URL('cases.json', OUT), JSON.stringify(cases, null, 1) + '\n');
writeFileSync(new URL('proposals.json', OUT), JSON.stringify(accounts.map((a) => ({ pubkey: a.pubkey, account: { data: a.account.data } })), null, 1) + '\n');
save(answers);
console.log(`stored ${Object.keys(answers).length} answers, ${accounts.length} proposals`);
