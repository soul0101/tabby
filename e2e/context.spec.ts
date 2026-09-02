import { test, expect } from '@playwright/test'
import { boot, call, tools, waitForTools } from './helpers'

test.describe('shared context', () => {
  test('the agent inherits the group on screen', async ({ page }) => {
    await boot(page)
    await page.getByRole('link', { name: /Goa, five friends/ }).click()
    await expect(page.getByRole('link', { name: /^Add expense/ })).toBeVisible()

    // No groupId passed — a backend integration has no way to know this.
    const ctx = await call(page, 'get_context')
    expect(ctx.openGroup).toBe('Goa, five friends')
    const list = await call(page, 'list_expenses')
    expect(list.group).toBe('Goa, five friends')
  })

  test('a second group makes the agent ask which one, instead of guessing', async ({ page }) => {
    await boot(page)
    // Creating a group touches nobody's existing money, so it applies directly.
    await call(page, 'create_group', { name: 'Manali', people: ['Dev'] })

    await page.goto('/')
    await waitForTools(page)
    const res = await call(page, 'list_expenses')
    expect(String(res)).toContain('Which group?')
    expect(String(res)).toContain('Goa, five friends')
  })

  test('a tool call moves the user’s screen', async ({ page }) => {
    await boot(page)
    await call(page, 'open_group', { group: 'Goa, five friends' })
    await expect(page.getByRole('link', { name: /^Add expense/ })).toBeVisible()

    await call(page, 'open_view', { view: 'balances' })
    await expect(page.getByRole('heading', { name: 'Where everyone stands' })).toBeVisible()

    await call(page, 'open_view', { view: 'insights' })
    await expect(page.getByText('Where it went')).toBeVisible()

    // focus_expense opens the one the agent means.
    const id = (await call(page, 'list_expenses', { query: 'villa' })).expenses[0].id
    await call(page, 'focus_expense', { expenseId: id })
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Assagao villa')
    // It's a real URL, so it can be shared.
    await expect(page).toHaveURL(new RegExp(`/e/${id}$`))
  })

  test('receipt tools stay unregistered until a receipt exists', async ({ page }) => {
    await boot(page)
    // The sample trip has no photos, so there is nothing to read.
    expect(await tools(page)).not.toContain('read_receipt')
    expect(await tools(page)).not.toContain('list_receipts')
  })
})
