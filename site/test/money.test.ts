import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fmtUsd, matchesCents, microToDecimal, parseMicro, pct, ratio, sum, toCents } from '../src/money.ts';

test('parses decimals exactly, with no floating point', () => {
  assert.equal(parseMicro('0.1') + parseMicro('0.2'), parseMicro('0.3')); // 0.1 + 0.2 === 0.3, unlike floats
  assert.equal(parseMicro('7911340.211404'), 7_911_340_211_404n);
  assert.equal(parseMicro('-105000.000000'), -105_000_000_000n);
  assert.equal(parseMicro('34091'), 34_091_000_000n);
});

test('rejects anything that is not a plain decimal with at most 6 places', () => {
  for (const bad of ['', '1e6', '1.1234567', '1,000', ' 1', 'NaN', '0x10', '-']) assert.throws(() => parseMicro(bad), bad);
});

test('sums exactly across many small amounts', () => {
  const xs = Array.from({ length: 1000 }, () => parseMicro('0.01'));
  assert.equal(sum(xs), parseMicro('10'));
});

test('rounds half a cent away from zero', () => {
  assert.equal(toCents(parseMicro('1600000.595')), 160_000_060n);
  assert.equal(toCents(parseMicro('-0.005')), -1n);
  assert.equal(toCents(parseMicro('0.004999')), 0n);
});

test('compares an exact amount with a figure the scripts rounded to cents', () => {
  assert.ok(matchesCents(parseMicro('1600000.595'), parseMicro('1600000.59')));
  assert.ok(matchesCents(parseMicro('1600000.595'), parseMicro('1600000.60')));
  assert.ok(!matchesCents(parseMicro('1600000.595'), parseMicro('1600000.61')));
  assert.ok(!matchesCents(parseMicro('100'), parseMicro('100.01')));
});

test('formats dollars', () => {
  assert.equal(fmtUsd(parseMicro('8000000')), '$8,000,000');
  assert.equal(fmtUsd(parseMicro('989308.4')), '$989,308.40');
  assert.equal(fmtUsd(parseMicro('-250000'), { decimals: 2 }), '−$250,000.00');
  assert.equal(fmtUsd(parseMicro('34778.26'), { decimals: 2, sign: 'always' }), '+$34,778.26');
  assert.equal(fmtUsd(0n, { decimals: 2 }), '$0.00');
});

test('percentages and ratios are exact', () => {
  assert.equal(pct(14n, 17n), '82.4%');
  assert.equal(pct(19n, 120n), '15.8%');
  assert.equal(ratio(parseMicro('154943746'), parseMicro('3000000'), 2), '51.65');
  assert.equal(ratio(parseMicro('31968872'), parseMicro('250000'), 2), '127.88');
});

test('writes exact decimals for CSV', () => {
  assert.equal(microToDecimal(parseMicro('-105000')), '-105000.000000');
  assert.equal(microToDecimal(parseMicro('0.000001')), '0.000001');
});
