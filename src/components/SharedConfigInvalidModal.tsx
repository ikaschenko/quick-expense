import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { sharingApi } from "../services/sharingApi";
import { useAuth } from "../contexts/AuthContext";

export function SharedConfigInvalidModal(): JSX.Element {
  const { refreshSession } = useAuth();
  const navigate = useNavigate();
  const [isResetting, setIsResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleYes(): Promise<void> {
    setIsResetting(true);
    setError(null);
    try {
      await sharingApi.resetGuestConfig();
      await refreshSession();
      navigate("/setup");
    } catch (err) {
      setError((err as Error).message);
      setIsResetting(false);
    }
  }

  return (
    <div className="shared-config-invalid-overlay" role="dialog" aria-modal="true" aria-labelledby="sci-title">
      <div className="shared-config-invalid-modal">
        <h2 id="sci-title" className="shared-config-invalid-title">Shared setup no longer valid</h2>
        <p className="shared-config-invalid-body">
          The configuration that was shared with you is no longer valid. It must be cleared before
          you can use this application. Would you like to reset and set up from scratch?
        </p>
        {error && <p className="shared-config-invalid-error">{error}</p>}
        <div className="shared-config-invalid-actions">
          <button
            className="btn btn-primary"
            onClick={handleYes}
            disabled={isResetting}
          >
            {isResetting ? "Resetting…" : "Yes, reset and set up"}
          </button>
          <p className="shared-config-invalid-no-hint">
            Choosing "No" will block access until you confirm the reset.
          </p>
        </div>
      </div>
    </div>
  );
}
