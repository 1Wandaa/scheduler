// src/components/HoursPerMeetingSelect/HoursPerMeetingSelect.jsx
import React, { useState, useRef, useEffect } from 'react';

const PRESET_HOURS = [
  { value: 1, label: '1.0 Hour' },
  { value: 1.5, label: '1.5 Hours' },
  { value: 2, label: '2.0 Hours' },
  { value: 2.5, label: '2.5 Hours' },
  { value: 3, label: '3.0 Hours' },
  { value: 3.5, label: '3.5 Hours' },
  { value: 4, label: '4.0 Hours' },
  { value: 5, label: '5.0 Hours' },
  { value: 6, label: '6.0 Hours' },
];

const isPresetHour = (v) => PRESET_HOURS.some((p) => p.value === Number(v));

/**
 * Clean, customizable Hours per Meeting selector.
 * - In standard preset mode: Renders a native select matching the modal theme.
 * - In custom mode: The select displays "Custom..." alongside a clean number input for entering exact hours.
 * - Zero layout shifts: If label is omitted, returns the control directly without unnecessary wrapper divs or duplicate labels.
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
  const isStandardPreset = isPresetHour(numValue);

  const [isCustom, setIsCustom] = useState(!isStandardPreset);
  const [customInputVal, setCustomInputVal] = useState(numValue.toString());
  const inputRef = useRef(null);
  const lastEmittedValueRef = useRef(null);
  const prevValueRef = useRef(value);

  // Sync external changes (e.g., when switching active subject or resetting)
  useEffect(() => {
    if (value !== prevValueRef.current) {
      prevValueRef.current = value;

      // If value change originated from user typing in custom mode, do NOT reset custom mode
      if (
        lastEmittedValueRef.current !== null &&
        (Number(value) === Number(lastEmittedValueRef.current) || String(value) === String(lastEmittedValueRef.current))
      ) {
        return;
      }

      // External update: check whether it's preset or custom
      const isPreset = isPresetHour(value);
      if (!isPreset && value !== undefined && value !== null && value !== '') {
        setIsCustom(true);
        setCustomInputVal(value.toString());
      } else if (isPreset) {
        setIsCustom(false);
        setCustomInputVal((Number(value) || 1.5).toString());
      }
    }
  }, [value]);

  const handleSelectChange = (e) => {
    const val = e.target.value;
    if (val === 'custom') {
      setIsCustom(true);
      const nextVal = customInputVal || (Number(value) || 1.5).toString();
      setCustomInputVal(nextVal);
      const parsed = parseFloat(nextVal);
      if (!isNaN(parsed)) {
        lastEmittedValueRef.current = parsed;
        if (onChange) onChange(parsed);
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
      lastEmittedValueRef.current = parsed;
      if (onChange) onChange(parsed);
    }
  };

  const handleCustomInputChange = (e) => {
    const raw = e.target.value;
    setCustomInputVal(raw);
    if (raw === '') {
      lastEmittedValueRef.current = '';
      if (onChange) onChange('');
    } else {
      const parsed = parseFloat(raw);
      if (!isNaN(parsed)) {
        lastEmittedValueRef.current = parsed;
        if (onChange) {
          onChange(parsed);
        }
      }
    }
  };

  const handleCustomInputBlur = () => {
    const parsed = parseFloat(customInputVal);
    if (isNaN(parsed) || parsed <= 0) {
      const fallback = 1.5;
      setCustomInputVal(fallback.toString());
      lastEmittedValueRef.current = fallback;
      if (onChange) onChange(fallback);
    }
  };

  const control = !isCustom ? (
    <select
      className={selectClassName}
      value={numValue}
      onChange={handleSelectChange}
      style={{ width: '100%', boxSizing: 'border-box', ...style }}
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
        boxSizing: 'border-box',
        ...style,
      }}
    >
      <select
        className={selectClassName}
        value="custom"
        onChange={handleSelectChange}
        style={{ flex: 1, minWidth: 0, boxSizing: 'border-box' }}
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
          onBlur={handleCustomInputBlur}
          className={inputClassName}
          style={{
            width: '64px',
            textAlign: 'center',
            paddingLeft: '4px',
            paddingRight: '4px',
            boxSizing: 'border-box',
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
        boxSizing: 'border-box',
        ...containerStyle,
      }}
    >
      <label className={labelClassName}>{label}</label>
      {control}
    </div>
  );
};

export default HoursPerMeetingSelect;
