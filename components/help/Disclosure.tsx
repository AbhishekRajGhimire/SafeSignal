'use client'

/**
 * Progressive disclosure, styled.
 *
 * Native details and summary, so keyboard and screen-reader behaviour come
 * from the platform rather than from anything reimplemented here. Only the
 * marker is replaced; the summary stays a full-width target at the minimum
 * tap size.
 */
export function Disclosure({
  title,
  children,
  open = false,
}: {
  title: string
  children: React.ReactNode
  open?: boolean
}) {
  return (
    <details className="disclosure" open={open}>
      <summary className="disclosure__summary">
        <span className="disclosure__title">{title}</span>
        <span className="disclosure__chevron" aria-hidden="true">›</span>
      </summary>
      <div className="disclosure__body">{children}</div>
    </details>
  )
}
