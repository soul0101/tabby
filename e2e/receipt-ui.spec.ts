import { test, expect } from '@playwright/test'
import { boot, call, settle } from './helpers'

const PIXEL =
  'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsL' +
  'DBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAAB' +
  'AAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q=='

test.describe('looking at the bill', () => {
  test('the receipt opens over the expense, not in a new screen', async ({ page }) => {
    await boot(page)
    const id = (await call(page, 'list_expenses', { query: 'Ritz' })).expenses[0].id
    await call(page, 'attach_receipt', { expenseId: id, image: PIXEL })
    await call(page, 'focus_expense', { expenseId: id })
    await page.waitForURL(new RegExp(`/e/${id}$`), { timeout: settle(10000) })

    const here = page.url()
    await page.getByRole('button', { name: /tap to see the bill/i }).click()

    const shot = page.getByRole('dialog')
    await expect(shot).toBeVisible({ timeout: settle(8000) })
    // Still the same expense underneath — checking a split against the paper
    // means looking from one to the other.
    expect(page.url()).toBe(here)

    await page.keyboard.press('Escape')
    await expect(shot).toBeHidden({ timeout: settle(5000) })
    expect(page.url()).toBe(here)

    // And the backdrop closes it too.
    await page.getByRole('button', { name: /tap to see the bill/i }).click()
    await expect(shot).toBeVisible({ timeout: settle(8000) })
    await page.getByRole('button', { name: 'Close' }).click()
    await expect(shot).toBeHidden({ timeout: settle(5000) })
  })

  test('a proposed bill shows the photo it was read from', async ({ page }) => {
    await boot(page)
    await call(page, 'add_expense', {
      description: 'Thalassa · Sunday lunch', amount: 5945.50, paidBy: 'Arjun',
      receipt: PIXEL, tax: 258.50, tip: 517,
      lines: [{ label: 'Prawn Balchão', amount: 640 }, { label: 'Serradura', amount: 280 }],
    })
    await call(page, 'open_group', { group: 'Goa, five friends' })
    await page.getByRole('tab', { name: /Activity/ }).click()

    const card = page.getByRole('article').first()
    await expect(card).toContainText('Thalassa')
    // The thing you'd want to look at before agreeing to the numbers.
    const thumb = card.getByRole('button', { name: /view full size/i })
    await expect(thumb).toBeVisible({ timeout: settle(8000) })

    await thumb.click()
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: settle(8000) })
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toBeHidden({ timeout: settle(5000) })
    // Never accepted it — the proposal is still waiting.
    await expect(card.getByRole('button', { name: 'Accept' })).toBeVisible()
  })
})
