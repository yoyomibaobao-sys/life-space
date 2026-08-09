import zh from "./zh";
import en from "./en";

export type Language = "zh" | "en";
export type TranslationDictionary = typeof zh;

const dictMap: Record<Language, TranslationDictionary> = {
  zh,
  en,
};

export function getBrowserLanguage(): Language {
  if (typeof window === "undefined") return "zh";

  const lang = navigator.language.toLowerCase();
  if (lang.startsWith("zh")) return "zh";
  if (lang.startsWith("en")) return "en";

  return "zh";
}

export function getStoredLanguage(): Language {
  if (typeof window === "undefined") return "zh";

  try {
    const saved = localStorage.getItem("lang");
    if (saved === "zh" || saved === "en") return saved;
  } catch {
    // Some browsers can block localStorage. Fall back to browser language.
  }

  return getBrowserLanguage();
}

export function setStoredLanguage(language: Language) {
  if (typeof window === "undefined") return;

  try {
    localStorage.setItem("lang", language);
  } catch {
    // Language switching still works for the current page if persistence fails.
  }

  document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
}

export function getTranslations(language: Language): TranslationDictionary {
  return dictMap[language] || zh;
}

// Backward-compatible snapshot for older components. New interactive UI should use useLanguage().
export const t = getTranslations(getStoredLanguage());
