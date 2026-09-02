import { test, expect } from '@playwright/test'
import { boot, call } from './helpers'

/**
 * Every route, end to end, as a person would walk them. Catches the things
 * unit tests can't: a page that doesn't render, a link that goes nowhere, a
 * form that saves nothing.
 */
test('walks every screen and saves what it should', async ({ page }) => {
  await boot(page)
  const groupId = (await call(page, 'get_context')).groups[0].id

  // Home → group
  await page.goto('/')
  await expect(page.getByText('Goa, five friends')).toBeVisible()
  await page.getByRole('link', { name: /Goa, five friends/ }).click()
  await expect(page).toHaveURL(new RegExp(`/g/${groupId}$`))

  // Every tab renders.
  for (const [tab, marker] of [
    ['Balances', 'Where everyone stands'],
    ['Insights', 'Where it went'],
    ['Activity', 'Waiting'],
    ['Expenses', 'Ritz Classic'],
  ] as const) {
    await page.getByRole('tab', { name: tab }).click()
    await expect(page.getByText(marker, { exact: false }).first()).toBeVisible({ timeout: 8000 })
  }

  // Add an expense, by hand, with shares.
  await page.getByRole('link', { name: /^Add expense/ }).click()
  await expect(page).toHaveURL(new RegExp(`/g/${groupId}/new$`))
  await page.getByRole('textbox', { name: 'Amount' }).fill('3000')
  await page.getByRole('textbox', { name: 'What was it for?' }).fill('Sunset cruise')
  await page.getByRole('button', { name: /^Split/ }).click()
  await page.getByRole('button', { name: 'Shares' }).click()
  await page.getByRole('button', { name: /More shares for Meera/ }).click()
  await page.getByRole('button', { name: 'Add expense' }).click()
  await expect(page).toHaveURL(new RegExp(`/g/${groupId}$`))

  // Open it, check the split took, then edit it.
  await page.getByRole('link', { name: /Sunset cruise/ }).click()
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Sunset cruise')
  await expect(page.getByText('2×')).toBeVisible()

  await page.getByRole('link', { name: 'Edit' }).click()
  await page.getByRole('textbox', { name: 'What was it for?' }).fill('Sunset cruise + drinks')
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Sunset cruise + drinks')

  // Discussion accepts a comment.
  await page.getByRole('tab', { name: 'Discussion' }).click()
  await page.getByRole('textbox', { name: 'Write a message' }).fill('Worth it')
  await page.getByRole('button', { name: 'Send' }).click()
  await expect(page.getByText('Worth it')).toBeVisible({ timeout: 8000 })

  // Person page.
  await page.goto(`/g/${groupId}`)
  await page.getByRole('tab', { name: 'Balances' }).click()
  await page.getByRole('link', { name: /Meera/ }).first().click()
  await expect(page.getByRole('heading', { level: 1 }).or(page.getByText(/You and Meera/))).toBeVisible()
  await expect(page.getByText(/shared expense/)).toBeVisible()

  // Settings: rename, add someone, invite link.
  await page.goto(`/g/${groupId}/settings`)
  await expect(page.getByLabel('Invite link')).toHaveValue(/\/join\//)
  // A bare name is the placeholder case now — for somebody who doesn't use
  // Tabby at all. Friends and email addresses go through the same field.
  await page.getByRole('textbox', { name: /Email address, or a name/ }).fill('Dev')
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(page.getByText('Dev · no account')).toBeVisible({ timeout: 8000 })
  await page.getByRole('button', { name: /^Add 1 to/ }).click()
  await expect(page.getByRole('list').getByText('Dev')).toBeVisible({ timeout: 8000 })
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Goa 2026')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page).toHaveURL(new RegExp(`/g/${groupId}$`), { timeout: 8000 })
  // The rename shows in the group header.
  await expect(page.getByText('Goa 2026').first()).toBeVisible({ timeout: 8000 })

  // Profile.
  await page.goto('/you')
  await page.getByLabel('Your name').fill('Arjun R')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page).toHaveURL(/\/$/, { timeout: 8000 })
})
