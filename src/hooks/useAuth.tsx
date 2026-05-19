import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

const VISITOR_KEY = "visitorMode";

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isVisitor, setIsVisitor] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(VISITOR_KEY) === "true";
  });

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        localStorage.removeItem(VISITOR_KEY);
        setIsVisitor(false);
      }
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      setLoading(false);
    });

    const onStorage = () => setIsVisitor(localStorage.getItem(VISITOR_KEY) === "true");
    window.addEventListener("storage", onStorage);
    return () => {
      subscription.unsubscribe();
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const enterVisitorMode = () => {
    localStorage.setItem(VISITOR_KEY, "true");
    setIsVisitor(true);
  };
  const exitVisitorMode = () => {
    localStorage.removeItem(VISITOR_KEY);
    setIsVisitor(false);
  };

  return { session, user, loading, isVisitor, enterVisitorMode, exitVisitorMode };
}
