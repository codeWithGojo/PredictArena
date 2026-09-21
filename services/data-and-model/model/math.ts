import type { Cell } from './types.ts';

export const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
export const sigmoid = (x: number) => x >= 0 ? 1 / (1 + Math.exp(-x)) : Math.exp(x) / (1 + Math.exp(x));
export const logit = (p: number) => Math.log(p / (1 - p));
export const DAY = 86_400_000;
export function decay(ageDays: number, halfLifeDays: number): number {
  if (!Number.isFinite(ageDays) || ageDays < 0 || !Number.isFinite(halfLifeDays) || halfLifeDays <= 0) {
    throw new RangeError('Decay requires nonnegative age and positive half-life.');
  }
  return Math.exp(-Math.LN2 * ageDays / halfLifeDays);
}
export function poisson(k: number, rate: number): number {
  if (!Number.isInteger(k) || k < 0 || !Number.isFinite(rate) || rate < 0) throw new RangeError('Invalid Poisson arguments.');
  let p = Math.exp(-rate);
  for (let i = 1; i <= k; i++) p *= rate / i;
  return p;
}
export function dcCoefficient(h: number, a: number, lambda: number, mu: number): number {
  if (h === 0 && a === 0) return -lambda * mu;
  if (h === 0 && a === 1) return lambda;
  if (h === 1 && a === 0) return mu;
  if (h === 1 && a === 1) return -1;
  return 0;
}
export function dcBounds(lambda: number, mu: number): [number, number] {
  return [Math.max(-1 / lambda, -1 / mu) + 1e-10, Math.min(1, 1 / (lambda * mu)) - 1e-10];
}
export function scoreDistribution(lambda: number, mu: number, rho = 0) {
  if (![lambda, mu, rho].every(Number.isFinite) || lambda <= 0 || mu <= 0 || lambda > 10 || mu > 10) {
    throw new RangeError('Invalid goal rates or correlation.');
  }
  const [lo, hi] = dcBounds(lambda, mu);
  const safeRho = clamp(rho, lo, hi);
  const cells: Cell[] = [];
  let home = 0, draw = 0, away = 0, mass = 0;
  let top: Cell = { home: 0, away: 0, probability: -1 };
  const hp = Array.from({length:51}, (_,k) => poisson(k,lambda));
  const ap = Array.from({length:51}, (_,k) => poisson(k,mu));
  // Rates are bounded to 6 in the engine; 0..50 leaves negligible omitted mass.
  for (let h = 0; h <= 50; h++) for (let a = 0; a <= 50; a++) {
    const probability = hp[h] * ap[a] * (1 + dcCoefficient(h, a, lambda, mu) * safeRho);
    const cell = { home: h, away: a, probability };
    mass += probability;
    if (h > a) home += probability; else if (h === a) draw += probability; else away += probability;
    if (probability > top.probability) top = cell;
    cells.push(cell);
  }
  return { home: home / mass, draw: draw / mass, away: away / mass, cells, top, rho: safeRho, mass };
}
/** Multiclass Brier: sum of squared errors across outcomes, then mean over matches. */
export function properScores(probabilities: readonly number[], outcome: number) {
  if (probabilities.length < 2 || !Number.isInteger(outcome) || outcome < 0 || outcome >= probabilities.length ||
      probabilities.some(p => !Number.isFinite(p) || p < 0 || p > 1) ||
      Math.abs(probabilities.reduce((a, b) => a + b, 0) - 1) > 1e-6) throw new RangeError('Invalid probability vector or outcome.');
  return {
    logLoss: -Math.log(Math.max(1e-15, probabilities[outcome])),
    brier: probabilities.reduce((sum, p, i) => sum + (p - Number(i === outcome)) ** 2, 0),
  };
}
