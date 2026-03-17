interface LoadingBlockProps {
  label?: string;
}

export function LoadingBlock({ label = "Loading…" }: LoadingBlockProps): JSX.Element {
  return (
    <div className="loading-block" role="status" aria-live="polite">
      <span className="spinner" />
      <span>{label}</span>
    </div>
  );
}
