import { useCallback, useEffect, useMemo, useState } from "react";

import ThemeContext from "./theme-context";

function getInitialTheme() {
  if (typeof document !== "undefined") {
    const initialTheme = document.documentElement.dataset.theme;
    if (initialTheme === "light" || initialTheme === "dark") return initialTheme;
  }

  return "light";
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(getInitialTheme);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
    try {
      localStorage.setItem("pathwise-theme", theme);
    } catch {
      // The selected theme still applies when storage is unavailable.
    }

    const themeColor = document.querySelector('meta[name="theme-color"]');
    themeColor?.setAttribute("content", theme === "dark" ? "#0c0a09" : "#773722");
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((current) => (current === "dark" ? "light" : "dark"));
  }, []);

  const value = useMemo(() => ({ theme, setTheme, toggleTheme }), [theme, toggleTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
