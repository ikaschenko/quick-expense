import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Link2Off } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { sharingApi } from "../services/sharingApi";

interface GuestUnlinkBannerProps {
  ownerEmail: string;
}

export function GuestUnlinkBanner({ ownerEmail }: GuestUnlinkBannerProps): JSX.Element {
  const { refreshSession } = useAuth();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [isUnlinking, setIsUnlinking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleUnlink = async (): Promise<void> => {
    setIsUnlinking(true);
    setError(null);
    try {
      await sharingApi.resetGuestConfig();
      await refreshSession();
      navigate("/setup");
    } catch (err) {
      setError((err as Error).message);
      setIsUnlinking(false);
    }
  };

  return (
    <>
      <div className="sharing-guest-banner" role="status">
        <span>This setup has been shared with you by <strong>{ownerEmail}</strong>. You cannot modify it.</span>
        <button className="btn btn-danger btn-sm" onClick={() => setIsOpen(true)}>
          <Link2Off size={14} aria-hidden /> Unlink
        </button>
      </div>

      {isOpen ? (
        <div className="confirm-overlay" role="dialog" aria-modal="true" aria-labelledby="guest-unlink-title">
          <div className="confirm-dialog">
            <h2 id="guest-unlink-title" className="confirm-title">Unlink from shared setup?</h2>
            <p className="confirm-warning">
              Are you sure you want to unlink from <strong>{ownerEmail}</strong>'s setup?
              You will need to configure your own setup after this.
            </p>
            {error ? <p className="error-message">{error}</p> : null}
            <div className="confirm-actions">
              <button className="btn btn-secondary" onClick={() => setIsOpen(false)} disabled={isUnlinking}>
                Cancel
              </button>
              <button className="btn btn-danger" onClick={() => void handleUnlink()} disabled={isUnlinking}>
                {isUnlinking ? "Unlinking…" : "Yes, unlink"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
