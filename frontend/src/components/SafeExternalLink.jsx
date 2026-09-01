function safeExternalUrl(value) {
  if (typeof value !== "string" || value.length > 2048) return null;

  try {
    const parsed = new URL(value);
    if (!["http:", "https:"].includes(parsed.protocol)) return null;
    if (!parsed.hostname || parsed.username || parsed.password) return null;
    return parsed.href;
  } catch {
    return null;
  }
}

export default function SafeExternalLink({ children, className, href, onClick }) {
  const safeHref = safeExternalUrl(href);

  if (!safeHref) {
    return (
      <span
        aria-disabled="true"
        className={`${className} cursor-not-allowed opacity-60`}
        title="This course link is unavailable"
      >
        {children}
      </span>
    );
  }

  return (
    <a
      className={className}
      href={safeHref}
      onClick={onClick}
      rel="noopener noreferrer"
      target="_blank"
    >
      {children}
    </a>
  );
}
