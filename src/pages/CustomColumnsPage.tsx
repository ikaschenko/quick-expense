import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Pencil, Trash2, ChevronUp, ChevronDown, Check, X } from "lucide-react";
import { Layout } from "../components/Layout";
import { StatusBanner } from "../components/StatusBanner";
import { useConfig } from "../contexts/ConfigContext";
import { googleSheetsService } from "../services/googleSheets";
import { CustomColumn } from "../types/expense";
import { validateColumnName } from "../utils/spreadsheet";
import { MAX_CUSTOM_COLUMNS } from "../constants/expenses";

export function CustomColumnsPage(): JSX.Element {
  const { config, saveCustomColumns } = useConfig();
  const navigate = useNavigate();

  const [columns, setColumns] = useState<CustomColumn[]>(config?.customColumns ?? []);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [bannerError, setBannerError] = useState<string | null>(null);
  const [bannerSuccess, setBannerSuccess] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmRemoveId, setConfirmRemoveId] = useState<number | null>(null);
  const [removeInfo, setRemoveInfo] = useState<{ hardDeleted: boolean; name: string } | null>(null);

  useEffect(() => {
    setColumns(config?.customColumns ?? []);
  }, [config?.customColumns]);

  function clearBanners() {
    setBannerError(null);
    setBannerSuccess(null);
  }

  // ─── Add ──────────────────────────────────────────────────────────────────

  const startAdding = () => {
    clearBanners();
    setEditingId(null);
    setFieldError(null);
    setNewName("");
    setIsAdding(true);
  };

  const cancelAdding = () => {
    setIsAdding(false);
    setNewName("");
    setFieldError(null);
  };

  const submitAdd = async (e: FormEvent) => {
    e.preventDefault();
    const err = validateColumnName(newName, columns.map((c) => c.name));
    if (err) { setFieldError(err); return; }
    setSaving(true);
    setFieldError(null);
    try {
      const added = await googleSheetsService.addCustomColumn(newName.trim());
      const next = [...columns, added];
      setColumns(next);
      saveCustomColumns(next);
      setIsAdding(false);
      setNewName("");
      setBannerSuccess(`Column "${added.name}" added.`);
    } catch (err) {
      setBannerError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  // ─── Rename ───────────────────────────────────────────────────────────────

  const startEditing = (col: CustomColumn) => {
    clearBanners();
    setIsAdding(false);
    setFieldError(null);
    setEditingId(col.id);
    setEditName(col.name);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditName("");
    setFieldError(null);
  };

  const submitRename = async (e: FormEvent) => {
    e.preventDefault();
    if (editingId === null) return;
    const target = columns.find((c) => c.id === editingId);
    if (!target) return;
    const err = validateColumnName(editName, columns.map((c) => c.name), target.name);
    if (err) { setFieldError(err); return; }
    setSaving(true);
    setFieldError(null);
    try {
      const renamed = await googleSheetsService.renameCustomColumn(editingId, editName.trim());
      const next = columns.map((c) => c.id === editingId ? renamed : c);
      setColumns(next);
      saveCustomColumns(next);
      setEditingId(null);
      setBannerSuccess(`Column renamed to "${renamed.name}".`);
    } catch (err) {
      setBannerError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  // ─── Reorder ──────────────────────────────────────────────────────────────

  const moveColumn = async (index: number, direction: -1 | 1) => {
    const swapIndex = index + direction;
    if (swapIndex < 0 || swapIndex >= columns.length) return;
    clearBanners();
    const next = [...columns];
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
    setSaving(true);
    try {
      const reordered = await googleSheetsService.reorderCustomColumns(next.map((c) => c.id));
      setColumns(reordered);
      saveCustomColumns(reordered);
    } catch (err) {
      setBannerError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  // ─── Remove ───────────────────────────────────────────────────────────────

  const confirmRemove = (col: CustomColumn) => {
    clearBanners();
    setConfirmRemoveId(col.id);
    setRemoveInfo(null);
  };

  const executeRemove = async () => {
    if (confirmRemoveId === null) return;
    const target = columns.find((c) => c.id === confirmRemoveId);
    if (!target) return;
    setSaving(true);
    try {
      const result = await googleSheetsService.removeCustomColumn(confirmRemoveId);
      const next = columns.filter((c) => c.id !== confirmRemoveId);
      setColumns(next);
      saveCustomColumns(next);
      setConfirmRemoveId(null);
      setRemoveInfo({ hardDeleted: result.hardDeleted, name: target.name });
      setBannerSuccess(
        result.hardDeleted
          ? `Column "${target.name}" deleted.`
          : `Column "${target.name}" hidden (data preserved in spreadsheet).`,
      );
    } catch (err) {
      setBannerError((err as Error).message);
      setConfirmRemoveId(null);
    } finally {
      setSaving(false);
    }
  };

  const atLimit = columns.length >= MAX_CUSTOM_COLUMNS;

  return (
    <Layout title="Customize Columns">
      <button
        className="btn btn-secondary btn-inline"
        type="button"
        onClick={() => navigate("/setup")}
        style={{ marginBottom: "var(--space-4)" }}
      >
        ← Back to Setup
      </button>

      {bannerError ? <StatusBanner variant="error" message={bannerError} /> : null}
      {bannerSuccess ? <StatusBanner variant="success" message={bannerSuccess} /> : null}

      <div className="card setup-card">
        <p className="input-label" style={{ marginBottom: "var(--space-3)" }}>
          Custom columns appear after the fixed fields (Date, Amount, Category, SpentBy, Comment)
          on the Add Expense form and in your spreadsheet.
        </p>

        {columns.length === 0 && !isAdding ? (
          <p style={{ color: "var(--color-text-muted)", marginBottom: "var(--space-3)" }}>
            No custom columns yet.
          </p>
        ) : null}

        <ul className="custom-columns-list" style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {columns.map((col, index) => (
            <li key={col.id} className="custom-columns-row">
              {editingId === col.id ? (
                <form onSubmit={(e) => void submitRename(e)} className="custom-columns-edit-form">
                  <input
                    className="input custom-columns-name-input"
                    value={editName}
                    autoFocus
                    maxLength={30}
                    onChange={(e) => { setEditName(e.target.value); setFieldError(null); }}
                  />
                  {fieldError ? <div className="field-error">{fieldError}</div> : null}
                  <div className="custom-columns-edit-actions">
                    <button className="btn-icon" type="submit" disabled={saving} aria-label="Save rename">
                      <Check size={16} />
                    </button>
                    <button className="btn-icon" type="button" onClick={cancelEditing} aria-label="Cancel rename">
                      <X size={16} />
                    </button>
                  </div>
                </form>
              ) : confirmRemoveId === col.id ? (
                <div className="custom-columns-confirm">
                  <span className="custom-columns-confirm-text">
                    Remove &ldquo;{col.name}&rdquo;?
                  </span>
                  <button className="btn btn-danger btn-sm" type="button" disabled={saving} onClick={() => void executeRemove()}>
                    Remove
                  </button>
                  <button className="btn btn-secondary btn-sm" type="button" onClick={() => setConfirmRemoveId(null)}>
                    Cancel
                  </button>
                </div>
              ) : (
                <>
                  <span className="custom-columns-name">{col.name}</span>
                  <div className="custom-columns-actions">
                    <button
                      className="btn-icon"
                      type="button"
                      disabled={saving || index === 0}
                      onClick={() => void moveColumn(index, -1)}
                      aria-label="Move up"
                    >
                      <ChevronUp size={16} />
                    </button>
                    <button
                      className="btn-icon"
                      type="button"
                      disabled={saving || index === columns.length - 1}
                      onClick={() => void moveColumn(index, 1)}
                      aria-label="Move down"
                    >
                      <ChevronDown size={16} />
                    </button>
                    <button
                      className="btn-icon"
                      type="button"
                      disabled={saving}
                      onClick={() => startEditing(col)}
                      aria-label={`Rename ${col.name}`}
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      className="btn-icon btn-icon-danger"
                      type="button"
                      disabled={saving}
                      onClick={() => confirmRemove(col)}
                      aria-label={`Remove ${col.name}`}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>

        {isAdding ? (
          <form onSubmit={(e) => void submitAdd(e)} className="custom-columns-add-form" style={{ marginTop: "var(--space-3)" }}>
            <input
              className="input custom-columns-name-input"
              value={newName}
              autoFocus
              maxLength={30}
              placeholder="New column name…"
              onChange={(e) => { setNewName(e.target.value); setFieldError(null); }}
            />
            {fieldError ? <div className="field-error">{fieldError}</div> : null}
            <div className="custom-columns-edit-actions">
              <button className="btn btn-primary btn-sm" type="submit" disabled={saving}>
                Add
              </button>
              <button className="btn btn-secondary btn-sm" type="button" onClick={cancelAdding}>
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <button
            className="btn btn-secondary"
            type="button"
            disabled={saving || atLimit}
            onClick={startAdding}
            style={{ marginTop: "var(--space-3)" }}
            title={atLimit ? `Maximum of ${MAX_CUSTOM_COLUMNS} custom columns reached` : undefined}
          >
            <Plus size={16} aria-hidden />
            Add column
          </button>
        )}

        {atLimit ? (
          <p style={{ color: "var(--color-text-muted)", marginTop: "var(--space-2)", fontSize: "var(--font-size-sm)" }}>
            Maximum of {MAX_CUSTOM_COLUMNS} custom columns reached.
          </p>
        ) : null}
      </div>
    </Layout>
  );
}
