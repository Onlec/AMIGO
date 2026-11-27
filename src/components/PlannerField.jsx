import React, { useState } from 'react';
import { t } from '../i18n/index.js';
export default function PlannerField({ id, label, value, onChange, error, help, multiline = false, ...props }) {
  const [focused, setFocused] = useState(false);
  const Input = multiline ? 'textarea' : 'input';
  return <label className="planner-field" htmlFor={id}>
    <span className="field-caption">{label}</span>
    <Input id={id} value={value} onChange={onChange} {...props} aria-invalid={Boolean(error) || undefined}
      aria-describedby={error || (focused && help) ? id + '-help' : undefined}
      onFocus={() => setFocused(true)} onBlur={event => { setFocused(false); props.onBlur?.(event); }} />
    {(error || (focused && help)) && <span id={id + '-help'} className={'field-help' + (error ? ' error' : '')} role={error ? 'alert' : undefined}>{t(error || help)}</span>}
  </label>;
}
