interface LoadingBlockProps {
  label?: string;
  variant?: "spinner" | "skeleton";
  skeletonCount?: number;
}

export function LoadingBlock({
  label = "Loading…",
  variant = "spinner",
  skeletonCount = 3,
}: LoadingBlockProps): JSX.Element {
  if (variant === "skeleton") {
    return (
      <div className="skeleton-list" role="status" aria-live="polite">
        {Array.from({ length: skeletonCount }, (_, i) => (
          <div key={i} className="skeleton-card" />
        ))}
        <span className="sr-only">{label}</span>
      </div>
    );
  }

  return (
    <div className="loading-block" role="status" aria-live="polite">
      <span className="spinner" />
      <span>{label}</span>
    </div>
  );
}
