import { useId, type JSX, type ReactNode } from "react";
import { Link } from "react-router-dom";

interface PermissionGatedActionProps {
  allowed: boolean;
  /** Always-visible explanation shown above the disabled control. */
  reason: string;
  to: string;
  className: string;
  children: ReactNode;
}

export function PermissionGatedAction({ allowed, reason, to, className, children }: PermissionGatedActionProps): JSX.Element {
  const noteId = useId();

  if (allowed) {
    return <Link to={to} className={className}>{children}</Link>;
  }

  return (
    <div className="permission-gated">
      <p id={noteId} className="permission-note">{reason}</p>
      <button type="button" className={className} disabled aria-describedby={noteId}>
        {children}
      </button>
    </div>
  );
}

export function viewOnlyReason(ownerEmail: string | null | undefined, action: string): string {
  return ownerEmail
    ? `You have view-only access. Ask ${ownerEmail} for edit access to ${action}.`
    : `Ask the owner of this setup for edit access to ${action}.`;
}
