'use client'
import { useEffect, useRef, useState } from 'react'
import { formatMinor } from '@/lib/money'
import { deep, solid, tint } from '@/lib/palette'

// ── text ────────────────────────────────────────────────────────────────

/**
 * A small caps label. Section titles should pass `as="h2"` so the page has a
 * real heading outline rather than a wall of styled divs.
 */
export function Label({
  children, className = '', as: As = 'div', id,
}: { children: React.ReactNode; className?: string; as?: React.ElementType; id?: string }) {
  return <As id={id} className={`label ${className}`}>{children}</As>
}

/** Money. Tabular, never wrapped, sized by role. */
export function Amount({
  minor, currency = 'INR', size = 'md', tone, className = '',
}: {
  minor: number
  currency?: string
  size?: 'sm' | 'md' | 'lg' | 'hero'
  tone?: 'positive' | 'negative' | 'muted' | 'auto'
  className?: string
}) {
  const sizes = {
    sm: 'text-[13px]',
    md: 'text-[15px]',
    lg: 'text-[22px] font-display font-semibold tracking-[-0.02em]',
    hero: 'text-[44px] leading-[1.05] font-display font-bold tracking-[-0.035em]',
  }[size]
  const t = tone === 'auto' ? (minor > 0 ? 'positive' : minor < 0 ? 'negative' : 'muted') : tone
  const tones = {
    positive: 'text-positive',
    negative: 'text-negative',
    muted: 'text-ink-3',
    undefined: '',
  }[String(t) as 'positive' | 'negative' | 'muted' | 'undefined']

  return (
    <span className={`tnum whitespace-nowrap ${sizes} ${tones} ${className}`} translate="no">
      {formatMinor(minor, currency)}
    </span>
  )
}

/**
 * Money that rolls to its new value instead of snapping.
 *
 * Watching a share fall from ₹2,947 to ₹924 is how you *see* a split change;
 * a number that simply replaces itself reads as a glitch. Eases out over
 * 650ms, and respects prefers-reduced-motion by jumping straight there.
 */
export function AnimatedAmount({
  minor, currency = 'INR', size = 'md', tone, className = '',
}: {
  minor: number
  currency?: string
  size?: 'sm' | 'md' | 'lg' | 'hero'
  tone?: 'positive' | 'negative' | 'muted' | 'auto'
  className?: string
}) {
  const [shown, setShown] = useState(minor)
  const from = useRef(minor)
  const raf = useRef<number | undefined>(undefined)

  useEffect(() => {
    const start = from.current
    if (start === minor) return

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced) { from.current = minor; setShown(minor); return }

    const t0 = performance.now()
    const DURATION = 650
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / DURATION)
      // easeOutCubic — quick to move, gentle to land.
      const eased = 1 - Math.pow(1 - p, 3)
      setShown(Math.round(start + (minor - start) * eased))
      if (p < 1) raf.current = requestAnimationFrame(tick)
      else from.current = minor
    }
    raf.current = requestAnimationFrame(tick)
    return () => { if (raf.current) cancelAnimationFrame(raf.current) }
  }, [minor])

  return <Amount minor={shown} currency={currency} size={size} tone={tone} className={className} />
}

/** A short-lived "−₹2,023" badge showing what just changed. */
export function DeltaBadge({ minor, currency = 'INR' }: { minor: number; currency?: string }) {
  if (minor === 0) return null
  const up = minor > 0
  return (
    <span
      className="tnum ml-1.5 inline-flex shrink-0 items-center rounded-full px-1.5 py-px text-[11px] font-semibold"
      style={{
        animation: 'delta-in .3s cubic-bezier(.2,.9,.3,1)',
        background: up ? 'var(--color-negative-wash)' : 'var(--color-positive-wash)',
        color: up ? 'var(--color-negative)' : 'var(--color-positive)',
      }}
    >
      {up ? '+' : '−'}{formatMinor(Math.abs(minor), currency)}
    </span>
  )
}

// ── people ──────────────────────────────────────────────────────────────

export interface PersonLike { id: string; name: string; hue: number }

const initials = (name: string) =>
  name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?'

export function Avatar({
  person, size = 32, muted = false, ring = false,
}: { person: PersonLike; size?: number; muted?: boolean; ring?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className="inline-grid shrink-0 place-items-center rounded-full font-semibold transition-all duration-150"
      style={{
        width: size,
        height: size,
        fontSize: Math.max(10, size * 0.38),
        background: muted ? 'var(--color-sunken)' : tint(person.hue),
        color: muted ? 'var(--color-ink-3)' : deep(person.hue),
        boxShadow: ring ? `0 0 0 2px var(--color-surface), 0 0 0 3px ${solid(person.hue)}` : undefined,
        opacity: muted ? 0.75 : 1,
      }}
    >
      {initials(person.name)}
    </span>
  )
}

export function AvatarStack({ people, size = 26, max = 5 }: { people: PersonLike[]; size?: number; max?: number }) {
  const shown = people.slice(0, max)
  const rest = people.length - shown.length
  return (
    <span className="flex items-center" aria-label={people.map((p) => p.name).join(', ')}>
      {shown.map((p, i) => (
        <span key={p.id} style={{ marginLeft: i === 0 ? 0 : -size * 0.32 }} className="rounded-full ring-2 ring-surface">
          <Avatar person={p} size={size} />
        </span>
      ))}
      {rest > 0 && (
        <span
          className="grid place-items-center rounded-full bg-sunken text-[11px] font-semibold text-ink-2 ring-2 ring-surface"
          style={{ width: size, height: size, marginLeft: -size * 0.32 }}
        >
          +{rest}
        </span>
      )}
    </span>
  )
}

// ── the signature ───────────────────────────────────────────────────────

/**
 * The split bar. A stacked bar proportioned to each person's share, so the
 * shape of a split is legible before any number is read.
 */
export function SplitBar({
  shares, people, height = 6, currency = 'INR', className = '',
}: {
  shares: Record<string, number>
  people: PersonLike[]
  height?: number
  currency?: string
  className?: string
}) {
  const entries = people
    .map((p) => ({ person: p, value: shares[p.id] ?? 0 }))
    .filter((e) => e.value > 0)
  const total = entries.reduce((s, e) => s + e.value, 0)

  if (total <= 0) {
    return (
      <div
        className={`overflow-hidden rounded-full bg-sunken ${className}`}
        style={{ height }}
        aria-hidden="true"
      />
    )
  }

  return (
    <div
      className={`flex overflow-hidden rounded-full ${className}`}
      style={{ height }}
      role="img"
      aria-label={entries
        .map((e) => `${e.person.name} ${formatMinor(e.value, currency)}`)
        .join(', ')}
    >
      {entries.map((e) => (
        <span
          key={e.person.id}
          className="h-full transition-[width] duration-500 ease-out"
          style={{ width: `${(e.value / total) * 100}%`, background: solid(e.person.hue) }}
        />
      ))}
    </div>
  )
}

// ── controls ────────────────────────────────────────────────────────────

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  ref?: React.Ref<HTMLButtonElement>
}

export function Button({ variant = 'secondary', size = 'md', className = '', ref, ...props }: ButtonProps) {
  const variants = {
    primary: 'bg-ink text-surface hover:bg-ink/90 active:bg-ink/80 shadow-sm',
    secondary: 'bg-surface text-ink border border-line hover:border-line-2 hover:bg-canvas active:bg-sunken',
    ghost: 'text-ink-2 hover:bg-sunken hover:text-ink',
    danger: 'bg-negative-wash text-negative hover:bg-negative hover:text-surface',
  }[variant]
  const sizes = {
    sm: 'h-8 px-3 text-[13px] rounded-[9px]',
    md: 'h-10 px-4 text-[14px] rounded-[11px]',
    lg: 'h-12 px-5 text-[15px] rounded-[13px]',
  }[size]
  return (
    <button
      ref={ref}
      {...props}
      className={`inline-flex select-none items-center justify-center gap-2 font-semibold transition-[background-color,border-color,color,box-shadow,transform] duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40 ${variants} ${sizes} ${className}`}
    />
  )
}

export function Field({
  label, hint, error, children, htmlFor,
}: {
  label: string
  hint?: string
  error?: string
  children: React.ReactNode
  htmlFor?: string
}) {
  return (
    <div className="grid gap-1.5">
      <label htmlFor={htmlFor} className="text-[13px] font-semibold text-ink-2">
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-[13px] text-negative">{error}</p>
      ) : hint ? (
        <p className="text-[13px] text-ink-3">{hint}</p>
      ) : null}
    </div>
  )
}

export const inputClass =
  'h-11 w-full rounded-[11px] border border-line bg-surface px-3.5 text-[15px] placeholder:text-ink-3 ' +
  'transition-[border-color,box-shadow] duration-150 hover:border-line-2 ' +
  'focus:border-ink focus:outline-none focus:ring-2 focus:ring-ink/10'

export function Card({
  as: As = 'div', className = '', children, ...rest
}: { as?: React.ElementType; className?: string; children: React.ReactNode } & Record<string, unknown>) {
  return <As className={`card ${className}`} {...rest}>{children}</As>
}

export function EmptyState({
  title, body, action,
}: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="grid place-items-center px-6 py-14 text-center">
      <h3 className="font-display text-[19px] font-semibold">{title}</h3>
      <p className="mt-1.5 max-w-sm text-[14px] leading-relaxed text-ink-2 text-pretty">{body}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
