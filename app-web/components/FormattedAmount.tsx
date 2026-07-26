interface FormattedAmountProps {
  /** Numeric value to display */
  value: number;
  /** Text prepended before the number — e.g. "$" or "PLN " */
  prefix?: string;
  /** Number of decimal places (default: 2) */
  fractionDigits?: number;
}

/**
 * Renders a monetary amount where the fractional part (".XX") is displayed
 * at half the current font size and in the secondary text color.
 *
 * Designed to be embedded inside any element that sets font-size — the
 * fractional span uses `font-size: 0.5em` so it scales automatically.
 *
 * @example
 * // Inside a .home-metric-amount paragraph:
 * <FormattedAmount prefix="$" value={37.37} />
 * // → $37<span class="amount-fraction">.37</span>
 */
export function FormattedAmount({
  value,
  prefix = "",
  fractionDigits = 2,
}: FormattedAmountProps): JSX.Element {
  const formatted = value.toLocaleString("en", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
  const dotIndex = formatted.indexOf(".");
  if (dotIndex === -1) {
    return <>{prefix}{formatted}</>;
  }
  const whole = formatted.slice(0, dotIndex);
  const frac = formatted.slice(dotIndex); // includes "."
  return (
    <>{prefix}{whole}<span className="amount-fraction">{frac}</span></>
  );
}
