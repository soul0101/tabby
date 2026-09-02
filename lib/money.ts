/**
 * Money in Tabby is always an integer count of minor units (paise, cents).
 * Never a float, never a string, never `toFixed` arithmetic.
 * Formatting happens only at the render edge, via `formatMinor`.
 */

export const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0)

export const toMinor = (major: number): number => Math.round(major * 100)
export const fromMinor = (minor: number): number => minor / 100

const formatters = new Map<string, Intl.NumberFormat>()

export function formatMinor(minor: number, currency = 'INR', locale = 'en-IN'): string {
  const key = `${locale}:${currency}`
  let f = formatters.get(key)
  if (!f) {
    f = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      // Without this, en-IN renders foreign currencies as "THB 360.00".
      currencyDisplay: 'narrowSymbol',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
    formatters.set(key, f)
  }
  return f.format(fromMinor(minor))
}

/**
 * Largest-remainder (Hamilton) allocation.
 *
 * Distributes `total` across `weights` so that the result sums to *exactly*
 * `total` — no paisa is ever lost or invented, which is the whole reason the
 * agent is not allowed to do this arithmetic itself.
 *
 * Deterministic: remainders go to the largest fractional parts, ties broken
 * toward the lower index, so the same input always yields the same output.
 */
export function allocate(total: number, weights: number[]): number[] {
  const totalWeight = sum(weights)
  if (totalWeight <= 0 || total === 0) return weights.map(() => 0)

  const exact = weights.map((w) => (total * w) / totalWeight)
  const floors = exact.map(Math.floor)
  let remainder = total - sum(floors)

  const byFraction = exact
    .map((value, index) => ({ index, frac: value - Math.floor(value) }))
    .sort((a, b) => b.frac - a.frac || a.index - b.index)

  const out = [...floors]
  const step = remainder >= 0 ? 1 : -1
  for (let k = 0; remainder !== 0; k++, remainder -= step) {
    out[byFraction[k % byFraction.length].index] += step
  }
  return out
}
