import { Moon, Sun } from "@phosphor-icons/react";

import useTheme from "../context/useTheme";

export default function ThemeToggle({ className = "", showLabel = false, variant = "default" }) {
  const { theme, toggleTheme } = useTheme();
  const darkMode = theme === "dark";
  const nextTheme = darkMode ? "light" : "dark";
  const appearance = variant === "ghost"
    ? "border-transparent bg-transparent text-stone-600 hover:bg-stone-100 hover:text-terracotta-800 dark:text-stone-300 dark:hover:bg-stone-800 dark:hover:text-terracotta-300"
    : "border-stone-300 bg-white text-stone-700 hover:border-terracotta-600 hover:text-terracotta-800 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200 dark:hover:border-terracotta-400 dark:hover:text-terracotta-300";

  return (
    <button
      aria-label={`Switch to ${nextTheme} mode`}
      aria-pressed={darkMode}
      className={`inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-xl border px-2.5 text-sm font-bold transition-[transform,border-color,background-color,color] duration-150 focus-visible:outline-2 focus-visible:outline-terracotta-700 active:scale-[0.96] dark:focus-visible:outline-terracotta-400 ${appearance} ${className}`}
      onClick={toggleTheme}
      title={`Switch to ${nextTheme} mode`}
      type="button"
    >
      {darkMode ? <Sun aria-hidden="true" size={18} weight="bold" /> : <Moon aria-hidden="true" size={18} weight="bold" />}
      {showLabel && <span>{darkMode ? "Light" : "Dark"}</span>}
    </button>
  );
}
