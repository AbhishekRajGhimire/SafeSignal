'use client'

import { useId } from 'react'

export interface Option<T extends string> {
  value: T
  label: string
  /** Secondary line, e.g. what "Another language" actually does. */
  note?: string
}

interface BaseProps<T extends string> {
  /** Visible legend. Omit when `labelledBy` points at a heading instead. */
  legend?: string
  /** Id of a heading that already states the question, to avoid announcing it twice. */
  labelledBy?: string
  help?: string
  options: Option<T>[]
  name: string
}

interface SingleProps<T extends string> extends BaseProps<T> {
  mode: 'single'
  selected: T
  onChange: (value: T) => void
}

interface MultiProps<T extends string> extends BaseProps<T> {
  mode: 'multi'
  selected: readonly T[]
  onChange: (value: T[]) => void
  /** Selecting this clears everything else, and vice versa. */
  noneOption?: Option<T>
}

type Props<T extends string> = SingleProps<T> | MultiProps<T>

/**
 * One question, rendered as native radios or checkboxes.
 *
 * The inputs are visually replaced by a mark, never removed: they stay in the
 * accessibility tree and keep native keyboard behaviour (arrow keys within a
 * radio group, space to toggle a checkbox). Selection is signalled by a check
 * glyph, a heavier border, and a background change, so colour is never the
 * only carrier of state.
 */
export function OptionGroup<T extends string>(props: Props<T>) {
  const helpId = useId()
  const { legend, labelledBy, help, options, name, mode } = props

  const isMulti = mode === 'multi'
  const noneValue = isMulti ? props.noneOption?.value : undefined
  const selectedList = isMulti ? props.selected : []
  const noneSelected = isMulti && selectedList.length === 0

  const isChecked = (value: T): boolean => {
    if (!isMulti) return props.selected === value
    if (value === noneValue) return noneSelected
    return selectedList.includes(value)
  }

  const toggle = (value: T): void => {
    if (!isMulti) {
      props.onChange(value)
      return
    }
    if (value === noneValue) {
      // Clicking a checked "none" is a no-op, and correctly so: "none of
      // these" and "nothing selected" are the same state, so there is no
      // second state to toggle into.
      props.onChange([])
      return
    }
    const next = selectedList.includes(value)
      ? selectedList.filter((v) => v !== value)
      : [...selectedList, value]
    props.onChange(next)
  }

  const rendered = isMulti && props.noneOption ? [...options, props.noneOption] : options

  return (
    <fieldset
      style={{ border: 0, margin: 0, padding: 0 }}
      aria-labelledby={labelledBy}
      aria-describedby={help ? helpId : undefined}
    >
      {legend && (
        <legend
          style={{
            fontSize: 'var(--text-xl)',
            fontWeight: 700,
            lineHeight: 1.25,
            marginBottom: 'var(--space-2)',
          }}
        >
          {legend}
        </legend>
      )}

      {help && (
        <p id={helpId} className="question__help" style={{ marginBottom: 'var(--space-3)' }}>
          {help}
        </p>
      )}

      <div className="options">
        {rendered.map((option) => {
          const checked = isChecked(option.value)
          return (
            <label
              key={option.value}
              className={`option${checked ? ' option--selected' : ''}`}
            >
              <input
                className="option__input"
                type={isMulti ? 'checkbox' : 'radio'}
                name={name}
                value={option.value}
                checked={checked}
                onChange={() => toggle(option.value)}
              />
              <span
                className={`option__mark option__mark--${isMulti ? 'multi' : 'single'}`}
                aria-hidden="true"
              >
                {checked ? '✓' : ''}
              </span>
              <span className="option__label">
                {option.label}
                {option.note && <span className="option__note">{option.note}</span>}
              </span>
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}
