import React, { useRef } from 'react';
import '../styles/segmented-control.css';

// Two choices flip on every click; longer lists select the clicked answer.
// allowDeselect preserves optional answers.
export default function SegmentedControl({
  options, value, onChange, label, variant = 'default', disabled = false, allowDeselect = false, iconOnly = false, size = 'default',
}) {
  const buttons = useRef([]);
  const binary = options.length === 2 && !allowDeselect;
  const selected = options.findIndex(option => option.value === value);
  const focusIndex = selected >= 0 && !options[selected].disabled
    ? selected : options.findIndex(option => !option.disabled);

  function handleClick(index) {
    if (disabled || buttons.current[index]?.matches(':disabled')) return;
    const next = binary && selected >= 0 ? 1 - selected : index;
    if (options[next].disabled) return;
    onChange(allowDeselect && next === selected ? null : options[next].value);
  }

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
    <div className={'segmented-control segmented-control--' + variant + (size === 'small' ? ' segmented-control--small' : '')}
      role="radiogroup" aria-label={label} aria-disabled={disabled || undefined}
      onClick={event => {
        if (binary && event.target === event.currentTarget) handleClick(Math.max(0, selected));
      }}
      data-status={variant === 'status' ? options[selected]?.status : undefined}
      style={{ '--segment-count': options.length, '--segment-index': Math.max(0, selected) }}>
      <span className="segmented-control__track" aria-hidden="true" hidden={selected < 0}>
        <span className="segmented-control__indicator" />
      </span>
      {options.map((option, index) => (
        <button key={option.value} ref={node => { buttons.current[index] = node; }}
          type="button" className="segmented-control__option" role="radio"
          aria-label={iconOnly ? option.label : undefined}
          title={iconOnly ? option.label : undefined}
          aria-checked={index === selected} disabled={disabled || option.disabled}
          tabIndex={index === focusIndex && !disabled ? 0 : -1}
          onKeyDown={event => handleKeyDown(event, index)}
          onClick={() => handleClick(index)}>
          {option.icon && <span className="segmented-control__icon" aria-hidden="true">{option.icon}</span>}
          {!iconOnly && option.label}
        </button>
      ))}
    </div>
  );
}
