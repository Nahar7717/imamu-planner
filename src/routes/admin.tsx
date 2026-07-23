import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export const Route = createFileRoute("/admin")({
  component: AdminPage,
  head: () => ({ meta: [{ title: "Admin — Academic Planner" }] }),
});

type Profile  = { id: string; email: string; major_id: string | null; is_admin: boolean; full_name: string | null };
type Course   = { code: string; name: string; name_ar: string | null; code_ar: string | null; credits: number; course_type: string; level_num: number | null; major_id: string | null; notes: string | null };
type College  = { id: string; name: string; name_ar: string | null };
type Major    = { id: string; college_id: string; name: string; name_ar: string | null; total_credits: number };

const GRAD = "linear-gradient(135deg, #f97316, #ec4899)";
const BTN: React.CSSProperties = {
  padding: "6px 14px", border: "none", borderRadius: 6, cursor: "pointer",
  fontSize: 12, fontWeight: 600, fontFamily: "var(--font-sans)",
};

function AdminPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<"stats" | "courses" | "majors" | "users" | "import">("stats");

  const { data: profile } = useQuery({
    queryKey: ["admin-profile", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("is_admin").eq("id", user!.id).single();
      return data as { is_admin: boolean } | null;
    },
  });

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  useEffect(() => {
    if (profile && !profile.is_admin) navigate({ to: "/" });
  }, [profile, navigate]);

  if (loading || !profile) return <LoadingScreen />;
  if (!profile.is_admin) return null;

  const tabs = [
    { key: "stats",   label: "Stats" },
    { key: "courses", label: "Courses" },
    { key: "majors",  label: "Colleges & Majors" },
    { key: "users",   label: "Users" },
    { key: "import",  label: "Bulk Import" },
  ] as const;

  return (
    <div style={{ minHeight: "100vh", background: "var(--color-background)", color: "var(--color-foreground)" }}>
      <header style={{
        height: 52, padding: "0 28px", display: "flex", alignItems: "center", justifyContent: "space-between",
        borderBottom: "1px solid var(--ds-w06)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: GRAD, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 16px rgba(249,115,22,0.4)" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
            </svg>
          </div>
          <span style={{ fontSize: 14, fontWeight: 600 }}>Admin Panel</span>
          <span style={{ fontSize: 11, color: "#f97316", background: "rgba(249,115,22,0.1)", border: "1px solid rgba(249,115,22,0.25)", borderRadius: 99, padding: "1px 8px" }}>admin</span>
        </div>
        <button onClick={() => navigate({ to: "/" })} style={{ ...BTN, background: "var(--ds-w06)", color: "var(--ds-muted)" }}>
          ← Back to Planner
        </button>
      </header>

      <div style={{ padding: "0 28px", borderBottom: "1px solid var(--ds-w06)", display: "flex", gap: 0 }}>
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: "12px 16px", fontSize: 12, fontWeight: 500, cursor: "pointer",
            background: "transparent", border: "none", borderBottom: tab === t.key ? "2px solid #f97316" : "2px solid transparent",
            color: tab === t.key ? "#f97316" : "#52525b", fontFamily: "var(--font-sans)",
            marginBottom: -1,
          }}>
            {t.label}
          </button>
        ))}
      </div>

      <main style={{ maxWidth: 900, margin: "0 auto", padding: "28px 20px 80px" }}>
        {tab === "stats"   && <StatsTab />}
        {tab === "courses" && <CoursesTab />}
        {tab === "majors"  && <MajorsTab />}
        {tab === "users"   && <UsersTab />}
        {tab === "import"  && <ImportTab />}
      </main>
    </div>
  );
}

// ── Stats ────────────────────────────────────────────────────────────────────

function StatsTab() {
  const { data: profiles = [] } = useQuery({
    queryKey: ["admin-all-profiles"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("*");
      return (data ?? []) as Profile[];
    },
  });

  const { data: progress = [] } = useQuery({
    queryKey: ["admin-all-progress"],
    queryFn: async () => {
      const { data } = await supabase.from("student_progress").select("course_code, student_id");
      return (data ?? []) as { course_code: string; student_id: string }[];
    },
  });

  const { data: courses = [] } = useQuery({
    queryKey: ["admin-courses-count"],
    queryFn: async () => {
      const { data } = await supabase.from("courses").select("code");
      return (data ?? []) as { code: string }[];
    },
  });

  const totalUsers    = profiles.length;
  const totalStudents = profiles.filter((p) => !p.is_admin).length;
  const totalAdmins   = profiles.filter((p) => p.is_admin).length;
  const totalCourses  = courses.length;
  const completions   = progress.length;

  const freq = progress.reduce<Record<string, number>>((acc, p) => {
    acc[p.course_code] = (acc[p.course_code] ?? 0) + 1;
    return acc;
  }, {});
  const topCourse = Object.entries(freq).sort((a, b) => b[1] - a[1])[0];

  const statCards = [
    { label: "Total Users",   value: totalUsers,    color: "#8b5cf6" },
    { label: "Students",      value: totalStudents,  color: "#06b6d4" },
    { label: "Admins",        value: totalAdmins,    color: "#f97316" },
    { label: "Total Courses", value: totalCourses,   color: "#ec4899" },
    { label: "Completions",   value: completions,    color: "#22c55e" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <SectionTitle>Overview</SectionTitle>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12 }}>
        {statCards.map((s) => (
          <div key={s.label} style={{
            background: "var(--color-card)", border: "1px solid var(--ds-w06)",
            borderRadius: 12, padding: "18px 20px", borderTop: `2px solid ${s.color}`,
          }}>
            <div style={{ fontSize: 32, fontWeight: 700, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 12, color: "var(--ds-muted)", marginTop: 4 }}>{s.label}</div>
          </div>
        ))}
      </div>
      {topCourse && (
        <div style={{ background: "var(--color-card)", border: "1px solid var(--ds-w06)", borderRadius: 12, padding: "18px 20px" }}>
          <div style={{ fontSize: 11, color: "var(--ds-muted)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>Most Completed Course</div>
          <div style={{ fontSize: 20, fontWeight: 600, color: "#f97316" }}>{topCourse[0]}</div>
          <div style={{ fontSize: 13, color: "var(--ds-muted)", marginTop: 2 }}>completed by {topCourse[1]} student{topCourse[1] !== 1 ? "s" : ""}</div>
        </div>
      )}
    </div>
  );
}

// ── Courses ──────────────────────────────────────────────────────────────────

function CoursesTab() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Course | null>(null);
  const [adding, setAdding] = useState(false);

  const { data: courses = [] } = useQuery({
    queryKey: ["admin-courses-full"],
    queryFn: async () => {
      const { data } = await supabase.from("courses").select("*").order("level_num", { nullsFirst: false }).order("code");
      return (data ?? []) as Course[];
    },
  });

  const { data: majors = [] } = useQuery({
    queryKey: ["majors"],
    queryFn: async () => {
      const { data } = await supabase.from("majors").select("*");
      return (data ?? []) as Major[];
    },
  });

  const deleteCourse = useMutation({
    mutationFn: async (code: string) => {
      const { error } = await supabase.from("courses").delete().eq("code", code);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-courses-full"] }); toast.success("Course deleted"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Delete failed"),
  });

  const filtered = courses.filter((c) =>
    c.code.toLowerCase().includes(search.toLowerCase()) ||
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <SectionTitle>Courses ({courses.length})</SectionTitle>
        <button onClick={() => setAdding(true)} style={{ ...BTN, background: GRAD, color: "#fff" }}>+ Add Course</button>
      </div>
      <input
        placeholder="Search by code or name…"
        value={search} onChange={(e) => setSearch(e.target.value)}
        style={{ ...inputStyle, maxWidth: 320 }}
      />
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ display: "grid", gridTemplateColumns: "80px 1fr 80px 80px 60px 80px", gap: 8, padding: "6px 12px", fontSize: 10, color: "var(--ds-muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
          <span>Code</span><span>Name</span><span>Type</span><span>Major</span><span>Cr</span><span>Actions</span>
        </div>
        {filtered.map((c) => (
          <div key={c.code} style={{
            display: "grid", gridTemplateColumns: "80px 1fr 80px 80px 60px 80px", gap: 8,
            padding: "10px 12px", background: "var(--color-card)",
            border: "1px solid var(--ds-w06)", borderRadius: 8, alignItems: "center",
          }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "#f97316" }}>{c.code}</span>
            <span style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
            <span style={{ fontSize: 11, color: "var(--ds-muted)" }}>{c.course_type}</span>
            <span style={{ fontSize: 11, color: "var(--ds-muted)" }}>{c.major_id ?? "—"}</span>
            <span style={{ fontSize: 12 }}>{c.credits}</span>
            <div style={{ display: "flex", gap: 4 }}>
              <button onClick={() => setEditing(c)} style={{ ...BTN, background: "var(--ds-w06)", color: "var(--color-foreground)", padding: "4px 10px" }}>Edit</button>
              <button
                onClick={() => { if (confirm(`Delete ${c.code}?`)) deleteCourse.mutate(c.code); }}
                style={{ ...BTN, background: "rgba(239,68,68,0.12)", color: "#ef4444", padding: "4px 10px" }}
              >Del</button>
            </div>
          </div>
        ))}
      </div>
      {(editing || adding) && (
        <CourseModal
          course={editing}
          majors={majors}
          onClose={() => { setEditing(null); setAdding(false); }}
          onSaved={() => { qc.invalidateQueries({ queryKey: ["admin-courses-full"] }); setEditing(null); setAdding(false); }}
        />
      )}
    </div>
  );
}

function CourseModal({ course, majors, onClose, onSaved }: {
  course: Course | null; majors: Major[];
  onClose: () => void; onSaved: () => void;
}) {
  const isNew = !course;
  const [form, setForm] = useState<Partial<Course>>(course ?? { credits: 3, level_num: 1 });
  const [saving, setSaving] = useState(false);
  const set = (k: keyof Course, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.code || !form.name || !form.course_type) { toast.error("Code, name and type are required"); return; }
    setSaving(true);
    const { error } = isNew
      ? await supabase.from("courses").insert(form as any)
      : await supabase.from("courses").update(form as any).eq("code", course!.code);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(isNew ? "Course added" : "Course updated");
    onSaved();
  };

  return (
    <Modal title={isNew ? "Add Course" : `Edit ${course?.code}`} onClose={onClose}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <FormField label="Code *"><input style={inputStyle} value={form.code ?? ""} onChange={(e) => set("code", e.target.value)} disabled={!isNew} /></FormField>
        <FormField label="Code (Arabic)"><input style={inputStyle} value={form.code_ar ?? ""} onChange={(e) => set("code_ar", e.target.value)} /></FormField>
        <FormField label="Name (English) *"><input style={inputStyle} value={form.name ?? ""} onChange={(e) => set("name", e.target.value)} /></FormField>
        <FormField label="Name (Arabic)"><input style={inputStyle} value={form.name_ar ?? ""} onChange={(e) => set("name_ar", e.target.value)} /></FormField>
        <FormField label="Credits *"><input style={inputStyle} type="number" value={form.credits ?? 3} onChange={(e) => set("credits", parseInt(e.target.value))} /></FormField>
        <FormField label="Level"><input style={inputStyle} type="number" value={form.level_num ?? ""} onChange={(e) => set("level_num", e.target.value ? parseInt(e.target.value) : null)} /></FormField>
        <FormField label="Type *">
          <select style={inputStyle} value={form.course_type ?? ""} onChange={(e) => set("course_type", e.target.value)}>
            <option value="">Select type</option>
            {["cs_core","cs_elective","uni_mandatory","uni_group","free_elective"].map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </FormField>
        <FormField label="Major">
          <select style={inputStyle} value={form.major_id ?? ""} onChange={(e) => set("major_id", e.target.value || null)}>
            <option value="">None</option>
            {majors.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </FormField>
        <FormField label="Notes" style={{ gridColumn: "1 / -1" }}>
          <input style={inputStyle} value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value)} />
        </FormField>
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
        <button onClick={onClose} style={{ ...BTN, background: "var(--ds-w06)", color: "var(--ds-muted)" }}>Cancel</button>
        <button onClick={save} disabled={saving} style={{ ...BTN, background: GRAD, color: "#fff", opacity: saving ? 0.7 : 1 }}>
          {saving ? "Saving…" : isNew ? "Add Course" : "Save Changes"}
        </button>
      </div>
    </Modal>
  );
}

// ── Colleges & Majors ────────────────────────────────────────────────────────

function MajorsTab() {
  const qc = useQueryClient();
  const [addingCollege, setAddingCollege] = useState(false);
  const [addingMajor, setAddingMajor] = useState(false);

  const { data: colleges = [] } = useQuery({
    queryKey: ["admin-colleges"],
    queryFn: async () => { const { data } = await supabase.from("colleges").select("*"); return (data ?? []) as College[]; },
  });

  const { data: majors = [] } = useQuery({
    queryKey: ["admin-majors"],
    queryFn: async () => { const { data } = await supabase.from("majors").select("*"); return (data ?? []) as Major[]; },
  });

  const deleteCollege = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("colleges").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-colleges"] }); toast.success("College deleted"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const deleteMajor = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("majors").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-majors"] }); toast.success("Major deleted"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <SectionTitle>Colleges</SectionTitle>
          <button onClick={() => setAddingCollege(true)} style={{ ...BTN, background: GRAD, color: "#fff" }}>+ Add College</button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {colleges.map((c) => (
            <div key={c.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", background: "var(--color-card)", border: "1px solid var(--ds-w06)", borderRadius: 8 }}>
              <div>
                <span style={{ fontWeight: 500 }}>{c.name}</span>
                {c.name_ar && <span style={{ marginInlineStart: 8, color: "var(--ds-muted)", fontSize: 13 }}> · {c.name_ar}</span>}
                <span style={{ fontSize: 11, color: "var(--ds-muted)", fontFamily: "var(--font-mono)" }}> [{c.id}]</span>
              </div>
              <button onClick={() => { if (confirm(`Delete college ${c.id}?`)) deleteCollege.mutate(c.id); }} style={{ ...BTN, background: "rgba(239,68,68,0.12)", color: "#ef4444" }}>Delete</button>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <SectionTitle>Majors</SectionTitle>
          <button onClick={() => setAddingMajor(true)} style={{ ...BTN, background: GRAD, color: "#fff" }}>+ Add Major</button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {majors.map((m) => {
            const college = colleges.find((c) => c.id === m.college_id);
            return (
              <div key={m.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", background: "var(--color-card)", border: "1px solid var(--ds-w06)", borderRadius: 8 }}>
                <div>
                  <span style={{ fontWeight: 500 }}>{m.name}</span>
                  {m.name_ar && <span style={{ color: "var(--ds-muted)", fontSize: 13 }}> · {m.name_ar}</span>}
                  <div style={{ fontSize: 11, color: "var(--ds-muted)", marginTop: 2 }}>{college?.name ?? m.college_id} · {m.total_credits} credits · <span style={{ fontFamily: "var(--font-mono)" }}>[{m.id}]</span></div>
                </div>
                <button onClick={() => { if (confirm(`Delete major ${m.id}?`)) deleteMajor.mutate(m.id); }} style={{ ...BTN, background: "rgba(239,68,68,0.12)", color: "#ef4444" }}>Delete</button>
              </div>
            );
          })}
        </div>
      </div>

      {addingCollege && <CollegeModal onClose={() => setAddingCollege(false)} onSaved={() => { qc.invalidateQueries({ queryKey: ["admin-colleges"] }); setAddingCollege(false); }} />}
      {addingMajor  && <MajorModal colleges={colleges} onClose={() => setAddingMajor(false)} onSaved={() => { qc.invalidateQueries({ queryKey: ["admin-majors"] }); setAddingMajor(false); }} />}
    </div>
  );
}

function CollegeModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ id: "", name: "", name_ar: "" });
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!form.id || !form.name) { toast.error("ID and name required"); return; }
    setSaving(true);
    const { error } = await supabase.from("colleges").insert({ id: form.id, name: form.name, name_ar: form.name_ar || null });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("College added"); onSaved();
  };
  return (
    <Modal title="Add College" onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <FormField label="ID (unique, e.g. ccs)"><input style={inputStyle} value={form.id} onChange={(e) => setForm((f) => ({ ...f, id: e.target.value }))} /></FormField>
        <FormField label="Name (English)"><input style={inputStyle} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></FormField>
        <FormField label="Name (Arabic)"><input style={inputStyle} value={form.name_ar} onChange={(e) => setForm((f) => ({ ...f, name_ar: e.target.value }))} /></FormField>
      </div>
      <ModalActions onClose={onClose} onSave={save} saving={saving} label="Add College" />
    </Modal>
  );
}

function MajorModal({ colleges, onClose, onSaved }: { colleges: College[]; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ id: "", college_id: "", name: "", name_ar: "", total_credits: 135 });
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!form.id || !form.name || !form.college_id) { toast.error("ID, college and name required"); return; }
    setSaving(true);
    const { error } = await supabase.from("majors").insert({ ...form, name_ar: form.name_ar || null });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Major added"); onSaved();
  };
  return (
    <Modal title="Add Major" onClose={onClose}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <FormField label="ID (unique, e.g. cs)"><input style={inputStyle} value={form.id} onChange={(e) => setForm((f) => ({ ...f, id: e.target.value }))} /></FormField>
        <FormField label="College">
          <select style={inputStyle} value={form.college_id} onChange={(e) => setForm((f) => ({ ...f, college_id: e.target.value }))}>
            <option value="">Select college</option>
            {colleges.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </FormField>
        <FormField label="Name (English)"><input style={inputStyle} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></FormField>
        <FormField label="Name (Arabic)"><input style={inputStyle} value={form.name_ar} onChange={(e) => setForm((f) => ({ ...f, name_ar: e.target.value }))} /></FormField>
        <FormField label="Total Credits"><input style={inputStyle} type="number" value={form.total_credits} onChange={(e) => setForm((f) => ({ ...f, total_credits: parseInt(e.target.value) }))} /></FormField>
      </div>
      <ModalActions onClose={onClose} onSave={save} saving={saving} label="Add Major" />
    </Modal>
  );
}

// ── Users ────────────────────────────────────────────────────────────────────

function UsersTab() {
  const qc = useQueryClient();
  const { data: profiles = [] } = useQuery({
    queryKey: ["admin-all-profiles"],
    queryFn: async () => { const { data } = await supabase.from("profiles").select("*"); return (data ?? []) as Profile[]; },
  });
  const { data: majors = [] } = useQuery({
    queryKey: ["admin-majors"],
    queryFn: async () => { const { data } = await supabase.from("majors").select("*"); return (data ?? []) as Major[]; },
  });

  const updateMajor = useMutation({
    mutationFn: async ({ id, major_id }: { id: string; major_id: string }) => {
      const { error } = await supabase.from("profiles").update({ major_id }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-all-profiles"] }); toast.success("Major updated"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const toggleAdmin = useMutation({
    mutationFn: async ({ id, is_admin }: { id: string; is_admin: boolean }) => {
      const { error } = await supabase.from("profiles").update({ is_admin }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-all-profiles"] }); toast.success("Admin status updated"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <SectionTitle>Users ({profiles.length})</SectionTitle>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 120px 120px 80px", gap: 8, padding: "6px 12px", fontSize: 10, color: "var(--ds-muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
          <span>Email</span><span>Major</span><span>Role</span><span></span>
        </div>
        {profiles.map((p) => (
          <div key={p.id} style={{ display: "grid", gridTemplateColumns: "1fr 120px 120px 80px", gap: 8, padding: "10px 12px", background: "var(--color-card)", border: "1px solid var(--ds-w06)", borderRadius: 8, alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 13 }}>{p.email}</div>
              {p.full_name && <div style={{ fontSize: 11, color: "var(--ds-muted)" }}>{p.full_name}</div>}
            </div>
            <select
              value={p.major_id ?? ""}
              onChange={(e) => updateMajor.mutate({ id: p.id, major_id: e.target.value })}
              style={{ ...inputStyle, fontSize: 11, padding: "4px 8px" }}
            >
              <option value="">None</option>
              {majors.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
            <span style={{
              fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 99, textAlign: "center",
              background: p.is_admin ? "rgba(249,115,22,0.12)" : "var(--ds-w04)",
              color: p.is_admin ? "#f97316" : "var(--ds-muted)",
              border: p.is_admin ? "1px solid rgba(249,115,22,0.25)" : "1px solid var(--ds-w07)",
            }}>{p.is_admin ? "Admin" : "Student"}</span>
            <button
              onClick={() => toggleAdmin.mutate({ id: p.id, is_admin: !p.is_admin })}
              style={{ ...BTN, background: "var(--ds-w06)", color: "var(--ds-muted)", padding: "4px 8px", fontSize: 11 }}
            >{p.is_admin ? "Revoke" : "Make Admin"}</button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Bulk Import ───────────────────────────────────────────────────────────────

const EXAMPLE_JSON = JSON.stringify({
  major_id: "cs",
  courses: [
    {
      code: "CS499",
      code_ar: "ح ح 499",
      name: "Example Course",
      name_ar: "مقرر مثال",
      course_type: "cs_core",
      credits: 3,
      level_num: 8,
      notes: null,
      prerequisites: ["CS301"],
    },
  ],
}, null, 2);

type ImportCourse = {
  code: string;
  code_ar?: string | null;
  name: string;
  name_ar?: string | null;
  course_type: string;
  credits: number;
  level_num?: number | null;
  notes?: string | null;
  prerequisites?: string[];
};

function ImportTab() {
  const qc = useQueryClient();
  const [json, setJson] = useState("");
  const [preview, setPreview] = useState<{ courses: ImportCourse[]; major_id: string } | null>(null);
  const [parseErr, setParseErr] = useState("");
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ inserted: number; prereqs: number; skipped: string[] } | null>(null);

  const parse = () => {
    setParseErr("");
    setPreview(null);
    setResult(null);
    try {
      const obj = JSON.parse(json);
      if (!obj.major_id || typeof obj.major_id !== "string") throw new Error("Missing or invalid 'major_id'");
      if (!Array.isArray(obj.courses) || obj.courses.length === 0) throw new Error("'courses' must be a non-empty array");
      for (const c of obj.courses) {
        if (!c.code || !c.name || !c.course_type || typeof c.credits !== "number") {
          throw new Error(`Course missing required fields: code, name, course_type, credits. Got: ${JSON.stringify(c)}`);
        }
      }
      setPreview({ major_id: obj.major_id, courses: obj.courses });
    } catch (e) {
      setParseErr(e instanceof Error ? e.message : "Invalid JSON");
    }
  };

  const runImport = async () => {
    if (!preview) return;
    setImporting(true);
    setResult(null);
    const skipped: string[] = [];
    let inserted = 0;
    let prereqCount = 0;

    try {
      for (const c of preview.courses) {
        const { error } = await (supabase.from("courses") as any).upsert({
          code: c.code,
          code_ar: c.code_ar ?? null,
          name: c.name,
          name_ar: c.name_ar ?? null,
          course_type: c.course_type,
          credits: c.credits,
          level_num: c.level_num ?? null,
          major_id: preview.major_id,
          notes: c.notes ?? null,
        }, { onConflict: "code" });

        if (error) { skipped.push(`${c.code}: ${error.message}`); continue; }
        inserted++;

        // Insert prerequisites
        if (c.prerequisites && c.prerequisites.length > 0) {
          for (const prereq of c.prerequisites) {
            const { error: pe } = await supabase.from("prerequisites").upsert(
              { course_code: c.code, prereq_code: prereq },
              { onConflict: "course_code,prereq_code" },
            );
            if (!pe) prereqCount++;
          }
        }
      }

      setResult({ inserted, prereqs: prereqCount, skipped });
      qc.invalidateQueries({ queryKey: ["courses"] });
      toast.success(`Imported ${inserted} courses, ${prereqCount} prerequisite links`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <SectionTitle>Bulk Course Import</SectionTitle>
        <p style={{ fontSize: 13, color: "var(--ds-muted)", marginTop: 6, lineHeight: 1.6 }}>
          Paste a JSON object to insert or upsert multiple courses at once, including their prerequisites.
          Existing courses with the same code will be updated.
        </p>
      </div>

      {/* Example format */}
      <div style={{ background: "var(--ds-w03)", border: "1px solid var(--ds-w08)", borderRadius: 10, padding: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--ds-muted)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 10 }}>
          Expected Format
        </div>
        <pre style={{ fontSize: 11, color: "#a8a8a8", fontFamily: "var(--font-mono)", margin: 0, whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
          {EXAMPLE_JSON}
        </pre>
        <div style={{ marginTop: 10, fontSize: 11, color: "var(--ds-muted)", lineHeight: 1.6 }}>
          <b style={{ color: "#f97316" }}>course_type</b> values: <code>cs_core</code>, <code>cs_elec</code>, <code>uni_mandatory</code>, <code>free_elec</code><br />
          <b style={{ color: "#f97316" }}>prerequisites</b>: array of existing course codes (optional)
        </div>
        <button
          onClick={() => setJson(EXAMPLE_JSON)}
          style={{ ...BTN, marginTop: 10, background: "var(--ds-w06)", color: "var(--ds-muted)" }}
        >
          Load Example
        </button>
      </div>

      {/* JSON input */}
      <FormField label="JSON Input">
        <textarea
          value={json}
          onChange={(e) => { setJson(e.target.value); setParseErr(""); setPreview(null); setResult(null); }}
          rows={14}
          placeholder='{ "major_id": "cs", "courses": [...] }'
          style={{ ...inputStyle, resize: "vertical", lineHeight: 1.5, fontFamily: "var(--font-mono)", fontSize: 12 }}
        />
      </FormField>

      {parseErr && (
        <div style={{ fontSize: 12, color: "#ff4d4d", background: "rgba(255,77,77,0.08)", border: "1px solid rgba(255,77,77,0.2)", borderRadius: 8, padding: "10px 14px" }}>
          ⚠ {parseErr}
        </div>
      )}

      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={parse} style={{ ...BTN, background: "var(--ds-w08)", color: "var(--color-foreground)", padding: "8px 18px" }}>
          Preview
        </button>
        {preview && (
          <button
            onClick={runImport}
            disabled={importing}
            style={{ ...BTN, background: GRAD, color: "#fff", padding: "8px 18px", opacity: importing ? 0.7 : 1 }}
          >
            {importing ? "Importing…" : `Import ${preview.courses.length} courses`}
          </button>
        )}
      </div>

      {/* Preview table */}
      {preview && !result && (
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-foreground)", marginBottom: 10 }}>
            Preview — {preview.courses.length} courses for major <code style={{ color: "#f97316" }}>{preview.major_id}</code>
          </div>
          <div style={{ border: "1px solid var(--ds-w08)", borderRadius: 10, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: "var(--ds-w04)", textAlign: "left" }}>
                  {["Code", "Name", "Type", "Cr", "Lvl", "Prereqs"].map((h) => (
                    <th key={h} style={{ padding: "8px 12px", fontWeight: 600, color: "var(--ds-muted)", fontSize: 11 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.courses.map((c, i) => (
                  <tr key={c.code} style={{ borderTop: "1px solid var(--ds-w05)", background: i % 2 === 0 ? "transparent" : "var(--ds-w02)" }}>
                    <td style={{ padding: "7px 12px", fontFamily: "var(--font-mono)", color: "#f97316" }}>{c.code}</td>
                    <td style={{ padding: "7px 12px", color: "var(--color-foreground)" }}>{c.name}</td>
                    <td style={{ padding: "7px 12px", color: "var(--ds-muted)" }}>{c.course_type}</td>
                    <td style={{ padding: "7px 12px", color: "var(--ds-muted)" }}>{c.credits}</td>
                    <td style={{ padding: "7px 12px", color: "var(--ds-muted)" }}>{c.level_num ?? "—"}</td>
                    <td style={{ padding: "7px 12px", color: "var(--ds-muted)", fontFamily: "var(--font-mono)", fontSize: 11 }}>
                      {c.prerequisites?.join(", ") || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Result */}
      {result && (
        <div style={{ background: "rgba(34,197,94,0.07)", border: "1px solid rgba(34,197,94,0.2)", borderRadius: 10, padding: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#4ade80", marginBottom: 8 }}>
            ✓ Import complete
          </div>
          <div style={{ fontSize: 13, color: "var(--ds-body)", lineHeight: 1.8 }}>
            {result.inserted} courses inserted/updated<br />
            {result.prereqs} prerequisite links added
          </div>
          {result.skipped.length > 0 && (
            <div style={{ marginTop: 10, fontSize: 12, color: "#ff4d4d" }}>
              <b>Skipped:</b><br />
              {result.skipped.map((s, i) => <div key={i}>{s}</div>)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Shared helpers ────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "8px 10px", background: "var(--ds-canvas-deep)",
  color: "var(--color-foreground)", border: "1px solid var(--ds-line-strong, #333)",
  borderRadius: 6, fontSize: 13, fontFamily: "var(--font-sans)", outline: "none",
};

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 16, fontWeight: 600, color: "var(--color-foreground)" }}>{children}</div>;
}

function FormField({ label, children, style }: { label: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 5, ...style }}>
      <span style={{ fontSize: 11, color: "var(--ds-muted)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>{label}</span>
      {children}
    </label>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "var(--ds-scrim)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: 20 }}>
      <div style={{ background: "var(--color-card)", border: "1px solid var(--ds-w10)", borderRadius: 14, padding: 24, width: "100%", maxWidth: 560, maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 18, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          {title}
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--ds-muted)", cursor: "pointer", fontSize: 18, lineHeight: 1 }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ModalActions({ onClose, onSave, saving, label }: { onClose: () => void; onSave: () => void; saving: boolean; label: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
      <button onClick={onClose} style={{ ...BTN, background: "var(--ds-w06)", color: "var(--ds-muted)" }}>Cancel</button>
      <button onClick={onSave} disabled={saving} style={{ ...BTN, background: GRAD, color: "#fff", opacity: saving ? 0.7 : 1 }}>
        {saving ? "Saving…" : label}
      </button>
    </div>
  );
}

function LoadingScreen() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--color-background)", color: "var(--ds-muted)" }}>
      Loading…
    </div>
  );
}
