import { useEffect, useId, useMemo, useRef, useState } from "react";

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
}

export function AutosuggestInput({
  id,
  value,
  onChange,
  allSuggestions,
  minChars = 2,
  placeholder,
  className = "input",
}: AutosuggestInputProps): JSX.Element {
  const uid = useId();
  const instanceId = id ?? uid;
  const listboxId = `autosuggest-lb-${instanceId}`;

  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const filteredSuggestions = useMemo(() => {
    if (value.length < minChars) return [];
    const lower = value.toLowerCase();
    return allSuggestions.filter((s) => s.toLowerCase().includes(lower));
  }, [value, allSuggestions, minChars]);

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
      }
    };
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [isOpen]);

  const select = (suggestion: string): void => {
    onChange(suggestion);
    setIsOpen(false);
    setActiveIndex(-1);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (!shouldShow) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, filteredSuggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault();
      select(filteredSuggestions[activeIndex]);
    } else if (e.key === "Escape") {
      setIsOpen(false);
      setActiveIndex(-1);
    }
  };

  return (
    <div className="autosuggest-wrapper" ref={wrapperRef}>
      <input
        id={instanceId}
        className={className}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setIsOpen(true);
        }}
        onFocus={() => {
          if (value.length >= minChars) setIsOpen(true);
        }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        role="combobox"
        aria-expanded={shouldShow}
        aria-haspopup="listbox"
        aria-controls={listboxId}
        aria-activedescendant={
          activeIndex >= 0 ? `autosuggest-opt-${instanceId}-${activeIndex}` : undefined
        }
        autoComplete="off"
      />
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
