import { ChevronDown, ChevronUp } from "lucide-react";
import { LoadingBlock } from "./LoadingBlock";
import { StatusBanner } from "./StatusBanner";
import { ColumnMappingEditor } from "./ColumnMappingEditor";
import { ColumnMappingState } from "../hooks/useColumnMapping";
import { REQUIRED_QE_FIELDS } from "../constants/expenses";

interface ColumnMappingSectionProps {
  mapping: ColumnMappingState;
}

export function ColumnMappingSection({ mapping }: ColumnMappingSectionProps): JSX.Element {
  const { mappingData, sectionOpen } = mapping;

  return (
    <div className="column-mapping-section">
      <button
        type="button"
        className="column-mapping-section-toggle"
        aria-expanded={sectionOpen}
        onClick={mapping.toggleSection}
      >
        {sectionOpen ? <ChevronUp size={14} aria-hidden /> : <ChevronDown size={14} aria-hidden />}
        Column mapping
        {mappingData ? (
          <span className={`config-mode-badge config-mode-badge--${mappingData.mode}`}>
            {mappingData.mode === "config-driven" ? "Config detected" : "Not configured"}
          </span>
        ) : null}
      </button>

      {sectionOpen ? <div className="column-mapping-section-body"><MappingBody mapping={mapping} /></div> : null}
    </div>
  );
}

function MappingBody({ mapping }: ColumnMappingSectionProps): JSX.Element {
  const { mappingData, mappingLoadError } = mapping;

  if (mappingLoadError) {
    return (
      <>
        <StatusBanner variant="error" message={`Could not load mapping — ${mappingLoadError}`} />
        <button type="button" className="btn btn-secondary btn-sm" onClick={mapping.retry}>
          Retry
        </button>
      </>
    );
  }
  if (!mappingData) {
    return <LoadingBlock label="Loading mapping…" />;
  }
  if (mappingData.mode !== "config-driven") {
    return <p className="muted text-sm">No column mapping is configured. Standard column names apply.</p>;
  }

  return (
    <>
      {mapping.success ? <StatusBanner variant="success" message={mapping.success} /> : null}
      {mapping.editorOpen ? (
        <ColumnMappingEditor
          detectedColumns={mappingData.detectedColumns}
          initialMapping={mappingData.mapping ?? undefined}
          onSaved={mapping.onEditorSaved}
          onCancel={mapping.closeEditor}
        />
      ) : (
        <>
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
                  <td>{mappingData.mapping?.[field] ?? field}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            style={{ marginTop: "var(--space-3)" }}
            onClick={mapping.openEditor}
          >
            Edit mapping
          </button>
        </>
      )}
    </>
  );
}
