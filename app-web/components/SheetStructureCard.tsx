import { ReactNode } from "react";
import { Plus, TableProperties } from "lucide-react";
import { StatusBanner } from "./StatusBanner";
import { SheetStructureRow } from "./SheetStructureRow";
import { SheetStructure } from "../hooks/useSheetStructure";
import { MAX_CUSTOM_COLUMNS } from "../constants/expenses";

interface SheetStructureCardProps {
  structure: SheetStructure;
  isGuest: boolean;
  /** Rendered between the column list and the inline add forms. */
  children?: ReactNode;
}

export function SheetStructureCard({ structure, isGuest, children }: SheetStructureCardProps): JSX.Element {
  const {
    columns, currencies, customColumns, currencyDictionary, maxOptionalCurrencies,
    actionError, actionSuccess, actionBusy, fieldError, clearFieldError,
    isAddingCurrency, newCurrencyCode, setNewCurrencyCode,
    isAddingColumn, newColumnName, setNewColumnName,
  } = structure;

  return (
    <div className="card setup-card">
      <div className="setup-card-icon">
        <TableProperties size={24} aria-hidden />
        <span className="setup-card-title">Sheet Structure</span>
      </div>

      {actionError ? <StatusBanner variant="error" message={actionError} toast /> : null}
      {actionSuccess ? <StatusBanner variant="success" message={actionSuccess} /> : null}
      {actionBusy ? (
        <div className="action-busy-toast" role="status" aria-live="polite">
          <div className="spinner" aria-hidden />
          <span>Please wait…</span>
        </div>
      ) : null}

      <ul className="custom-columns-list">
        {columns.map((col) => (
          <SheetStructureRow key={col.name} col={col} structure={structure} />
        ))}
      </ul>

      {children}

      {isAddingCurrency ? (
        <form onSubmit={(e) => void structure.submitAddCurrency(e)} className="custom-columns-add-form" style={{ marginTop: "var(--space-3)" }}>
          <input
            className="input custom-columns-name-input"
            value={newCurrencyCode}
            autoFocus
            maxLength={10}
            placeholder="Currency code (e.g., EUR)…"
            onChange={(e) => { setNewCurrencyCode(e.target.value); clearFieldError(); }}
            list="currency-suggestions"
          />
          {currencyDictionary ? (
            <datalist id="currency-suggestions">
              {currencyDictionary.currencies
                .filter((c) => !currencies.includes(c.code))
                .map((c) => (
                  <option key={c.code} value={c.code}>{c.name}</option>
                ))}
            </datalist>
          ) : null}
          {fieldError ? <div className="field-error">{fieldError}</div> : null}
          <div className="custom-columns-edit-actions">
            <button className="btn btn-primary btn-sm" type="submit" disabled={actionBusy}>
              Add
            </button>
            <button className="btn btn-secondary btn-sm" type="button" onClick={structure.cancelAddingCurrency}>
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      {isAddingColumn ? (
        <form onSubmit={(e) => void structure.submitAddColumn(e)} className="custom-columns-add-form" style={{ marginTop: "var(--space-3)" }}>
          <input
            className="input custom-columns-name-input"
            value={newColumnName}
            autoFocus
            maxLength={30}
            placeholder="New field name…"
            onChange={(e) => { setNewColumnName(e.target.value); clearFieldError(); }}
          />
          {fieldError ? <div className="field-error">{fieldError}</div> : null}
          <div className="custom-columns-edit-actions">
            <button className="btn btn-primary btn-sm" type="submit" disabled={actionBusy}>
              Add
            </button>
            <button className="btn btn-secondary btn-sm" type="button" onClick={structure.cancelAddingColumn}>
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      {!isAddingCurrency && !isAddingColumn && !isGuest ? (
        <div style={{ display: "flex", gap: "var(--space-3)", marginTop: "var(--space-3)" }}>
          <button
            className="btn btn-secondary"
            type="button"
            disabled={actionBusy || !currencyDictionary || currencies.length >= maxOptionalCurrencies}
            onClick={structure.startAddingCurrency}
            title={
              currencyDictionary && currencies.length >= maxOptionalCurrencies
                ? `Maximum of ${maxOptionalCurrencies} currencies reached`
                : undefined
            }
          >
            <Plus size={16} aria-hidden />
            Add currency
          </button>
          <button
            className="btn btn-secondary"
            type="button"
            disabled={actionBusy || customColumns.length >= MAX_CUSTOM_COLUMNS}
            onClick={structure.startAddingColumn}
            title={customColumns.length >= MAX_CUSTOM_COLUMNS ? `Maximum of ${MAX_CUSTOM_COLUMNS} custom fields reached` : undefined}
          >
            <Plus size={16} aria-hidden />
            Add column
          </button>
        </div>
      ) : null}
    </div>
  );
}
