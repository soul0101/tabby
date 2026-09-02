'use client'

/**
 * The bottom action bar on a form page.
 *
 * A page can't borrow a modal's footer, and burying Save at the end of a long
 * scroll is worse than either — so it pins, and gets out of the way of the
 * home indicator.
 */
export function ActionBar({ children, error }: { children: React.ReactNode; error?: string | null }) {
  return (
    <div
      className="sticky bottom-0 z-20 -mx-4 mt-6 border-t border-line bg-canvas/95 px-4 pt-3 backdrop-blur sm:-mx-6 sm:px-6"
      style={{ paddingBottom: 'max(0.875rem, env(safe-area-inset-bottom))' }}
    >
      {error && <p role="alert" className="mb-2 text-[13.5px] font-medium text-negative">{error}</p>}
      <div className="flex gap-2.5">{children}</div>
    </div>
  )
}
