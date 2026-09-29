import { Check, Pencil, Plus, Share2, Trash2, X } from "lucide-react";
import { StatusBanner } from "./StatusBanner";
import { SetupSharing } from "../hooks/useSetupSharing";
import { ShareEntry } from "../types/expense";

interface SharingSectionProps {
  sharing: SetupSharing;
}

export function SharingSection({ sharing }: SharingSectionProps): JSX.Element {
  const { shares, loadError, actionError, actionBusy, newShareEmail, newShareLevel } = sharing;

  return (
    <div className="card setup-card sharing-section">
      <div className="setup-card-icon">
        <Share2 size={24} aria-hidden />
        <span className="setup-card-title">Share your setup</span>
      </div>

      <p className="sharing-section-note">
        Make sure to also share your Google Spreadsheet directly in Google Sheets with each
        user at the corresponding access level (View or Edit). QuickExpense cannot grant
        Google Sheets permissions on your behalf.
      </p>

      {loadError ? <StatusBanner variant="error" message={loadError} /> : null}
      {actionError ? <StatusBanner variant="error" message={actionError} /> : null}

      {shares.length > 0 ? (
        <table className="sharing-table" aria-label="Shared users">
          <thead>
            <tr>
              <th>Email</th>
              <th>Access</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {shares.map((share) => (
              <ShareRow key={share.guestEmail} share={share} sharing={sharing} />
            ))}
          </tbody>
        </table>
      ) : null}

      <form onSubmit={(e) => void sharing.addShare(e)} className="sharing-add-form">
        <input
          className="input"
          type="email"
          placeholder="user@gmail.com"
          value={newShareEmail}
          onChange={(e) => sharing.setNewShareEmail(e.target.value)}
          required
          disabled={actionBusy}
          style={{ flex: 1, minWidth: "200px" }}
        />
        <select
          className="input"
          value={newShareLevel}
          onChange={(e) => sharing.setNewShareLevel(e.target.value as 'view' | 'edit')}
          disabled={actionBusy}
        >
          <option value="edit">Edit</option>
          <option value="view">View</option>
        </select>
        <button className="btn btn-primary" type="submit" disabled={actionBusy}>
          <Plus size={16} aria-hidden />
          Add user
        </button>
      </form>
    </div>
  );
}

function ShareRow({ share, sharing }: { share: ShareEntry; sharing: SetupSharing }): JSX.Element {
  const isEditing = sharing.editingShareEmail === share.guestEmail;

  return (
    <tr>
      <td>{share.guestEmail}</td>
      <td>
        {isEditing ? (
          <select
            className="input"
            value={sharing.editShareLevel}
            onChange={(e) => sharing.setEditShareLevel(e.target.value as 'view' | 'edit')}
          >
            <option value="edit">Edit</option>
            <option value="view">View</option>
          </select>
        ) : (
          <span className={`config-mode-badge config-mode-badge--${share.accessLevel === 'edit' ? 'config-driven' : 'default'}`}>
            {share.accessLevel === 'edit' ? 'Edit' : 'View'}
          </span>
        )}
      </td>
      <td>
        <div className="sharing-table-actions">
          {isEditing ? (
            <>
              <button
                className="btn-icon"
                type="button"
                disabled={sharing.actionBusy}
                onClick={() => void sharing.updateShare(share.guestEmail)}
                aria-label="Save"
              >
                <Check size={16} />
              </button>
              <button className="btn-icon" type="button" onClick={sharing.cancelEditing} aria-label="Cancel">
                <X size={16} />
              </button>
            </>
          ) : (
            <>
              <button
                className="btn-icon"
                type="button"
                disabled={sharing.actionBusy}
                onClick={() => sharing.startEditing(share)}
                aria-label={`Edit ${share.guestEmail}`}
              >
                <Pencil size={16} />
              </button>
              <button
                className="btn-icon btn-icon-danger"
                type="button"
                disabled={sharing.actionBusy}
                onClick={() => void sharing.removeShare(share.guestEmail)}
                aria-label={`Remove ${share.guestEmail}`}
              >
                <Trash2 size={16} />
              </button>
            </>
          )}
        </div>
      </td>
    </tr>
  );
}
