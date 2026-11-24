import React, { useRef } from 'react';
import '../styles/segmented-control.css';

// Controlled single-choice input. allowDeselect preserves optional answers.
export default function SegmentedControl({
  options, value, onChange, label, variant = 'default', disabled = false, allowDeselect = false,
}) {
  const buttons = useRef([]);
  const selected = options.findIndex(option => option.value === value);
  const focusIndex = selected >= 0 && !options[selected].disabled
    ? selected : options.findIndex(option => !option.disabled);

  function handleKeyDown(event, index) {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const enabled = options.map((_, i) => i).filter(i => !buttons.current[i]?.matches(':disabled'));
    if (!enabled.length) return;
    const current = enabled.indexOf(index);
    const direction = ['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : -1;
    const next = event.key === 'Home' ? enabled[0] : event.key === 'End' ? enabled.at(-1)
      : enabled[(current + direction + enabled.length) % enabled.length];
    buttons.current[next]?.focus();
    if (options[next].value !== value) onChange(options[next].value);
  }

  return (
    <div className={'segmented-control segmented-control--' + variant}
      role="radiogroup" aria-label={label} aria-disabled={disabled || undefined}
      data-status={variant === 'status' ? options[selected]?.status : undefined}
      style={{ '--segment-count': options.length, '--segment-index': Math.max(0, selected) }}>
      <span className="segmented-control__track" aria-hidden="true" hidden={selected < 0}>
        <span className="segmented-control__indicator" />
      </span>
      {options.map((option, index) => (
        <button key={option.value} ref={node => { buttons.current[index] = node; }}
          type="button" className="segmented-control__option" role="radio"
          aria-checked={index === selected} disabled={disabled || option.disabled}
          tabIndex={index === focusIndex && !disabled ? 0 : -1}
          onKeyDown={event => handleKeyDown(event, index)}
          onClick={() => onChange(allowDeselect && index === selected ? null : option.value)}>
          {option.icon && <span className="segmented-control__icon" aria-hidden="true">{option.icon}</span>}
          {option.label}
        </button>
      ))}
    </div>
  );
}
