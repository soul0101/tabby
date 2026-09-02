import { test, expect } from '@playwright/test'
import { boot, call } from './helpers'

test.describe('the trip’s days', () => {
  test('the Saturday dinner is on a Saturday, whatever day you look', async ({ page }) => {
    await boot(page)
    const ritz = (await call(page, 'list_expenses', { query: 'Ritz' })).expenses[0]
    // The description says Saturday. Four days ago only lands on one if you
    // happen to look on a Wednesday, so the trip anchors itself instead.
    const day = new Date(ritz.date).toLocaleDateString('en-US', { weekday: 'long' })
    expect(day, `“${ritz.description}” fell on a ${day}`).toBe('Saturday')
  })
})
