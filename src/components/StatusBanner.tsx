interface StatusBannerProps {
  variant: "error" | "success" | "info";
  message: string;
}

export function StatusBanner({ variant, message }: StatusBannerProps): JSX.Element {
  return <div className={`status-banner ${variant}`}>{message}</div>;
}
