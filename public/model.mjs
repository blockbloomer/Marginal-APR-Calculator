export const LIMITS = Object.freeze({
  capital: [0.000001, 1e12],
  activePercent: [0.00000001, 100],
  aprPercent: [0, 1000000],
  additional: [0, 1e12],
});

const messages = {
  capital: '现有本金需在 0.000001 到 1 万亿 U 之间。',
  activePercent: 'Active 份额需大于等于 0.00000001%，且不超过 100%。',
  aprPercent: '手续费 APR 需在 0% 到 1,000,000% 之间。',
  additional: '追加本金需在 0 到 1 万亿 U 之间。',
};

export function validateInputs(input) {
  const errors = {};
  for (const [key, [min, max]] of Object.entries(LIMITS)) {
    const value = input?.[key];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) errors[key] = messages[key];
  }
  return errors;
}

export function calculatePosition(input) {
  const errors = validateInputs(input);
  if (Object.keys(errors).length) throw new RangeError(`输入无效：${Object.values(errors).join(' ')}`);
  const { capital, activePercent, aprPercent, additional } = input;
  const share = activePercent / 100;
  const denominator = capital + share * additional;
  const dilution = capital / denominator;
  // Preserve the original complementary share to avoid cancellation near 100%.
  const finiteApr = aprPercent * (1 - share) * dilution;
  const extraAnnualFees = additional * (finiteApr / 100);
  const annualFeesBefore = capital * (aprPercent / 100);
  return {
    capitalAfter: capital + additional,
    activeAfter: (share + (1 - share) * (share * additional / denominator)) * 100,
    averageAprAfter: aprPercent * dilution,
    incrementApr: additional === 0 ? null : finiteApr,
    instantAprBefore: aprPercent * (1 - share),
    instantAprAfter: finiteApr * dilution,
    annualFeesBefore,
    totalAnnualFeesAfter: annualFeesBefore + extraAnnualFees,
    extraAnnualFees,
    extraDailyFees: extraAnnualFees / 365,
    extraHourlyFees: extraAnnualFees / 365 / 24,
    dilution,
  };
}

export function incrementalAprAt(input, additional) {
  const share = input.activePercent / 100;
  return input.aprPercent * (1 - share) * input.capital / (input.capital + share * additional);
}
