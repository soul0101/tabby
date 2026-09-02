import { test, expect } from '@playwright/test'
import { boot, call } from './helpers'

/**
 * Models send imperfect arguments. Every failure should name the next step,
 * never crash, and never leave a half-written expense behind.
 */
test.describe('malformed agent input', () => {
  test('an unknown person names the ones that exist', async ({ page }) => {
    await boot(page)
    const res = await call(page, 'add_expense', { description: 'x', amount: 100, paidBy: 'Gandalf' })
    expect(String(res)).toContain('isn’t in Goa, five friends')
    expect(String(res)).toContain('Meera')
  })

  test('names resolve case-insensitively, and "me" means the user', async ({ page }) => {
    await boot(page)
    const r = await call(page, 'who_owes_whom', { person: 'ME', other: 'meera' })
    expect(r.summary).toMatch(/You|Meera/)
  })

  test('a missing or stringly-typed amount is refused, not coerced', async ({ page }) => {
    await boot(page)
    expect(String(await call(page, 'add_expense', { description: 'x' })))
      .toContain('positive number')
    expect(String(await call(page, 'add_expense', { description: 'x', amount: '2840' })))
      .toContain('positive number')
    expect(String(await call(page, 'add_expense', { description: 'x', amount: -5 })))
      .toContain('positive number')
  })

  test('a foreign currency without a rate is refused rather than assumed', async ({ page }) => {
    await boot(page)
    const res = await call(page, 'add_expense', {
      description: 'Bangkok dinner', amount: 1800, currency: 'THB',
    })
    expect(String(res)).toContain('rate')
    expect(String(res)).toContain('THB')
  })

  test('an empty split list is refused', async ({ page }) => {
    await boot(page)
    expect(String(await call(page, 'add_expense', { description: 'x', amount: 10, splitBetween: [] })))
      .toContain('at least one person')
  })

  test('settling with yourself is refused', async ({ page }) => {
    await boot(page)
    expect(String(await call(page, 'settle_up', { from: 'Meera', to: 'Meera' })))
      .toContain('themselves')
  })

  test('settling a pair the plan does not contain points back at get_balances', async ({ page }) => {
    await boot(page)
    const res = await call(page, 'settle_up', { from: 'Meera', to: 'Ravi' })
    expect(String(res)).toContain('get_balances')
  })

  test('an unknown expense id points at list_expenses', async ({ page }) => {
    await boot(page)
    expect(String(await call(page, 'explain_expense', { expenseId: 'nope' })))
      .toContain('list_expenses')
  })

  test('assigning items on a non-itemised bill says what to do first', async ({ page }) => {
    await boot(page)
    const id = (await call(page, 'list_expenses', { query: 'villa' })).expenses[0].id
    expect(String(await call(page, 'assign_items', { expenseId: id, assignments: [] })))
      .toContain('itemise_expense')
  })

  test('changing the total of an itemised bill is refused', async ({ page }) => {
    await boot(page)
    const id = (await call(page, 'list_expenses', { query: 'Ritz' })).expenses[0].id
    expect(String(await call(page, 'update_expense', { expenseId: id, amount: 99 })))
      .toContain('line items')
  })

  test('read tools tolerate being called with no arguments at all', async ({ page }) => {
    await boot(page)
    for (const t of ['get_context', 'list_expenses', 'get_balances', 'get_insights']) {
      expect(String(await call(page, t)), t).not.toContain('Error:')
    }
  })

  test('an absurd limit is clamped', async ({ page }) => {
    await boot(page)
    const res = await call(page, 'list_expenses', { limit: 100000 })
    expect(res.expenses.length).toBeLessThanOrEqual(100)
  })
})
