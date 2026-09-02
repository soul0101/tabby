import { test, expect, type Page } from '@playwright/test'
import { boot, call, MOCK, waitForTools } from './helpers'

const ritz = async (page: Page) =>
  (await call(page, 'list_expenses', { query: 'Ritz' })).expenses[0].id

const items = async (page: Page, id: string) =>
  (await call(page, 'explain_expense', { expenseId: id })).items

const owes = async (page: Page, id: string, who: string) =>
  (await call(page, 'explain_expense', { expenseId: id })).owes
    .find((o: { person: string }) => o.person === who).amount

/** A second person, in their own browser, holding their own seat. */
async function joinAs(browser: import('@playwright/test').Browser, page: Page, name: string) {
  const invite = await page.evaluate(() =>
    (window as unknown as { __tabbyGroups?: { inviteToken: string }[] }).__tabbyGroups?.[0]?.inviteToken)
  const ctx = await browser.newContext({ baseURL: 'http://localhost:3000' })
  const p = await ctx.newPage()
  await p.addInitScript(MOCK)
  await p.goto(`/join/${invite}`)
  await p.getByRole('button', { name: /without an account/ }).click()
  await p.getByRole('button', { name: new RegExp(`^${name}`) }).click({ timeout: 20_000 })
  await expect(p.getByRole('link', { name: /^Add expense/ })).toBeVisible({ timeout: 20_000 })
  await waitForTools(p)
  return { ctx, page: p }
}

test.describe('the situations people actually get into', () => {
  test('“she’s vegetarian… actually she had the mutton” — the agent can see its own draft', async ({ page }) => {
    await boot(page)
    const id = await ritz(page)
    const all = await items(page, id)
    const nonVeg = all.filter((i: { label: string }) => /prawn|crab|mutton/i.test(i.label))
    const mutton = all.find((i: { label: string }) => /mutton/i.test(i.label))

    await call(page, 'assign_items', {
      expenseId: id,
      assignments: nonVeg.map((i: { id: string }) => ({ itemId: i.id, hadBy: ['Arjun', 'Ravi', 'Priya', 'Sam'] })),
      reason: 'Meera is vegetarian — off the non-veg items.',
    })

    // The agent must be able to read the *draft*, not just the saved bill.
    const seen = await call(page, 'explain_expense', { expenseId: id })
    expect(seen.pendingProposals).toHaveLength(1)
    const draft = seen.pendingProposals[0]
    expect(draft.yours).toBe(true)
    const asProposed = draft.wouldBecome.items.find((i: { label: string }) => /mutton/i.test(i.label))
    // Saved says everyone; the draft says Meera is off it. That distinction is
    // the whole reason a correction used to look like a no-op.
    expect(asProposed.hadBy).not.toContain('Meera')
    expect(seen.items.find((i: { label: string }) => /mutton/i.test(i.label)).hadBy).toBe('everyone')

    // Now the correction, which folds in rather than replacing.
    const fixed = await call(page, 'assign_items', {
      expenseId: id,
      assignments: [{ itemId: mutton.id, hadBy: ['Arjun', 'Meera', 'Ravi', 'Priya', 'Sam'] }],
      reason: 'Actually Meera had the Mutton Xacuti.',
    })
    expect(fixed.amended).toBe(true)
    expect(fixed.warning).toBeUndefined()

    await call(page, 'focus_expense', { expenseId: id })
    await page.getByRole('article').first().getByRole('button', { name: 'Accept' }).click()
    await expect(page.getByRole('tab', { name: 'Split', selected: true })).toBeVisible({ timeout: 10_000 })

    const after = await items(page, id)
    const of = (re: RegExp) => after.find((i: { label: string }) => re.test(i.label))
    expect(of(/prawn/i).hadBy).not.toContain('Meera')
    expect(of(/crab/i).hadBy).not.toContain('Meera')
    expect(of(/mutton/i).hadBy).toContain('Meera')
  })

  test('an agent can take back its own suggestion instead of asking to be declined', async ({ page }) => {
    await boot(page)
    const id = await ritz(page)
    const all = await items(page, id)

    const made = await call(page, 'assign_items', {
      expenseId: id, assignments: [{ itemId: all[0].id, hadBy: ['Ravi'] }],
      reason: 'Only Ravi had the prawns.',
    })
    const withdrawn = await call(page, 'withdraw_proposal', { proposalId: made.proposalId })
    expect(withdrawn.withdrawn).toBe(true)

    // Gone from the queue, still on the record.
    expect((await call(page, 'explain_expense', { expenseId: id })).pendingProposals).toBeNull()
    await call(page, 'focus_expense', { expenseId: id })
    await page.getByRole('tab', { name: 'Discussion' }).click()
    await expect(page.getByText('Withdrawn by the agent that proposed it')).toBeVisible({ timeout: 10_000 })

    // And a fresh suggestion starts clean rather than amending the dead one.
    const again = await call(page, 'assign_items', {
      expenseId: id, assignments: [{ itemId: all[1].id, hadBy: ['Meera'] }],
      reason: 'Meera had the crab.',
    })
    expect(again.proposed).toBe(true)
    expect(again.proposalId).not.toBe(made.proposalId)
  })

  test('two people’s agents propose on one bill, and neither edits the other', async ({ page, browser }) => {
    await boot(page)
    const id = await ritz(page)
    const all = await items(page, id)

    // Arjun's agent proposes.
    await call(page, 'assign_items', {
      expenseId: id, assignments: [{ itemId: all[0].id, hadBy: ['Arjun'] }],
      reason: 'Arjun had the prawns.',
    })

    const ravi = await joinAs(browser, page, 'Ravi')
    // Ravi's agent sees it, and is told it isn't his to edit.
    const seenByRavi = await call(ravi.page, 'explain_expense', { expenseId: id })
    expect(seenByRavi.pendingProposals).toHaveLength(1)
    expect(seenByRavi.pendingProposals[0].yours).toBe(false)
    expect(seenByRavi.pendingProposals[0].note).toContain('cannot edit theirs')

    // His own suggestion becomes a separate draft, not an amendment.
    const his = await call(ravi.page, 'assign_items', {
      expenseId: id, assignments: [{ itemId: all[1].id, hadBy: ['Ravi'] }],
      reason: 'And I had the crab.',
    })
    expect(his.proposed).toBe(true)

    // Both stand, each attributed to its own side.
    await expect.poll(async () =>
      (await call(page, 'explain_expense', { expenseId: id })).pendingProposals.length,
      { timeout: 20_000 }).toBe(2)

    await call(page, 'focus_expense', { expenseId: id })
    await page.getByRole('tab', { name: 'Discussion' }).click()
    const cards = page.getByRole('article')
    await expect(cards).toHaveCount(2, { timeout: 10_000 })
    await expect(cards.filter({ hasText: 'Arjun had the prawns' })).toContainText('your agent')
    await expect(cards.filter({ hasText: 'I had the crab' })).toContainText('Ravi’s agent')

    await ravi.ctx.close()
  })

  test('accepting one draft recosts the other, live', async ({ page, browser }) => {
    await boot(page)
    const id = await ritz(page)
    const all = await items(page, id)
    const prawns = all[0]

    // Arjun proposes putting the prawns on himself.
    await call(page, 'assign_items', {
      expenseId: id, assignments: [{ itemId: prawns.id, hadBy: ['Arjun'] }],
      reason: 'Arjun had the prawns.',
    })

    // Ravi proposes exactly the same thing, unaware.
    const ravi = await joinAs(browser, page, 'Ravi')
    await call(ravi.page, 'assign_items', {
      expenseId: id, assignments: [{ itemId: prawns.id, hadBy: ['Arjun'] }],
      reason: 'Pretty sure those were Arjun’s.',
    })

    await call(page, 'focus_expense', { expenseId: id })
    await page.getByRole('tab', { name: 'Discussion' }).click()
    await page.getByRole('article').filter({ hasText: 'Arjun had the prawns' })
      .getByRole('button', { name: 'Accept' }).click()

    // Ravi's is now redundant, and his screen says so rather than showing the
    // numbers it was costed at.
    await ravi.page.goto(`/g/${(await call(ravi.page, 'get_context')).groups[0].id}/e/${id}`)
    await ravi.page.getByRole('tab', { name: 'Discussion' }).click()
    const his = ravi.page.getByRole('article').filter({ hasText: 'Pretty sure' })
    await expect(his).toContainText('wouldn’t change anyone’s share', { timeout: 20_000 })
    await expect(his.getByRole('button', { name: 'Accept' })).toBeDisabled()

    await ravi.ctx.close()
  })

  test('a hand edit while a draft is open shows the draft’s true effect', async ({ page }) => {
    await boot(page)
    const id = await ritz(page)
    const all = await items(page, id)

    await call(page, 'assign_items', {
      expenseId: id, assignments: [{ itemId: all[0].id, hadBy: ['Ravi', 'Meera'] }],
      reason: 'Ravi and Meera shared the prawns.',
    })

    // Someone edits the same line by hand, in the app.
    await call(page, 'focus_expense', { expenseId: id })
    await page.getByRole('tab', { name: 'Split' }).click()
    await page.getByRole('button', { name: new RegExp(`^Priya had ${all[0].label}`) }).click()

    await page.getByRole('tab', { name: 'Discussion' }).click()
    const card = page.getByRole('article').first()
    await expect(card).toContainText('changed since this was suggested', { timeout: 10_000 })

    // Accepting still does what the card now says.
    await card.getByRole('button', { name: 'Accept' }).click()
    await expect(page.getByRole('tab', { name: 'Split', selected: true })).toBeVisible({ timeout: 10_000 })
    const after = await items(page, id)
    expect(after[0].hadBy.sort()).toEqual(['Meera', 'Ravi'])
  })

  test('a long back-and-forth stays one draft with a readable trail', async ({ page }) => {
    await boot(page)
    const id = await ritz(page)
    const all = await items(page, id)

    const steps: [string, string[], string][] = [
      [all[0].id, ['Arjun', 'Meera'], 'Arjun and Meera had the prawns.'],
      [all[1].id, ['Ravi'], 'Ravi took the crab.'],
      [all[2].id, ['Sam', 'Priya'], 'Sam and Priya split the mutton.'],
      [all[0].id, ['Arjun'], 'Correction — just Arjun on the prawns.'],
    ]
    let last
    for (const [itemId, hadBy, reason] of steps) {
      last = await call(page, 'assign_items', { expenseId: id, assignments: [{ itemId, hadBy }], reason })
    }
    expect(last!.soFar).toHaveLength(4)

    await call(page, 'focus_expense', { expenseId: id })
    const card = page.getByRole('article')
    await expect(card).toHaveCount(1)
    await expect(card.first()).toContainText('4 adjustments')
    await expect(card.first()).toContainText('Correction — just Arjun on the prawns')

    await card.first().getByRole('button', { name: 'Accept' }).click()
    await expect(page.getByRole('tab', { name: 'Split', selected: true })).toBeVisible({ timeout: 10_000 })

    // The last word wins on the prawns; the rest of the trail still applied.
    const after = await items(page, id)
    // The signed-in person reads as "You" throughout the tool surface.
    expect(after[0].hadBy).toEqual(['You'])
    expect(after[1].hadBy).toEqual(['Ravi'])
    expect(after[2].hadBy.sort()).toEqual(['Priya', 'Sam'])
  })

  test('deleting the bill takes its open drafts with it', async ({ page }) => {
    await boot(page)
    const groupId = (await call(page, 'get_context')).groups[0].id
    const id = await ritz(page)
    const all = await items(page, id)

    await call(page, 'assign_items', {
      expenseId: id, assignments: [{ itemId: all[0].id, hadBy: ['Ravi'] }],
      reason: 'Ravi had the prawns.',
    })

    await page.goto(`/g/${groupId}/e/${id}`)
    await page.getByRole('tab', { name: 'Split' }).click()
    await page.getByRole('button', { name: 'Delete this expense' }).click()
    await page.getByRole('button', { name: 'Delete expense' }).click()

    await page.goto(`/g/${groupId}`)
    await page.getByRole('tab', { name: /Activity/ }).click()
    // With nothing pending the panel opens on History, and the badge is gone.
    const waiting = page.getByRole('tab', { name: /Waiting/ })
    await expect(waiting).toHaveText('Waiting', { timeout: 15_000 })
    await waiting.click()
    await expect(page.getByText('Nothing to decide')).toBeVisible()
    // The bill is gone, but the history still records that it was.
    await page.getByRole('tab', { name: /History/ }).click()
    await expect(page.getByText(/Ritz/).first()).toBeVisible()
  })

  test('the money still reconciles after a messy sequence', async ({ page }) => {
    await boot(page)
    const id = await ritz(page)
    const all = await items(page, id)

    await call(page, 'assign_items', {
      expenseId: id,
      assignments: all.slice(0, 4).map((i: { id: string }) => ({ itemId: i.id, hadBy: ['Arjun', 'Meera'] })),
      reason: 'First pass.',
    })
    await call(page, 'assign_items', {
      expenseId: id, assignments: [{ itemId: all[0].id, hadBy: [] }],
      reason: 'The prawns were shared after all.',
    })

    await call(page, 'focus_expense', { expenseId: id })
    await page.getByRole('article').first().getByRole('button', { name: 'Accept' }).click()
    await expect(page.getByRole('tab', { name: 'Split', selected: true })).toBeVisible({ timeout: 10_000 })

    const detail = await call(page, 'explain_expense', { expenseId: id })
    const sum = detail.owes.reduce((s: number, o: { amount: number }) => s + o.amount, 0)
    expect(sum).toBeCloseTo(detail.total, 2)
    expect(detail.items[0].hadBy).toBe('everyone')
  })
})
