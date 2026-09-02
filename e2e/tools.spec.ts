import { test, expect } from '@playwright/test'
import { boot, call, tools, settle } from './helpers'

test.describe('the tool surface', () => {
  test('registers every tier once the user is signed in', async ({ page }) => {
    await boot(page)
    expect(await tools(page)).toEqual(expect.arrayContaining([
      'get_context', 'list_expenses', 'get_balances', 'explain_expense',
      'who_owes_whom', 'get_insights',
      'open_group', 'open_view', 'focus_expense',
      'add_expense', 'itemise_expense', 'assign_items', 'update_expense',
      'delete_expense', 'settle_up', 'add_person', 'create_group', 'attach_receipt', 'get_history',
    ]))
  })

  test('marks the tools that move money as destructive', async ({ page }) => {
    await boot(page)
    for (const name of ['add_expense', 'delete_expense', 'settle_up', 'create_group']) {
      const a = await page.evaluate((n) => window.__agent.annotations(n), name)
      expect(a.destructiveHint, name).toBe(true)
      expect(a.readOnlyHint, name).toBe(false)
    }
    for (const name of ['get_context', 'get_balances', 'explain_expense']) {
      const a = await page.evaluate((n) => window.__agent.annotations(n), name)
      expect(a.readOnlyHint, name).toBe(true)
    }
  })

  test('get_context is small and orienting', async ({ page }) => {
    await boot(page)
    const ctx = await call(page, 'get_context')
    expect(ctx.you).toBe('Arjun')
    expect(ctx.groups).toHaveLength(1)
    expect(ctx.groups[0].name).toBe('Goa, five friends')
    expect(ctx.groups[0].people).toHaveLength(5)
    expect(ctx.groups[0].expenses).toBe(10)
    // Payload discipline: the whole picture in a couple hundred tokens.
    expect(JSON.stringify(ctx).length).toBeLessThan(800)
  })

  test('list_expenses paginates instead of dumping the ledger', async ({ page }) => {
    await boot(page)
    const page1 = await call(page, 'list_expenses', { limit: 3 })
    expect(page1.expenses).toHaveLength(3)
    expect(page1.hasMore).toBe(true)
    expect(page1.total).toBe(10)

    const byPayer = await call(page, 'list_expenses', { paidBy: 'Meera' })
    expect(byPayer.expenses.length).toBeGreaterThan(0)
    expect(byPayer.expenses.every((e: any) => e.paidBy === 'Meera')).toBe(true)
  })

  test('balances sum to zero and the plan uses fewer payments than debts', async ({ page }) => {
    await boot(page)
    const b = await call(page, 'get_balances')
    const net = b.balances.reduce((s: number, x: any) => s + x.net, 0)
    expect(Math.abs(net)).toBeLessThan(0.01)
    expect(b.settlementPlan.length).toBeLessThan(b.debts)
    expect(b.settlementPlan.every((t: any) => t.amount > 0)).toBe(true)
  })

  test('who_owes_whom answers the question a group balance cannot', async ({ page }) => {
    await boot(page)
    const r = await call(page, 'who_owes_whom', { person: 'me', other: 'Meera' })
    expect(r.summary).toMatch(/owes|square/)
    expect(r.sharedExpenses.length).toBeGreaterThan(0)
    // The pairwise net must equal the sum of its parts.
    const derived = r.sharedExpenses.reduce(
      (s: number, l: any) => s + (l.direction.startsWith('Meera') ? l.amount : -l.amount), 0)
    expect(Math.abs(Math.abs(derived) - r.net)).toBeLessThan(0.02)
  })
})

test.describe('the receipt', () => {
  // A 1×1 JPEG. Enough to prove the path: the agent hands over bytes, the page
  // uploads them, and the expense carries the photo afterwards.
  const PIXEL =
    'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsL' +
    'DBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAAB' +
    'AAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q=='

  test('the agent can put the bill photo on an expense', async ({ page }) => {
    await boot(page)
    const id = (await call(page, 'list_expenses', { query: 'Curlies' })).expenses[0].id
    const res = await call(page, 'attach_receipt', { expenseId: id, image: PIXEL })
    expect(res.attached).toContain('Curlies')

    await expect.poll(async () =>
      (await call(page, 'list_receipts')).expenses.some((r: { expenseId: string }) => r.expenseId === id),
      { timeout: settle(15_000) }).toBe(true)
  })

  test('it refuses anything that isn’t an image, and won’t overwrite one', async ({ page }) => {
    await boot(page)
    const id = (await call(page, 'list_expenses', { query: 'Newton' })).expenses[0].id
    // A tool error comes back as text rather than throwing, so the model gets
    // to read it and try something else.
    expect(String(await call(page, 'attach_receipt',
      { expenseId: id, image: 'the receipt is in my bag' })))
      .toMatch(/data: URL|https:/i)

    await call(page, 'attach_receipt', { expenseId: id, image: PIXEL })
    expect(String(await call(page, 'attach_receipt', { expenseId: id, image: PIXEL })))
      .toMatch(/already has a receipt/i)
  })
})

test.describe('a bill from a photo', () => {
  const PIXEL =
    'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsL' +
    'DBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAAB' +
    'AAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q=='

  test('one proposal carries the total, the line items and the photo', async ({ page }) => {
    await boot(page)
    await call(page, 'add_expense', {
      description: 'Thalassa · Sunday lunch', amount: 5945.50, paidBy: 'Arjun',
      receipt: PIXEL, tax: 258.50, tip: 517,
      lines: [
        { label: 'Prawn Balchão', amount: 640 }, { label: 'Grilled Kingfish', amount: 820 },
        { label: 'Chicken Cafreal', amount: 580 }, { label: 'Calamari Rechad', amount: 520 },
        { label: 'Goan Sausage Chilli Fry', amount: 460 }, { label: 'Veg Xacuti', amount: 380 },
        { label: 'Steamed Rice', amount: 160 }, { label: 'Poi Bread ×4', amount: 120 },
        { label: 'Sol Kadhi ×5', amount: 250 }, { label: 'Feni Cocktails ×4', amount: 960 },
        { label: 'Serradura', amount: 280 },
      ],
    })
    // Nothing saved yet — that is the whole point of a proposal.
    expect((await call(page, 'list_expenses', { query: 'Thalassa' })).total).toBe(0)

    await call(page, 'open_group', { group: 'Goa, five friends' })
    await page.getByRole('tab', { name: /Activity/ }).click()
    await page.getByRole('article').first().getByRole('button', { name: 'Accept' }).click()
    await expect.poll(async () => (await call(page, 'list_expenses', { query: 'Thalassa' })).total,
      { timeout: settle(15_000) }).toBe(1)

    const id = (await call(page, 'list_expenses', { query: 'Thalassa' })).expenses[0].id
    const detail = await call(page, 'explain_expense', { expenseId: id })
    expect(detail.items).toHaveLength(11)
    expect(detail.total).toBeCloseTo(5945.50, 2)
    // Read but not yet divided: everyone still on an equal share.
    expect(new Set(detail.owes.map((o: { amount: number }) => o.amount)).size).toBe(1)

    // And the photo came with it, without a second round trip.
    expect(detail.hasReceipt ?? detail.receipt).toBeTruthy()
    // The read tools only appear once there is something to read.
    await expect.poll(async () => (await tools(page)).includes('list_receipts'),
      { timeout: settle(10_000) }).toBe(true)
  })

  test('a line without a real amount is refused rather than half-entered', async ({ page }) => {
    await boot(page)
    expect(String(await call(page, 'add_expense', {
      description: 'Blurry bill', amount: 900,
      lines: [{ label: 'Readable', amount: 500 }, { label: 'Smudged', amount: 0 }],
    }))).toMatch(/positive amount/i)
    expect((await call(page, 'list_expenses', { query: 'Blurry' })).total).toBe(0)
  })
})

test.describe('provenance', () => {
  test('a change records what moved, who moved it, and what it cost', async ({ page }) => {
    await boot(page)
    const id = (await call(page, 'list_expenses', { query: 'Ritz' })).expenses[0].id
    const detail = await call(page, 'explain_expense', { expenseId: id })
    const bebinca = detail.items.find((i: { label: string }) => /Bebinca/i.test(i.label))
    // `hadBy` reads "everyone" when nobody has been excluded yet.
    const all = ['Arjun', 'Meera', 'Ravi', 'Priya', 'Sam']
    const without = (Array.isArray(bebinca.hadBy) ? bebinca.hadBy : all)
      .filter((n: string) => n !== 'Priya')

    await call(page, 'assign_items', {
      expenseId: id, assignments: [{ itemId: bebinca.id, hadBy: without }],
      reason: 'Priya skipped dessert.',
    })
    // Accept it, so the change is the agent's and the log should say so.
    await call(page, 'focus_expense', { expenseId: id })
    await page.getByRole('tab', { name: 'Discussion' }).click()
    await page.getByRole('article').filter({ hasText: 'Needs a decision' }).first()
      .getByRole('button', { name: 'Accept' }).click()
    await page.waitForTimeout(settle(2500))

    const hist = await call(page, 'get_history', { expenseId: id })
    expect(hist.of).toContain('Ritz')
    const change = hist.changes[0]
    expect(change.how).toMatch(/agent/)
    expect(change.items[0].item).toMatch(/Bebinca/i)
    expect(change.items[0].cameOff).toEqual(['Priya'])
    // And what it cost people, which is the question that starts arguments.
    const priya = change.shares.find((r: { person: string }) => r.person === 'Priya')
    expect(priya.to).toBeLessThan(priya.from)
  })

  test('an edit made by hand is recorded as made by hand', async ({ page }) => {
    await boot(page)
    const id = (await call(page, 'list_expenses', { query: 'Ritz' })).expenses[0].id
    await call(page, 'focus_expense', { expenseId: id })
    await page.getByRole('tab', { name: 'Split' }).click()
    await page.getByRole('button', { name: /^Priya had Bebinca/ }).click()
    await page.waitForTimeout(settle(2000))

    const change = (await call(page, 'get_history', { expenseId: id })).changes[0]
    expect(change.how).toBe('by hand')
    expect(change.items[0].cameOff).toEqual(['Priya'])
    expect(change.what).toMatch(/Priya came off Bebinca/i)

    // And it's on the bill's own History tab, not just the group's.
    await page.getByRole('tab', { name: 'History' }).click()
    await expect(page.getByText(/Priya came off Bebinca/i).first())
      .toBeVisible({ timeout: settle(8000) })
    await expect(page.getByText(/by hand/i).first()).toBeVisible()
  })
})
