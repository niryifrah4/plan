"use client";

import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { fmtILS } from "@/lib/format";
import { usePersistedState } from "@/hooks/usePersistedState";
import { useAutoSave } from "@/hooks/useAutoSave";
import { SaveIndicator } from "@/components/SaveIndicator";
import { InviteClientButton } from "@/components/crm/InviteClientButton";

/* ═══════════════════════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════════════════════ */
type LeadStatus = "new" | "in_progress" | "not_relevant" | "converted";
type CrmTab = "leads" | "clients";

interface FollowUp {
  id: number;
  text: string;
  timestamp: string;
}

interface Lead {
  id: number;
  name: string;
  phone: string;
  email: string;
  source: string;
  status: LeadStatus;
  createdAt: string;
  followUps: FollowUp[];
}

interface Client {
  id: number;
  family: string;
  step: number;
  totalSteps: number;
  netWorth: number;
  trend: string;
  members: number;
  joined: string;
  docsUploaded: number;
  docsTotal: number;
  monthlyRevenue: number;
  riskProfile: string;
  convertedFromLead?: string;
  householdId?: string; // Real Supabase household UUID (when synced from DB)
  email?: string;  // Primary contact email — inherited from lead on conversion
  phone?: string;  // Primary contact phone — inherited from lead on conversion
}

/* ═══════════════════════════════════════════════════════════════════
   Static maps
   ═══════════════════════════════════════════════════════════════════ */
const STATUS_META: Record<LeadStatus, { label: string; color: string; bg: string; icon: string }> = {
  new:           { label: "חדש",         color: "#2B694D", bg: "#2B694D18", icon: "fiber_new" },
  in_progress:   { label: "בטיפול",      color: "#3b82f6", bg: "#3b82f618", icon: "pending" },
  not_relevant:  { label: "לא רלוונטי", color: "#9ca3af", bg: "#9ca3af18", icon: "block" },
  converted:     { label: "הומר ללקוח", color: "#1B4332", bg: "#1B433218", icon: "check_circle" },
};

const SOURCE_META: Record<string, { icon: string; color: string }> = {
  "פייסבוק":      { icon: "share",          color: "#1877F2" },
  "הפניה":        { icon: "person",         color: "#1B4332" },
  "אתר":          { icon: "language",       color: "#5a7a6a" },
  "לינקדאין":     { icon: "work",           color: "#0A66C2" },
  "אינסטגרם":     { icon: "photo_camera",   color: "#E1306C" },
  "דף נחיתה":     { icon: "web",            color: "#1B4332" },
  "שאלון פיננסי": { icon: "quiz",           color: "#f59e0b" },
};

// Backward compat alias
const SOURCE_ICONS: Record<string, string> = Object.fromEntries(
  Object.entries(SOURCE_META).map(([k, v]) => [k, v.icon]),
);

const now = () => new Date().toISOString();

/* ═══════════════════════════════════════════════════════════════════
   Calendar + Tasks data (advisor-level, cross-client)
   ═══════════════════════════════════════════════════════════════════ */
type CalendarView = "daily" | "weekly" | "monthly";

interface Meeting {
  date: string; time: string; client: string; type: string; duration: number; color: string;
}

const ALL_MEETINGS: Meeting[] = [];

interface AdvisorTask { id: number; text: string; client: string | null; dueDate: string; urgent: boolean; done: boolean; }

const INITIAL_ADVISOR_TASKS: AdvisorTask[] = [];

const HE_DAY_SHORT = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];
const HE_MONTHS_FULL = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];

function isoDateStr(d: Date): string { return d.toISOString().split("T")[0]; }
function getWeekDays(ref: Date): Date[] {
  const start = new Date(ref); start.setDate(ref.getDate() - ref.getDay());
  return Array.from({ length: 7 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
}
function getMonthCells(y: number, m: number): (Date | null)[] {
  const first = new Date(y, m, 1); const pad = first.getDay(); const dim = new Date(y, m + 1, 0).getDate();
  const c: (Date | null)[] = []; for (let i = 0; i < pad; i++) c.push(null); for (let d = 1; d <= dim; d++) c.push(new Date(y, m, d)); return c;
}
function meetingsOn(date: string) { return ALL_MEETINGS.filter((m) => m.date === date); }

/* ═══════════════════════════════════════════════════════════════════
   Demo data
   ═══════════════════════════════════════════════════════════════════ */
const INITIAL_LEADS: Lead[] = [];
/* ──────── Clean slate for testing ──────── */

const INITIAL_CLIENTS: Client[] = [];
/* ──────── Clean slate for testing ──────── */

/* ═══════════════════════════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════════════════════════ */
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "numeric" });
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
}
function isWithinDays(iso: string, days: number) {
  const d = new Date(iso);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return d >= cutoff;
}

/* ═══════════════════════════════════════════════════════════════════
   CRM Page
   ═══════════════════════════════════════════════════════════════════ */
export default function CrmPage() {
  const router = useRouter();

  /* ── Persisted State (survives refresh) ── */
  const [tab, setTab] = useState<CrmTab>("leads");
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const [leads, setLeads, leadsSaving] = usePersistedState<Lead[]>("verdant:leads", INITIAL_LEADS);
  const [clients, setClients, clientsSaving] = usePersistedState<Client[]>("verdant:clients", INITIAL_CLIENTS);
  const [filterStatus, setFilterStatus] = useState<LeadStatus | "all">("all");
  const [drawerLeadId, setDrawerLeadId] = useState<number | null>(null);
  const [newFollowUp, setNewFollowUp] = useState("");

  // Drawer edit fields
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editSource, setEditSource] = useState("");
  const [editStatus, setEditStatus] = useState<LeadStatus>("new");

  // Search state (debounced)
  const [searchLeads, setSearchLeads] = useState("");
  const [searchClients, setSearchClients] = useState("");
  const [debouncedLeadQ, setDebouncedLeadQ] = useState("");
  const [debouncedClientQ, setDebouncedClientQ] = useState("");

  // Schedule-meeting modal
  const [showSchedule, setShowSchedule] = useState(false);
  const [schedDate, setSchedDate] = useState("");
  const [schedTime, setSchedTime] = useState("");
  const [schedType, setSchedType] = useState("היכרות");

  // New lead modal
  const [showNewLead, setShowNewLead] = useState(false);
  const [nlName, setNlName] = useState("");
  const [nlPhone, setNlPhone] = useState("");
  const [nlEmail, setNlEmail] = useState("");
  const [nlSource, setNlSource] = useState("אתר");
  const [nlNote, setNlNote] = useState("");

  // Toast notification (config messages stay 6s, others 3s)
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    if (toast) {
      const duration = toast.includes("⚙️") ? 6000 : 3000;
      const t = setTimeout(() => setToast(null), duration);
      return () => clearTimeout(t);
    }
  }, [toast]);

  // Google Calendar connection state
  const [gcalConnected, setGcalConnected, gcalSaving] = usePersistedState("verdant:gcal_connected", false);
  const [gcalLoading, setGcalLoading] = useState(false);
  const [gcalEvents, setGcalEvents] = useState<{ id: string; summary: string; start: string; end: string }[]>([]);

  const drawerRef = useRef<HTMLDivElement>(null);

  /* ── Calendar + Tasks state (persisted) ── */
  const [calView, setCalView] = useState<CalendarView>("daily");
  const [advisorTasks, setAdvisorTasks, tasksSaving] = usePersistedState("verdant:advisor_tasks", INITIAL_ADVISOR_TASKS);
  const todayISO = "2026-04-06";
  const todayObj = new Date(2026, 3, 6);
  const todayMeetings = useMemo(() => meetingsOn(todayISO), []);
  const weekDays = useMemo(() => getWeekDays(todayObj), []);
  const monthCells = useMemo(() => getMonthCells(2026, 3), []);
  const todayTasks = useMemo(() => advisorTasks.filter((t) => t.dueDate === todayISO), [advisorTasks]);
  const tasksDone = todayTasks.filter((t) => t.done).length;
  const tasksTotal = todayTasks.length;
  function toggleAdvisorTask(id: number) { setAdvisorTasks((p) => p.map((t) => (t.id === id ? { ...t, done: !t.done } : t))); }

  /* ── Greeting (client-only to avoid hydration mismatch) ── */
  const [greet, setGreet] = useState("");
  const [today, setToday] = useState("");
  useEffect(() => {
    const h = new Date().getHours();
    setGreet(h < 12 ? "בוקר טוב" : h < 17 ? "צהריים טובים" : h < 20 ? "ערב טוב" : "לילה טוב");
    setToday(new Date().toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "long", year: "numeric" }));
  }, []);

  /* ── KPI Calculations ── */
  const newLeadsThisMonth = useMemo(() => leads.filter((l) => isWithinDays(l.createdAt, 30)).length, [leads]);
  const conversionsThisMonth = useMemo(() => leads.filter((l) => l.status === "converted" && isWithinDays(l.createdAt, 30)).length, [leads]);
  const conversionRate = useMemo(() => (newLeadsThisMonth > 0 ? Math.round((conversionsThisMonth / newLeadsThisMonth) * 100) : 0), [newLeadsThisMonth, conversionsThisMonth]);

  /* ── Filtered leads (exclude converted, apply search) ── */
  const activeLeads = useMemo(() => {
    let list = leads.filter((l) => l.status !== "converted");
    if (filterStatus !== "all") list = list.filter((l) => l.status === filterStatus);
    if (debouncedLeadQ) {
      list = list.filter(
        (l) =>
          l.name.toLowerCase().includes(debouncedLeadQ) ||
          l.phone.includes(debouncedLeadQ) ||
          l.email.toLowerCase().includes(debouncedLeadQ),
      );
    }
    return list;
  }, [leads, filterStatus, debouncedLeadQ]);

  /* ── Filtered clients (apply search) ── */
  const filteredClients = useMemo(() => {
    if (!debouncedClientQ) return clients;
    return clients.filter(
      (c) =>
        c.family.toLowerCase().includes(debouncedClientQ) ||
        (c.convertedFromLead && c.convertedFromLead.toLowerCase().includes(debouncedClientQ)),
    );
  }, [clients, debouncedClientQ]);

  /* ── Drawer ── */
  const selectedLead = useMemo(() => leads.find((l) => l.id === drawerLeadId) ?? null, [leads, drawerLeadId]);

  const openDrawer = useCallback((lead: Lead) => {
    setDrawerLeadId(lead.id);
    setEditName(lead.name);
    setEditPhone(lead.phone);
    setEditEmail(lead.email);
    setEditSource(lead.source);
    setEditStatus(lead.status);
    setNewFollowUp("");
  }, []);

  const closeDrawer = useCallback(() => { setDrawerLeadId(null); setShowSchedule(false); }, []);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (drawerRef.current && !drawerRef.current.contains(e.target as Node)) closeDrawer();
    }
    if (drawerLeadId !== null) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [drawerLeadId, closeDrawer]);

  /* ── Debounce search inputs (300ms) ── */
  useEffect(() => {
    const t = setTimeout(() => setDebouncedLeadQ(searchLeads.trim().toLowerCase()), 300);
    return () => clearTimeout(t);
  }, [searchLeads]);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedClientQ(searchClients.trim().toLowerCase()), 300);
    return () => clearTimeout(t);
  }, [searchClients]);

  /* ── Mutations ── */
  /* ── Auto-save hook for Supabase (when configured) ── */
  const leadAutoSave = useAutoSave({ table: "leads", debounceMs: 1500 });

  // Compute combined save status for indicator
  const combinedSaveStatus: "idle" | "saving" | "saved" | "error" =
    leadsSaving || clientsSaving || tasksSaving
      ? "saving"
      : leadAutoSave.status !== "idle"
      ? leadAutoSave.status
      : "idle";

  function saveDrawerEdits() {
    if (!drawerLeadId) return;
    setLeads((prev) =>
      prev.map((l) =>
        l.id === drawerLeadId
          ? { ...l, name: editName, phone: editPhone, email: editEmail, source: editSource, status: editStatus }
          : l,
      ),
    );
    // Also trigger Supabase auto-save
    leadAutoSave.triggerSave({
      id: drawerLeadId, name: editName, phone: editPhone,
      email: editEmail, source: editSource, status: editStatus,
    });
    setToast("✅ השינויים נשמרו");
  }

  function addFollowUp() {
    if (!newFollowUp.trim() || !drawerLeadId) return;
    const ts = now();
    setLeads((prev) =>
      prev.map((l) =>
        l.id === drawerLeadId
          ? { ...l, followUps: [...l.followUps, { id: Math.max(0, ...l.followUps.map((f) => f.id)) + 1, text: newFollowUp.trim(), timestamp: ts }] }
          : l,
      ),
    );
    setNewFollowUp("");
  }

  function createNewLead() {
    if (!nlName.trim()) return;
    const newId = Math.max(0, ...leads.map((l) => l.id), 0) + 1;
    const newLead: Lead = {
      id: newId,
      name: nlName.trim(),
      phone: nlPhone.trim(),
      email: nlEmail.trim(),
      source: nlSource,
      status: "new",
      createdAt: now(),
      followUps: nlNote.trim()
        ? [{ id: 1, text: nlNote.trim(), timestamp: now() }]
        : [],
    };
    setLeads((prev) => [newLead, ...prev]);
    setShowNewLead(false);
    setNlName(""); setNlPhone(""); setNlEmail(""); setNlSource("אתר"); setNlNote("");
    setTab("leads");
    setFilterStatus("all");
    setToast(`✅ המתעניין "${newLead.name}" נוסף בהצלחה`);
  }

  function handleGcalConnect() {
    setGcalLoading(true);
    // Redirect to real OAuth flow — server route handles Google redirect
    // If credentials aren't configured, the API will redirect back with ?gcal=error&reason=not_configured
    window.location.href = "/api/gcal/auth";
  }

  function handleGcalDisconnect() {
    fetch("/api/gcal/disconnect", { method: "POST" }).then(() => {
      setGcalConnected(false);
      setGcalEvents([]);
      setToast("יומן גוגל נותק");
    });
  }

  // On mount: check gcal connection status + load events
  useEffect(() => {
    // Check URL params for OAuth callback result
    const params = new URLSearchParams(window.location.search);
    if (params.get("gcal") === "connected") {
      setGcalConnected(true);
      setToast("✅ יומן גוגל חובר בהצלחה!");
      // Clean URL
      window.history.replaceState({}, "", "/crm");
    } else if (params.get("gcal") === "error") {
      const reason = params.get("reason") || "unknown";
      if (reason === "not_configured") {
        setToast("⚙️ יש להגדיר GOOGLE_CLIENT_ID ו-GOOGLE_CLIENT_SECRET בקובץ .env.local");
      } else {
        setToast("❌ שגיאה בחיבור ליומן: " + reason);
      }
      window.history.replaceState({}, "", "/crm");
    }

    // Check server-side connection status
    fetch("/api/gcal/status").then((r) => r.json()).then((data) => {
      if (data.connected) {
        setGcalConnected(true);
        // Fetch real events
        fetch("/api/gcal/events").then((r) => r.json()).then((evData) => {
          if (evData.events) setGcalEvents(evData.events);
        }).catch(() => {});
      }
    }).catch(() => {});

    // Refetch trigger — dispatched by InviteClientButton after a successful invite
    // so the new household appears immediately.
    const onRefetch = () => {
      fetch("/api/crm/clients").then((r) => r.json()).then((data) => {
        if (!Array.isArray(data.households)) return;
        const monthStr = (iso: string) => {
          const d = new Date(iso);
          return `${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
        };
        const rows: Client[] = (data.households as Array<{ id: string; family_name: string; members_count: number; stage: string; created_at: string }>).map((h, i) => ({
          id: i + 1, family: h.family_name || "משפחה", step: h.stage === "onboarding" ? 0 : 3,
          totalSteps: 3, netWorth: 0, trend: "—", members: h.members_count || 1,
          joined: monthStr(h.created_at), docsUploaded: 0, docsTotal: 10,
          monthlyRevenue: 0, riskProfile: "—", householdId: h.id,
        }));
        setClients(rows);
      }).catch(() => {});
    };
    window.addEventListener("verdant:clients:refetch", onRefetch);

    // Load real client households from Supabase — REPLACE the clients list entirely.
    // No merging with legacy localStorage rows (those have no householdId and would
    // break "כניסה לתיק" impersonation). Only DB households are the source of truth.
    fetch("/api/crm/clients").then((r) => r.json()).then((data) => {
      if (!Array.isArray(data.households)) return;
      const monthStr = (iso: string) => {
        const d = new Date(iso);
        return `${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
      };
      const rows: Client[] = (data.households as Array<{ id: string; family_name: string; members_count: number; stage: string; created_at: string }>).map((h, i) => ({
        id: i + 1,
        family: h.family_name || "משפחה",
        step: h.stage === "onboarding" ? 0 : 3,
        totalSteps: 3,
        netWorth: 0,
        trend: "—",
        members: h.members_count || 1,
        joined: monthStr(h.created_at),
        docsUploaded: 0,
        docsTotal: 10,
        monthlyRevenue: 0,
        riskProfile: "—",
        householdId: h.id,
      }));
      setClients(rows);
    }).catch(() => {});

    return () => { window.removeEventListener("verdant:clients:refetch", onRefetch); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function convertToClient() {
    if (!selectedLead) return;
    setLeads((prev) => prev.map((l) => (l.id === selectedLead.id ? { ...l, status: "converted" as LeadStatus } : l)));
    const newId = Math.max(0, ...clients.map((c) => c.id)) + 1;
    const monthStr = `${String(new Date().getMonth() + 1).padStart(2, "0")}/${new Date().getFullYear()}`;
    const newClient = {
      id: newId, family: selectedLead.name, step: 0, totalSteps: 3, netWorth: 0,
      trend: "—", members: 1, joined: monthStr, docsUploaded: 0, docsTotal: 10,
      monthlyRevenue: 0, riskProfile: "—", convertedFromLead: selectedLead.name,
      email: selectedLead.email, phone: selectedLead.phone,
    };
    setClients((prev) => [...prev, newClient]);
    // Also persist current client ID for the client layout to pick up
    try { localStorage.setItem("verdant:current_hh", String(newId)); } catch {}
    closeDrawer();
    setTab("clients"); // switch to clients tab to show the new client
    setToast(`✅ "${selectedLead.name}" הומר ללקוח בהצלחה`);
  }

  /* ═══════════════════════════════════════════════════════════════════
     RENDER
     ═══════════════════════════════════════════════════════════════════ */
  return (
    <main dir="rtl" className="min-h-screen px-6 py-8 relative" style={{ background: "var(--verdant-bg)" }}>
      <div className="max-w-7xl mx-auto">

        {/* ═══════ Header ═══════ */}
        <header className="flex items-start justify-between mb-8 gap-4">
          <div className="text-right">
            <div className="flex items-baseline gap-2 justify-end">
              <span className="text-[11px] uppercase tracking-[0.2em] text-verdant-emerald font-bold">CRM · מרכז ניהול</span>
              <span className="text-2xl font-extrabold text-verdant-ink">פלאן</span>
            </div>
            <h1 className="text-3xl font-extrabold text-verdant-ink mt-1">שלום, ניר — {greet}</h1>
            <p className="text-sm text-verdant-muted mt-0.5">{today}</p>
          </div>
          {/* Actions cluster — top-left */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {!gcalConnected ? (
              <button
                onClick={handleGcalConnect}
                disabled={gcalLoading}
                title="חבר יומן גוגל"
                className="inline-flex items-center gap-1.5 h-10 px-3.5 rounded-2xl text-[12px] font-bold transition-all disabled:opacity-60"
                style={{ background: "#F3F4EC", color: "#1B4332" }}
              >
                <span className={`material-symbols-outlined text-[16px] ${gcalLoading ? "animate-spin" : ""}`} style={{ color: "#2B694D" }}>
                  {gcalLoading ? "progress_activity" : "calendar_month"}
                </span>
                {gcalLoading ? "מתחבר..." : "חבר יומן"}
              </button>
            ) : (
              <button
                onClick={handleGcalDisconnect}
                title={`יומן מחובר${gcalEvents.length ? ` · ${gcalEvents.length} אירועים` : ""} · לחץ לניתוק`}
                className="inline-flex items-center gap-1.5 h-10 px-3.5 rounded-2xl text-[12px] font-bold transition-all"
                style={{ background: "#ECF7EF", color: "#1B4332" }}
              >
                <span className="material-symbols-outlined text-[16px]" style={{ color: "#2B694D" }}>check_circle</span>
                יומן מחובר
                {gcalEvents.length > 0 && (
                  <span className="tabular text-[10px] opacity-70">· {gcalEvents.length}</span>
                )}
              </button>
            )}
            <button
              onClick={() => router.push("/login")}
              title="התנתקות"
              className="w-10 h-10 rounded-2xl flex items-center justify-center transition-all hover:bg-red-50 hover:text-red-600 text-verdant-muted"
              style={{ background: "#F3F4EC" }}
            >
              <span className="material-symbols-outlined text-[20px]">logout</span>
            </button>
          </div>
        </header>

        {/* ═══════ KPI Row — 3 colored tiles ═══════ */}
        <section className="grid grid-cols-3 gap-5 mb-8">
          {/* Leads — mint */}
          <div
            className="p-5 flex flex-col justify-between min-h-[140px] transition-all hover:-translate-y-0.5"
            style={{
              background: "#D6EFDC",
              color: "#012D1D",
              borderRadius: "1rem",
              boxShadow: "0 1px 2px rgba(27,67,50,0.06)",
            }}
          >
            <div className="flex items-center justify-between">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "rgba(27,67,50,0.12)", color: "#1B4332" }}>
                <span className="material-symbols-outlined text-[22px]">person_add</span>
              </div>
              <div className="text-[10px] uppercase tracking-[0.2em] font-bold text-right" style={{ color: "rgba(1,45,29,0.55)" }}>מתעניינים חדשים החודש</div>
            </div>
            <div className="flex items-baseline gap-2 justify-end mt-auto pt-3">
              <span className="text-[11px] font-bold" style={{ color: "rgba(1,45,29,0.65)" }}>ב-30 יום</span>
              <span className="text-4xl font-extrabold tabular" style={{ color: "#012D1D" }}>{newLeadsThisMonth}</span>
            </div>
          </div>

          {/* Conversions — sage-cream tint */}
          <div
            className="p-5 flex flex-col justify-between min-h-[140px] transition-all hover:-translate-y-0.5"
            style={{
              background: "#E7EFDD",
              color: "#012D1D",
              borderRadius: "1rem",
              boxShadow: "0 1px 2px rgba(27,67,50,0.06)",
            }}
          >
            <div className="flex items-center justify-between">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "rgba(27,67,50,0.12)", color: "#1B4332" }}>
                <span className="material-symbols-outlined text-[22px]">how_to_reg</span>
              </div>
              <div className="text-[10px] uppercase tracking-[0.2em] font-bold text-right" style={{ color: "rgba(1,45,29,0.55)" }}>סגירות (המרה ללקוח)</div>
            </div>
            <div className="flex items-baseline gap-2 justify-end mt-auto pt-3">
              <span className="text-[11px] font-bold" style={{ color: "rgba(1,45,29,0.65)" }}>החודש</span>
              <span className="text-4xl font-extrabold tabular" style={{ color: "#012D1D" }}>{conversionsThisMonth}</span>
            </div>
          </div>

          {/* Conversion rate — forest hero */}
          <div
            className="p-5 flex flex-col justify-between min-h-[140px] transition-all hover:-translate-y-0.5"
            style={{
              background: "#012D1D",
              color: "#FFFFFF",
              borderRadius: "1rem",
              boxShadow: "0 1px 2px rgba(27,67,50,0.12)",
            }}
          >
            <div className="flex items-center justify-between">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "rgba(193,236,212,0.18)", color: "#C1ECD4" }}>
                <span className="material-symbols-outlined text-[22px]">trending_up</span>
              </div>
              <div className="text-[10px] uppercase tracking-[0.2em] font-bold text-right" style={{ color: "rgba(255,255,255,0.60)" }}>אחוז סגירה</div>
            </div>
            <div className="flex items-baseline gap-2 justify-end mt-auto pt-3">
              <span className="text-[11px] font-bold" style={{ color: "rgba(255,255,255,0.65)" }}>Converted / Total</span>
              <span className="text-4xl font-extrabold tabular" style={{ color: conversionRate >= 20 ? "#C1ECD4" : conversionRate >= 10 ? "#FCD34D" : "#FCA5A5" }}>
                {conversionRate}%
              </span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden mt-2" style={{ background: "rgba(255,255,255,0.15)" }}>
              <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(conversionRate, 100)}%`, background: conversionRate >= 20 ? "#C1ECD4" : conversionRate >= 10 ? "#FCD34D" : "#FCA5A5" }} />
            </div>
          </div>
        </section>

        {/* ═══════ Command Center: Calendar + Daily Tasks ═══════ */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-8 items-stretch">
          {/* ── Calendar Card ── */}
          <div className="card-pad flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <div className="text-right">
                <div className="text-[10px] uppercase tracking-[0.2em] text-verdant-muted font-bold mb-0.5">Calendar · יומן פגישות</div>
                <h3 className="text-base font-extrabold text-verdant-ink">לוח פגישות</h3>
              </div>
              <div className="flex items-center gap-1 rounded-lg p-0.5" style={{ background: "#f4f7ed" }}>
                {([ { k: "daily" as CalendarView, l: "יומי" }, { k: "weekly" as CalendarView, l: "שבועי" }, { k: "monthly" as CalendarView, l: "חודשי" } ]).map((v) => (
                  <button key={v.k} onClick={() => setCalView(v.k)}
                    className={`text-[10px] font-bold px-2.5 py-1 rounded-md transition-all ${calView === v.k ? "bg-white text-verdant-accent shadow-sm" : "text-verdant-muted hover:text-verdant-ink"}`}
                  >{v.l}</button>
                ))}
              </div>
            </div>

            {calView === "daily" && (
              <div className="flex-1">
                <div className="text-[11px] font-bold text-verdant-muted mb-3 text-right">{today} · <span className="tabular text-verdant-accent">{todayMeetings.length} פגישות</span></div>
                <div className="divide-y v-divider">
                  {todayMeetings.map((m, i) => (
                    <div key={i} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                      <div className="text-right min-w-[48px]">
                        <div className="text-sm font-extrabold text-verdant-ink tabular">{m.time}</div>
                        <div className="text-[10px] text-verdant-muted font-bold">{m.duration} דק&apos;</div>
                      </div>
                      <div className="w-0.5 self-stretch rounded-full flex-shrink-0" style={{ background: m.color }} />
                      <div className="flex-1 min-w-0 text-right">
                        <div className="text-sm font-bold text-verdant-ink truncate">{m.client}</div>
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold mt-0.5" style={{ background: `${m.color}15`, color: m.color }}>{m.type}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {calView === "weekly" && (
              <div className="flex-1 space-y-1">
                {weekDays.map((day) => {
                  const iso = isoDateStr(day); const dm = meetingsOn(iso); const isT = iso === todayISO;
                  return (
                    <div key={iso} className="flex items-start gap-3 py-2 px-2.5 rounded-lg" style={{ background: isT ? "#012d1d" : dm.length > 0 ? "#f4f7ed" : "transparent" }}>
                      <div className="min-w-[38px] text-center">
                        <div className="text-[10px] font-bold" style={{ color: isT ? "rgba(255,255,255,0.5)" : "#5a7a6a" }}>{HE_DAY_SHORT[day.getDay()]}</div>
                        <div className={`text-sm font-extrabold tabular ${isT ? "text-white" : "text-verdant-ink"}`}>{day.getDate()}</div>
                      </div>
                      <div className="flex-1 min-w-0">
                        {dm.length === 0
                          ? <div className="text-[10px] py-1" style={{ color: isT ? "rgba(255,255,255,0.3)" : "#9ca3af" }}>—</div>
                          : <div className="flex flex-wrap gap-1">{dm.map((m, j) => (
                              <span key={j} className="text-[10px] font-bold px-1.5 py-0.5 rounded inline-flex items-center gap-1 whitespace-nowrap"
                                style={{ background: isT ? "rgba(255,255,255,0.12)" : `${m.color}12`, color: isT ? "#fff" : m.color }}>
                                <span className="tabular">{m.time}</span>{m.client}
                              </span>
                            ))}</div>
                        }
                      </div>
                      {dm.length > 0 && <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded-full tabular" style={{ background: isT ? "rgba(16,185,129,0.3)" : "#1B433218", color: isT ? "#2B694D" : "#1B4332" }}>{dm.length}</span>}
                    </div>
                  );
                })}
              </div>
            )}

            {calView === "monthly" && (
              <div className="flex-1 flex flex-col">
                <div className="text-[11px] font-bold text-verdant-muted mb-2 text-right">{HE_MONTHS_FULL[3]} 2026</div>
                <div className="grid grid-cols-7 gap-0.5 mb-1">{HE_DAY_SHORT.map((d) => <div key={d} className="text-center text-[9px] font-bold text-verdant-muted py-0.5">{d}</div>)}</div>
                <div className="grid grid-cols-7 gap-0.5 flex-1">
                  {monthCells.map((cell, i) => {
                    if (!cell) return <div key={`p-${i}`} />;
                    const iso = isoDateStr(cell); const cnt = meetingsOn(iso).length; const isT = iso === todayISO;
                    return (
                      <div key={iso} className="flex flex-col items-center py-1 rounded-md" style={{ background: isT ? "#012d1d" : cnt > 0 ? "#f4f7ed" : "transparent" }}>
                        <span className={`text-[11px] font-extrabold tabular ${isT ? "text-white" : "text-verdant-ink"}`}>{cell.getDate()}</span>
                        {cnt > 0 && <div className="flex gap-0.5 mt-0.5">{Array.from({ length: Math.min(cnt, 3) }).map((_, j) => <span key={j} className="w-1 h-1 rounded-full" style={{ background: isT ? "#2B694D" : "#1B4332" }} />)}{cnt > 3 && <span className="text-[7px] font-bold" style={{ color: isT ? "#2B694D" : "#1B4332" }}>+</span>}</div>}
                      </div>
                    );
                  })}
                </div>
                <div className="mt-2 pt-2 border-t v-divider flex items-center justify-between text-[10px] font-bold text-verdant-muted">
                  <span className="tabular">{ALL_MEETINGS.filter((m) => m.date.startsWith("2026-04")).length} פגישות</span>
                  <span>אפריל 2026</span>
                </div>
              </div>
            )}
          </div>

          {/* ── Daily Tasks Card ── */}
          <div className="card-pad flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <div className="text-right">
                <div className="text-[10px] uppercase tracking-[0.2em] text-verdant-muted font-bold mb-0.5">Daily Tasks · סדר יום</div>
                <h3 className="text-base font-extrabold text-verdant-ink">משימות להיום</h3>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-extrabold tabular" style={{ color: tasksDone === tasksTotal ? "#2B694D" : "#5a7a6a" }}>{tasksDone}/{tasksTotal}</span>
                <span className="material-symbols-outlined text-verdant-emerald text-[20px]">task_alt</span>
              </div>
            </div>

            <div className="h-1.5 rounded-full overflow-hidden mb-4" style={{ background: "#eef2e8" }}>
              <div className="h-full rounded-full transition-all duration-500" style={{ width: `${tasksTotal > 0 ? Math.round((tasksDone / tasksTotal) * 100) : 0}%`, background: "#2B694D" }} />
            </div>

            <ul className="flex-1 divide-y v-divider">
              {todayTasks.filter(t => !t.done).map((t) => (
                <li key={t.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                  <button onClick={() => toggleAdvisorTask(t.id)} className="flex-shrink-0">
                    <span className="material-symbols-outlined text-[18px]" style={{ color: "#d8e0d0" }}>radio_button_unchecked</span>
                  </button>
                  <div className="flex-1 text-right min-w-0">
                    <span className="text-sm block truncate text-verdant-ink">{t.text}</span>
                    {t.client && <span className="text-[10px] font-bold text-verdant-accent inline-flex items-center gap-1 mt-0.5"><span className="material-symbols-outlined text-[11px]">person</span>{t.client}</span>}
                  </div>
                  {t.urgent && <span className="text-[9px] font-extrabold uppercase px-2 py-0.5 rounded-full flex-shrink-0" style={{ background: "#b91c1c18", color: "#b91c1c" }}>דחוף</span>}
                </li>
              ))}
              {todayTasks.filter(t => !t.done).length === 0 && (
                <li className="py-6 text-center text-sm text-verdant-muted">
                  <span className="material-symbols-outlined text-[22px] block mx-auto mb-1" style={{ color: "#2B694D" }}>check_circle</span>
                  כל המשימות הושלמו — כל הכבוד!
                </li>
              )}
            </ul>
          </div>
        </section>

        {/* ═══════ Tab Switcher ═══════ */}
        <div className="flex items-center gap-0 mb-0 border-b v-divider">
          {([
            { key: "leads"   as CrmTab, label: "מתעניינים",      icon: "person_search" },
            { key: "clients" as CrmTab, label: "לקוחות פעילים", icon: "folder_shared" },
          ]).map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-6 py-3.5 text-sm font-bold transition-colors border-b-2 ${
                tab === t.key
                  ? "border-verdant-accent text-verdant-accent"
                  : "border-transparent text-verdant-muted hover:text-verdant-ink"
              }`}
            >
              <span className="material-symbols-outlined text-[18px]">{t.icon}</span>
              {t.label}
              {mounted && (
                <span
                  className="text-[10px] font-extrabold px-2 py-0.5 rounded-full tabular"
                  style={{
                    background: tab === t.key ? "#1B433218" : "#f4f7ed",
                    color: tab === t.key ? "#1B4332" : "#5a7a6a",
                  }}
                >
                  {t.key === "leads" ? activeLeads.length : filteredClients.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ═══════════════════════════════════════════════════════════════
           TAB 1 — Leads (מתעניינים)
           ═══════════════════════════════════════════════════════════════ */}
        {tab === "leads" && (
          <div className="v-card overflow-hidden mt-0 rounded-t-none border-t-0">
            {/* Toolbar */}
            <div className="px-6 py-4 border-b v-divider flex items-center justify-between flex-wrap gap-3" style={{ background: "#f4f7ed" }}>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="relative">
                  <span className="material-symbols-outlined text-[16px] text-verdant-muted absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none">search</span>
                  <input
                    className="inp text-xs !py-1.5 !pr-8 !w-[200px]"
                    placeholder="חיפוש שם, טלפון, אימייל..."
                    value={searchLeads}
                    onChange={(e) => setSearchLeads(e.target.value)}
                  />
                  {searchLeads && (
                    <button onClick={() => setSearchLeads("")} className="absolute left-2 top-1/2 -translate-y-1/2 text-verdant-muted hover:text-verdant-ink">
                      <span className="material-symbols-outlined text-[14px]">close</span>
                    </button>
                  )}
                </div>
                <select
                  className="inp text-xs !py-1.5 !w-auto !min-w-[140px]"
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value as LeadStatus | "all")}
                >
                  <option value="all">כל הסטטוסים</option>
                  {(["new", "in_progress", "not_relevant"] as LeadStatus[]).map((k) => (
                    <option key={k} value={k}>{STATUS_META[k].label}</option>
                  ))}
                </select>
                <button
                  onClick={() => setShowNewLead(true)}
                  className="btn-botanical text-xs py-1.5 px-4 flex items-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-[14px]">add</span>
                  מתעניין חדש
                </button>
              </div>
              <div className="text-right">
                <div className="text-[10px] uppercase tracking-[0.2em] text-verdant-muted font-bold">Lead Pipeline</div>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[10px] uppercase tracking-[0.1em] text-verdant-muted font-bold border-b v-divider" style={{ background: "#fafcf6" }}>
                    <th className="text-right px-5 py-3 w-[1%]" />
                    <th className="text-right px-4 py-3">שם מלא</th>
                    <th className="text-right px-4 py-3">טלפון</th>
                    <th className="text-right px-4 py-3">מקור</th>
                    <th className="text-right px-4 py-3">סטטוס</th>
                    <th className="text-right px-4 py-3">תאריך יצירה</th>
                    <th className="text-right px-4 py-3">פולואו-אפ אחרון</th>
                  </tr>
                </thead>
                <tbody>
                  {activeLeads.length === 0 && (
                    <tr>
                      <td colSpan={7} className="text-center py-16 text-sm text-verdant-muted">
                        <span className="material-symbols-outlined text-[36px] opacity-25 block mb-2">inbox</span>
                        {debouncedLeadQ ? "לא נמצאו תוצאות" : "אין מתעניינים בסטטוס זה"}
                      </td>
                    </tr>
                  )}
                  {activeLeads.map((lead) => {
                    const sm = STATUS_META[lead.status];
                    const lastFU = lead.followUps.length > 0 ? lead.followUps[lead.followUps.length - 1] : null;
                    return (
                      <tr
                        key={lead.id}
                        onClick={() => openDrawer(lead)}
                        className="border-b v-divider hover:bg-[#f4f7ed] transition-colors cursor-pointer group"
                      >
                        <td className="px-5 py-3.5">
                          <span className="material-symbols-outlined text-[16px] opacity-0 group-hover:opacity-60 transition-opacity" style={{ color: sm.color }}>{sm.icon}</span>
                        </td>
                        <td className="px-4 py-3.5 font-extrabold text-verdant-ink whitespace-nowrap text-right">{lead.name}</td>
                        <td className="px-4 py-3.5 tabular text-verdant-muted font-bold text-right" dir="ltr">{lead.phone}</td>
                        <td className="px-4 py-3.5 text-right">
                          <span
                            className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-extrabold"
                            style={{
                              background: `${(SOURCE_META[lead.source]?.color || "#5a7a6a")}14`,
                              color: SOURCE_META[lead.source]?.color || "#5a7a6a",
                            }}
                          >
                            <span className="material-symbols-outlined text-[13px]">{SOURCE_META[lead.source]?.icon || "link"}</span>
                            {lead.source}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          <span className="text-[10px] font-extrabold px-2.5 py-1 rounded-full inline-block" style={{ background: sm.bg, color: sm.color }}>{sm.label}</span>
                        </td>
                        <td className="px-4 py-3.5 text-verdant-muted font-bold tabular whitespace-nowrap text-right">{fmtDate(lead.createdAt)}</td>
                        <td className="px-4 py-3.5 text-right">
                          {lastFU ? (
                            <span className="text-xs text-verdant-muted max-w-[220px] truncate block text-right" title={lastFU.text}>{lastFU.text}</span>
                          ) : (
                            <span className="text-xs text-verdant-muted/40">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pipeline summary bar */}
            <div className="px-6 py-3 border-t v-divider flex items-center gap-6 flex-wrap" style={{ background: "#f4f7ed" }}>
              {(["new", "in_progress", "not_relevant"] as LeadStatus[]).map((s) => {
                const cnt = leads.filter((l) => l.status === s).length;
                const sm = STATUS_META[s];
                return (
                  <div key={s} className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{ background: sm.color }} />
                    <span className="text-[11px] font-bold text-verdant-muted">{sm.label}</span>
                    <span className="text-[11px] font-extrabold tabular" style={{ color: sm.color }}>{cnt}</span>
                  </div>
                );
              })}
              <div className="flex items-center gap-2 mr-auto">
                <span className="w-2 h-2 rounded-full" style={{ background: "#1B4332" }} />
                <span className="text-[11px] font-bold text-verdant-muted">הומרו</span>
                <span className="text-[11px] font-extrabold tabular" style={{ color: "#1B4332" }}>{leads.filter((l) => l.status === "converted").length}</span>
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════
           TAB 2 — Clients (לקוחות)
           ═══════════════════════════════════════════════════════════════ */}
        {tab === "clients" && (
          <div className="v-card overflow-hidden mt-0 rounded-t-none border-t-0">
            {/* Toolbar */}
            <div className="px-6 py-4 border-b v-divider flex items-center justify-between flex-wrap gap-3" style={{ background: "#f4f7ed" }}>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="relative">
                  <span className="material-symbols-outlined text-[16px] text-verdant-muted absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none">search</span>
                  <input
                    className="inp text-xs !py-1.5 !pr-8 !w-[200px]"
                    placeholder="חיפוש שם משפחה..."
                    value={searchClients}
                    onChange={(e) => setSearchClients(e.target.value)}
                  />
                  {searchClients && (
                    <button onClick={() => setSearchClients("")} className="absolute left-2 top-1/2 -translate-y-1/2 text-verdant-muted hover:text-verdant-ink">
                      <span className="material-symbols-outlined text-[14px]">close</span>
                    </button>
                  )}
                </div>
                {mounted && <span className="text-xs text-verdant-muted font-bold tabular">{filteredClients.length} תיקים פעילים</span>}
                <InviteClientButton />
              </div>
              <div className="text-right">
                <div className="text-[10px] uppercase tracking-[0.2em] text-verdant-muted font-bold">Client Portfolio</div>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[10px] uppercase tracking-[0.1em] text-verdant-muted font-bold border-b v-divider" style={{ background: "#fafcf6" }}>
                    <th className="text-right px-5 py-3">משפחה / שם</th>
                    <th className="text-right px-4 py-3">שלב</th>
                    <th className="text-right px-4 py-3">הון נקי</th>
                    <th className="text-right px-4 py-3">מגמה</th>
                    <th className="text-right px-4 py-3">פרופיל סיכון</th>
                    <th className="text-right px-4 py-3">מסמכים</th>
                    <th className="text-right px-4 py-3">הצטרפות</th>
                    <th className="px-4 py-3 text-right">פעולות</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredClients.length === 0 && (
                    <tr>
                      <td colSpan={8} className="text-center py-16 text-sm text-verdant-muted">
                        <span className="material-symbols-outlined text-[36px] opacity-25 block mb-2">folder_off</span>
                        {debouncedClientQ ? "לא נמצאו תוצאות" : "אין לקוחות פעילים"}
                      </td>
                    </tr>
                  )}
                  {filteredClients.map((c) => {
                    const docPct = c.docsTotal > 0 ? Math.round((c.docsUploaded / c.docsTotal) * 100) : 0;
                    const stepLabel = c.step === 0 ? "חדש" : `שלב ${c.step}/${c.totalSteps}`;
                    const stepColor = c.step === 0 ? "#f59e0b" : c.step >= c.totalSteps ? "#2B694D" : "#1B4332";
                    return (
                      <tr key={c.id} className="border-b v-divider hover:bg-[#f9faf2] transition-colors">
                        <td className="px-5 py-3.5 text-right">
                          <div className="font-extrabold text-verdant-ink">{c.family}</div>
                          {c.convertedFromLead && (
                            <div className="text-[10px] text-verdant-emerald font-bold mt-0.5 flex items-center gap-1 justify-end">
                              <span className="material-symbols-outlined text-[12px]">swap_horiz</span>
                              הומר מליד
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          <span className="text-[10px] font-extrabold px-2.5 py-1 rounded-full" style={{ background: `${stepColor}18`, color: stepColor }}>{stepLabel}</span>
                        </td>
                        <td className="px-4 py-3.5 tabular font-bold text-verdant-ink text-right">{c.netWorth > 0 ? fmtILS(c.netWorth) : "—"}</td>
                        <td className="px-4 py-3.5 font-bold tabular text-right" style={{ color: c.trend.startsWith("+") ? "#1B4332" : c.trend.startsWith("-") ? "#b91c1c" : "#9ca3af" }}>{c.trend}</td>
                        <td className="px-4 py-3.5 text-right">
                          <span className="text-xs font-bold text-verdant-muted">{c.riskProfile}</span>
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          <div className="flex items-center gap-2 justify-end">
                            <span className="text-[10px] font-bold text-verdant-muted tabular">{c.docsUploaded}/{c.docsTotal}</span>
                            <div className="w-16 h-1.5 rounded-full overflow-hidden" style={{ background: "#eef2e8" }}>
                              <div className="h-full rounded-full" style={{ width: `${docPct}%`, background: docPct === 100 ? "#2B694D" : "#f59e0b" }} />
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-verdant-muted font-bold text-right">{c.joined}</td>
                        <td className="px-4 py-3.5 text-right">
                          <div className="flex items-center gap-2 justify-end">
                            <Link href={`/onboarding?hh=${c.id}`} className="text-[11px] font-bold text-verdant-muted hover:text-verdant-accent transition-colors whitespace-nowrap">
                              שאלון אפיון
                            </Link>
                            <button
                              type="button"
                              onClick={async () => {
                                if (c.householdId) {
                                  try {
                                    const res = await fetch("/api/crm/impersonate", {
                                      method: "POST",
                                      headers: { "Content-Type": "application/json" },
                                      body: JSON.stringify({ householdId: c.householdId }),
                                    });
                                    if (!res.ok) {
                                      setToast("❌ לא ניתן להיכנס לתיק — בדוק הרשאות");
                                      return;
                                    }
                                    const target = c.step === 0 ? "/onboarding" : "/dashboard";
                                    window.location.href = target;
                                  } catch {
                                    setToast("❌ שגיאת רשת בכניסה לתיק");
                                  }
                                } else {
                                  // Legacy demo client without real household — open with old ?hh= param
                                  window.location.href = `/dashboard?hh=${c.id}`;
                                }
                              }}
                              className="inline-flex items-center gap-1.5 text-[11px] font-extrabold px-4 py-2 rounded-full whitespace-nowrap transition-all hover:shadow-soft active:scale-95"
                              style={{ background: "#1B4332", color: "#F9FAF2" }}
                            >
                              כניסה לתיק
                              <span className="material-symbols-outlined text-[14px]">arrow_back</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════════
         SIDE DRAWER — Lead Follow-Up Panel (from right)
         ═══════════════════════════════════════════════════════════════ */}
      {drawerLeadId !== null && (
        <div className="fixed inset-0 bg-black/20 z-40 transition-opacity" />
      )}

      <div
        ref={drawerRef}
        className={`fixed top-0 right-0 h-full w-[440px] max-w-[90vw] bg-white shadow-2xl z-50 flex flex-col transition-transform duration-300 ease-out ${
          drawerLeadId !== null ? "translate-x-0" : "translate-x-full"
        }`}
        style={{ borderLeft: "1px solid var(--verdant-line)" }}
      >
        {selectedLead && (
          <>
            {/* Drawer Header */}
            <div className="px-6 py-5 border-b v-divider flex items-center justify-between" style={{ background: "#f4f7ed" }}>
              <button onClick={closeDrawer} className="text-verdant-muted hover:text-verdant-ink transition-colors">
                <span className="material-symbols-outlined text-[22px]">close</span>
              </button>
              <div className="text-right">
                <div className="text-[10px] uppercase tracking-[0.2em] text-verdant-muted font-bold mb-0.5">מעקב מתעניין</div>
                <h3 className="text-lg font-extrabold text-verdant-ink">{selectedLead.name}</h3>
              </div>
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto">
              {/* Quick edit */}
              <div className="px-6 py-5 border-b v-divider space-y-3">
                <div className="text-[10px] uppercase tracking-[0.15em] text-verdant-muted font-bold text-right mb-2">עריכה מהירה</div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-verdant-muted mb-1 text-right">שם מלא</label>
                    <input className="inp text-right" value={editName} onChange={(e) => setEditName(e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-verdant-muted mb-1 text-right">טלפון</label>
                    <input className="inp" dir="ltr" value={editPhone} onChange={(e) => setEditPhone(e.target.value)} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-verdant-muted mb-1 text-right">אימייל</label>
                    <input className="inp" dir="ltr" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-verdant-muted mb-1 text-right">מקור הגעה</label>
                    <select className="inp text-right" value={editSource} onChange={(e) => setEditSource(e.target.value)}>
                      {Object.keys(SOURCE_META).map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-verdant-muted mb-1 text-right">סטטוס</label>
                  <div className="flex gap-2 flex-wrap justify-end">
                    {(["new", "in_progress", "not_relevant"] as LeadStatus[]).map((s) => {
                      const sm = STATUS_META[s];
                      const active = editStatus === s;
                      return (
                        <button
                          key={s}
                          onClick={() => setEditStatus(s)}
                          className="text-[11px] font-extrabold px-3 py-1.5 rounded-full border-2 transition-all"
                          style={{
                            borderColor: active ? sm.color : "transparent",
                            background: active ? sm.bg : "#f4f7ed",
                            color: active ? sm.color : "#5a7a6a",
                          }}
                        >
                          {sm.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <button
                  onClick={saveDrawerEdits}
                  className="w-full text-sm font-bold py-2 rounded-lg transition-colors"
                  style={{ background: "#1B433218", color: "#1B4332" }}
                >
                  שמור שינויים
                </button>
              </div>

              {/* Follow-up Timeline */}
              <div className="px-6 py-5 border-b v-divider">
                <div className="text-[10px] uppercase tracking-[0.15em] text-verdant-muted font-bold text-right mb-4">
                  מעקב פולואו-אפ · Timeline
                </div>

                {selectedLead.followUps.length === 0 ? (
                  <div className="text-center py-8 text-sm text-verdant-muted">
                    <span className="material-symbols-outlined text-[28px] opacity-25 block mb-1">chat_bubble_outline</span>
                    אין הערות עדיין
                  </div>
                ) : (
                  <div className="space-y-0 relative">
                    <div className="absolute right-[11px] top-2 bottom-2 w-0.5 rounded-full" style={{ background: "var(--verdant-line)" }} />
                    {selectedLead.followUps.map((fu, idx) => (
                      <div key={fu.id} className="flex gap-3 pb-4 last:pb-0 relative">
                        <div
                          className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center z-10 mt-0.5"
                          style={{ background: idx === selectedLead.followUps.length - 1 ? "#1B4332" : "#d8e0d0" }}
                        >
                          <span className="w-2 h-2 rounded-full" style={{ background: idx === selectedLead.followUps.length - 1 ? "#fff" : "#5a7a6a" }} />
                        </div>
                        <div className="flex-1 text-right">
                          <div className="text-[10px] font-bold text-verdant-muted tabular mb-0.5">
                            {fmtDate(fu.timestamp)} · {fmtTime(fu.timestamp)}
                          </div>
                          <div className="text-sm text-verdant-ink leading-relaxed">{fu.text}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add note */}
                <form className="mt-4 flex gap-2" onSubmit={(e) => { e.preventDefault(); addFollowUp(); }}>
                  <button
                    type="submit"
                    className="flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center transition-colors"
                    style={{ background: "#1B433218", color: "#1B4332" }}
                  >
                    <span className="material-symbols-outlined text-[18px]">send</span>
                  </button>
                  <input
                    className="inp flex-1 text-right !text-xs"
                    placeholder="הוסף הערה / פולואו-אפ..."
                    value={newFollowUp}
                    onChange={(e) => setNewFollowUp(e.target.value)}
                  />
                </form>
              </div>

              {/* Schedule Meeting Section */}
            <div className="px-6 py-4 border-b v-divider">
              {!showSchedule ? (
                <button
                  onClick={() => setShowSchedule(true)}
                  className="w-full text-sm font-bold py-2.5 rounded-lg flex items-center justify-center gap-2 transition-colors"
                  style={{ background: "#3b82f618", color: "#3b82f6" }}
                >
                  <span className="material-symbols-outlined text-[18px]">calendar_add_on</span>
                  קבע פגישה ביומן
                </button>
              ) : (
                <div className="space-y-3">
                  <div className="text-[10px] uppercase tracking-[0.15em] text-verdant-muted font-bold text-right">
                    קביעת פגישה · Google Calendar
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold text-verdant-muted mb-1 text-right">תאריך</label>
                      <input type="date" className="inp text-xs" value={schedDate} onChange={(e) => setSchedDate(e.target.value)} />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-verdant-muted mb-1 text-right">שעה</label>
                      <input type="time" className="inp text-xs" value={schedTime} onChange={(e) => setSchedTime(e.target.value)} />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-verdant-muted mb-1 text-right">סוג פגישה</label>
                    <select className="inp text-xs text-right" value={schedType} onChange={(e) => setSchedType(e.target.value)}>
                      <option value="היכרות">היכרות</option>
                      <option value="אבחון">אבחון</option>
                      <option value="בניית תוכנית">בניית תוכנית</option>
                      <option value="הגשת תוכנית">הגשת תוכנית</option>
                      <option value="מעקב">מעקב</option>
                      <option value="פרישה">פרישה</option>
                    </select>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={async () => {
                        if (schedDate && schedTime && selectedLead) {
                          const startDT = `${schedDate}T${schedTime}:00`;
                          const endDate = new Date(startDT);
                          endDate.setMinutes(endDate.getMinutes() + 60);
                          const endDT = endDate.toISOString();
                          const summary = `${schedType} — ${selectedLead.name}`;
                          const desc = `פגישה עם ${selectedLead.name} · Verdant Plan`;

                          if (gcalConnected) {
                            // POST to real Google Calendar API
                            try {
                              const res = await fetch("/api/gcal/events", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ summary, description: desc, startDateTime: startDT, endDateTime: endDT }),
                              });
                              if (res.ok) {
                                setToast("✅ הפגישה נוספה ליומן גוגל");
                              } else {
                                // Fallback to deep link
                                const dt = schedDate.replace(/-/g, "") + "T" + schedTime.replace(":", "") + "00";
                                window.open(`https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(summary)}&dates=${dt}/${dt}&details=${encodeURIComponent(desc)}`, "_blank");
                              }
                            } catch {
                              setToast("❌ שגיאה ביצירת פגישה");
                            }
                          } else {
                            // No OAuth — use deep link as fallback
                            const dt = schedDate.replace(/-/g, "") + "T" + schedTime.replace(":", "") + "00";
                            window.open(`https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(summary)}&dates=${dt}/${dt}&details=${encodeURIComponent(desc)}`, "_blank");
                          }
                        }
                        setShowSchedule(false);
                        setSchedDate("");
                        setSchedTime("");
                      }}
                      className="flex-1 text-sm font-bold py-2 rounded-lg text-white flex items-center justify-center gap-1.5"
                      style={{ background: "#3b82f6" }}
                    >
                      <span className="material-symbols-outlined text-[16px]">{gcalConnected ? "event_available" : "open_in_new"}</span>
                      {gcalConnected ? "הוסף ליומן" : "פתח ביומן גוגל"}
                    </button>
                    <button
                      onClick={() => setShowSchedule(false)}
                      className="text-sm font-bold py-2 px-4 rounded-lg text-verdant-muted"
                      style={{ background: "#f4f7ed" }}
                    >
                      ביטול
                    </button>
                  </div>
                </div>
              )}
            </div>
            </div>

            {/* Drawer Footer — Convert CTA */}
            <div className="px-6 py-4 border-t v-divider" style={{ background: "#f4f7ed" }}>
              {selectedLead.status === "converted" ? (
                <div className="text-center text-sm font-bold text-verdant-accent flex items-center justify-center gap-2">
                  <span className="material-symbols-outlined text-[18px]">check_circle</span>
                  הומר ללקוח בהצלחה
                </div>
              ) : (
                <button
                  onClick={convertToClient}
                  className="btn-botanical w-full text-sm flex items-center justify-center gap-2"
                >
                  <span className="material-symbols-outlined text-[18px]">person_add</span>
                  המר ללקוח ופתח אפיון
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {/* ═══════ Auto-Save Indicator ═══════ */}
      <SaveIndicator status={combinedSaveStatus} />

      {/* ═══════ Toast Notification ═══════ */}
      {toast && (
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] px-6 py-3 rounded-xl shadow-lg text-sm font-bold text-white animate-[fadeInUp_0.3s_ease-out]"
          style={{ background: "linear-gradient(135deg,#012d1d 0%,#1B4332 100%)" }}
        >
          {toast}
        </div>
      )}

      {/* ═══════ New Lead Modal ═══════ */}
      {showNewLead && (
        <>
          <div className="fixed inset-0 bg-black/30 z-[55]" onClick={() => setShowNewLead(false)} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[56] w-[460px] max-w-[92vw] bg-white rounded-organic shadow-soft overflow-hidden" dir="rtl">
            {/* Modal Header */}
            <div className="px-6 py-5 border-b v-divider flex items-center justify-between" style={{ background: "#f4f7ed" }}>
              <h3 className="text-lg font-extrabold text-verdant-ink">מתעניין חדש</h3>
              <button onClick={() => setShowNewLead(false)} className="text-verdant-muted hover:text-verdant-ink transition-colors">
                <span className="material-symbols-outlined text-[22px]">close</span>
              </button>
            </div>

            {/* Modal Body */}
            <form
              className="px-6 py-5 space-y-4"
              onSubmit={(e) => { e.preventDefault(); createNewLead(); }}
            >
              <div>
                <label className="block text-[11px] font-bold text-verdant-muted mb-1 text-right">שם מלא *</label>
                <input
                  className="inp text-right"
                  placeholder="הזן שם מלא"
                  value={nlName}
                  onChange={(e) => setNlName(e.target.value)}
                  autoFocus
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-verdant-muted mb-1 text-right">טלפון</label>
                  <input
                    className="inp"
                    dir="ltr"
                    style={{ textAlign: "left" }}
                    placeholder="050-0000000"
                    value={nlPhone}
                    onChange={(e) => setNlPhone(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-verdant-muted mb-1 text-right">אימייל</label>
                  <input
                    className="inp"
                    dir="ltr"
                    style={{ textAlign: "left" }}
                    placeholder="email@example.com"
                    type="email"
                    value={nlEmail}
                    onChange={(e) => setNlEmail(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-verdant-muted mb-1 text-right">מקור הגעה</label>
                <select className="inp text-right" value={nlSource} onChange={(e) => setNlSource(e.target.value)}>
                  {Object.keys(SOURCE_META).map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-verdant-muted mb-1 text-right">הערה ראשונית</label>
                <textarea
                  className="inp text-right"
                  placeholder="פרטים על המתעניין, מה הוא מחפש..."
                  value={nlNote}
                  onChange={(e) => setNlNote(e.target.value)}
                  rows={2}
                />
              </div>

              {/* Modal Footer */}
              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  className="btn-botanical flex-1 text-sm flex items-center justify-center gap-2"
                >
                  <span className="material-symbols-outlined text-[18px]">person_add</span>
                  הוסף מתעניין
                </button>
                <button
                  type="button"
                  onClick={() => setShowNewLead(false)}
                  className="btn-botanical-ghost text-sm"
                >
                  ביטול
                </button>
              </div>
            </form>
          </div>
        </>
      )}
    </main>
  );
}
