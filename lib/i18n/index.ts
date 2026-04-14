import zh from "./zh";
import en from "./en";

const dictMap = {
  zh,
  en,
};

function getLang() {
  if (typeof window === "undefined") return "zh";

  const saved = localStorage.getItem("lang");

  if (saved === "zh" || saved === "en") {
    return saved;
  }

  const lang = navigator.language.toLowerCase();

  if (lang.startsWith("zh")) return "zh";
  if (lang.startsWith("en")) return "en";

  return "zh";
}

// ⭐关键：增加 fallback
const lang = getLang();

export const t = dictMap[lang] || zh;