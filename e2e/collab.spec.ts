import { test, expect, type Page } from '@playwright/test'
import { boot, call, MOCK, waitForTools } from './helpers'

/**
 * Two people, two browsers, one ledger.
 *
 * This is the whole reason proposals beat a modal: the person who has to pay
 * more is usually not the person whose screen the agent is on.
 */
test('a proposal reaches the other person, who can decline it', async ({ page, browser }) => {
  // Arjun sets the trip up and shares the link.
  await boot(page)

  // Read the invite straight from the group, as the settings sheet does.
  const invite = await page.evaluate(() => {
    const g = (window as any).__tabbyGroups?.[0]
    return g?.inviteToken ?? null
  })
  expect(invite, 'invite token exposed for the test').toBeTruthy()

  const id = (await call(page, 'list_expenses', { query: 'Ritz' })).expenses[0].id
  const detail = await call(page, 'explain_expense', { expenseId: id })
  const meat = detail.items.filter((i: any) => /prawn|crab|mutton/i.test(i.label)).map((i: any) => i.id)

  await call(page, 'assign_items', {
    expenseId: id,
    assignments: meat.map((itemId: string) => ({ itemId, hadBy: ['Arjun', 'Meera', 'Priya', 'Sam'] })),
    reason: 'Ravi is vegetarian — off all meat and seafood.',
  })

  // Ravi opens the invite in his *own* browser — a second page in the same
  // context would just share Arjun's session.
  const raviContext = await browser.newContext({ baseURL: 'http://localhost:3000' })
  const ravi: Page = await raviContext.newPage()
  await ravi.addInitScript(MOCK)
  await ravi.goto(`/join/${invite}`)
  await ravi.getByRole('button', { name: /without an account/ }).click()
  await ravi.getByRole('button', { name: 'Ravi' }).click({ timeout: 20_000 })
  await expect(ravi.getByRole('link', { name: /^Add expense/ })).toBeVisible({ timeout: 20_000 })

  // He sees the proposal waiting, without anyone telling him.
  await ravi.getByRole('tab', { name: /Activity/ }).click()
  const card = ravi.getByRole('article').first()
  await expect(card).toContainText('Ravi is vegetarian', { timeout: 20_000 })
  await expect(card).toContainText('Needs a decision')

  // Ravi is the one who benefits here, so he accepts.
  await card.getByRole('button', { name: 'Accept' }).click()

  // It leaves his waiting queue, because it no longer is waiting.
  await expect(ravi.getByText('Nothing to decide')).toBeVisible({ timeout: 15_000 })
  // And the record of it survives, greyed out, in the expense's thread.
  await ravi.getByRole('tab', { name: 'Expenses' }).click()
  await ravi.getByRole('link', { name: /Ritz Classic/ }).first().click()
  await ravi.getByRole('tab', { name: 'Discussion' }).click()
  const resolved = ravi.getByRole('article').first()
  await expect(resolved).toContainText('Accepted', { timeout: 10_000 })
  await expect(resolved).toContainText('Ravi is vegetarian')

  // And it lands on Arjun's screen too, without a reload.
  await waitForTools(page)
  await expect.poll(async () =>
    (await call(page, 'explain_expense', { expenseId: id })).owes
      .find((o: any) => o.person === 'Ravi').amount,
    { timeout: 20_000 }).toBeLessThan(1000)

  // And Arjun's history shows that Ravi is the one who decided — the whole
  // point of a shared log rather than a private confirmation.
  const groupId = (await call(page, 'get_context')).groups[0].id
  await page.goto(`/g/${groupId}`)
  await page.getByRole('tab', { name: /Activity/ }).click()
  await page.getByRole('tab', { name: 'History' }).click()
  await expect(page.getByText(/accepted: Ravi is vegetarian/i)).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText(/^Ravi/).first()).toBeVisible()

  await raviContext.close()
})
