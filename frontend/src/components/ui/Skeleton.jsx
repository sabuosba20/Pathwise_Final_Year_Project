export function Skeleton({ className = "" }) {
  return (
    <div aria-hidden="true" className={`pathwise-skeleton ${className}`} />
  );
}

export function LoadingRegion({
  children,
  className = "",
  label = "Loading content",
}) {
  return (
    <div
      aria-busy="true"
      aria-label={label}
      className={className}
      role="status"
    >
      <span className="sr-only">{label}</span>
      <div aria-hidden="true">{children}</div>
    </div>
  );
}
