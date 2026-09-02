import { toMinor } from './money'
import type { Category, Id, SplitMode } from './types'

/**
 * Ready-made situations to try the app on.
 *
 * Each one exists to make a different thing obvious, and each lets you pick
 * who you are — the argument about the meat bill only lands if you're the
 * vegetarian being charged for it, not the person who's owed money.
 */

export interface ScenarioItem {
  label: string
  amount: number
  /** Cast names. Omit for a line everyone shared. */
  hadBy?: string[]
}

export interface ScenarioExpense {
  description: string
  /** Cast name. */
  paidBy: string
  amount: number
  category: Category
  daysAgo: number
  /** Cast names. Omit for everyone. */
  between?: string[]
  splitMode?: SplitMode
  /** Cast name → relative share. */
  weights?: Record<string, number>
  items?: ScenarioItem[]
  tax?: number
  tip?: number
  currency?: string
  /** Units of the group currency per unit of `currency`. */
  rate?: number
  note?: string
}

export interface ScenarioSettlement {
  from: string
  to: string
  amount: number
}

export interface Scenario {
  id: string
  title: string
  emoji: string
  /** One line on what this one is for. */
  blurb: string
  /** What it shows off, for the picker. */
  shows: string
  cast: string[]
  /**
   * Keeps a named day honest. "Saturday dinner" is four days ago, which is only
   * a Saturday if you happen to look on a Wednesday — so the whole trip shifts
   * to whichever week makes the anchored expense land on its weekday.
   * `weekday` is JS's: 0 Sunday … 6 Saturday.
   */
  anchor?: { daysAgo: number; weekday: number }
  expenses: ScenarioExpense[]
  settlements?: ScenarioSettlement[]
  /** Who to suggest being, and why that vantage point is interesting. */
  perspectives: { name: string; hint: string }[]
}

export const SCENARIOS: Scenario[] = [
  {
    id: 'goa',
    title: 'Goa, five friends',
    emoji: '🌴',
    blurb: 'A long weekend, ten expenses, and one 10-line seafood dinner nobody wants to split by hand.',
    shows: 'Itemised bills · who had what',
    cast: ['Arjun', 'Meera', 'Ravi', 'Priya', 'Sam'],
    // The Ritz dinner is called a Saturday dinner, so make it one.
    anchor: { daysAgo: 4, weekday: 6 },
    perspectives: [
      { name: 'Ravi', hint: 'Vegetarian, and currently paying for everyone’s prawns' },
      { name: 'Arjun', hint: 'Paid for the villa, owed the most' },
      { name: 'Meera', hint: 'Arrived late, on fewer expenses' },
    ],
    expenses: [
      { description: 'Assagao villa · 3 nights', paidBy: 'Arjun', amount: 42000, category: 'stay', daysAgo: 6 },
      {
        description: 'Scooter rental', paidBy: 'Priya', amount: 5400, category: 'travel', daysAgo: 6,
        between: ['Arjun', 'Ravi', 'Priya', 'Sam'], note: 'Meera flew in on Sunday.',
      },
      { description: 'Newton’s supermarket', paidBy: 'Sam', amount: 3840, category: 'groceries', daysAgo: 5 },
      { description: 'Curlies · beach lunch', paidBy: 'Meera', amount: 2367, category: 'food', daysAgo: 5 },
      {
        description: 'Ritz Classic · Saturday dinner', paidBy: 'Arjun', amount: 0,
        category: 'food', daysAgo: 4, splitMode: 'items', tax: 830.25, tip: 900,
        items: [
          { label: 'Butter Garlic Prawns', amount: 780 },
          { label: 'Crab Xec Xec', amount: 890 },
          { label: 'Mutton Xacuti', amount: 610 },
          { label: 'Tiger Prawns Tandoori', amount: 1100 },
          { label: 'Veg Caldin', amount: 340 },
          { label: 'Dal Tadka', amount: 260 },
          { label: 'Goan Red Rice', amount: 180 },
          { label: 'Butter Naan ×3', amount: 195 },
          { label: 'Kingfisher Ultra ×6', amount: 1140 },
          { label: 'Bebinca', amount: 260 },
        ],
      },
      {
        description: 'Tito’s Lane · cover + table', paidBy: 'Sam', amount: 14850,
        category: 'drinks', daysAgo: 4, between: ['Arjun', 'Meera', 'Priya', 'Sam'],
        note: 'Ravi went home after dinner.',
      },
      { description: 'Dolphin trip', paidBy: 'Meera', amount: 3600, category: 'tickets', daysAgo: 3 },
      { description: 'Spice plantation tour', paidBy: 'Ravi', amount: 5800, category: 'tickets', daysAgo: 3 },
      {
        description: 'Anjuna flea market', paidBy: 'Priya', amount: 3700,
        category: 'shopping', daysAgo: 2, between: ['Arjun', 'Meera', 'Priya'],
      },
      { description: 'Airport taxi', paidBy: 'Meera', amount: 3600, category: 'travel', daysAgo: 1 },
    ],
  },

  {
    id: 'flat',
    title: 'A shared flat',
    emoji: '🏠',
    blurb: 'Three flatmates. Rent split unevenly because one room is bigger, and bills that come every month.',
    shows: 'Shares · recurring bills',
    cast: ['Arjun', 'Dev', 'Tara'],
    perspectives: [
      { name: 'Dev', hint: 'Small room, pays the least, chases everyone' },
      { name: 'Arjun', hint: 'Big room, pays double, fronts the rent' },
      { name: 'Tara', hint: 'Pays the utilities' },
    ],
    expenses: [
      {
        description: 'Rent · this month', paidBy: 'Arjun', amount: 66000, category: 'stay', daysAgo: 12,
        splitMode: 'shares', weights: { Arjun: 2, Dev: 1, Tara: 1 },
        note: 'Arjun has the big room.',
      },
      { description: 'Wifi + electricity', paidBy: 'Tara', amount: 4270, category: 'utilities', daysAgo: 9 },
      { description: 'Weekly groceries', paidBy: 'Dev', amount: 3155, category: 'groceries', daysAgo: 4 },
      { description: 'Gas cylinder', paidBy: 'Tara', amount: 1150, category: 'utilities', daysAgo: 2 },
      { description: 'Deep clean', paidBy: 'Arjun', amount: 2400, category: 'other', daysAgo: 1 },
    ],
  },

  {
    id: 'tokyo',
    title: 'Tokyo, in yen',
    emoji: '🗼',
    blurb: 'Four people abroad, paying in yen, settling in rupees. Every rate is fixed at the moment it was spent.',
    shows: 'Multi-currency · fixed rates',
    cast: ['Arjun', 'Meera', 'Sam', 'Nikhil'],
    perspectives: [
      { name: 'Nikhil', hint: 'Paid for almost nothing, owes the most' },
      { name: 'Arjun', hint: 'Fronted the hotel in yen' },
      { name: 'Meera', hint: 'Booked the flights in rupees' },
    ],
    expenses: [
      { description: 'Flights', paidBy: 'Meera', amount: 148000, category: 'travel', daysAgo: 20 },
      {
        description: 'Shinjuku hotel · 4 nights', paidBy: 'Arjun', amount: 172000,
        category: 'stay', daysAgo: 8, currency: 'JPY', rate: 0.58,
      },
      {
        description: 'JR passes', paidBy: 'Sam', amount: 200000,
        category: 'travel', daysAgo: 8, currency: 'JPY', rate: 0.58,
      },
      {
        description: 'Omakase, Ginza', paidBy: 'Arjun', amount: 96000,
        category: 'food', daysAgo: 6, currency: 'JPY', rate: 0.58,
        between: ['Arjun', 'Meera', 'Sam'], note: 'Nikhil doesn’t eat fish.',
      },
      {
        description: 'teamLab tickets', paidBy: 'Nikhil', amount: 16800,
        category: 'tickets', daysAgo: 5, currency: 'JPY', rate: 0.58,
      },
      {
        description: 'Izakaya, Shibuya', paidBy: 'Sam', amount: 38400,
        category: 'drinks', daysAgo: 4, currency: 'JPY', rate: 0.59,
      },
    ],
  },

  {
    id: 'settled',
    title: 'Nearly square',
    emoji: '✅',
    blurb: 'A small trip that’s mostly paid off. One payment left, and a bill somebody still disputes.',
    shows: 'Settling up · the last mile',
    cast: ['Arjun', 'Meera', 'Sam'],
    perspectives: [
      { name: 'Sam', hint: 'Owes the last payment' },
      { name: 'Meera', hint: 'Already paid up' },
      { name: 'Arjun', hint: 'Waiting on one person' },
    ],
    expenses: [
      { description: 'Volvo tickets', paidBy: 'Sam', amount: 7200, category: 'travel', daysAgo: 30 },
      { description: 'Old Manali homestay', paidBy: 'Meera', amount: 12600, category: 'stay', daysAgo: 29 },
      {
        description: 'Café dinner', paidBy: 'Arjun', amount: 3450, category: 'food', daysAgo: 28,
        splitMode: 'items',
        items: [
          { label: 'Trout, grilled', amount: 780 },
          { label: 'Momos ×2', amount: 320 },
          { label: 'Thukpa', amount: 260 },
          { label: 'Beers ×4', amount: 760 },
          { label: 'Apple pie', amount: 240 },
        ],
        tax: 172.5, tip: 200,
      },
    ],
    settlements: [
      { from: 'Arjun', to: 'Meera', amount: 4200 },
    ],
  },
]

export const scenarioById = (id: string) => SCENARIOS.find((s) => s.id === id)

/** Where the guest's last choice is remembered, so the app can name it back. */
export const GUEST_CHOICE_KEY = 'tabby-guest-scenario'

export interface GuestChoice { scenarioId: string; you: string; groupId: Id }

export function rememberChoice(choice: GuestChoice) {
  try { localStorage.setItem(GUEST_CHOICE_KEY, JSON.stringify(choice)) } catch { /* private mode */ }
}

export function recallChoice(): GuestChoice | null {
  try {
    const raw = localStorage.getItem(GUEST_CHOICE_KEY)
    return raw ? (JSON.parse(raw) as GuestChoice) : null
  } catch {
    return null
  }
}

export function forgetChoice() {
  try { localStorage.removeItem(GUEST_CHOICE_KEY) } catch { /* private mode */ }
}

export const minor = (n: number) => toMinor(n)
