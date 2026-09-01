const SIZE_CLASSES = {
  sm: "size-8 text-xs",
  md: "size-11 text-sm",
  lg: "size-16 text-xl",
  xl: "size-24 text-3xl",
};

function getInitials(name) {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export default function Avatar({ name, size = "md" }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-terracotta-800 font-display font-bold text-stone-50 dark:bg-terracotta-400 dark:text-stone-950 ${SIZE_CLASSES[size] || SIZE_CLASSES.md}`}
    >
      {getInitials(name)}
    </span>
  );
}
