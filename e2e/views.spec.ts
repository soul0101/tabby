import { test, expect } from '@playwright/test'
import { boot, call, waitForTools } from './helpers'

test.describe('the visible tab', () => {
  test('an agent can steer it, and the page does not thrash', async ({ page }) => {
    const errors: string[] = []
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
    page.on('pageerror', (e) => errors.push(String(e)))

    await boot(page)
    const groupId = (await call(page, 'get_context')).groups[0].id
    await page.goto(`/g/${groupId}`)
    await waitForTools(page)

    for (const view of ['balances', 'insights', 'activity', 'expenses', 'activity'] as const) {
      await call(page, 'open_view', { view })
      await expect(page.getByRole('tab', { name: new RegExp(view, 'i') }))
        .toHaveAttribute('aria-selected', 'true', { timeout: 10_000 })
    }

    // Clicking sends it the other way, and the tool layer sees the same value.
    await page.getByRole('tab', { name: 'Balances' }).click()
    expect((await call(page, 'get_context')).openView).toBe('balances')

    // Stepping into an expense and back keeps the tab you were on.
    await page.getByRole('tab', { name: 'Expenses' }).click()
    await page.getByRole('link', { name: /Ritz/ }).first().click()
    await expect(page.getByRole('tab', { name: 'Split' })).toBeVisible({ timeout: 10_000 })
    await page.goBack()
    await expect(page.getByRole('tab', { name: 'Expenses' }))
      .toHaveAttribute('aria-selected', 'true', { timeout: 10_000 })

    // A different group starts on its own expenses, not the last tab used.
    await call(page, 'open_view', { view: 'insights' })
    await page.goto('/')
    await page.goto(`/g/${groupId}`)
    await waitForTools(page)
    await expect(page.getByRole('tab', { name: 'Expenses' }))
      .toHaveAttribute('aria-selected', 'true', { timeout: 10_000 })

    expect(errors.filter((e) => /Maximum update depth|too many re-renders/i.test(e))).toEqual([])
  })
})
