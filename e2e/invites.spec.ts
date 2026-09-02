import { test, expect, type Page, type Browser } from '@playwright/test'
import { boot, call, MOCK, waitForTools, settle, supabaseEnv } from './helpers'

/**
 * A second, genuinely separate person — their own account, their own address.
 *
 * Signs in through GoTrue directly and plants the session where supabase-js
 * looks for it. Deliberately not the app's own auth client: that is exposed
 * only outside production, so leaning on it meant this test silently stopped
 * exercising anything the moment it was pointed at the deployment — which is
 * exactly where it is worth running.
 *
 * Not the magic-link flow either: that turns this into a test of GoTrue's
 * redirect allowlist rather than of invitations.
 */
async function signInAs(browser: Browser, email: string, cookie: { name: string; domain: string }) {
  const ctx = await browser.newContext({ baseURL: process.env.TABBY_URL ?? 'http://localhost:3000' })
  const page = await ctx.newPage()
  await page.addInitScript(MOCK)
  await page.goto('/')
  await page.getByRole('button', { name: /without an account/ }).first()
    .waitFor({ timeout: settle(20_000) })

  const { url, key } = supabaseEnv()
  const res = await page.request.post(`${url}/auth/v1/signup`, {
    headers: { apikey: key, 'Content-Type': 'application/json' },
    data: { email, password: 'demo-password-1234' },
  })
  const session = await res.json()
  expect(session.access_token, `signing up ${email}: ${JSON.stringify(session).slice(0, 200)}`)
    .toBeTruthy()

  // @supabase/ssr keeps the session in a cookie as base64-encoded JSON, so the
  // server and the client see the same user. Written the same way here.
  await ctx.addCookies([{
    name: cookie.name,
    value: 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64'),
    domain: cookie.domain,
    path: '/',
    sameSite: 'Lax',
  }])
  await page.reload()
  await expect(page.getByText(/no groups yet|invited you to/i).first())
    .toBeVisible({ timeout: settle(25_000) })
  await waitForTools(page)
  return { ctx, page }
}

/** The cookie this project keeps its session in — its name encodes the ref. */
async function sessionCookie(page: Page) {
  const found = (await page.context().cookies())
    .find((c) => c.name.startsWith('sb-') && c.name.endsWith('-auth-token'))
  expect(found, 'a signed-in page should carry a supabase session cookie').toBeTruthy()
  return { name: found!.name, domain: found!.domain }
}

const ADDR = () => `friend-${Date.now()}-${Math.floor(Math.random() * 1e4)}@example.com`

test.describe('inviting a real person', () => {
  test('an invitation crosses between two accounts, and joining shares the money', async ({ page, browser }) => {
    await boot(page)
    const groupId = (await call(page, 'get_context')).groups[0].id
    const email = ADDR()

    // Offer Ravi's unclaimed seat to an address.
    const sentInvite = await call(page, 'invite_to_group', { email, seatName: 'Ravi', groupId })
    expect(sentInvite.invited).toBe(email)
    expect(sentInvite.as).toBe('Ravi')

    const friend = await signInAs(browser, email, await sessionCookie(page))

    // They can see it, and it names who asked and which seat.
    await expect.poll(async () =>
      (await call(friend.page, 'get_context')).invitations?.length ?? 0,
      { timeout: settle(15_000) }).toBe(1)
    const theirContext = await call(friend.page, 'get_context')
    expect(theirContext.invitations[0].as).toBe('Ravi')
    expect(theirContext.groups).toHaveLength(0)      // nothing shared before accepting

    await expect(friend.page.getByText(/invited you to/i)).toBeVisible({ timeout: settle(15_000) })
    await friend.page.getByRole('button', { name: 'Join' }).click()

    // Now they're in, holding Ravi's seat and Ravi's balance.
    await expect.poll(async () =>
      (await call(friend.page, 'get_context')).groups.length, { timeout: settle(25_000) }).toBe(1)
    const joined = (await call(friend.page, 'get_context')).groups[0]
    expect(joined.expenses).toBe(10)
    const balances = await call(friend.page, 'get_balances', { groupId })
    expect(balances.balances.find((b: { person: string }) => b.person === 'You')).toBeTruthy()
    expect((await call(friend.page, 'get_context')).invitations).toBeNull()

    await friend.ctx.close()
  })

  test('declining leaves the group alone, and the address can be asked again', async ({ page, browser }) => {
    await boot(page)
    const groupId = (await call(page, 'get_context')).groups[0].id
    const email = ADDR()
    await call(page, 'invite_to_group', { email, groupId })

    const friend = await signInAs(browser, email, await sessionCookie(page))
    await expect.poll(async () =>
      (await call(friend.page, 'get_context')).invitations?.length ?? 0,
      { timeout: settle(15_000) }).toBe(1)
    const first = (await call(friend.page, 'get_context')).invitations[0]
    await call(friend.page, 'respond_to_invitation', { invitationId: first.invitationId, accept: false })

    expect((await call(friend.page, 'get_context')).groups).toHaveLength(0)
    expect((await call(friend.page, 'get_context')).invitations).toBeNull()

    // Declining frees the address — the point being "sorry, wrong person".
    const again = await call(page, 'invite_to_group', { email, groupId })
    expect(again.invited).toBe(email)
    await friend.ctx.close()
  })

  test('the same address cannot be invited twice while one is waiting', async ({ page }) => {
    await boot(page)
    const groupId = (await call(page, 'get_context')).groups[0].id
    const email = ADDR()
    await call(page, 'invite_to_group', { email, groupId })
    // The mock client hands tool errors back as strings, the way a real one
    // hands them to the model — so assert on the message, not on a rejection.
    expect(String(await call(page, 'invite_to_group', { email, groupId })))
      .toMatch(/already has an invitation/i)
  })

  test('a seat someone already claimed is not offered again', async ({ page }) => {
    await boot(page)
    expect(String(await call(page, 'invite_to_group', { email: ADDR(), seatName: 'Arjun' })))
      .toMatch(/already claimed/i)
  })
})

test.describe('deleting keeps the row', () => {
  test('an expense comes back as itself — same items, same discussion', async ({ page }) => {
    await boot(page)
    const id = (await call(page, 'list_expenses', { query: 'Ritz' })).expenses[0].id
    await call(page, 'say', { expenseId: id, message: 'Was the tip included?' }).catch(() => {})
    const before = await call(page, 'explain_expense', { expenseId: id })

    // delete_expense proposes; a person still has to agree to it.
    await call(page, 'delete_expense', { expenseId: id })
    await call(page, 'focus_expense', { expenseId: id })
    await page.getByRole('tab', { name: 'Discussion' }).click()
    await page.getByRole('article')
      .filter({ has: page.getByRole('button', { name: 'Accept' }) })
      .first().getByRole('button', { name: 'Accept' }).click()
    await expect.poll(async () =>
      (await call(page, 'list_expenses', { query: 'Ritz' })).expenses.length,
      { timeout: settle(15_000) }).toBe(0)

    const back = await call(page, 'restore_expense', { expenseId: id })
    expect(back.restored).toContain('Ritz')

    const after = await call(page, 'explain_expense', { expenseId: id })
    expect(after.total).toBe(before.total)
    expect(after.items).toHaveLength(before.items.length)
    // The identity survived, which a delete-and-recreate undo cannot manage.
    expect(after.items[0].id).toBe(before.items[0].id)
  })

  test('a group comes back with its expenses and balances intact', async ({ page }) => {
    await boot(page)
    const ctx = await call(page, 'get_context')
    const groupId = ctx.groups[0].id
    const before = await call(page, 'get_balances', { groupId })

    const gone = await call(page, 'delete_group', { groupId })
    expect(gone.expensesRemoved).toBe(10)
    expect((await call(page, 'get_context')).groups).toHaveLength(0)

    await call(page, 'restore_group', { groupId })
    const back = await call(page, 'get_context')
    expect(back.groups).toHaveLength(1)
    expect(back.groups[0].expenses).toBe(10)
    expect((await call(page, 'get_balances', { groupId })).balances)
      .toEqual(before.balances)
  })
})

test.describe('friends', () => {
  test('splitting once makes you friends, and the next group is one tap', async ({ page, browser }) => {
    // Both sides have to be real accounts. An anonymous guest has no address,
    // so it deliberately never accumulates friends — its seat goes away with
    // the session, and remembering it would be remembering nobody.
    await boot(page)
    const cookie = await sessionCookie(page)
    const hostEmail = ADDR()
    const friendEmail = ADDR()

    const host = await signInAs(browser, hostEmail, cookie)
    expect((await call(host.page, 'get_context')).friends).toBeNull()

    const made = await call(host.page, 'create_group', {
      name: 'Goa again', people: [friendEmail],
    })
    expect(made.invited).toEqual([friendEmail])
    expect(made.addedDirectly).toBe(0)

    const friend = await signInAs(browser, friendEmail, cookie)
    await expect.poll(async () =>
      (await call(friend.page, 'get_context')).invitations?.length ?? 0,
      { timeout: settle(15_000) }).toBe(1)
    const inv = (await call(friend.page, 'get_context')).invitations[0]
    await call(friend.page, 'respond_to_invitation', { invitationId: inv.invitationId, accept: true })

    // Having split together, each now knows the other.
    await expect.poll(async () =>
      (await call(friend.page, 'get_context')).friends?.length ?? 0,
      { timeout: settle(15_000) }).toBe(1)
    expect((await call(friend.page, 'get_context')).friends[0].email).toBe(hostEmail)

    // And the next group takes them straight in — nothing to accept.
    const second = await call(friend.page, 'create_group', {
      name: 'Second trip', people: [hostEmail],
    })
    expect(second.addedDirectly).toBe(1)
    expect(second.invited).toEqual([])
    const groups = (await call(friend.page, 'get_context')).groups
    expect(groups.find((g: { name: string }) => g.name === 'Second trip').people).toHaveLength(2)

    await host.ctx.close(); await friend.ctx.close()
  })

  test('an address you have never split with is invited, not added', async ({ page }) => {
    await boot(page)
    const made = await call(page, 'create_group', {
      name: 'Ski trip', people: ['stranger@example.com', 'Someone Offline'],
    })
    expect(made.invited).toEqual(['stranger@example.com'])
    expect(made.placeholders).toEqual(['Someone Offline'])
    expect(made.addedDirectly).toBe(0)

    // The placeholder is a seat immediately; the address is not a member yet.
    const g = (await call(page, 'get_context')).groups
      .find((x: { name: string }) => x.name === 'Ski trip')
    expect(g.people).toEqual(expect.arrayContaining(['Someone Offline']))
    expect(g.people).toHaveLength(2)
  })
})
