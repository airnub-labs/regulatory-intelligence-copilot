"use client"

import { createContext, useContext, useEffect, useMemo, useState } from "react"

export type Theme = "light" | "dark"

interface ThemeContextValue {
  theme: Theme
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined)

function getPreferredTheme(): Theme {
  if (typeof window === "undefined") return "light"

  const stored = window.localStorage.getItem("theme") as Theme | null
  if (stored === "light" || stored === "dark") {
    return stored
  }

  const systemPrefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches
  return systemPrefersDark ? "dark" : "light"
}

function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return

  const root = document.documentElement
  root.classList.remove("light", "dark")
  root.dataset.theme = theme
  root.classList.add(theme)
  root.style.colorScheme = theme
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(getPreferredTheme)

  useEffect(() => {
    applyTheme(theme)
    window.localStorage.setItem("theme", theme)
  }, [theme])

  const value = useMemo(
    () => ({
      theme,
      setTheme,
      toggleTheme: () => setTheme((prev) => (prev === "dark" ? "light" : "dark")),
    }),
    [theme]
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const context = useContext(ThemeContext)

  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider")
  }

  return context
}
