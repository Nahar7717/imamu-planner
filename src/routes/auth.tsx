import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import { useTheme } from "@/hooks/useTheme";
import { t } from "@/lib/i18n";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";

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
  const [mode, setMode] = useState<"signin" | "signup" | "forgot">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [selectedCollege, setSelectedCollege] = useState("");
  const [selectedMajor, setSelectedMajor] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [isRecovery, setIsRecovery] = useState(false);

  const { data: colleges = [] } = useQuery({
    queryKey: ["colleges"],
    queryFn: async () => {
      const { data } = await (supabase.from("colleges") as any).select("*").order("name");
      return (data ?? []) as { id: string; name: string; name_ar: string | null }[];
    },
  });

  const { data: majors = [] } = useQuery({
    queryKey: ["majors"],
    queryFn: async () => {
      const { data } = await (supabase.from("majors") as any).select("*").order("name");
      return (data ?? []) as { id: string; college_id: string; name: string; name_ar: string | null }[];
    },
  });

  const filteredMajors = selectedCollege
    ? majors.filter((m) => m.college_id === selectedCollege)
    : majors;

  // Listen for PASSWORD_RECOVERY event from the reset email link
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setIsRecovery(true);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!authLoading && user && !isRecovery) navigate({ to: "/" });
  }, [authLoading, user, isRecovery, navigate]);

  const continueAsVisitor = () => {
    enterVisitorMode();
    navigate({ to: "/" });
  };

  const submitForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.toLowerCase().endsWith(ALLOWED_DOMAIN)) {
      setErr(s.domainErr(ALLOWED_DOMAIN));
      return;
    }
    setErr("");
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth`,
      });
      if (error) throw error;
      setResetSent(true);
    } catch (err: unknown) {
      setErr(err instanceof Error ? err.message : s.authFailed);
    } finally {
      setLoading(false);
    }
  };

  const submitNewPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) { setErr(s.passwordErr); return; }
    setErr("");
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      toast.success(lang === "ar" ? "تم تغيير كلمة المرور بنجاح!" : "Password updated successfully!");
      setIsRecovery(false);
      navigate({ to: "/" });
    } catch (err: unknown) {
      setErr(err instanceof Error ? err.message : s.authFailed);
    } finally {
      setLoading(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.toLowerCase().endsWith(ALLOWED_DOMAIN)) {
      setErr(s.domainErr(ALLOWED_DOMAIN));
      return;
    }
    if (password.length < 6) { setErr(s.passwordErr); return; }
    if (mode === "signup" && !selectedMajor) { setErr(lang === "ar" ? "الرجاء اختيار التخصص" : "Please select your major."); return; }
    setErr("");
    setLoading(true);
    try {
      if (mode === "signup") {
        const { data: signUpData, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } });
        if (error) throw error;
        // Upsert profile with chosen major
        if (signUpData.user) {
          await (supabase.from("profiles") as any).upsert({
            id: signUpData.user.id,
            email: signUpData.user.email,
            major_id: selectedMajor,
          }, { onConflict: "id" });
        }
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
          background: "linear-gradient(135deg, #f97316, #ec4899)",
          display: "flex", alignItems: "center", justifyContent: "center",
          margin: "0 auto 20px",
          boxShadow: "0 0 32px rgba(249,115,22,0.5)",
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

        {/* ── Set new password (recovery mode) ── */}
        {isRecovery ? (
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: "var(--color-foreground)", marginBottom: 4 }}>
              {lang === "ar" ? "تعيين كلمة مرور جديدة" : "Set New Password"}
            </div>
            <div style={{ fontSize: 12, color: "var(--ds-muted)", marginBottom: 16 }}>
              {lang === "ar" ? "أدخل كلمة المرور الجديدة أدناه." : "Enter your new password below."}
            </div>
            <form onSubmit={submitNewPassword} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <FieldInput
                label={lang === "ar" ? "كلمة المرور الجديدة" : "New Password"}
                type="password"
                value={newPassword}
                onChange={setNewPassword}
                placeholder="••••••••"
              />
              {err && <div style={{ fontSize: 12, color: "#ff4d4d", padding: "4px 0" }}>{err}</div>}
              <button
                type="submit"
                disabled={loading}
                style={{
                  marginTop: 4,
                  padding: "12px 16px", border: "none", cursor: loading ? "not-allowed" : "pointer",
                  background: "linear-gradient(135deg, #f97316, #ec4899)", color: "#fff",
                  borderRadius: 8, fontSize: 14, fontWeight: 500,
                  fontFamily: "var(--font-sans)",
                  boxShadow: "0 0 24px rgba(249,115,22,0.4)",
                  opacity: loading ? 0.7 : 1,
                }}
              >
                {loading ? s.waiting : (lang === "ar" ? "حفظ كلمة المرور" : "Save Password")}
              </button>
            </form>
          </div>
        ) : (
          <>
        {/* Sign in / Sign up toggle */}
        {mode !== "forgot" && (
          <div style={{ display: "flex", padding: 3, background: "var(--ds-canvas-deep, #000)", borderRadius: 8, marginBottom: 16 }}>
            {(["signin", "signup"] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => { setMode(k); setErr(""); }}
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
        )}

        {/* Forgot password form */}
        {mode === "forgot" && (
          <div>
            <button
              type="button"
              onClick={() => { setMode("signin"); setErr(""); setResetSent(false); }}
              style={{ background: "none", border: "none", color: "var(--ds-muted)", cursor: "pointer", fontSize: 12, padding: "0 0 12px", display: "flex", alignItems: "center", gap: 4 }}
            >
              ← {lang === "ar" ? "رجوع" : "Back"}
            </button>
            <div style={{ fontSize: 14, fontWeight: 500, color: "var(--color-foreground)", marginBottom: 12 }}>
              {lang === "ar" ? "استعادة كلمة المرور" : "Reset Password"}
            </div>
            {resetSent ? (
              <div style={{ fontSize: 13, color: "#4ade80", padding: "10px 0", lineHeight: 1.6 }}>
                {lang === "ar"
                  ? "تم إرسال رابط الاسترداد إلى بريدك الإلكتروني."
                  : "A reset link has been sent to your email."}
              </div>
            ) : (
              <form onSubmit={submitForgot} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <FieldInput label={s.emailLabel} type="email" value={email} onChange={setEmail} placeholder={`yourname${ALLOWED_DOMAIN}`} />
                {err && <div style={{ fontSize: 12, color: "#ff4d4d", padding: "4px 0" }}>{err}</div>}
                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    marginTop: 4,
                    padding: "12px 16px", border: "none", cursor: loading ? "not-allowed" : "pointer",
                    background: "linear-gradient(135deg, #f97316, #ec4899)", color: "#fff",
                    borderRadius: 8, fontSize: 14, fontWeight: 500,
                    fontFamily: "var(--font-sans)",
                    boxShadow: "0 0 24px rgba(249,115,22,0.4)",
                    opacity: loading ? 0.7 : 1,
                  }}
                >
                  {loading ? s.waiting : (lang === "ar" ? "إرسال رابط الاسترداد" : "Send Reset Link")}
                </button>
              </form>
            )}
          </div>
        )}

        {/* Sign in / Sign up form */}
        {mode !== "forgot" && (
        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <FieldInput label={s.emailLabel} type="email" value={email} onChange={setEmail} placeholder={`yourname${ALLOWED_DOMAIN}`} />
          <FieldInput label={s.passwordLabel} type="password" value={password} onChange={setPassword} placeholder="••••••••" />

          {mode === "signup" && (
            <>
              <FieldSelect
                label={lang === "ar" ? "الكلية" : "College"}
                value={selectedCollege}
                onChange={(v) => { setSelectedCollege(v); setSelectedMajor(""); }}
                options={colleges.map((c) => ({ value: c.id, label: lang === "ar" && c.name_ar ? c.name_ar : c.name }))}
                placeholder={lang === "ar" ? "اختر الكلية" : "Select college"}
              />
              <FieldSelect
                label={lang === "ar" ? "التخصص" : "Major"}
                value={selectedMajor}
                onChange={setSelectedMajor}
                options={filteredMajors.map((m) => ({ value: m.id, label: lang === "ar" && m.name_ar ? m.name_ar : m.name }))}
                placeholder={lang === "ar" ? "اختر التخصص" : "Select major"}
                disabled={filteredMajors.length === 0}
              />
            </>
          )}

          {err && <div style={{ fontSize: 12, color: "#ff4d4d", padding: "4px 0" }}>{err}</div>}
          <button
            type="submit"
            disabled={loading}
            style={{
              marginTop: 4,
              padding: "12px 16px", border: "none", cursor: loading ? "not-allowed" : "pointer",
              background: "linear-gradient(135deg, #f97316, #ec4899)", color: "#fff",
              borderRadius: 8, fontSize: 14, fontWeight: 500,
              fontFamily: "var(--font-sans)",
              boxShadow: "0 0 24px rgba(249,115,22,0.4)",
              opacity: loading ? 0.7 : 1,
              transition: "background 150ms",
            }}
          >
            {loading ? s.waiting : mode === "signin" ? s.signInBtn : s.signUpBtn}
          </button>
          {mode === "signin" && (
            <button
              type="button"
              onClick={() => { setMode("forgot"); setErr(""); }}
              style={{
                background: "none", border: "none", color: "var(--ds-muted)", cursor: "pointer",
                fontSize: 11, textAlign: "center", padding: "2px 0", fontFamily: "var(--font-sans)",
              }}
            >
              {lang === "ar" ? "نسيت كلمة المرور؟" : "Forgot password?"}
            </button>
          )}
        </form>
        )}

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
          </>
        )}
      </div>

      <div style={{ marginTop: 24, fontSize: 11, color: "var(--ds-muted-soft, #666)", fontFamily: "var(--font-mono)" }}>
        academic-planner · IMAMU CS
      </div>
    </div>
  );
}

function FieldSelect({
  label, value, onChange, options, placeholder, disabled,
}: {
  label: string; value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string; disabled?: boolean;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: 11, color: "var(--ds-muted)", letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 600 }}>
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        style={{
          width: "100%", padding: "10px 12px",
          background: "var(--ds-canvas-deep)", color: value ? "var(--color-foreground)" : "var(--ds-muted)",
          border: "1px solid var(--ds-line-strong, #333)",
          borderRadius: 8, fontSize: 14, fontFamily: "var(--font-sans)",
          outline: "none", cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.5 : 1,
          appearance: "none",
        }}
        onFocus={(e) => (e.target.style.borderColor = "#f97316")}
        onBlur={(e) => (e.target.style.borderColor = "var(--ds-line-strong, #333)")}
      >
        <option value="" disabled>{placeholder}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
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
          background: "var(--ds-canvas-deep)", color: "var(--color-foreground)",
          border: "1px solid var(--ds-line-strong, #333)",
          borderRadius: 8, fontSize: 14, fontFamily: "var(--font-sans)",
          outline: "none",
        }}
        onFocus={(e) => (e.target.style.borderColor = "#f97316")}
        onBlur={(e) => (e.target.style.borderColor = "var(--ds-line-strong, #333)")}
      />
    </label>
  );
}
