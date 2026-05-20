import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

type Lang = "en" | "ar";

interface LangCtx {
  lang: Lang;
  setLang: (l: Lang) => void;
  isRtl: boolean;
}

const Ctx = createContext<LangCtx>({ lang: "en", setLang: () => {}, isRtl: false });

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    try { return (localStorage.getItem("lang") as Lang) || "en"; } catch { return "en"; }
  });

  const setLang = (l: Lang) => {
    setLangState(l);
    try { localStorage.setItem("lang", l); } catch {}
  };

  useEffect(() => {
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
    document.documentElement.lang = lang;
  }, [lang]);

  return <Ctx.Provider value={{ lang, setLang, isRtl: lang === "ar" }}>{children}</Ctx.Provider>;
}

export function useLanguage() {
  return useContext(Ctx);
}
