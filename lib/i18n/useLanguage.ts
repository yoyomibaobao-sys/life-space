"use client";

import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import {
  getStoredLanguage,
  getTranslations,
  setStoredLanguage,
  type Language,
} from "@/lib/i18n";

const LANGUAGE_EVENT = "lifespace-language-change";

function subscribeToLanguage(onStoreChange: () => void) {
  function handleLanguageChange() {
    onStoreChange();
  }

  function handleStorage(event: StorageEvent) {
    if (event.key === "lang") onStoreChange();
  }

  window.addEventListener(LANGUAGE_EVENT, handleLanguageChange);
  window.addEventListener("storage", handleStorage);

  return () => {
    window.removeEventListener(LANGUAGE_EVENT, handleLanguageChange);
    window.removeEventListener("storage", handleStorage);
  };
}

function getServerLanguage(): Language {
  return "zh";
}

export function useLanguage() {
  const language = useSyncExternalStore(
    subscribeToLanguage,
    getStoredLanguage,
    getServerLanguage
  );

  useEffect(() => {
    document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
  }, [language]);

  const setLanguage = useCallback((next: Language) => {
    setStoredLanguage(next);
    window.dispatchEvent(new CustomEvent<Language>(LANGUAGE_EVENT, { detail: next }));
  }, []);

  const t = useMemo(() => getTranslations(language), [language]);

  return { language, setLanguage, t };
}
