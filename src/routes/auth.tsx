import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import { useTheme } from "@/hooks/useTheme";
import { t } from "@/lib/i18n";
import { toast } from "sonner";

const ALLOWED_DOMAIN = "@sm.imamu.edu.sa";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
  head: () => ({ meta: [{ title: "Sign in — Academic Planner" }] }),
});

function AuthPage() {
  const navigate = useNavigate();
  const { user, loading: authLoading, enterVisitorMode } = useAuth();
  const { lang, setLang } = useLanguage();
  const { theme, toggleTheme } = useTheme();
  const s = t(lang).auth;
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!authLoading && user) navigate({ to: "/" });
  }, [authLoading, user, navigate]);

  const continueAsVisitor = () => {
    enterVisitorMode();
    navigate({ to: "/" });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.toLowerCase().endsWith(ALLOWED_DOMAIN)) {
      setErr(s.domainErr(ALLOWED_DOMAIN));
      return;
    }
    if (password.length < 6) { setErr(s.passwordErr); return; }
    setErr("");
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } });
        if (error) throw error;
        toast.success(s.successMsg);
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: "/" });
      }
    } catch (err: unknown) {
      setErr(err instanceof Error ? err.message : s.authFailed);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="spotlight-glow"
      style={{
        minHeight: "100vh",
        background: "var(--color-background)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "40px 24px",
      }}
    >
      {/* Logo + headline */}
      <div style={{ textAlign: "center", marginBottom: 32 }}>
        <div style={{
          width: 56, height: 56, borderRadius: 12,
          background: "#0007cd",
          display: "flex", alignItems: "center", justifyContent: "center",
          margin: "0 auto 20px",
          boxShadow: "0 0 32px rgba(26,38,255,0.55)",
        }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
            <path d="M6 12v5c0 1.66 4 3 6 3s6-1.34 6-3v-5" />
          </svg>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 4 }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ds-muted)" }}>
            {s.subtitle}
          </div>
          <button
            type="button"
            onClick={toggleTheme}
            style={{
              padding: "2px 8px", cursor: "pointer",
              background: "transparent", color: "var(--ds-muted)",
              border: "1px solid var(--ds-line-strong, #333)",
              borderRadius: 6, fontSize: 12,
            }}
          >
            {theme === "dark" ? "☀️" : "🌙"}
          </button>
          <button
            type="button"
            onClick={() => setLang(lang === "en" ? "ar" : "en")}
            style={{
              padding: "2px 8px", cursor: "pointer",
              background: "transparent", color: "var(--ds-muted)",
              border: "1px solid var(--ds-line-strong, #333)",
              borderRadius: 6, fontSize: 11, fontFamily: "var(--font-mono)", fontWeight: 600,
            }}
          >
            {lang === "en" ? "ع" : "EN"}
          </button>
        </div>
        <div style={{ fontSize: 28, fontWeight: 500, color: "var(--color-foreground)", letterSpacing: "-0.02em", marginTop: 6, lineHeight: 1.1 }}>
          {s.headline}
        </div>
        <div style={{ fontSize: 14, color: "var(--ds-body)", marginTop: 8 }}>
          {s.tagline}
        </div>
      </div>

      {/* Card */}
      <div style={{
        width: "100%", maxWidth: 340,
        background: "var(--color-card)",
        border: "1px solid var(--ds-line-strong)",
        borderRadius: 16,
        padding: 20,
      }}>
        {/* Sign in / Sign up toggle */}
        <div style={{ display: "flex", padding: 3, background: "var(--ds-canvas-deep, #000)", borderRadius: 8, marginBottom: 16 }}>
          {(["signin", "signup"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setMode(k)}
              style={{
                flex: 1, padding: "8px 0", border: "none", cursor: "pointer",
                background: mode === k ? "var(--ds-surface-elevated, #222)" : "transparent",
                color: mode === k ? "var(--color-foreground)" : "var(--ds-muted)",
                borderRadius: 6,
                fontSize: 13, fontWeight: 500, fontFamily: "var(--font-sans)",
                transition: "all 150ms",
              }}
            >
              {k === "signin" ? s.signIn : s.signUp}
            </button>
          ))}
        </div>

        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <FieldInput label={s.emailLabel} type="email" value={email} onChange={setEmail} placeholder={`yourname${ALLOWED_DOMAIN}`} />
          <FieldInput label={s.passwordLabel} type="password" value={password} onChange={setPassword} placeholder="••••••••" />
          {err && <div style={{ fontSize: 12, color: "#ff4d4d", padding: "4px 0" }}>{err}</div>}
          <button
            type="submit"
            disabled={loading}
            style={{
              marginTop: 4,
              padding: "12px 16px", border: "none", cursor: loading ? "not-allowed" : "pointer",
              background: "#0007cd", color: "#fff",
              borderRadius: 8, fontSize: 14, fontWeight: 500,
              fontFamily: "var(--font-sans)",
              boxShadow: "0 0 24px rgba(26,38,255,0.35)",
              opacity: loading ? 0.7 : 1,
              transition: "background 150ms",
            }}
          >
            {loading ? s.waiting : mode === "signin" ? s.signInBtn : s.signUpBtn}
          </button>
        </form>

        <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "16px 0" }}>
          <div style={{ flex: 1, height: 1, background: "var(--ds-line-strong, #333)" }} />
          <span style={{ fontSize: 10, color: "var(--ds-muted)", letterSpacing: "0.12em", textTransform: "uppercase" }}>{s.or}</span>
          <div style={{ flex: 1, height: 1, background: "var(--ds-line-strong, #333)" }} />
        </div>

        <button
          type="button"
          onClick={continueAsVisitor}
          style={{
            width: "100%", padding: "11px 16px", cursor: "pointer",
            background: "transparent", color: "var(--color-foreground)",
            border: "1px solid var(--ds-line-strong, #333)",
            borderRadius: 8, fontSize: 13, fontWeight: 500,
            fontFamily: "var(--font-sans)",
          }}
        >
          {s.visitorBtn}
        </button>
        <div style={{ fontSize: 11, color: "var(--ds-muted-soft, #666)", textAlign: "center", marginTop: 10, lineHeight: 1.5 }}>
          {s.visitorNote}
        </div>
      </div>

      <div style={{ marginTop: 24, fontSize: 11, color: "var(--ds-muted-soft, #666)", fontFamily: "var(--font-mono)" }}>
        academic-planner · IMAMU CS
      </div>
    </div>
  );
}

function FieldInput({
  label, value, onChange, type = "text", placeholder,
}: {
  label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: 11, color: "var(--ds-muted)", letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 600 }}>
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: "100%", padding: "10px 12px",
          background: "#000", color: "var(--color-foreground)",
          border: "1px solid var(--ds-line-strong, #333)",
          borderRadius: 8, fontSize: 14, fontFamily: "var(--font-sans)",
          outline: "none",
        }}
        onFocus={(e) => (e.target.style.borderColor = "#1a26ff")}
        onBlur={(e) => (e.target.style.borderColor = "var(--ds-line-strong, #333)")}
      />
    </label>
  );
}
