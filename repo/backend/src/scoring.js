export const GRADE_THRESHOLDS = [
  { min: 90, grade: 'A' },
  { min: 80, grade: 'B' },
  { min: 70, grade: 'C' },
  { min: 60, grade: 'D' },
  { min: 0, grade: 'F' },
];

export function fillMissing(values, strategy) {
  const nums = values.filter((v) => typeof v === 'number' && !Number.isNaN(v));
  const avg = nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
  return values.map((v) => {
    if (typeof v === 'number' && !Number.isNaN(v)) return v;
    if (strategy === 'drop') return null;
    if (strategy === 'zero-fill') return 0;
    return avg;
  });
}

export function weightedAggregation({ metrics, weights, strategy = 'drop', mappingRules = {} }) {
  const keys = Object.keys(weights);
  const prepared = {};
  for (const k of keys) {
    prepared[k] = fillMissing([metrics[k]], strategy)[0];
  }

  let denom = 0;
  let total = 0;
  for (const k of keys) {
    const w = Number(weights[k] || 0);
    const val = prepared[k];
    if (val == null && strategy === 'drop') continue;
    const mapped = mappingRules[k]?.[String(val)] ?? val;
    total += Number(mapped || 0) * w;
    denom += w;
  }

  if (!denom) return 0;
  return total / denom;
}

export function mergeRounds(roundScores) {
  const valid = roundScores.filter((v) => typeof v === 'number' && !Number.isNaN(v));
  if (!valid.length) return 0;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}

export function gradeForScore(score) {
  const numeric = Number(score || 0);
  return GRADE_THRESHOLDS.find((threshold) => numeric >= threshold.min)?.grade || 'F';
}
