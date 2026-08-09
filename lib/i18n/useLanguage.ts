"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getStoredLanguage,
  getTranslations,
  setStoredLanguage,
  type Language,
} from "@/lib/i18n";

const LANGUAGE_EVENT = "lifespace-language-change";

export function useLanguage() {
  const [language, setLanguageState] = useState<Language>("zh");

  useEffect(() => {
    const initial = getStoredLanguage();
    setLanguageState(initial);
    document.documentElement.lang = initial === "zh" ? "zh-CN" : "en";

    function handleLanguageChange(event: Event) {
      const next = (event as CustomEvent<Language>).detail;
      if (next === "zh" || next === "en") {
        setLanguageState(next);
      }
    }

    function handleStorage(event: StorageEvent) {
      if (event.key !== "lang") return;
      if (event.newValue === "zh" || event.newValue === "en") {
        setLanguageState(event.newValue);
      }
    }

    window.addEventListener(LANGUAGE_EVENT, handleLanguageChange);
    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener(LANGUAGE_EVENT, handleLanguageChange);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  const setLanguage = useCallback((next: Language) => {
    setStoredLanguage(next);
    setLanguageState(next);
    window.dispatchEvent(new CustomEvent<Language>(LANGUAGE_EVENT, { detail: next }));
  }, []);

  const t = useMemo(() => getTranslations(language), [language]);

  return { language, setLanguage, t };
}
