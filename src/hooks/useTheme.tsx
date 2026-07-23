import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

// Light mode is temporarily disabled while its design is polished.
// Flip this to true to bring back the light theme + its toggle button.
export const LIGHT_MODE_ENABLED = false;

type Theme = "dark" | "light";

interface ThemeCtx {
  theme: Theme;
  toggleTheme: () => void;
}

const Ctx = createContext<ThemeCtx>({ theme: "dark", toggleTheme: () => {} });

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    if (!LIGHT_MODE_ENABLED) return "dark";
    try { return (localStorage.getItem("theme") as Theme) || "dark"; } catch { return "dark"; }
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
    try { localStorage.setItem("theme", theme); } catch {}
  }, [theme]);

  const toggleTheme = () => {
    if (!LIGHT_MODE_ENABLED) return;
    setTheme((t) => (t === "dark" ? "light" : "dark"));
  };

  return <Ctx.Provider value={{ theme, toggleTheme }}>{children}</Ctx.Provider>;
}

export function useTheme() {
  return useContext(Ctx);
}
