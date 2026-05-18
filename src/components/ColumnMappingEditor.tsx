import { useState } from "react";
import { googleSheetsService } from "../services/googleSheets";
import { ColumnMapping } from "../types/expense";
import { StatusBanner } from "./StatusBanner";
import { REQUIRED_QE_FIELDS } from "../constants/expenses";

/** Required QuickExpense fields that must be mapped. */

interface Props {
  /** Actual column names found in the user's sheet. */
  detectedColumns: string[];
  /** Pre-populate with an existing saved mapping. Only overrides (QE field ≠ user col) are stored. */
  initialMapping?: ColumnMapping;
  /** Called when the mapping has been saved successfully. */
  onSaved: () => void;
  /** Called when the user cancels the editor. */
  onCancel: () => void;
}

type EditorPhase = "edit" | "confirm";

export function ColumnMappingEditor({ detectedColumns, initialMapping, onSaved, onCancel }: Props): JSX.Element {
  const [mapping, setMapping] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const field of REQUIRED_QE_FIELDS) {
      if (initialMapping) {
        // initialMapping stores only overrides. If no entry, field maps to itself (identity).
        initial[field] = initialMapping[field] ?? field;
      } else {
        const exact = detectedColumns.find((c) => c.toLowerCase() === field.toLowerCase());
        initial[field] = exact ?? "";
      }
    }
    return initial;
  });

  const [phase, setPhase] = useState<EditorPhase>("edit");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const allAssigned = REQUIRED_QE_FIELDS.every((f) => mapping[f]);

  // The effective mapping only includes entries where the user column differs from the QE field name.
  const effectiveMapping: ColumnMapping = {};
  for (const field of REQUIRED_QE_FIELDS) {
    if (mapping[field] && mapping[field] !== field) {
      effectiveMapping[field] = mapping[field];
    }
  }

  const handleFieldChange = (field: string, userCol: string) => {
    setMapping((prev) => ({ ...prev, [field]: userCol }));
  };

  const handleSaveClick = () => {
    if (!allAssigned) return;
    setPhase("confirm");
  };

  const handleConfirm = async () => {
    setIsSaving(true);
    setSaveError(null);
    try {
      await googleSheetsService.saveColumnMapping(effectiveMapping);
      onSaved();
    } catch (err) {
      setSaveError((err as Error).message);
      setPhase("edit");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="column-mapping-editor">
      {phase === "edit" ? (
        <>
          <p className="column-mapping-editor-intro">
            Match each QuickExpense field to the column name in your spreadsheet. Columns not listed here remain unchanged.
          </p>
          {saveError ? <StatusBanner variant="error" message={saveError} /> : null}
          <table className="column-mapping-table">
            <thead>
              <tr>
                <th>QuickExpense field</th>
                <th>Your column name</th>
              </tr>
            </thead>
            <tbody>
              {REQUIRED_QE_FIELDS.map((field) => (
                <tr key={field}>
                  <td className="column-mapping-field-name">{field}</td>
                  <td>
                    <select
                      className="input column-mapping-select"
                      value={mapping[field]}
                      onChange={(e) => handleFieldChange(field, e.target.value)}
                    >
                      <option value="">— select a column —</option>
                      {detectedColumns.map((col) => (
                        <option key={col} value={col}>{col}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="column-mapping-editor-actions">
            <button
              className="btn btn-primary"
              type="button"
              disabled={!allAssigned}
              onClick={handleSaveClick}
            >
              Save mapping
            </button>
            <button className="btn btn-secondary" type="button" onClick={onCancel}>
              Cancel
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="column-mapping-confirm-title">Save mapping to your spreadsheet?</p>
          <p className="column-mapping-confirm-notice">
            {initialMapping
              ? "This will update the \u2018Config\u2019 tab in your spreadsheet with your revised column mapping."
              : "This will create a \u2018Config\u2019 tab in your spreadsheet and write your column mapping there. You can review or delete it in Google Sheets at any time."}
          </p>
          <table className="column-mapping-table">
            <thead>
              <tr>
                <th>QuickExpense field</th>
                <th>Your column name</th>
              </tr>
            </thead>
            <tbody>
              {REQUIRED_QE_FIELDS.map((field) => (
                <tr key={field}>
                  <td className="column-mapping-field-name">{field}</td>
                  <td>{mapping[field]}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="column-mapping-editor-actions">
            <button
              className="btn btn-primary"
              type="button"
              disabled={isSaving}
              onClick={() => void handleConfirm()}
            >
              Confirm
            </button>
            <button
              className="btn btn-secondary"
              type="button"
              disabled={isSaving}
              onClick={onCancel}
            >
              Cancel
            </button>
          </div>
        </>
      )}
    </div>
  );
}
