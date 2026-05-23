import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import { useTheme } from "@/hooks/useTheme";
import { toast } from "sonner";

export const Route = createFileRoute("/profile")({
  component: ProfilePage,
  head: () => ({ meta: [{ title: "Profile — Academic Planner" }] }),
});

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  background: "var(--ds-canvas-deep, #000)",
  color: "var(--color-foreground)",
  border: "1px solid var(--ds-line-strong, #333)",
  borderRadius: 8,
  fontSize: 14,
  fontFamily: "var(--font-sans)",
  outline: "none",
  boxSizing: "border-box",
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: 11, color: "var(--ds-muted)", letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 600 }}>
        {label}
      </span>
      {children}
    </label>
  );
}

function ProfilePage() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const { lang, setLang } = useLanguage();
  const { theme, toggleTheme } = useTheme();
  const qc = useQueryClient();
  const [initialized, setInitialized] = useState(false);
  const [fullName, setFullName] = useState("");
  const [studentId, setStudentId] = useState("");
  const [batch, setBatch] = useState("");
  const [selectedCollege, setSelectedCollege] = useState("");
  const [selectedMajor, setSelectedMajor] = useState("");

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ["profile-edit", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await (supabase.from("profiles") as any)
        .select("full_name, student_id, batch, major_id, email")
        .eq("id", user!.id)
        .single();
      return data as { full_name: string | null; student_id: string | null; batch: number | null; major_id: string | null; email: string } | null;
    },
  });

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

  // Initialize form from DB once
  useEffect(() => {
    if (profile && !initialized && majors.length > 0) {
      setFullName(profile.full_name ?? "");
      setStudentId(profile.student_id ?? "");
      setBatch(profile.batch ? String(profile.batch) : "");
      setSelectedMajor(profile.major_id ?? "");
      if (profile.major_id) {
        const m = majors.find((x) => x.id === profile.major_id);
        if (m) setSelectedCollege(m.college_id ?? "");
      }
      setInitialized(true);
    }
  }, [profile, majors, initialized]);

  const filteredMajors = selectedCollege
    ? majors.filter((m) => m.college_id === selectedCollege)
    : majors;

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase.from("profiles") as any)
        .update({
          full_name: fullName.trim() || null,
          student_id: studentId.trim() || null,
          batch: batch ? parseInt(batch, 10) : null,
          major_id: selectedMajor || null,
        })
        .eq("id", user!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["profile"] });
      qc.invalidateQueries({ queryKey: ["profile-edit"] });
      toast.success(lang === "ar" ? "تم حفظ الملف الشخصي ✓" : "Profile saved ✓");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to save"),
  });

  if (loading || profileLoading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--color-background)", color: "var(--ds-muted)", fontFamily: "var(--font-sans)" }}>
        {lang === "ar" ? "جارٍ التحميل…" : "Loading…"}
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--color-background)", fontFamily: "var(--font-sans)" }}>
      {/* Header */}
      <header style={{
        position: "sticky", top: 0, zIndex: 10,
        background: "rgba(15,15,15,0.88)",
        backdropFilter: "blur(12px)",
        borderBottom: "1px solid var(--ds-line-soft, #1a1a1a)",
        padding: "12px 20px",
        display: "flex", alignItems: "center", gap: 10,
      }}>
        <button
          onClick={() => navigate({ to: "/" })}
          style={{ background: "none", border: "none", color: "var(--ds-muted)", cursor: "pointer", fontSize: 13, display: "flex", alignItems: "center", gap: 6, fontFamily: "var(--font-sans)", padding: "4px 0" }}
        >
          ← {lang === "ar" ? "رجوع" : "Back"}
        </button>
        <div style={{ flex: 1 }} />
        <button
          onClick={toggleTheme}
          style={{ background: "transparent", border: "1px solid var(--ds-line-strong, #333)", color: "var(--ds-body)", borderRadius: 8, padding: "6px 10px", cursor: "pointer", fontSize: 13 }}
        >
          {theme === "dark" ? "☀️" : "🌙"}
        </button>
        <button
          onClick={() => setLang(lang === "en" ? "ar" : "en")}
          style={{ background: "transparent", border: "1px solid var(--ds-line-strong, #333)", color: "var(--ds-body)", borderRadius: 8, padding: "6px 10px", cursor: "pointer", fontSize: 11, fontFamily: "var(--font-mono)", fontWeight: 600 }}
        >
          {lang === "en" ? "ع" : "EN"}
        </button>
      </header>

      <main style={{ maxWidth: 480, margin: "0 auto", padding: "32px 20px 80px" }}>
        {/* Title */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 22, fontWeight: 600, color: "var(--color-foreground)", letterSpacing: "-0.02em" }}>
            {lang === "ar" ? "الملف الشخصي" : "Your Profile"}
          </div>
          <div style={{ fontSize: 13, color: "var(--ds-muted)", marginTop: 4, fontFamily: "var(--font-mono)" }}>
            {user?.email}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Field label={lang === "ar" ? "الاسم الكامل" : "Full Name"}>
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder={lang === "ar" ? "أدخل اسمك الكامل" : "Enter your full name"}
              style={inputStyle}
              onFocus={(e) => (e.target.style.borderColor = "#f97316")}
              onBlur={(e) => (e.target.style.borderColor = "var(--ds-line-strong, #333)")}
            />
          </Field>

          <Field label={lang === "ar" ? "الرقم الجامعي" : "Student ID"}>
            <input
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              placeholder={lang === "ar" ? "مثال: 445011121" : "e.g. 445011121"}
              style={inputStyle}
              onFocus={(e) => (e.target.style.borderColor = "#f97316")}
              onBlur={(e) => (e.target.style.borderColor = "var(--ds-line-strong, #333)")}
            />
          </Field>

          <Field label={lang === "ar" ? "سنة الالتحاق" : "Batch Year"}>
            <input
              type="number"
              value={batch}
              onChange={(e) => setBatch(e.target.value)}
              placeholder={lang === "ar" ? "مثال: 2022" : "e.g. 2022"}
              min={2000}
              max={2100}
              style={inputStyle}
              onFocus={(e) => (e.target.style.borderColor = "#f97316")}
              onBlur={(e) => (e.target.style.borderColor = "var(--ds-line-strong, #333)")}
            />
          </Field>

          {/* Divider */}
          <div style={{ borderTop: "1px solid var(--ds-line-soft, #1a1a1a)", marginTop: 4, paddingTop: 4 }}>
            <div style={{ fontSize: 11, color: "var(--ds-muted)", marginBottom: 12, letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 600 }}>
              {lang === "ar" ? "التخصص" : "Academic Program"}
            </div>
          </div>

          <Field label={lang === "ar" ? "الكلية" : "College"}>
            <select
              value={selectedCollege}
              onChange={(e) => { setSelectedCollege(e.target.value); setSelectedMajor(""); }}
              style={{ ...inputStyle, cursor: "pointer", appearance: "none" }}
              onFocus={(e) => (e.target.style.borderColor = "#f97316")}
              onBlur={(e) => (e.target.style.borderColor = "var(--ds-line-strong, #333)")}
            >
              <option value="">{lang === "ar" ? "اختر الكلية" : "Select college"}</option>
              {colleges.map((c) => (
                <option key={c.id} value={c.id}>
                  {lang === "ar" && c.name_ar ? c.name_ar : c.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label={lang === "ar" ? "التخصص" : "Major"}>
            <select
              value={selectedMajor}
              onChange={(e) => setSelectedMajor(e.target.value)}
              disabled={!selectedCollege && filteredMajors.length === 0}
              style={{ ...inputStyle, cursor: "pointer", appearance: "none", opacity: (!selectedCollege && filteredMajors.length === 0) ? 0.5 : 1 }}
              onFocus={(e) => (e.target.style.borderColor = "#f97316")}
              onBlur={(e) => (e.target.style.borderColor = "var(--ds-line-strong, #333)")}
            >
              <option value="">{lang === "ar" ? "اختر التخصص" : "Select major"}</option>
              {filteredMajors.map((m) => (
                <option key={m.id} value={m.id}>
                  {lang === "ar" && m.name_ar ? m.name_ar : m.name}
                </option>
              ))}
            </select>
          </Field>

          <button
            onClick={() => save.mutate()}
            disabled={save.isPending}
            style={{
              marginTop: 8,
              padding: "13px 16px", border: "none",
              cursor: save.isPending ? "not-allowed" : "pointer",
              background: "linear-gradient(135deg, #f97316, #ec4899)", color: "#fff",
              borderRadius: 10, fontSize: 14, fontWeight: 500, fontFamily: "var(--font-sans)",
              boxShadow: "0 0 24px rgba(249,115,22,0.35)",
              opacity: save.isPending ? 0.7 : 1,
              transition: "opacity 150ms",
            }}
          >
            {save.isPending
              ? (lang === "ar" ? "جارٍ الحفظ…" : "Saving…")
              : (lang === "ar" ? "حفظ التغييرات" : "Save Changes")}
          </button>
        </div>
      </main>
    </div>
  );
}
