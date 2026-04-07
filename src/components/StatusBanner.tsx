import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle, Info } from "lucide-react";

interface StatusBannerProps {
  variant: "error" | "success" | "info";
  message: string;
}

const ICONS = {
  error: <AlertCircle size={16} />,
  success: <CheckCircle size={16} />,
  info: <Info size={16} />,
};

export function StatusBanner({ variant, message }: StatusBannerProps): JSX.Element {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    setVisible(true);
    if (variant !== "success") return;
    const timer = setTimeout(() => setVisible(false), 4000);
    return () => clearTimeout(timer);
  }, [variant, message]);

  if (!visible) return <></>;

  return (
    <div className={`status-banner ${variant}`}>
      <span className="status-banner-icon">{ICONS[variant]}</span>
      <span className="status-banner-text">{message}</span>
    </div>
  );
}
