// src/components/HoursPerMeetingSelect/HoursPerMeetingSelect.jsx
import React, { useState, useEffect, useRef } from 'react';

export const PRESET_HOURS = [
  { value: 1, label: '1.0 Hour' },
  { value: 1.5, label: '1.5 Hours' },
  { value: 2, label: '2.0 Hours' },
  { value: 2.5, label: '2.5 Hours' },
  { value: 3, label: '3.0 Hours' },
  { value: 3.5, label: '3.5 Hours' },
  { value: 4, label: '4.0 Hours' },
  { value: 5, label: '5.0 Hours' },
];

/**
 * Clean, customizable Hours per Meeting selector.
 * - In standard preset mode: Renders a native select matching the modal theme.
 * - In custom mode: The select displays "Custom..." alongside a clean number input for entering exact hours.
 * - Zero layout shifts: If label is omitted, returns the control directly without unnecessary wrapper divs.
 */
const HoursPerMeetingSelect = ({
  value = 1.5,
  onChange,
  label,
  labelClassName = '',
  selectClassName = '',
  inputClassName = '',
  containerStyle = {},
  style = {},
}) => {
  const numValue = Number(value) || 1.5;
  const isStandardPreset = PRESET_HOURS.some((p) => p.value === numValue);

  const [isCustom, setIsCustom] = useState(!isStandardPreset);
  const [customInputVal, setCustomInputVal] = useState(numValue.toString());
  const inputRef = useRef(null);

  // Sync external changes (e.g., when switching active subject)
  useEffect(() => {
    const isPreset = PRESET_HOURS.some((p) => p.value === Number(value));
    if (!isPreset && value !== undefined && value !== null && value !== '') {
      setIsCustom(true);
      setCustomInputVal(value.toString());
    } else {
      setIsCustom(false);
      setCustomInputVal((Number(value) || 1.5).toString());
    }
  }, [value]);

  const handleSelectChange = (e) => {
    const val = e.target.value;
    if (val === 'custom') {
      setIsCustom(true);
      const nextVal = customInputVal || (Number(value) || 1.5).toString();
      setCustomInputVal(nextVal);
      if (onChange) {
        const parsed = parseFloat(nextVal);
        if (!isNaN(parsed)) onChange(parsed);
      }
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          inputRef.current.select();
        }
      }, 50);
    } else {
      setIsCustom(false);
      const parsed = Number(val);
      setCustomInputVal(parsed.toString());
      if (onChange) onChange(parsed);
    }
  };

  const handleCustomInputChange = (e) => {
    const raw = e.target.value;
    setCustomInputVal(raw);
    if (raw === '') {
      if (onChange) onChange('');
    } else {
      const parsed = parseFloat(raw);
      if (!isNaN(parsed) && onChange) {
        onChange(parsed);
      }
    }
  };

  const control = !isCustom ? (
    <select
      className={selectClassName}
      value={numValue}
      onChange={handleSelectChange}
      style={{ width: '100%', ...style }}
    >
      {PRESET_HOURS.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
      <option value="custom">Custom...</option>
    </select>
  ) : (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        width: '100%',
        ...style,
      }}
    >
      <select
        className={selectClassName}
        value="custom"
        onChange={handleSelectChange}
        style={{ flex: 1, minWidth: 0 }}
      >
        {PRESET_HOURS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
        <option value="custom">Custom...</option>
      </select>

      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          flexShrink: 0,
        }}
      >
        <input
          ref={inputRef}
          type="number"
          step="0.25"
          min="0.25"
          max="12"
          placeholder="Hrs"
          value={customInputVal}
          onChange={handleCustomInputChange}
          className={inputClassName}
          style={{
            width: '68px',
            textAlign: 'center',
            paddingLeft: '4px',
            paddingRight: '4px',
          }}
        />
        <span
          style={{
            fontSize: '0.82rem',
            fontWeight: 600,
            color: 'var(--text-muted, #64748b)',
            userSelect: 'none',
          }}
        >
          hrs
        </span>
      </div>
    </div>
  );

  if (!label) {
    return control;
  }

  return (
    <div
      className="hours-per-meeting-container"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        width: '100%',
        ...containerStyle,
      }}
    >
      <label className={labelClassName}>{label}</label>
      {control}
    </div>
  );
};

export default HoursPerMeetingSelect;
