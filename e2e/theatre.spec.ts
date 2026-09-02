import { test, expect } from '@playwright/test'
import { boot, call } from './helpers'

test.describe('the agent is visible while it works', () => {
  test('the banner says what it is doing, and clears when done', async ({ page }) => {
    await boot(page)
    await page.getByRole('link', { name: /Goa, five friends/ }).click()
    await expect(page.getByRole('link', { name: /^Add expense/ })).toBeVisible()

    // Fire without awaiting so we can catch the banner mid-flight.
    await page.evaluate(() => window.__agent.begin('get_insights', {}))
    await expect(page.getByRole('status').filter({ hasText: 'Adding up where the money went' }))
      .toBeVisible({ timeout: 3000 })

    await page.evaluate(() => window.__agent.settle())
    await expect(page.getByRole('status').filter({ hasText: 'Adding up' }))
      .toBeHidden({ timeout: 4000 })
  })

  test('reassigning items highlights the rows and badges what moved', async ({ page }) => {
    await boot(page)
    const id = (await call(page, 'list_expenses', { query: 'Ritz' })).expenses[0].id
    await call(page, 'focus_expense', { expenseId: id })
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Ritz Classic')

    const detail = await call(page, 'explain_expense', { expenseId: id })
    const meat = detail.items
      .filter((i: any) => /prawn|crab|mutton/i.test(i.label))
      .map((i: any) => i.id)

    await page.evaluate(([eid, ids]) => window.__agent.begin('assign_items', {
      expenseId: eid,
      assignments: (ids as string[]).map((itemId) => ({
        itemId, hadBy: ['Arjun', 'Meera', 'Priya', 'Sam'],
      })),
      reason: 'Ravi is vegetarian — off all meat and seafood.',
    }), [id, meat] as const)

    await page.evaluate(() => window.__agent.settle())

    // The proposal card carries the diff, with the movement spelled out.
    const card = page.getByRole('article').first()
    await expect(card).toContainText('Ravi is vegetarian')
    await expect(card.getByText(/^−₹/).first()).toBeVisible({ timeout: 4000 })

    // Accepting lights the rows up — and drops you back on Split to watch it.
    await card.getByRole('button', { name: 'Accept' }).click()
    await expect(page.locator('.agent-touched').first()).toBeVisible({ timeout: 8000 })
  })

  test('amounts settle on the correct value after rolling', async ({ page }) => {
    await boot(page)
    const id = (await call(page, 'list_expenses', { query: 'Ritz' })).expenses[0].id
    await call(page, 'focus_expense', { expenseId: id })

    const detail = await call(page, 'explain_expense', { expenseId: id })
    const meat = detail.items.filter((i: any) => /prawn|crab|mutton/i.test(i.label)).map((i: any) => i.id)
    await call(page, 'assign_items', {
      expenseId: id,
      assignments: meat.map((itemId: string) => ({ itemId, hadBy: ['Arjun', 'Meera', 'Priya', 'Sam'] })),
    })
    // The agent proposes; accepting is what makes the number move.
    const card = page.getByRole('article').first()
    await card.getByRole('button', { name: 'Accept' }).click()
    await expect(page.getByRole('tab', { name: 'Split', selected: true })).toBeVisible({ timeout: 8000 })

    const ravi = (await call(page, 'explain_expense', { expenseId: id })).owes
      .find((o: any) => o.person === 'Ravi').amount

    // The animation must land exactly where the engine says, not near it.
    const shown = page.getByRole('list', { name: 'Everyone pays' })
      .getByRole('listitem').filter({ hasText: 'Ravi' })
    await expect.poll(async () => {
      const text = await shown.innerText()
      return text.replace(/[^0-9.]/g, '')
    }, { timeout: 5000 }).toContain(String(ravi))
  })
})
