import React, { createContext, useContext, useEffect, useState } from "react";

// Preferência: "light" | "dark" | "system" (segue o aparelho)
const ThemeContext = createContext();
const STORAGE_KEY = "theme";
const LIGHT_BAR = "#0B8F5A";
const DARK_BAR = "#0A0F14";

const readSaved = () => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return ["light", "dark", "system"].includes(saved) ? saved : "light";
  } catch {
    return "light";
  }
};

const systemPrefersDark = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches;

export const ThemeProvider = ({ children }) => {
  const [preference, setPreference] = useState(readSaved);
  const [systemDark, setSystemDark] = useState(systemPrefersDark);

  // Acompanha a troca de tema do aparelho (modo "Automático")
  useEffect(() => {
    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!media) return undefined;
    const onChange = (e) => setSystemDark(e.matches);
    media.addEventListener?.("change", onChange);
    return () => media.removeEventListener?.("change", onChange);
  }, []);

  const theme = preference === "system" ? (systemDark ? "dark" : "light") : preference;

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, preference); } catch { /* sem armazenamento */ }
  }, [preference]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? DARK_BAR : LIGHT_BAR);
  }, [theme]);

  const toggleTheme = () => setPreference(theme === "dark" ? "light" : "dark");

  return (
    <ThemeContext.Provider value={{ theme, preference, setPreference, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
