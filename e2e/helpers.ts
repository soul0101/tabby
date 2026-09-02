import { type Page, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

export const MOCK = readFileSync(join(__dirname, 'mock-agent.js'), 'utf8')

/**
 * How long to allow for a write to come back.
 *
 * Local Supabase is a container away. The deployment's database is in
 * us-east-1 — chosen to be near the judges, which makes it far from here — and
 * accepting a proposal is several round trips plus a full reload. Measured at
 * roughly twenty seconds from India against maybe three from the US east
 * coast, so the multiplier is distance, not a hang.
 *
 * Scaling in one place keeps a real stall distinguishable from ordinary
 * latency: if something exceeds even this, it is stuck, not slow.
 */
export const REMOTE = Boolean(process.env.TABBY_URL)

/**
 * Supabase's URL and key, for the project the run is pointed at.
 *
 * Next loads NEXT_PUBLIC_* itself; the test process never sees them, so read
 * the same file Next would — and the production one when pointed at the
 * deployment, or a test would happily sign a user in to the wrong database.
 */
export function supabaseEnv() {
  const file = REMOTE ? '.env.production.local' : '.env.local'
  const text = readFileSync(join(__dirname, '..', file), 'utf8')
  const read = (k: string) =>
    text.split('\n').find((l) => l.startsWith(`${k}=`))?.slice(k.length + 1).trim() ?? ''
  const url = read('NEXT_PUBLIC_SUPABASE_URL')
  const key = read('NEXT_PUBLIC_SUPABASE_ANON_KEY')
  if (!url || !key) throw new Error(`${file} is missing NEXT_PUBLIC_SUPABASE_URL or _ANON_KEY`)
  return { url, key }
}
export const settle = (ms: number) => (REMOTE ? ms * 8 : ms)

declare global {
  interface Window {
    __agent: {
      list: () => string[]
      schema: (n: string) => unknown
      annotations: (n: string) => { destructiveHint?: boolean; readOnlyHint?: boolean }
      call: (n: string, a?: unknown) => Promise<any>
      begin: (n: string, a?: unknown) => string
      settle: () => Promise<any>
    }
  }
}

/** Fresh anonymous guest, the Goa scenario loaded as Arjun, agent attached. */
export async function boot(page: Page) {
  await page.addInitScript(MOCK)
  await page.goto('/')
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
  await page.context().clearCookies()
  await page.goto('/')

  await page.getByRole('button', { name: /without an account/ }).click()

  // Load the Goa scenario as Arjun — the vantage point the tests assume.
  await page.getByRole('button', { name: /Goa, five friends/ }).click({ timeout: 20_000 })
  await page.getByRole('button', { name: /^Arjun/ }).click({ timeout: 10_000 })
  await expect(page.getByRole('link', { name: /^Add expense/ })).toBeVisible({ timeout: 30_000 })
  await page.waitForFunction(() => window.__agent?.list().length > 0)

  // Loading a scenario lands you in the group; come back so every test starts
  // from the same place.
  await page.goto('/')
  await waitForTools(page)

  // The group exists before its expenses do; wait for the whole trip.
  await expect
    .poll(async () => (await call(page, 'get_context')).groups[0]?.expenses ?? 0, { timeout: 30_000 })
    .toBe(10)
}

export const call = (page: Page, name: string, args?: unknown) =>
  page.evaluate(([n, a]) => window.__agent.call(n as string, a), [name, args] as const)

export const tools = (page: Page) => page.evaluate(() => window.__agent.list())

/** A hard reload starts the client fresh, so tools re-register asynchronously. */
export const waitForTools = (page: Page) =>
  page.waitForFunction(() => window.__agent?.list().includes('get_context'), undefined, { timeout: 20_000 })
