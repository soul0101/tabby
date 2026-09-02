/**
 * A small, strict CSV reader for bank and UPI statement exports.
 *
 * Parsing structured text is deterministic work, so it belongs in the page —
 * the same reason the page owns the arithmetic. A receipt photo is
 * unstructured, so the model reads that. The line between them is whether the
 * input has a grammar.
 */

export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false

  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ }
        else quoted = false
      } else field += c
      continue
    }
    if (c === '"') { quoted = true; continue }
    if (c === ',' || c === '\t') { row.push(field.trim()); field = ''; continue }
    if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field.trim())
      if (row.some((f) => f !== '')) rows.push(row)
      row = []
      field = ''
      continue
    }
    field += c
  }
  row.push(field.trim())
  if (row.some((f) => f !== '')) rows.push(row)
  return rows
}

export interface Transaction {
  date: string
  description: string
  amountMinor: number
}

const DATE_KEYS = ['date', 'txn date', 'transaction date', 'value date', 'posted']
const DESC_KEYS = ['description', 'narration', 'details', 'particulars', 'merchant', 'remarks', 'to', 'payee']
const AMOUNT_KEYS = ['amount', 'debit', 'withdrawal', 'value', 'amount (inr)', 'debit amount']

const findColumn = (header: string[], keys: string[]) =>
  header.findIndex((h) => keys.includes(h.toLowerCase().trim()))

/** Handles "1,234.56", "₹1,234.56", "(1,234.56)" and a trailing "Dr". */
export function parseAmount(raw: string): number | null {
  // Strip the Dr/Cr suffix before whitespace, or the word boundary disappears.
  let s = raw.replace(/\s*(dr|cr)\.?\s*$/i, '').replace(/[₹$€£,\s]/g, '')
  let negative = false
  if (/^\(.*\)$/.test(s)) { negative = true; s = s.slice(1, -1) }
  if (s.startsWith('-')) { negative = true; s = s.slice(1) }
  if (s === '' || !/^\d*\.?\d+$/.test(s)) return null
  const n = Math.round(parseFloat(s) * 100)
  return negative ? -n : n
}

/** ISO already, or dd/mm/yyyy and dd-mm-yy as Indian statements write them. */
export function parseDate(raw: string): string | null {
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}T12:00:00.000Z`
  const dmy = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/)
  if (!dmy) return null
  const [, d, m, y] = dmy
  const year = y.length === 2 ? `20${y}` : y
  return `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}T12:00:00.000Z`
}

export interface ImportResult {
  transactions: Transaction[]
  skipped: { row: number; reason: string }[]
}

export function readStatement(text: string): ImportResult {
  const rows = parseCsv(text)
  if (rows.length < 2) {
    throw new Error('That doesn’t look like a statement — expected a header row and at least one transaction.')
  }
  const header = rows[0]
  const dateCol = findColumn(header, DATE_KEYS)
  const descCol = findColumn(header, DESC_KEYS)
  const amountCol = findColumn(header, AMOUNT_KEYS)

  if (dateCol < 0 || descCol < 0 || amountCol < 0) {
    const missing = [
      dateCol < 0 && 'a date column',
      descCol < 0 && 'a description column',
      amountCol < 0 && 'an amount column',
    ].filter(Boolean).join(', ')
    throw new Error(
      `Couldn’t find ${missing}. The header was: ${header.join(', ')}. ` +
      'Rename the columns to Date, Description and Amount and try again.',
    )
  }

  const transactions: Transaction[] = []
  const skipped: { row: number; reason: string }[] = []

  rows.slice(1).forEach((r, i) => {
    const rowNo = i + 2
    const date = parseDate(r[dateCol] ?? '')
    const amountMinor = parseAmount(r[amountCol] ?? '')
    const description = (r[descCol] ?? '').trim()
    if (!date) return skipped.push({ row: rowNo, reason: `couldn’t read the date "${r[dateCol]}"` })
    if (amountMinor === null) return skipped.push({ row: rowNo, reason: `couldn’t read the amount "${r[amountCol]}"` })
    if (amountMinor <= 0) return skipped.push({ row: rowNo, reason: 'not a debit' })
    if (!description) return skipped.push({ row: rowNo, reason: 'no description' })
    transactions.push({ date, description, amountMinor })
  })

  return { transactions, skipped }
}
