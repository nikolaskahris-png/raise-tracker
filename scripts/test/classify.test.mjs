// Item 11: the treasury classification, tested offline against real transactions stored as fixtures
// (recorded by scripts/test/record-classify.mjs). Each case must give exactly the row the live run published
// in the frozen site/test/fixtures/2026-11-16/treasury-flows.csv.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { indexProposals, makeClassifier } from '../classify.mjs';

const C = JSON.parse(readFileSync(new URL('../../constants.json', import.meta.url), 'utf8'));
const F = new URL('./fixtures/classify/', import.meta.url);
const read = (n) => JSON.parse(readFileSync(new URL(n, F), 'utf8'));
const cases = read('cases.json'), answers = read('rpc.json'), proposals = indexProposals(read('proposals.json'));

// An rpc that only answers from the stored fixtures: any other call fails the test, so nothing reaches the network.
const replay = async (method, params) => {
  const key = `${method} ${JSON.stringify(params)}`;
  if (!(key in answers)) throw new Error(`not in fixtures: ${key.slice(0, 120)}`);
  return structuredClone(answers[key]);
};
const classifier = () => makeClassifier({ rpc: replay, proposals, adminVoteWindowS: C.admin_vote_window_days * 86400 });

function publishedRow(signature) {
  const text = readFileSync(new URL('../../site/test/fixtures/2026-11-16/treasury-flows.csv', import.meta.url), 'utf8').replace(/\r/g, '');
  const [h, ...rows] = text.trim().split('\n');
  const cols = h.split(',');
  const line = rows.find((l) => l.includes(`,${signature},`));
  assert.ok(line, `no published row for ${signature}`);
  return Object.fromEntries(line.split(',').map((v, i) => [cols[i], v]));
}
const COLS = ['time_utc', 'usdc', 'class', 'approval', 'market_decision', 'decision_ref', 'prior_vote_number', 'prior_vote_address', 'prior_vote_finalize_signature', 'prior_vote_finalized_utc', 'counterparty', 'signature', 'instructions'];

test('the fixtures cover every class seen on the frozen data that has a real example', () => {
  assert.deepEqual(cases.map((c) => c.expect).sort(), ['admin_after_vote', 'inflow_other', 'launch_funding', 'market_approved', 'other_out', 'team_budget']);
  assert.equal(proposals.errors, 0);
});

for (const c of cases) {
  test(`${c.ticker} ${c.expect}: offline classification equals the published row`, async () => {
    const k = classifier();
    const tx = await k.getTx(c.signature);
    const m = await k.classify({ tx, ata: c.ata, multisig: c.multisig, dao: c.dao });
    assert.ok(m, 'the treasury balance moved');
    assert.deepEqual(m.problems, []);
    const got = k.flowColumns(m, tx, c.signature), want = publishedRow(c.signature);
    // The public RPC returned this transaction's logs cut short ("Log truncated"); the published row was read
    // through Helius with the full logs. Then the instructions seen must be the start of the published list.
    const truncated = tx.meta.logMessages.at(-1) === 'Log truncated';
    for (const col of COLS) {
      if (col === 'instructions' && truncated) assert.ok(want[col].startsWith(String(got[col]) + ' '), 'instructions: not the start of the published list');
      else assert.equal(String(got[col]), want[col], `${col}`);
    }
  });
}

test('the launch deposit names where the rest of the raise went, in exact base units', async () => {
  const c = cases.find((x) => x.expect === 'launch_funding');
  const k = classifier();
  const m = await k.classify({ tx: await k.getTx(c.signature), ata: c.ata, multisig: c.multisig, dao: c.dao });
  const t = readFileSync(new URL('../../site/test/fixtures/2026-11-16/treasury.csv', import.meta.url), 'utf8').replace(/\r/g, '').trim().split('\n');
  const cols = t[0].split(','), row = t.find((l) => l.startsWith(`${c.ticker},`)).split(',');
  const want = row[cols.indexOf('launch_other_recipients')];
  const micro = (v) => `${v / 1000000n}.${(v % 1000000n).toString().padStart(6, '0')}`;
  assert.equal(m.launchOthers.map((o) => `${o.owner}:${o.account}:${micro(o.amount)}`).join(' '), want);
});

test('a market vote whose Squads proposal was approved by an admin key is not a market vote', async () => {
  // The real Umbra market-vote movement, with one stored transaction of its Squads proposal changed to have run an
  // admin approval: the classifier must then call it an admin-key movement, timed against its own proposal.
  const c = cases.find((x) => x.expect === 'market_approved');
  const k0 = classifier();
  const tx = await k0.getTx(c.signature);
  const own = publishedRow(c.signature).approval.match(/proposal=(\w+)/)[1];
  const tampered = structuredClone(answers);
  const sigKey = Object.keys(tampered).find((x) => x.startsWith(`getSignaturesForAddress ["${own}"`));
  const firstSig = tampered[sigKey].find((s) => !s.err).signature;
  const txKey = Object.keys(tampered).find((x) => x.startsWith(`getTransaction ["${firstSig}"`));
  tampered[txKey].meta.logMessages = [...tampered[txKey].meta.logMessages, 'Program FUTARELBfJfQ8RDGhg1wdhddq1odMAJUePHFuBYfUxKq invoke [1]', 'Program log: Instruction: AdminEnqueueMultisigProposalApproval', 'Program FUTARELBfJfQ8RDGhg1wdhddq1odMAJUePHFuBYfUxKq success'];
  // The futarchy proposal's history has thousands of trades; the recorder stored only its FinalizeProposal
  // (a proposal is finalized once), so its history is served as that one real transaction.
  tampered[`getSignaturesForAddress ${JSON.stringify([c.finalize.proposal, { limit: 1000 }])}`] = [{ signature: c.finalize.signature, err: null }];
  const rpc = async (method, params) => {
    const key = `${method} ${JSON.stringify(params)}`;
    if (!(key in tampered)) throw new Error(`not in fixtures: ${key.slice(0, 120)}`);
    return structuredClone(tampered[key]);
  };
  const k = makeClassifier({ rpc, proposals, adminVoteWindowS: C.admin_vote_window_days * 86400 });
  const m = await k.classify({ tx, ata: c.ata, multisig: c.multisig, dao: c.dao });
  const row = publishedRow(c.signature);
  const futarchyProposal = row.decision_ref.split(' ')[1];
  assert.equal(c.finalize.proposal, futarchyProposal);
  const f = await k.finalizeOf(futarchyProposal);
  assert.equal(f?.signature, c.finalize.signature, 'the market vote has its FinalizeProposal');
  assert.equal(m.cls, f.time <= tx.blockTime ? 'admin_after_vote' : 'admin_vote_passed_after');
  assert.match(m.approval, /^admin_approved/);
  assert.equal(m.prior?.address, futarchyProposal);
  assert.equal(m.prior?.finalize_signature, f.signature);
});
