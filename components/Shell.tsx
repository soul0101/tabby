'use client'
import Link from 'next/link'

export function Shell({
  children, back, title, action, wide = false,
}: {
  children: React.ReactNode
  back?: { href: string; label: string }
  title?: React.ReactNode
  action?: React.ReactNode
  wide?: boolean
}) {
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-line bg-canvas/85 backdrop-blur-md">
        <div className={`mx-auto flex h-14 items-center gap-3 px-4 sm:px-6 ${wide ? 'max-w-5xl' : 'max-w-3xl'}`}>
          {back ? (
            <Link
              href={back.href}
              className="-ml-2 inline-flex h-9 items-center gap-1.5 rounded-[10px] px-2 text-[14px] font-medium text-ink-2 transition-colors hover:bg-sunken hover:text-ink"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M10 12.5 5.5 8 10 3.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {back.label}
            </Link>
          ) : (
            <Link href="/" className="font-display text-[19px] font-bold tracking-[-0.03em]">
              Tabby
            </Link>
          )}
          <div className="min-w-0 flex-1">{title}</div>
          {action}
        </div>
      </header>
      <main id="main" className={`mx-auto px-4 pb-24 pt-6 sm:px-6 ${wide ? 'max-w-5xl' : 'max-w-3xl'}`}>
        {children}
      </main>
    </div>
  )
}
