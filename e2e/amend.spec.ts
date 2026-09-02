import { test, expect } from '@playwright/test'
import { boot, call } from './helpers'

/**
 * The sequence that exposed the flaw: take someone off the non-veg, then put
 * them back on one dish. Those compose — treating the second as a replacement
 * dropped the first and left a proposal that changed nothing.
 */
test.describe('revisions amend the draft', () => {
  const ritz = async (page: import('@playwright/test').Page) =>
    (await call(page, 'list_expenses', { query: 'Ritz' })).expenses[0].id

  test('a follow-up builds on the pending change instead of replacing it', async ({ page }) => {
    await boot(page)
    const id = await ritz(page)
    const detail = await call(page, 'explain_expense', { expenseId: id })

    const nonVeg = detail.items
      .filter((i: any) => /prawn|crab|mutton/i.test(i.label))
      .map((i: any) => i.id)
    const mutton = detail.items.find((i: any) => /mutton/i.test(i.label)).id

    // 1. Take Meera off everything non-veg.
    const first = await call(page, 'assign_items', {
      expenseId: id,
      assignments: nonVeg.map((itemId: string) => ({
        itemId, hadBy: ['Arjun', 'Ravi', 'Priya', 'Sam'],
      })),
      reason: 'Meera is vegetarian — off the non-veg items.',
    })
    expect(first.proposed).toBe(true)

    // 2. Correct it: she did have the mutton.
    const second = await call(page, 'assign_items', {
      expenseId: id,
      assignments: [{ itemId: mutton, hadBy: ['Arjun', 'Meera', 'Ravi', 'Priya', 'Sam'] }],
      reason: 'Actually Meera had the Mutton Xacuti.',
    })
    // Folded in, not queued alongside.
    expect(second.amended).toBe(true)
    expect(second.proposalId).toBe(first.proposalId)
    expect(second.soFar).toEqual([
      'Meera is vegetarian — off the non-veg items.',
      'Actually Meera had the Mutton Xacuti.',
    ])
    // And it still does something — the first half survived.
    expect(second.warning).toBeUndefined()

    // One card, carrying both steps.
    await call(page, 'focus_expense', { expenseId: id })
    const card = page.getByRole('article')
    await expect(card).toHaveCount(1)
    await expect(card.first()).toContainText('Meera is vegetarian')
    await expect(card.first()).toContainText('Actually Meera had the Mutton Xacuti')

    // Accepting applies both halves: Meera is off the prawns and crab, on the mutton.
    await card.first().getByRole('button', { name: 'Accept' }).click()
    await expect(page.getByRole('tab', { name: 'Split', selected: true })).toBeVisible({ timeout: 10_000 })

    const after = await call(page, 'explain_expense', { expenseId: id })
    const item = (re: RegExp) => after.items.find((i: any) => re.test(i.label))
    expect(item(/prawn/i).hadBy).not.toContain('Meera')
    expect(item(/crab/i).hadBy).not.toContain('Meera')
    expect(item(/mutton/i).hadBy).toContain('Meera')
    // Shares still reconcile.
    const sum = after.owes.reduce((s: number, o: any) => s + o.amount, 0)
    expect(sum).toBeCloseTo(after.total, 2)
  })

  test('the agent is told a change is already waiting, and what it says', async ({ page }) => {
    await boot(page)
    const id = await ritz(page)
    const detail = await call(page, 'explain_expense', { expenseId: id })
    expect(detail.pendingProposals).toBeNull()

    await call(page, 'assign_items', {
      expenseId: id,
      assignments: [{ itemId: detail.items[0].id, hadBy: ['Ravi'] }],
      reason: 'Only Ravi had the prawns.',
    })

    const withPending = await call(page, 'explain_expense', { expenseId: id })
    // One bill can carry several drafts, so this is a list — here, just ours.
    expect(withPending.pendingProposals).toHaveLength(1)
    const [draft] = withPending.pendingProposals
    expect(draft.yours).toBe(true)
    expect(draft.soFar).toEqual(['Only Ravi had the prawns.'])
    expect(draft.note).toContain('folds into it')
  })

  test('a revision that changes nothing says so and can’t be accepted', async ({ page }) => {
    await boot(page)
    const id = await ritz(page)
    const detail = await call(page, 'explain_expense', { expenseId: id })
    const first = detail.items[0].id
    const everyone = ['Arjun', 'Meera', 'Ravi', 'Priya', 'Sam']

    await call(page, 'assign_items', {
      expenseId: id,
      assignments: [{ itemId: first, hadBy: ['Ravi'] }],
      reason: 'Ravi had the prawns.',
    })
    // Undo it inside the same draft — now the draft does nothing.
    const back = await call(page, 'assign_items', {
      expenseId: id,
      assignments: [{ itemId: first, hadBy: everyone }],
      reason: 'No, everyone shared them.',
    })
    expect(back.amended).toBe(true)
    expect(back.warning).toContain('wouldn’t change')

    await call(page, 'focus_expense', { expenseId: id })
    const card = page.getByRole('article').first()
    await expect(card).toContainText('wouldn’t change anyone’s share')
    await expect(card.getByRole('button', { name: 'Accept' })).toBeDisabled()
  })

  test('settling still replaces rather than accumulating', async ({ page }) => {
    await boot(page)
    const plan = (await call(page, 'get_balances')).settlementPlan
    const t = plan[0]
    await call(page, 'settle_up', { from: t.from, to: t.to, amount: 100 })
    const second = await call(page, 'settle_up', { from: t.from, to: t.to, amount: 250 })
    expect(second.proposed).toBe(true)

    await page.goto(`/g/${(await call(page, 'get_context')).groups[0].id}`)
    await page.getByRole('tab', { name: /Activity/ }).click()
    await expect(page.getByRole('article')).toHaveCount(1, { timeout: 10_000 })
  })
})
