import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle, Info } from "lucide-react";

interface StatusBannerProps {
  variant: "error" | "success" | "info";
  message: string;
  toast?: boolean;
}

const ICONS = {
  error: <AlertCircle size={16} />,
  success: <CheckCircle size={16} />,
  info: <Info size={16} />,
};

export function StatusBanner({ variant, message, toast }: StatusBannerProps): JSX.Element {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    setVisible(true);
    if (!toast && variant !== "success") return;
    const timer = setTimeout(() => setVisible(false), toast ? 5000 : 4000);
    return () => clearTimeout(timer);
  }, [variant, message, toast]);

  if (!visible) return <></>;

  return (
    <div className={`status-banner ${variant}${toast ? " status-banner--toast" : ""}`}>
      <span className="status-banner-icon">{ICONS[variant]}</span>
      <span className="status-banner-text">{message}</span>
    </div>
  );
}
