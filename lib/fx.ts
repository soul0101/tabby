/**
 * Currency conversion for expenses paid in something other than the group's
 * currency.
 *
 * The rate is captured on the expense at entry time and never recomputed —
 * a swing in the market must not silently rewrite what someone owed in March.
 * Rates are a convenience for filling the field; the number that matters is
 * whatever ends up stored on the row.
 */

export interface Currency { code: string; symbol: string; name: string }

export const CURRENCIES: Currency[] = [
  { code: 'INR', symbol: '₹', name: 'Indian rupee' },
  { code: 'USD', symbol: '$', name: 'US dollar' },
  { code: 'EUR', symbol: '€', name: 'Euro' },
  { code: 'GBP', symbol: '£', name: 'British pound' },
  { code: 'AED', symbol: 'د.إ', name: 'UAE dirham' },
  { code: 'SGD', symbol: 'S$', name: 'Singapore dollar' },
  { code: 'THB', symbol: '฿', name: 'Thai baht' },
  { code: 'JPY', symbol: '¥', name: 'Japanese yen' },
  { code: 'AUD', symbol: 'A$', name: 'Australian dollar' },
  { code: 'LKR', symbol: 'Rs', name: 'Sri Lankan rupee' },
  { code: 'IDR', symbol: 'Rp', name: 'Indonesian rupiah' },
  { code: 'VND', symbol: '₫', name: 'Vietnamese dong' },
]

export const symbolOf = (code: string) =>
  CURRENCIES.find((c) => c.code === code)?.symbol ?? code

const cache = new Map<string, { rates: Record<string, number>; at: number }>()
const TTL = 6 * 60 * 60 * 1000

export interface RateResult {
  rate: number | null
  source: 'live' | 'unavailable'
}

/**
 * How many units of `base` one unit of `quote` is worth.
 * Returns null when no rate could be fetched, so the caller can ask for one.
 */
export async function fetchRate(quote: string, base: string): Promise<RateResult> {
  if (quote === base) return { rate: 1, source: 'live' }

  const hit = cache.get(quote)
  if (hit && Date.now() - hit.at < TTL && hit.rates[base]) {
    return { rate: hit.rates[base], source: 'live' }
  }

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 4000)
    const res = await fetch(`https://open.er-api.com/v6/latest/${quote}`, { signal: controller.signal })
    clearTimeout(timer)
    if (!res.ok) return { rate: null, source: 'unavailable' }
    const json = (await res.json()) as { result?: string; rates?: Record<string, number> }
    if (json.result !== 'success' || !json.rates?.[base]) return { rate: null, source: 'unavailable' }
    cache.set(quote, { rates: json.rates, at: Date.now() })
    return { rate: json.rates[base], source: 'live' }
  } catch {
    return { rate: null, source: 'unavailable' }
  }
}

/** Convert minor units at a rate, rounding once at the end. */
export const convertMinor = (minor: number, rate: number) => Math.round(minor * rate)
