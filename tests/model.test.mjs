import test from 'node:test';
import assert from 'node:assert/strict';
import { calculatePosition, validateInputs } from '../public/model.mjs';

const baseline = { capital: 2000, activePercent: 70, aprPercent: 60, additional: 1000 };
const close = (actual, expected, tolerance = 1e-10) => assert.ok(Math.abs(actual - expected) <= tolerance * Math.max(1, Math.abs(expected)), `${actual} != ${expected}`);

test('the 2000 to 3000 example distinguishes finite, average and instantaneous APR', () => {
  const r = calculatePosition(baseline);
  close(r.activeAfter, 77.77777777777777);
  close(r.incrementApr, 13.33333333333333);
  close(r.averageAprAfter, 44.44444444444444);
  close(r.instantAprAfter, 9.87654320987654);
  close(r.extraAnnualFees, 133.33333333333333);
  close(r.extraDailyFees * 365, r.extraAnnualFees);
});

test('annual fee conservation agrees with the independent liquidity-share model', () => {
  const r = calculatePosition(baseline);
  const other = 2000 * 0.3 / 0.7;
  const annualPool = 1200 / 0.7;
  close(r.totalAnnualFeesAfter, annualPool * 3000 / (3000 + other));
  close(r.totalAnnualFeesAfter - r.annualFeesBefore, r.extraAnnualFees);
  close(r.incrementApr / 100 * 1000, r.extraAnnualFees);
});

test('scaling all money preserves rates and scales fee income', () => {
  const a = calculatePosition(baseline);
  const b = calculatePosition({ ...baseline, capital: 200000, additional: 100000 });
  close(b.incrementApr, a.incrementApr);
  close(b.activeAfter, a.activeAfter);
  close(b.extraAnnualFees, a.extraAnnualFees * 100);
});

test('more money raises total fees while reducing the finite incremental APR', () => {
  const results = [100, 500, 1000, 4000].map(additional => calculatePosition({ ...baseline, additional }));
  results.slice(1).forEach((r, i) => {
    assert.ok(r.extraAnnualFees > results[i].extraAnnualFees);
    assert.ok(r.incrementApr < results[i].incrementApr);
    assert.ok(r.instantAprAfter < r.incrementApr);
  });
});

test('zero addition has no finite incremental APR, but has an instantaneous limit', () => {
  const r = calculatePosition({ ...baseline, additional: 0 });
  assert.equal(r.incrementApr, null);
  assert.equal(r.extraAnnualFees, 0);
  close(r.instantAprAfter, 18);
  close(r.activeAfter, 70);
  close(r.averageAprAfter, 60);
});

test('owning all active liquidity produces no additional fees at fixed volume', () => {
  const r = calculatePosition({ ...baseline, activePercent: 100 });
  assert.equal(r.activeAfter, 100);
  assert.equal(r.incrementApr, 0);
  assert.equal(r.instantAprAfter, 0);
  close(r.averageAprAfter, 40);
  assert.equal(r.totalAnnualFeesAfter, r.annualFeesBefore);
});

test('zero fees and high APR inputs retain their financial units', () => {
  const zero = calculatePosition({ ...baseline, aprPercent: 0 });
  assert.equal(zero.incrementApr, 0);
  assert.equal(zero.extraAnnualFees, 0);
  const high = calculatePosition({ ...baseline, aprPercent: 100000 });
  close(high.incrementApr, 22222.22222222222);
  close(high.extraAnnualFees, 222222.2222222222);
});

test('tiny shares and near-monopoly positions remain numerically useful', () => {
  const small = calculatePosition({ ...baseline, activePercent: 0.00000001 });
  close(small.incrementApr, 60, 1e-8);
  const large = calculatePosition({ capital: 0.000001, additional: 1e12, activePercent: 99.99999999, aprPercent: 60 });
  assert.ok(large.incrementApr > 0);
  assert.ok(large.instantAprAfter > 0);
  assert.ok(Number.isFinite(large.extraAnnualFees));
});

test('invalid and out-of-range inputs fail instead of returning stale or NaN results', () => {
  for (const change of [{ capital: 0 }, { capital: '' }, { capital: null }, { capital: 1e13 }, { activePercent: 0 }, { activePercent: 101 }, { activePercent: NaN }, { aprPercent: -1 }, { aprPercent: Infinity }, { additional: -1 }]) {
    const input = { ...baseline, ...change };
    assert.ok(Object.keys(validateInputs(input)).length > 0);
    assert.throws(() => calculatePosition(input), /输入/);
  }
});
