import { describe, it, expect } from 'vitest'
import { parseCsv, parseAmount, parseDate, readStatement } from '../lib/csv'

describe('parseCsv', () => {
  it('handles quoted fields containing commas', () => {
    expect(parseCsv('a,"b,c",d')).toEqual([['a', 'b,c', 'd']])
  })
  it('handles escaped quotes', () => {
    expect(parseCsv('a,"say ""hi""",c')).toEqual([['a', 'say "hi"', 'c']])
  })
  it('handles CRLF and skips blank lines', () => {
    expect(parseCsv('a,b\r\n\r\nc,d\r\n')).toEqual([['a', 'b'], ['c', 'd']])
  })
  it('accepts tab-separated text too', () => {
    expect(parseCsv('a\tb\nc\td')).toEqual([['a', 'b'], ['c', 'd']])
  })
})

describe('parseAmount', () => {
  it('reads Indian statement formats', () => {
    expect(parseAmount('1,234.56')).toBe(123456)
    expect(parseAmount('₹1,234.56')).toBe(123456)
    expect(parseAmount('450')).toBe(45000)
    expect(parseAmount('1,234.56 Dr')).toBe(123456)
  })
  it('reads negatives in both conventions', () => {
    expect(parseAmount('-450')).toBe(-45000)
    expect(parseAmount('(450.00)')).toBe(-45000)
  })
  it('refuses nonsense rather than guessing', () => {
    expect(parseAmount('')).toBeNull()
    expect(parseAmount('n/a')).toBeNull()
    expect(parseAmount('12.34.56')).toBeNull()
  })
})

describe('parseDate', () => {
  it('reads ISO and Indian day-first formats', () => {
    expect(parseDate('2026-08-22')).toBe('2026-08-22T12:00:00.000Z')
    expect(parseDate('22/08/2026')).toBe('2026-08-22T12:00:00.000Z')
    expect(parseDate('5-8-26')).toBe('2026-08-05T12:00:00.000Z')
  })
  it('refuses what it cannot read', () => {
    expect(parseDate('last tuesday')).toBeNull()
  })
})

describe('readStatement', () => {
  const csv = [
    'Date,Narration,Debit',
    '22/08/2026,"UPI/RITZ CLASSIC/GOA",17685.25',
    '23/08/2026,SCOOTER RENTAL,5400.00',
    '23/08/2026,SALARY CREDIT,-90000.00',
    '24/08/2026,BAD DATE ROW,100',
  ].join('\n')

  it('reads debits and reports what it skipped', () => {
    const { transactions, skipped } = readStatement(csv)
    expect(transactions).toHaveLength(3)
    expect(transactions[0]).toEqual({
      date: '2026-08-22T12:00:00.000Z',
      description: 'UPI/RITZ CLASSIC/GOA',
      amountMinor: 1768525,
    })
    expect(skipped).toEqual([{ row: 4, reason: 'not a debit' }])
  })

  it('names the columns it found when it cannot map them', () => {
    expect(() => readStatement('Foo,Bar\n1,2')).toThrow(/Foo, Bar/)
  })

  it('refuses a file with no transactions', () => {
    expect(() => readStatement('Date,Narration,Debit')).toThrow(/header row/)
  })
})
