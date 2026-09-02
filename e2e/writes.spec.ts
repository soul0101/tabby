import { test, expect } from '@playwright/test'
import { boot, call, settle } from './helpers'

test.describe('agents propose, humans decide', () => {
  test('add_expense posts a proposal and changes nothing yet', async ({ page }) => {
    await boot(page)
    const before = (await call(page, 'get_context')).groups[0].expenses

    const res = await call(page, 'add_expense', { description: 'Beach shack lunch', amount: 2840 })
    expect(res.proposed).toBe(true)
    expect(res.proposalId).toBeTruthy()
    // The ledger is untouched until someone accepts.
    expect((await call(page, 'get_context')).groups[0].expenses).toBe(before)
  })

  test('a proposal shows a real diff and applies exactly it when accepted', async ({ page }) => {
    await boot(page)
    const id = (await call(page, 'list_expenses', { query: 'Ritz' })).expenses[0].id
    const detail = await call(page, 'explain_expense', { expenseId: id })
    const raviBefore = detail.owes.find((o: any) => o.person === 'Ravi').amount
    const meat = detail.items.filter((i: any) => /prawn|crab|mutton/i.test(i.label)).map((i: any) => i.id)

    await call(page, 'assign_items', {
      expenseId: id,
      assignments: meat.map((itemId: string) => ({ itemId, hadBy: ['Arjun', 'Meera', 'Priya', 'Sam'] })),
      reason: 'Ravi is vegetarian — off all meat and seafood.',
    })

    await call(page, 'focus_expense', { expenseId: id })
        const card = page.getByRole('article').first()

    await expect(card).toContainText('Ravi is vegetarian')
    await expect(card).toContainText('Needs a decision')
    // The diff names people and shows the movement.
    await expect(card).toContainText('Ravi')
    await expect(card.getByText(/^−₹/).first()).toBeVisible()

    // Still unchanged while it sits there.
    const during = await call(page, 'explain_expense', { expenseId: id })
    expect(during.owes.find((o: any) => o.person === 'Ravi').amount).toBe(raviBefore)

    await card.getByRole('button', { name: 'Accept' }).click()
    // Deciding drops you back on Split; the record is still in Discussion.
    await page.getByRole('tab', { name: 'Discussion' }).click()
    await expect(card).toContainText('Accepted', { timeout: settle(6000) })

    const after = await call(page, 'explain_expense', { expenseId: id })
    expect(after.owes.find((o: any) => o.person === 'Ravi').amount).toBeLessThan(raviBefore)
    const sum = after.owes.reduce((s: number, o: any) => s + o.amount, 0)
    expect(sum).toBeCloseTo(after.total, 2)
  })

  test('declining leaves the money alone and keeps the record', async ({ page }) => {
    await boot(page)
    const id = (await call(page, 'list_expenses', { query: 'Ritz' })).expenses[0].id
    const before = await call(page, 'explain_expense', { expenseId: id })
    const item = before.items[0]

    await call(page, 'assign_items', {
      expenseId: id,
      assignments: [{ itemId: item.id, hadBy: ['Ravi'] }],
      reason: 'Ravi had the prawns alone.',
    })

    await call(page, 'focus_expense', { expenseId: id })
    const card = page.getByRole('article').first()
    await card.getByRole('button', { name: 'Decline' }).click()
    await card.getByRole('button', { name: 'Decline' }).click()

    // Deciding drops you back on Split; the record is still in Discussion.
    await page.getByRole('tab', { name: 'Discussion' }).click()
    await expect(card).toContainText('Declined', { timeout: settle(6000) })
    // Rejected proposals stay visible — the record is the point.
    await expect(card).toContainText('Ravi had the prawns alone')

    const after = await call(page, 'explain_expense', { expenseId: id })
    expect(after.items[0].hadBy).toEqual(before.items[0].hadBy)
  })

  test('accepting an add_expense proposal creates it with the page’s split', async ({ page }) => {
    await boot(page)
    await call(page, 'add_expense', {
      description: 'Beach shack lunch', amount: 2840, paidBy: 'Meera',
      splitBetween: ['me', 'Meera', 'Ravi'],
    })
    // Group-level proposals wait under Activity.
    await call(page, 'open_group', { group: 'Goa, five friends' })
    await page.getByRole('tab', { name: /Activity/ }).click()
    const card = page.getByRole('article').first()
    await expect(card).toContainText('Beach shack lunch')
    await card.getByRole('button', { name: 'Accept' }).click()

    await expect.poll(async () => (await call(page, 'list_expenses', { query: 'Beach shack' })).total,
      { timeout: 8000 }).toBe(1)

    const created = (await call(page, 'list_expenses', { query: 'Beach shack' })).expenses[0]
    const detail = await call(page, 'explain_expense', { expenseId: created.id })
    const amounts = detail.owes.map((o: any) => o.amount).sort()
    expect(amounts).toEqual([946.66, 946.67, 946.67])
  })

  test('settle_up proposes against the plan rather than recording it', async ({ page }) => {
    await boot(page)
    const plan = (await call(page, 'get_balances')).settlementPlan
    const res = await call(page, 'settle_up', { from: plan[0].from, to: plan[0].to })
    expect(res.proposed).toBe(true)
    // Balances are unmoved until it's accepted.
    expect((await call(page, 'get_balances')).settlementPlan.length).toBe(plan.length)
  })

  test('rejects a batch containing one bad line rather than half-proposing it', async ({ page }) => {
    await boot(page)
    const id = (await call(page, 'list_expenses', { query: 'Ritz' })).expenses[0].id
    const before = await call(page, 'explain_expense', { expenseId: id })

    const res = await call(page, 'assign_items', {
      expenseId: id,
      assignments: [
        { itemId: before.items[0].id, hadBy: ['Ravi'] },
        { itemId: 'not-a-real-item', hadBy: ['Ravi'] },
      ],
    })
    expect(String(res)).toContain('explain_expense')

    const after = await call(page, 'explain_expense', { expenseId: id })
    expect(after.items[0].hadBy).toEqual(before.items[0].hadBy)
  })
})

test.describe('the conversation', () => {
  test('people can talk on an expense, and it persists', async ({ page }) => {
    await boot(page)
    const id = (await call(page, 'list_expenses', { query: 'Ritz' })).expenses[0].id
    await call(page, 'focus_expense', { expenseId: id })
    await page.getByRole('tab', { name: 'Discussion' }).click()

    await page.getByRole('textbox', { name: 'Write a message' }).fill('Did anyone actually eat the crab?')
    await page.getByRole('button', { name: 'Send' }).click()

    // Exactly once. The realtime echo of our own insert can beat the insert's
    // own response back on a slow link, which used to show it twice.
    await expect(page.getByText('Did anyone actually eat the crab?')).toHaveCount(1)
    await expect(page.getByText('Did anyone actually eat the crab?')).toBeVisible({ timeout: settle(6000) })

    // Reloading the page finds it still there — it's a real URL.
    await page.reload()
    await page.getByRole('tab', { name: 'Discussion' }).click()
    // Exactly once. The realtime echo of our own insert can beat the insert's
    // own response back on a slow link, which used to show it twice.
    await expect(page.getByText('Did anyone actually eat the crab?')).toHaveCount(1)
    await expect(page.getByText('Did anyone actually eat the crab?')).toBeVisible({ timeout: 15_000 })
  })
})

test.describe('where the tax goes', () => {
  test('each person’s share names its food and its tax separately', async ({ page }) => {
    await boot(page)
    const ALL = ['Arjun', 'Meera', 'Ravi', 'Priya', 'Sam']
    const id = (await call(page, 'list_expenses', { query: 'Ritz' })).expenses[0].id
    const d = await call(page, 'explain_expense', { expenseId: id })
    const item = (re: RegExp) => d.items.find((i: { label: string }) => re.test(i.label)).id
    await call(page, 'assign_items', {
      expenseId: id,
      assignments: [/Butter Garlic Prawns/, /Crab/, /Mutton/, /Tiger Prawns/, /Kingfisher/]
        .map((re) => ({ itemId: item(re), hadBy: ALL.filter((n) => n !== 'Ravi') })),
      reason: 'Ravi is vegetarian and doesn’t drink.',
    })
    await call(page, 'focus_expense', { expenseId: id })
    await page.getByRole('tab', { name: 'Discussion' }).click()
    await page.getByRole('article').filter({ hasText: 'Needs a decision' }).first()
      .getByRole('button', { name: 'Accept' }).click()
    await page.waitForTimeout(settle(2500))
    await page.getByRole('tab', { name: 'Split' }).click()

    // The whole case for itemising: eat less and your slice of the tax and
    // service is smaller too. That is invisible if a share is one number.
    const pays = page.locator('ul[aria-labelledby="pays-heading"]')
    await expect(pays.locator('li').filter({ hasText: 'Ravi' }))
      .toContainText(/₹247\.00 \+ ₹74\.26/)
    await expect(pays.locator('li').filter({ hasText: 'Priya' }))
      .toContainText(/₹1,377\.00 \+ ₹414\.00/)
    await expect(page.getByText(/tax & service, by what people ate/)).toBeVisible()
  })
})
