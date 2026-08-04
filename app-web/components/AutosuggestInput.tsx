import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { X, ChevronDown } from "lucide-react";

interface AutosuggestInputProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
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
}

export function AutosuggestInput({
  id,
  value,
  onChange,
  allSuggestions,
  minChars = 2,
  placeholder,
  className = "input",
  multiLine = false,
  clearable = false,
  showChevron = false,
  required,
  invalid,
}: AutosuggestInputProps): JSX.Element {
  const uid = useId();
  const instanceId = id ?? uid;
  const listboxId = `autosuggest-lb-${instanceId}`;

  const [isOpen, setIsOpen] = useState(false);
  const [forceOpen, setForceOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

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
    const lower = value.toLowerCase();
    const textFiltered = allSuggestions.filter((s) => s.toLowerCase().includes(lower));
    if (forceOpen) return textFiltered;
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
      setIsOpen(true);
    },
    onFocus: () => {
      if (value.length >= minChars) setIsOpen(true);
    },
    onKeyDown: handleKeyDown,
  };

  return (
    <div className="autosuggest-wrapper" ref={wrapperRef}>
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
  );
}
