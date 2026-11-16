import { test } from 'node:test';
import assert from 'node:assert/strict';
import { badTokens, unsourcedDigits } from '../src/check-html.ts';
import { fig, chip, label, date } from '../src/fig.ts';
import { constant, CONSTANT_TEXT } from '../src/constants.ts';
import { parseCsv } from '../src/csv.ts';

const page = (main: string) => `<html><body><header>2026</header><main>${main}</main><footer>v1</footer></body></html>`;

test('a number typed into the page is caught', () => {
  assert.deepEqual(unsourcedDigits(page('<p>Raised $8,000,000 in total</p>')), ['Raised $8,000,000 in total']);
});

test('numbers inside a figure, a time, a chip, a constant or an identifier label are allowed', () => {
  const html = page(`<p>Raised ${fig('$8,000,000', { kind: 'account', address: '8uMemVUT1ToSuda2jBVhcaPmJWq5C3bKe7DhrM5wkqZP' })} on ${date(new Date('2026-07-21T16:59:30Z'))} by ${chip('8uMemVUT1ToSuda2jBVhcaPmJWq5C3bKe7DhrM5wkqZP', 'address')} over ${constant('spending_limit_period_days')}-day periods for ${label('P2P Protocol', 'name')}</p>`);
  assert.deepEqual(unsourcedDigits(html, { constants: CONSTANT_TEXT, identifiers: new Set(['P2P Protocol']) }), []);
});

test('a figure without a link does not count as sourced', () => {
  assert.equal(unsourcedDigits(page('<span data-figure="sum">42</span>')).length, 1);
});

test('digits outside <main> are not checked, digits in svg are ignored', () => {
  assert.deepEqual(unsourcedDigits(page('<svg viewBox="0 0 16 16"><path d="M3 8"></path></svg>')), []);
});

test('a link inside a link is caught', () => {
  assert.ok(unsourcedDigits(page('<a href="x">Download <a data-figure="sum" href="y">185</a></a>')).includes('a link nested inside a link'));
});

test('bad tokens are caught', () => {
  assert.deepEqual(badTokens('<main>$NaN</main>'), ['contains "NaN"']);
  assert.deepEqual(badTokens('<main>fine</main>'), []);
});

test('the CSV parser handles quotes and rejects a short row', () => {
  const { rows } = parseCsv('a,b\n"x, ""y""",2\n', 't');
  assert.equal(rows[0]?.get('a'), 'x, "y"');
  assert.throws(() => parseCsv('a,b\n1\n', 't'), /1 fields/);
  assert.throws(() => parseCsv('a,b\n"1,2\n', 't'), /unterminated/);
});
