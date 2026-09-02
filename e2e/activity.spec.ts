import { test, expect } from '@playwright/test'
import { boot, call } from './helpers'

/** The history has to record what actually happened, including who decided. */
test.describe('activity log', () => {
  const openHistory = async (page: import('@playwright/test').Page, groupId: string) => {
    await page.goto(`/g/${groupId}`)
    await page.getByRole('tab', { name: /Activity/ }).click()
    await page.getByRole('tab', { name: 'History' }).click()
  }

  test('records the agent proposing and the person deciding', async ({ page }) => {
    await boot(page)
    const ctx = await call(page, 'get_context')
    const groupId = ctx.groups[0].id

    const id = (await call(page, 'list_expenses', { query: 'Ritz' })).expenses[0].id
    const detail = await call(page, 'explain_expense', { expenseId: id })
    const meat = detail.items.filter((i: any) => /prawn|crab/i.test(i.label)).map((i: any) => i.id)

    await call(page, 'assign_items', {
      expenseId: id,
      assignments: meat.map((itemId: string) => ({ itemId, hadBy: ['Arjun', 'Meera', 'Priya', 'Sam'] })),
      reason: 'Ravi is vegetarian — off all meat and seafood.',
    })

    // Proposing is recorded, and attributed to the agent, not the person.
    await openHistory(page, groupId)
    await expect(page.getByText(/Your agent/).first()).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText(/suggested/).first()).toBeVisible()

    // Accepting is recorded too, and so is the change it caused.
    await call(page, 'focus_expense', { expenseId: id })
    await page.getByRole('article').first().getByRole('button', { name: 'Accept' }).click()

    await openHistory(page, groupId)
    await expect(page.getByText(/accepted: Ravi is vegetarian/i)).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText(/changed who had \d+ items? on/i)).toBeVisible()
  })

  test('records a decline, with the reason given', async ({ page }) => {
    await boot(page)
    const groupId = (await call(page, 'get_context')).groups[0].id
    const id = (await call(page, 'list_expenses', { query: 'Ritz' })).expenses[0].id
    const detail = await call(page, 'explain_expense', { expenseId: id })

    await call(page, 'assign_items', {
      expenseId: id,
      assignments: [{ itemId: detail.items[0].id, hadBy: ['Ravi'] }],
      reason: 'Ravi had the prawns alone.',
    })

    await call(page, 'focus_expense', { expenseId: id })
    const card = page.getByRole('article').first()
    await card.getByRole('button', { name: 'Decline' }).click()
    await card.getByRole('textbox').fill('I definitely shared those')
    await card.getByRole('button', { name: 'Decline' }).click()

    await openHistory(page, groupId)
    await expect(page.getByText(/declined: Ravi had the prawns alone/i)).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText(/I definitely shared those/)).toBeVisible()
  })

  test('history entries link to the expense they are about', async ({ page }) => {
    await boot(page)
    const groupId = (await call(page, 'get_context')).groups[0].id
    const id = (await call(page, 'list_expenses', { query: 'Ritz' })).expenses[0].id
    const detail = await call(page, 'explain_expense', { expenseId: id })

    await call(page, 'assign_items', {
      expenseId: id,
      assignments: [{ itemId: detail.items[0].id, hadBy: ['Ravi'] }],
      reason: 'Ravi had the prawns.',
    })

    await openHistory(page, groupId)
    const row = page.getByRole('link').filter({ hasText: 'suggested' }).first()
    await expect(row).toBeVisible({ timeout: 10_000 })
    await row.click()

    // It lands on the bill it was about.
    await expect(page).toHaveURL(new RegExp(`/e/${id}$`))
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Ritz Classic')
  })

  test('an entry about a deleted expense keeps its record but loses the link', async ({ page }) => {
    await boot(page)
    const groupId = (await call(page, 'get_context')).groups[0].id

    await page.goto(`/g/${groupId}/new`)
    await page.getByRole('textbox', { name: 'Amount' }).fill('900')
    await page.getByRole('textbox', { name: 'What was it for?' }).fill('Parking')
    await page.getByRole('button', { name: 'Add expense' }).click()
    await expect(page).toHaveURL(new RegExp(`/g/${groupId}$`))

    const created = (await call(page, 'list_expenses', { query: 'Parking' })).expenses[0].id
    await page.goto(`/g/${groupId}/e/${created}`)
    await page.getByRole('button', { name: 'Delete this expense' }).click()
    await page.getByRole('button', { name: 'Delete expense' }).click()

    await openHistory(page, groupId)
    // The history still says it happened.
    await expect(page.getByText(/added “Parking”/)).toBeVisible({ timeout: 10_000 })
    // But there's nowhere to go.
    await expect(page.getByRole('link').filter({ hasText: 'added “Parking”' })).toHaveCount(0)
  })

  test('records every kind of change a person makes directly', async ({ page }) => {
    await boot(page)
    const groupId = (await call(page, 'get_context')).groups[0].id

    // Add, from the UI, as a person.
    await page.goto(`/g/${groupId}/new`)
    await page.getByRole('textbox', { name: 'Amount' }).fill('1200')
    await page.getByRole('textbox', { name: 'What was it for?' }).fill('Beach chairs')
    await page.getByRole('button', { name: 'Add expense' }).click()
    await expect(page).toHaveURL(new RegExp(`/g/${groupId}$`))

    // Settle, from the UI.
    await page.getByRole('tab', { name: 'Balances' }).click()
    await page.getByRole('button', { name: 'Settle' }).first().click()
    await page.getByRole('button', { name: 'Mark as paid' }).click()

    await openHistory(page, groupId)
    await expect(page.getByText(/added “Beach chairs”/)).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText(/paid/).first()).toBeVisible()
  })
})
