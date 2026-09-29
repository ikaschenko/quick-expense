import { Check, ChevronDown, ChevronUp, Eye, EyeOff, Pencil, Trash2, X } from "lucide-react";
import { ColumnInfo } from "../types/expense";
import { typeLabel } from "../utils/setupColumns";
import { SheetStructure } from "../hooks/useSheetStructure";

interface SheetStructureRowProps {
  col: ColumnInfo;
  structure: SheetStructure;
}

export function SheetStructureRow({ col, structure }: SheetStructureRowProps): JSX.Element {
  if (structure.renamingColumn === col.name) {
    return <RenameRow structure={structure} />;
  }
  if (structure.confirmRemoveName === col.name) {
    return <ConfirmRemoveRow col={col} structure={structure} />;
  }
  return <DisplayRow col={col} structure={structure} />;
}

function RenameRow({ structure }: { structure: SheetStructure }): JSX.Element {
  const { renameValue, setRenameValue, clearFieldError, fieldError, actionBusy } = structure;
  return (
    <li className="custom-columns-row">
      <form onSubmit={(e) => void structure.submitRename(e)} className="custom-columns-edit-form">
        <input
          className="input custom-columns-name-input"
          value={renameValue}
          autoFocus
          maxLength={30}
          onChange={(e) => { setRenameValue(e.target.value); clearFieldError(); }}
        />
        {fieldError ? <div className="field-error">{fieldError}</div> : null}
        <div className="custom-columns-edit-actions">
          <button className="btn-icon" type="submit" disabled={actionBusy} aria-label="Save rename">
            <Check size={16} />
          </button>
          <button className="btn-icon" type="button" onClick={structure.cancelRenaming} aria-label="Cancel rename">
            <X size={16} />
          </button>
        </div>
      </form>
    </li>
  );
}

function ConfirmRemoveRow({ col, structure }: SheetStructureRowProps): JSX.Element {
  return (
    <li className="custom-columns-row">
      <div className="custom-columns-confirm">
        <span className="custom-columns-confirm-text">
          Remove &ldquo;{col.name}&rdquo;?
        </span>
        <button className="btn btn-danger btn-sm" type="button" disabled={structure.actionBusy} onClick={() => void structure.executeRemove()}>
          Remove
        </button>
        <button className="btn btn-secondary btn-sm" type="button" onClick={structure.cancelRemove}>
          Cancel
        </button>
      </div>
    </li>
  );
}

function DisplayRow({ col, structure }: SheetStructureRowProps): JSX.Element {
  const { actionBusy, currencies, customColumns, hiddenColumns } = structure;
  const isMandatory = col.type === "mandatory-field" || col.type === "mandatory-currency";
  const isCurrency = col.type === "optional-currency";
  const isCustom = col.type === "custom-column";
  const list = isCurrency ? currencies : customColumns;
  const index = list.indexOf(col.name);
  const onMove = isCurrency ? structure.moveCurrency : structure.moveCustomColumn;
  const isHidden = hiddenColumns.includes(col.name);

  return (
    <li className="custom-columns-row">
      <span className="custom-columns-name">
        {col.name}
        <span className={`custom-columns-type-badge custom-columns-type-badge--${col.type}`}>{typeLabel(col.type)}</span>
      </span>
      {(col.hideable || !isMandatory) ? (
        <div className="custom-columns-actions">
          {isCurrency || isCustom ? (
            <>
              <button
                className="btn-icon"
                type="button"
                disabled={actionBusy || index === 0}
                onClick={() => void onMove(index, -1)}
                aria-label="Move up"
              >
                <ChevronUp size={16} />
              </button>
              <button
                className="btn-icon"
                type="button"
                disabled={actionBusy || index === list.length - 1}
                onClick={() => void onMove(index, 1)}
                aria-label="Move down"
              >
                <ChevronDown size={16} />
              </button>
            </>
          ) : null}
          {!isMandatory ? (
            <button
              className="btn-icon"
              type="button"
              disabled={actionBusy}
              onClick={() => structure.startRenaming(col.name)}
              aria-label={`Rename ${col.name}`}
            >
              <Pencil size={16} />
            </button>
          ) : null}
          {col.hideable ? (
            <button
              className="btn-icon"
              type="button"
              disabled={actionBusy}
              onClick={() => void structure.toggleVisibility(col.name)}
              aria-label={isHidden ? `Show ${col.name} on Add and History screens` : `Hide ${col.name} from Add and History screens`}
              title={isHidden ? "Hidden from Add and History screens" : "Visible on Add and History screens"}
            >
              {isHidden ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          ) : null}
          {!isMandatory ? (
            <button
              className="btn-icon btn-icon-danger"
              type="button"
              disabled={actionBusy}
              onClick={() => structure.startRemove(col.name)}
              aria-label={`Remove ${col.name}`}
            >
              <Trash2 size={16} />
            </button>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
