import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

export function SetupStructureGuide(): JSX.Element {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className="setup-structure-guide-toggle"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? <ChevronUp size={14} aria-hidden /> : <ChevronDown size={14} aria-hidden />}
        What structure does my sheet need?
      </button>
      {open ? (
        <div className="setup-structure-guide">
          <p className="setup-structure-guide-intro">Your sheet’s <strong>Expenses</strong> tab must have a header row in this order:</p>
          <ol className="setup-structure-guide-list">
            <li><strong>Date</strong> — mandatory</li>
            <li><strong>Currency columns</strong> (e.g. EUR, PLN) — optional, any number</li>
            <li><strong>USD</strong> — mandatory</li>
            <li><strong>Category</strong> — mandatory</li>
            <li><strong>Spent By</strong> — mandatory, hidable</li>
            <li><strong>Spent For</strong> — mandatory, hidable</li>
            <li><strong>Comment</strong> — mandatory</li>
            <li><strong>Custom columns</strong> (any names) — optional, after Comment</li>
          </ol>
          <p className="setup-structure-guide-note">If the <strong>Expenses</strong> tab doesn’t exist, QuickExpense will create it with a default structure.</p>
          <br/>
          <p className="setup-structure-guide-note">QuickExpense only reads and writes the <strong>Expenses</strong> tab. Other sheets in your workbook are never accessed or modified.</p>
        </div>
      ) : null}
    </>
  );
}
