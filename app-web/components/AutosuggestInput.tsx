import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { X, ChevronDown, Pin } from "lucide-react";
import { FieldDefaultSettings } from "../types/expense";

interface AutosuggestInputProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  /** Fired only when a suggestion is picked (click or Enter on a highlighted option), not on free typing. */
  onSelect?: (value: string) => void;
  /** Pre-sorted, deduplicated suggestion list. Filtering is done inside the component. */
  allSuggestions: string[];
  /** Minimum number of typed characters before the dropdown appears. Default: 2. */
  minChars?: number;
  placeholder?: string;
  className?: string;
  /** When true, renders a auto-growing textarea instead of a single-line input. */
  multiLine?: boolean;
  clearable?: boolean;
  showChevron?: boolean;
  required?: boolean;
  invalid?: boolean;
  "aria-label"?: string;
  label?: string;
  defaultSettings?: FieldDefaultSettings;
}

export function AutosuggestInput({
  id,
  value,
  onChange,
  onSelect,
  allSuggestions,
  minChars = 2,
  placeholder,
  className = "input",
  multiLine = false,
  clearable = false,
  showChevron = false,
  required,
  invalid,
  "aria-label": ariaLabel,
  label,
  defaultSettings,
}: AutosuggestInputProps): JSX.Element {
  const uid = useId();
  const instanceId = id ?? uid;
  const listboxId = `autosuggest-lb-${instanceId}`;

  const [isOpen, setIsOpen] = useState(false);
  const [forceOpen, setForceOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const pinRef = useRef<HTMLButtonElement>(null);
  const [isDefaultOpen, setIsDefaultOpen] = useState(false);
  const [defaultError, setDefaultError] = useState<string | null>(null);
  const [isDefaultSaving, setIsDefaultSaving] = useState(false);
  const hasDefault = defaultSettings?.savedValue !== undefined;
  const defaultCaption = hasDefault ? `View default value for ${defaultSettings?.field}` : "Set this value as Default for this field";

  useEffect(() => {
    if (!isDefaultOpen) return;
    wrapperRef.current?.querySelector<HTMLElement>('[role="dialog"] input, [role="dialog"] button')?.focus();
    const dismiss = (event: MouseEvent): void => {
      if (!wrapperRef.current?.contains(event.target as Node)) setIsDefaultOpen(false);
    };
    document.addEventListener("mousedown", dismiss);
    return () => document.removeEventListener("mousedown", dismiss);
  }, [isDefaultOpen]);

  async function saveDefault(nextValue: string | null): Promise<void> {
    if (!defaultSettings) return;
    setIsDefaultSaving(true);
    setDefaultError(null);
    try {
      await defaultSettings.save(defaultSettings.field, nextValue);
      setIsDefaultOpen(false);
      pinRef.current?.focus();
    } catch (error) {
      setDefaultError((error as Error).message);
    } finally {
      setIsDefaultSaving(false);
    }
  }

  const adjustHeight = useCallback(() => {
    const el = fieldRef.current as HTMLTextAreaElement | null;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  useEffect(() => {
    if (multiLine) adjustHeight();
  }, [multiLine, value, adjustHeight]);

  const filteredSuggestions = useMemo(() => {
    if (forceOpen) return allSuggestions;
    const lower = value.toLowerCase();
    const textFiltered = allSuggestions.filter((s) => s.toLowerCase().includes(lower));
    if (value.length < minChars) return [];
    return textFiltered;
  }, [value, allSuggestions, minChars, forceOpen]);

  const shouldShow = isOpen && filteredSuggestions.length > 0;

  // Reset active index whenever the filtered list changes
  useEffect(() => {
    setActiveIndex(-1);
  }, [filteredSuggestions]);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handleMouseDown = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setForceOpen(false);
      }
    };
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [isOpen]);

  const select = (suggestion: string): void => {
    onChange(suggestion);
    onSelect?.(suggestion);
    setIsOpen(false);
    setForceOpen(false);
    setActiveIndex(-1);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLElement>): void => {
    if (!shouldShow) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, filteredSuggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && !e.shiftKey && activeIndex >= 0) {
      e.preventDefault();
      select(filteredSuggestions[activeIndex]);
    } else if (e.key === "Enter" && !e.shiftKey) {
      // Accept the free-typed text as-is and dismiss the dropdown.
      e.preventDefault();
      setIsOpen(false);
      setForceOpen(false);
    } else if (e.key === "Escape") {
      setIsOpen(false);
      setForceOpen(false);
      setActiveIndex(-1);
    }
  };

  const showClearBtn = clearable && value.length > 0;
  const actionCount = (showClearBtn ? 1 : 0) + (showChevron ? 1 : 0);
  const paddingRight = actionCount === 2 ? "3rem" : actionCount === 1 ? "1.75rem" : undefined;

  const sharedProps = {
    id: instanceId,
    value,
    placeholder,
    role: "combobox" as const,
    "aria-label": ariaLabel,
    "aria-expanded": shouldShow,
    "aria-haspopup": "listbox" as const,
    "aria-controls": listboxId,
    "aria-activedescendant":
      activeIndex >= 0 ? `autosuggest-opt-${instanceId}-${activeIndex}` : undefined,
    autoComplete: "off" as const,
    required,
    "data-invalid": invalid ? "true" : undefined,
    style: paddingRight ? { paddingRight } : undefined,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      onChange(e.target.value);
      setForceOpen(false);
      setIsOpen(true);
    },
    onFocus: () => {
      if (value.length >= minChars) setIsOpen(true);
    },
    onKeyDown: handleKeyDown,
  };

  return (
    <div className={defaultSettings ? "field-default" : "autosuggest-wrapper"} ref={wrapperRef}
      onKeyDown={(event) => {
        if (event.key === "Escape" && isDefaultOpen) { event.stopPropagation(); setIsDefaultOpen(false); pinRef.current?.focus(); }
      }}>
      {defaultSettings ? (
        <div className="field-default-heading">
          <label className="input-label" htmlFor={instanceId}>{label}</label>
          {(defaultSettings.canEdit || hasDefault) ? (
            <span className="field-default-pin-wrap">
              <button
                ref={pinRef}
                type="button"
                className={`btn-icon field-default-pin${hasDefault ? " field-default-pin--set" : ""}`}
                aria-label={`${defaultCaption}${hasDefault ? "" : ` (${defaultSettings.field})`}`}
                aria-pressed={hasDefault}
                aria-expanded={hasDefault ? isDefaultOpen : undefined}
                title={defaultCaption}
                disabled={isDefaultSaving || (defaultSettings.canEdit && defaultSettings.disabled) || (!hasDefault && !value.trim())}
                onClick={() => {
                  if (!hasDefault) { void saveDefault(value); return; }
                  setDefaultError(null);
                  setIsDefaultOpen((open) => !open);
                }}
              >
                <Pin size={16} fill={hasDefault ? "currentColor" : "none"} aria-hidden />
              </button>
              <span className="field-default-tooltip" role="tooltip">{defaultCaption}</span>
            </span>
          ) : null}
        </div>
      ) : label ? <div className="field-default-heading"><label className="input-label" htmlFor={instanceId}>{label}</label></div> : null}
      {isDefaultOpen && defaultSettings ? (
        <div className="field-default-menu" role="dialog" aria-label={`Default for ${defaultSettings.field}`}
          onKeyDown={(event) => {
            if (event.key === "Escape") { event.stopPropagation(); setIsDefaultOpen(false); pinRef.current?.focus(); }
          }}>
          <div className="field-default-summary">Default: <strong>{defaultSettings.savedValue}</strong></div>
          {defaultSettings.canEdit ? (
            <div className="field-default-actions">
              <button type="button" className="btn btn-secondary btn-sm" disabled={defaultSettings.disabled || isDefaultSaving || !value.trim()} onClick={() => void saveDefault(value)}>Replace default</button>
              <button type="button" className="btn btn-secondary btn-sm" disabled={defaultSettings.disabled || isDefaultSaving} onClick={() => void saveDefault(null)}>Clear default</button>
            </div>
          ) : null}
          <button type="button" className="btn-icon field-default-close" aria-label="Close default" onClick={() => { setIsDefaultOpen(false); pinRef.current?.focus(); }}><X size={16} aria-hidden /></button>
        </div>
      ) : null}
      {defaultError ? <div className="field-error" role="alert">{defaultError}</div> : null}
      <div className="autosuggest-wrapper">
      {multiLine ? (
        <textarea
          ref={fieldRef as React.RefObject<HTMLTextAreaElement>}
          className={`${className} autosuggest-textarea`}
          {...sharedProps}
          rows={1}
        />
      ) : (
        <input
          ref={fieldRef as React.RefObject<HTMLInputElement>}
          className={className}
          {...sharedProps}
        />
      )}
      {(showClearBtn || showChevron) ? (
        <div className="autosuggest-actions">
          {showClearBtn ? (
            <button
              type="button"
              className="autosuggest-action-btn"
              aria-label="Clear"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange("");
                setIsOpen(false);
                setForceOpen(false);
                setActiveIndex(-1);
                fieldRef.current?.focus();
              }}
            >
              <X size={14} aria-hidden />
            </button>
          ) : null}
          {showChevron ? (
            <button
              type="button"
              className="autosuggest-action-btn"
              aria-label="Show suggestions"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setIsOpen(true);
                setForceOpen(true);
                fieldRef.current?.focus();
              }}
            >
              <ChevronDown size={14} aria-hidden />
            </button>
          ) : null}
        </div>
      ) : null}
      {shouldShow ? (
        <ul className="autosuggest-dropdown" role="listbox" id={listboxId}>
          {filteredSuggestions.map((suggestion, i) => (
            <li
              key={suggestion}
              id={`autosuggest-opt-${instanceId}-${i}`}
              className={`autosuggest-option${i === activeIndex ? " autosuggest-option--active" : ""}`}
              role="option"
              aria-selected={i === activeIndex}
              onMouseDown={(e) => {
                e.preventDefault(); // prevent input blur before selection
                select(suggestion);
              }}
            >
              {suggestion}
            </li>
          ))}
        </ul>
      ) : null}
      </div>
    </div>
  );
}
