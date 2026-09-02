import { test, expect } from '@playwright/test'
import { boot, call } from './helpers'

/**
 * Amendable changes accumulate (see amend.spec); indivisible ones replace.
 * You can't half-settle a debt or half-delete an expense, so a second
 * suggestion of that kind retires the first rather than merging with it.
 */
test.describe('indivisible changes replace rather than accumulate', () => {
  test('a second delete suggestion replaces the first', async ({ page }) => {
    await boot(page)
    const groupId = (await call(page, 'get_context')).groups[0].id
    const list = await call(page, 'list_expenses', { limit: 2 })

    await call(page, 'delete_expense', { expenseId: list.expenses[0].id })
    await call(page, 'delete_expense', { expenseId: list.expenses[0].id })

    await page.goto(`/g/${groupId}`)
    await page.getByRole('tab', { name: /Activity/ }).click()
    await expect(page.getByRole('article')).toHaveCount(1, { timeout: 10_000 })
  })

  test('proposals about different things both stay', async ({ page }) => {
    await boot(page)
    const groupId = (await call(page, 'get_context')).groups[0].id
    const id = (await call(page, 'list_expenses', { query: 'Ritz' })).expenses[0].id
    const detail = await call(page, 'explain_expense', { expenseId: id })

    await call(page, 'assign_items', {
      expenseId: id,
      assignments: [{ itemId: detail.items[0].id, hadBy: ['Ravi'] }],
      reason: 'Ravi had the prawns.',
    })
    await call(page, 'update_expense', {
      expenseId: id, description: 'Ritz Classic · dinner', reason: 'Shorter name.',
    })

    await page.goto(`/g/${groupId}`)
    await page.getByRole('tab', { name: /Activity/ }).click()
    // Who-had-what and renaming are separate decisions.
    await expect(page.getByRole('article')).toHaveCount(2, { timeout: 10_000 })
  })

  test('a decided proposal is left alone by a later one', async ({ page }) => {
    await boot(page)
    const groupId = (await call(page, 'get_context')).groups[0].id
    const id = (await call(page, 'list_expenses', { query: 'Ritz' })).expenses[0].id
    const detail = await call(page, 'explain_expense', { expenseId: id })
    const first = detail.items[0].id

    await call(page, 'assign_items', {
      expenseId: id, assignments: [{ itemId: first, hadBy: ['Ravi'] }],
      reason: 'Ravi had the first item.',
    })
    await page.goto(`/g/${groupId}/e/${id}`)
    await page.getByRole('tab', { name: 'Discussion' }).click()
    await page.getByRole('article').first().getByRole('button', { name: 'Accept' }).click()
    await page.getByRole('tab', { name: 'Discussion' }).click()
    await expect(page.getByRole('article').first()).toContainText('Accepted', { timeout: 10_000 })

    // A later suggestion starts a fresh draft; the decided one keeps its verdict.
    await call(page, 'assign_items', {
      expenseId: id, assignments: [{ itemId: first, hadBy: ['Meera'] }],
      reason: 'Actually it was Meera.',
    })

    await page.reload()
    await page.getByRole('tab', { name: 'Discussion' }).click()
    await expect(page.getByText('Accepted by You')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText('Replaced by a newer suggestion')).toBeHidden()
    await expect(page.getByRole('article')).toHaveCount(2)
  })
})
