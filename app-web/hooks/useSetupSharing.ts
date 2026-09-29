import { FormEvent, useEffect, useState } from "react";
import { sharingApi } from "../services/sharingApi";
import { ShareEntry } from "../types/expense";

export interface SetupSharing {
  shares: ShareEntry[];
  loadError: string | null;
  actionError: string | null;
  actionBusy: boolean;
  newShareEmail: string;
  setNewShareEmail: (email: string) => void;
  newShareLevel: 'view' | 'edit';
  setNewShareLevel: (level: 'view' | 'edit') => void;
  addShare: (e: FormEvent) => Promise<void>;
  editingShareEmail: string | null;
  editShareLevel: 'view' | 'edit';
  setEditShareLevel: (level: 'view' | 'edit') => void;
  startEditing: (share: ShareEntry) => void;
  cancelEditing: () => void;
  updateShare: (guestEmail: string) => Promise<void>;
  removeShare: (guestEmail: string) => Promise<void>;
}

export function useSetupSharing(enabled: boolean): SetupSharing {
  const [shares, setShares] = useState<ShareEntry[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [newShareEmail, setNewShareEmail] = useState("");
  const [newShareLevel, setNewShareLevel] = useState<'view' | 'edit'>("edit");
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [editingShareEmail, setEditingShareEmail] = useState<string | null>(null);
  const [editShareLevel, setEditShareLevel] = useState<'view' | 'edit'>("edit");

  useEffect(() => {
    if (!enabled) return;
    setLoadError(null);
    void sharingApi.listShares()
      .then(setShares)
      .catch((err) => setLoadError((err as Error).message));
  }, [enabled]);

  async function runShareAction(action: () => Promise<void>): Promise<void> {
    setActionError(null);
    setActionBusy(true);
    try {
      await action();
    } catch (err) {
      setActionError((err as Error).message);
    } finally {
      setActionBusy(false);
    }
  }

  return {
    shares,
    loadError,
    actionError,
    actionBusy,
    newShareEmail,
    setNewShareEmail: (email) => {
      setNewShareEmail(email);
      setActionError(null);
    },
    newShareLevel,
    setNewShareLevel,
    addShare: async (e: FormEvent) => {
      e.preventDefault();
      await runShareAction(async () => {
        const entry = await sharingApi.addShare({ guestEmail: newShareEmail.trim(), accessLevel: newShareLevel });
        setShares((prev) => [...prev, entry]);
        setNewShareEmail("");
        setNewShareLevel("edit");
      });
    },
    editingShareEmail,
    editShareLevel,
    setEditShareLevel,
    startEditing: (share) => {
      setEditingShareEmail(share.guestEmail);
      setEditShareLevel(share.accessLevel);
    },
    cancelEditing: () => setEditingShareEmail(null),
    updateShare: (guestEmail) => runShareAction(async () => {
      const updated = await sharingApi.updateShare(guestEmail, editShareLevel);
      setShares((prev) => prev.map((s) => (s.guestEmail === guestEmail ? updated : s)));
      setEditingShareEmail(null);
    }),
    removeShare: (guestEmail) => runShareAction(async () => {
      await sharingApi.removeShare(guestEmail);
      setShares((prev) => prev.filter((s) => s.guestEmail !== guestEmail));
    }),
  };
}
