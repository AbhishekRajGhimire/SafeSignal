'use client'

export interface Choice<T extends string> {
  value: T
  label: string
}

export function ChoiceList<T extends string>({
  legend,
  choices,
  selected,
  onSelect,
}: {
  legend: string
  choices: Choice<T>[]
  selected: T
  onSelect: (value: T) => void
}) {
  return (
    <fieldset style={{ border: 0, margin: 0, padding: 0 }}>
      <legend style={{ fontWeight: 700, marginBottom: 'var(--space-2)' }}>{legend}</legend>
      {choices.map((choice) => (
        <label
          key={choice.value}
          className={`choice${selected === choice.value ? ' choice--selected' : ''}`}
        >
          <input
            type="radio"
            name={legend}
            value={choice.value}
            checked={selected === choice.value}
            onChange={() => onSelect(choice.value)}
          />
          <span>{choice.label}</span>
        </label>
      ))}
    </fieldset>
  )
}
