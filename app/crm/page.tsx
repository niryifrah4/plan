"use client";

import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { fmtILS } from "@/lib/format";
import { usePersistedState } from "@/hooks/usePersistedState";
import { useAutoSave } from "@/hooks/useAutoSave";
import { SaveIndicator } from "@/components/SaveIndicator";
import { InviteClientButton } from "@/components/crm/InviteClientButton";
import { SolidKpi } from "@/components/ui/SolidKpi";

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
  email?: string; // Primary contact email — inherited from lead on conversion
  phone?: string; // Primary contact phone — inherited from lead on conversion
}

/* ═══════════════════════════════════════════════════════════════════
   Static maps
   ═══════════════════════════════════════════════════════════════════ */
const STATUS_META: Record<LeadStatus, { label: string; color: string; bg: string; icon: string }> =
  {
    new: { label: "חדש", color: "#2B694D", bg: "#2B694D18", icon: "fiber_new" },
    in_progress: { label: "בטיפול", color: "#3b82f6", bg: "#3b82f618", icon: "pending" },
    not_relevant: { label: "לא רלוונטי", color: "#9ca3af", bg: "#9ca3af18", icon: "block" },
    converted: { label: "הומר ללקוח", color: "#1B4332", bg: "#1B433218", icon: "check_circle" },
  };

const SOURCE_META: Record<string, { icon: string; color: string }> = {
  פייסבוק: { icon: "share", color: "#1877F2" },
  הפניה: { icon: "person", color: "#1B4332" },
  אתר: { icon: "language", color: "#5a7a6a" },
  לינקדאין: { icon: "work", color: "#0A66C2" },
  אינסטגרם: { icon: "photo_camera", color: "#E1306C" },
  "דף נחיתה": { icon: "web", color: "#1B4332" },
  "שאלון פיננסי": { icon: "quiz", color: "#f59e0b" },
};

// Backward compat alias
const SOURCE_ICONS: Record<string, string> = Object.fromEntries(
  Object.entries(SOURCE_META).map(([k, v]) => [k, v.icon])
);

const now = () => new Date().toISOString();

/* ═══════════════════════════════════════════════════════════════════
   Calendar + Tasks data (advisor-level, cross-client)
   ═══════════════════════════════════════════════════════════════════ */
type CalendarView = "daily" | "weekly" | "monthly";

interface Meeting {
  date: string;
  time: string;
  client: string;
  type: string;
  duration: number;
  color: string;
}

const ALL_MEETINGS: Meeting[] = [];

interface AdvisorTask {
  id: number;
  text: string;
  client: string | null;
  dueDate: string;
  urgent: boolean;
  done: boolean;
}

const INITIAL_ADVISOR_TASKS: AdvisorTask[] = [];

const HE_DAY_SHORT = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];
const HE_MONTHS_FULL = [
  "ינואר",
  "פברואר",
  "מרץ",
  "אפריל",
  "מאי",
  "יוני",
  "יולי",
  "אוגוסט",
  "ספטמבר",
  "אוקטובר",
  "נובמבר",
  "דצמבר",
];

function isoDateStr(d: Date): string {
  return d.toISOString().split("T")[0];
}
function getWeekDays(ref: Date): Date[] {
  const start = new Date(ref);
  start.setDate(ref.getDate() - ref.getDay());
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}
function getMonthCells(y: number, m: number): (Date | null)[] {
  const first = new Date(y, m, 1);
  const pad = first.getDay();
  const dim = new Date(y, m + 1, 0).getDate();
  const c: (Date | null)[] = [];
  for (let i = 0; i < pad; i++) c.push(null);
  for (let d = 1; d <= dim; d++) c.push(new Date(y, m, d));
  return c;
}
function meetingsOn(date: string) {
  return ALL_MEETINGS.filter((m) => m.date === date);
}

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
  return new Date(iso).toLocaleDateString("he-IL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
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
  useEffect(() => {
    setMounted(true);
  }, []);
  const [leads, setLeads, leadsSaving] = usePersistedState<Lead[]>("verdant:leads", INITIAL_LEADS);
  const [clients, setClients, clientsSaving] = usePersistedState<Client[]>(
    "verdant:clients",
    INITIAL_CLIENTS
  );
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
  const [gcalConnected, setGcalConnected, gcalSaving] = usePersistedState(
    "verdant:gcal_connected",
    false
  );
  const [gcalLoading, setGcalLoading] = useState(false);
  const [gcalEvents, setGcalEvents] = useState<
    { id: string; summary: string; start: string; end: string }[]
  >([]);

  const drawerRef = useRef<HTMLDivElement>(null);

  /* ── Calendar + Tasks state (persisted) ── */
  const [calView, setCalView] = useState<CalendarView>("daily");
  const [advisorTasks, setAdvisorTasks, tasksSaving] = usePersistedState(
    "verdant:advisor_tasks",
    INITIAL_ADVISOR_TASKS
  );
  const todayISO = "2026-04-06";
  const todayObj = new Date(2026, 3, 6);
  const todayMeetings = useMemo(() => meetingsOn(todayISO), []);
  const weekDays = useMemo(() => getWeekDays(todayObj), []);
  const monthCells = useMemo(() => getMonthCells(2026, 3), []);
  const todayTasks = useMemo(
    () => advisorTasks.filter((t) => t.dueDate === todayISO),
    [advisorTasks]
  );
  const tasksDone = todayTasks.filter((t) => t.done).length;
  const tasksTotal = todayTasks.length;
  function toggleAdvisorTask(id: number) {
    setAdvisorTasks((p) => p.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
  }

  /* ── Greeting (client-only to avoid hydration mismatch) ── */
  const [greet, setGreet] = useState("");
  const [today, setToday] = useState("");
  useEffect(() => {
    const h = new Date().getHours();
    setGreet(h < 12 ? "בוקר טוב" : h < 17 ? "צהריים טובים" : h < 20 ? "ערב טוב" : "לילה טוב");
    setToday(
      new Date().toLocaleDateString("he-IL", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    );
  }, []);

  /* ── KPI Calculations ── */
  const newLeadsThisMonth = useMemo(
    () => leads.filter((l) => isWithinDays(l.createdAt, 30)).length,
    [leads]
  );
  const conversionsThisMonth = useMemo(
    () => leads.filter((l) => l.status === "converted" && isWithinDays(l.createdAt, 30)).length,
    [leads]
  );
  const conversionRate = useMemo(
    () =>
      newLeadsThisMonth > 0 ? Math.round((conversionsThisMonth / newLeadsThisMonth) * 100) : 0,
    [newLeadsThisMonth, conversionsThisMonth]
  );

  /* ── Filtered leads (exclude converted, apply search) ── */
  const activeLeads = useMemo(() => {
    let list = leads.filter((l) => l.status !== "converted");
    if (filterStatus !== "all") list = list.filter((l) => l.status === filterStatus);
    if (debouncedLeadQ) {
      list = list.filter(
        (l) =>
          l.name.toLowerCase().includes(debouncedLeadQ) ||
          l.phone.includes(debouncedLeadQ) ||
          l.email.toLowerCase().includes(debouncedLeadQ)
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
        (c.convertedFromLead && c.convertedFromLead.toLowerCase().includes(debouncedClientQ))
    );
  }, [clients, debouncedClientQ]);

  /* ── Drawer ── */
  const selectedLead = useMemo(
    () => leads.find((l) => l.id === drawerLeadId) ?? null,
    [leads, drawerLeadId]
  );

  const openDrawer = useCallback((lead: Lead) => {
    setDrawerLeadId(lead.id);
    setEditName(lead.name);
    setEditPhone(lead.phone);
    setEditEmail(lead.email);
    setEditSource(lead.source);
    setEditStatus(lead.status);
    setNewFollowUp("");
  }, []);

  const closeDrawer = useCallback(() => {
    setDrawerLeadId(null);
    setShowSchedule(false);
  }, []);

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
          ? {
              ...l,
              name: editName,
              phone: editPhone,
              email: editEmail,
              source: editSource,
              status: editStatus,
            }
          : l
      )
    );
    // Also trigger Supabase auto-save
    leadAutoSave.triggerSave({
      id: drawerLeadId,
      name: editName,
      phone: editPhone,
      email: editEmail,
      source: editSource,
      status: editStatus,
    });
    setToast("✅ השינויים נשמרו");
  }

  function addFollowUp() {
    if (!newFollowUp.trim() || !drawerLeadId) return;
    const ts = now();
    setLeads((prev) =>
      prev.map((l) =>
        l.id === drawerLeadId
          ? {
              ...l,
              followUps: [
                ...l.followUps,
                {
                  id: Math.max(0, ...l.followUps.map((f) => f.id)) + 1,
                  text: newFollowUp.trim(),
                  timestamp: ts,
                },
              ],
            }
          : l
      )
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
      followUps: nlNote.trim() ? [{ id: 1, text: nlNote.trim(), timestamp: now() }] : [],
    };
    setLeads((prev) => [newLead, ...prev]);
    setShowNewLead(false);
    setNlName("");
    setNlPhone("");
    setNlEmail("");
    setNlSource("אתר");
    setNlNote("");
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
    fetch("/api/gcal/status")
      .then((r) => r.json())
      .then((data) => {
        if (data.connected) {
          setGcalConnected(true);
          // Fetch real events
          fetch("/api/gcal/events")
            .then((r) => r.json())
            .then((evData) => {
              if (evData.events) setGcalEvents(evData.events);
            })
            .catch(() => {});
        }
      })
      .catch(() => {});

    // Refetch trigger — dispatched by InviteClientButton after a successful invite
    // so the new household appears immediately.
    const onRefetch = () => {
      fetch("/api/crm/clients")
        .then((r) => r.json())
        .then((data) => {
          if (!Array.isArray(data.households)) return;
          const monthStr = (iso: string) => {
            const d = new Date(iso);
            return `${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
          };
          const rows: Client[] = (
            data.households as Array<{
              id: string;
              family_name: string;
              members_count: number;
              stage: string;
              created_at: string;
            }>
          ).map((h, i) => ({
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
        })
        .catch(() => {});
    };
    window.addEventListener("verdant:clients:refetch", onRefetch);

    // Load real client households from Supabase — REPLACE the clients list entirely.
    // No merging with legacy localStorage rows (those have no householdId and would
    // break "כניסה לתיק" impersonation). Only DB households are the source of truth.
    fetch("/api/crm/clients")
      .then((r) => r.json())
      .then((data) => {
        if (!Array.isArray(data.households)) return;
        const monthStr = (iso: string) => {
          const d = new Date(iso);
          return `${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
        };
        const rows: Client[] = (
          data.households as Array<{
            id: string;
            family_name: string;
            members_count: number;
            stage: string;
            created_at: string;
          }>
        ).map((h, i) => ({
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
      })
      .catch(() => {});

    return () => {
      window.removeEventListener("verdant:clients:refetch", onRefetch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function convertToClient() {
    if (!selectedLead) return;
    setLeads((prev) =>
      prev.map((l) => (l.id === selectedLead.id ? { ...l, status: "converted" as LeadStatus } : l))
    );
    const newId = Math.max(0, ...clients.map((c) => c.id)) + 1;
    const monthStr = `${String(new Date().getMonth() + 1).padStart(2, "0")}/${new Date().getFullYear()}`;
    const newClient = {
      id: newId,
      family: selectedLead.name,
      step: 0,
      totalSteps: 3,
      netWorth: 0,
      trend: "—",
      members: 1,
      joined: monthStr,
      docsUploaded: 0,
      docsTotal: 10,
      monthlyRevenue: 0,
      riskProfile: "—",
      convertedFromLead: selectedLead.name,
      email: selectedLead.email,
      phone: selectedLead.phone,
    };
    setClients((prev) => [...prev, newClient]);
    // Also persist current client ID for the client layout to pick up
    try {
      localStorage.setItem("verdant:current_hh", String(newId));
    } catch {}
    closeDrawer();
    setTab("clients"); // switch to clients tab to show the new client
    setToast(`✅ "${selectedLead.name}" הומר ללקוח בהצלחה`);
  }

  /* ═══════════════════════════════════════════════════════════════════
     RENDER
     ═══════════════════════════════════════════════════════════════════ */
  return (
    <main
      dir="rtl"
      className="relative min-h-screen px-6 py-8"
      style={{ background: "var(--verdant-bg)" }}
    >
      <div className="mx-auto max-w-7xl">
        {/* CRM header + Google Calendar removed 2026-04-28 per Nir.
            Logout button preserved as a small floating action so the
            advisor can still sign out. */}
        <div className="mb-4 flex justify-end">
          <button
            onClick={() => router.push("/login")}
            title="התנתקות"
            className="flex h-9 w-9 items-center justify-center rounded-xl text-verdant-muted transition-all hover:bg-red-50 hover:text-red-600"
            style={{ background: "#F3F4EC" }}
          >
            <span className="material-symbols-outlined text-[18px]">logout</span>
          </button>
        </div>

        {/* KPIs unified to bank-style 2026-04-29 — was 3 colored tiles. */}
        <section className="mb-6 grid grid-cols-3 gap-3">
          <SolidKpi
            label="מתעניינים החודש"
            value={String(newLeadsThisMonth)}
            icon="person_add"
            tone="emerald"
            sub="ב-30 יום"
          />
          <SolidKpi
            label="סגירות החודש"
            value={String(conversionsThisMonth)}
            icon="how_to_reg"
            tone="forest"
            sub="המרה ללקוח"
          />
          <SolidKpi
            label="אחוז סגירה"
            value={`${conversionRate}%`}
            icon="trending_up"
            tone={conversionRate >= 20 ? "emerald" : conversionRate >= 10 ? "amber" : "red"}
          />
        </section>

        {/* ═══════ Daily Tasks (Calendar removed 2026-04-28 per Nir) ═══════ */}
        <section className="mb-8">
          {false && (
            <div className="card-pad flex flex-col">
              <div className="mb-4 flex items-center justify-between">
                <div className="text-right">
                  <div className="mb-0.5 text-[10px] font-bold uppercase tracking-[0.2em] text-verdant-muted">
                    Calendar · יומן פגישות
                  </div>
                  <h3 className="text-base font-extrabold text-verdant-ink">לוח פגישות</h3>
                </div>
                <div
                  className="flex items-center gap-1 rounded-lg p-0.5"
                  style={{ background: "#f4f7ed" }}
                >
                  {[
                    { k: "daily" as CalendarView, l: "יומי" },
                    { k: "weekly" as CalendarView, l: "שבועי" },
                    { k: "monthly" as CalendarView, l: "חודשי" },
                  ].map((v) => (
                    <button
                      key={v.k}
                      onClick={() => setCalView(v.k)}
                      className={`rounded-md px-2.5 py-1 text-[10px] font-bold transition-all ${calView === v.k ? "bg-white text-verdant-accent shadow-sm" : "text-verdant-muted hover:text-verdant-ink"}`}
                    >
                      {v.l}
                    </button>
                  ))}
                </div>
              </div>

              {calView === "daily" && (
                <div className="flex-1">
                  <div className="mb-3 text-right text-[11px] font-bold text-verdant-muted">
                    {today} ·{" "}
                    <span className="tabular text-verdant-accent">
                      {todayMeetings.length} פגישות
                    </span>
                  </div>
                  <div className="v-divider divide-y">
                    {todayMeetings.map((m, i) => (
                      <div key={i} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                        <div className="min-w-[48px] text-right">
                          <div className="tabular text-sm font-extrabold text-verdant-ink">
                            {m.time}
                          </div>
                          <div className="text-[10px] font-bold text-verdant-muted">
                            {m.duration} דק&apos;
                          </div>
                        </div>
                        <div
                          className="w-0.5 flex-shrink-0 self-stretch rounded-full"
                          style={{ background: m.color }}
                        />
                        <div className="min-w-0 flex-1 text-right">
                          <div className="truncate text-sm font-bold text-verdant-ink">
                            {m.client}
                          </div>
                          <span
                            className="mt-0.5 inline-flex items-center rounded px-2 py-0.5 text-[10px] font-bold"
                            style={{ background: `${m.color}15`, color: m.color }}
                          >
                            {m.type}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {calView === "weekly" && (
                <div className="flex-1 space-y-1">
                  {weekDays.map((day) => {
                    const iso = isoDateStr(day);
                    const dm = meetingsOn(iso);
                    const isT = iso === todayISO;
                    return (
                      <div
                        key={iso}
                        className="flex items-start gap-3 rounded-lg px-2.5 py-2"
                        style={{
                          background: isT ? "#012d1d" : dm.length > 0 ? "#f4f7ed" : "transparent",
                        }}
                      >
                        <div className="min-w-[38px] text-center">
                          <div
                            className="text-[10px] font-bold"
                            style={{ color: isT ? "rgba(255,255,255,0.5)" : "#5a7a6a" }}
                          >
                            {HE_DAY_SHORT[day.getDay()]}
                          </div>
                          <div
                            className={`tabular text-sm font-extrabold ${isT ? "text-white" : "text-verdant-ink"}`}
                          >
                            {day.getDate()}
                          </div>
                        </div>
                        <div className="min-w-0 flex-1">
                          {dm.length === 0 ? (
                            <div
                              className="py-1 text-[10px]"
                              style={{ color: isT ? "rgba(255,255,255,0.3)" : "#9ca3af" }}
                            >
                              —
                            </div>
                          ) : (
                            <div className="flex flex-wrap gap-1">
                              {dm.map((m, j) => (
                                <span
                                  key={j}
                                  className="inline-flex items-center gap-1 whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-bold"
                                  style={{
                                    background: isT ? "rgba(255,255,255,0.12)" : `${m.color}12`,
                                    color: isT ? "#fff" : m.color,
                                  }}
                                >
                                  <span className="tabular">{m.time}</span>
                                  {m.client}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        {dm.length > 0 && (
                          <span
                            className="tabular rounded-full px-1.5 py-0.5 text-[10px] font-extrabold"
                            style={{
                              background: isT ? "rgba(16,185,129,0.3)" : "#1B433218",
                              color: isT ? "#2B694D" : "#1B4332",
                            }}
                          >
                            {dm.length}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {calView === "monthly" && (
                <div className="flex flex-1 flex-col">
                  <div className="mb-2 text-right text-[11px] font-bold text-verdant-muted">
                    {HE_MONTHS_FULL[3]} 2026
                  </div>
                  <div className="mb-1 grid grid-cols-7 gap-0.5">
                    {HE_DAY_SHORT.map((d) => (
                      <div
                        key={d}
                        className="py-0.5 text-center text-[9px] font-bold text-verdant-muted"
                      >
                        {d}
                      </div>
                    ))}
                  </div>
                  <div className="grid flex-1 grid-cols-7 gap-0.5">
                    {monthCells.map((cell, i) => {
                      if (!cell) return <div key={`p-${i}`} />;
                      const iso = isoDateStr(cell);
                      const cnt = meetingsOn(iso).length;
                      const isT = iso === todayISO;
                      return (
                        <div
                          key={iso}
                          className="flex flex-col items-center rounded-md py-1"
                          style={{
                            background: isT ? "#012d1d" : cnt > 0 ? "#f4f7ed" : "transparent",
                          }}
                        >
                          <span
                            className={`tabular text-[11px] font-extrabold ${isT ? "text-white" : "text-verdant-ink"}`}
                          >
                            {cell.getDate()}
                          </span>
                          {cnt > 0 && (
                            <div className="mt-0.5 flex gap-0.5">
                              {Array.from({ length: Math.min(cnt, 3) }).map((_, j) => (
                                <span
                                  key={j}
                                  className="h-1 w-1 rounded-full"
                                  style={{ background: isT ? "#2B694D" : "#1B4332" }}
                                />
                              ))}
                              {cnt > 3 && (
                                <span
                                  className="text-[7px] font-bold"
                                  style={{ color: isT ? "#2B694D" : "#1B4332" }}
                                >
                                  +
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <div className="v-divider mt-2 flex items-center justify-between border-t pt-2 text-[10px] font-bold text-verdant-muted">
                    <span className="tabular">
                      {ALL_MEETINGS.filter((m) => m.date.startsWith("2026-04")).length} פגישות
                    </span>
                    <span>אפריל 2026</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Daily Tasks Card ── */}
          <div className="card-pad flex flex-col">
            <div className="mb-4 flex items-center justify-between">
              <div className="text-right">
                <div className="mb-0.5 text-[10px] font-bold uppercase tracking-[0.2em] text-verdant-muted">
                  Daily Tasks · סדר יום
                </div>
                <h3 className="text-base font-extrabold text-verdant-ink">משימות להיום</h3>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className="tabular text-xs font-extrabold"
                  style={{ color: tasksDone === tasksTotal ? "#2B694D" : "#5a7a6a" }}
                >
                  {tasksDone}/{tasksTotal}
                </span>
                <span className="material-symbols-outlined text-[20px] text-verdant-emerald">
                  task_alt
                </span>
              </div>
            </div>

            <div
              className="mb-4 h-1.5 overflow-hidden rounded-full"
              style={{ background: "#eef2e8" }}
            >
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${tasksTotal > 0 ? Math.round((tasksDone / tasksTotal) * 100) : 0}%`,
                  background: "#2B694D",
                }}
              />
            </div>

            <ul className="v-divider flex-1 divide-y">
              {todayTasks
                .filter((t) => !t.done)
                .map((t) => (
                  <li key={t.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                    <button onClick={() => toggleAdvisorTask(t.id)} className="flex-shrink-0">
                      <span
                        className="material-symbols-outlined text-[18px]"
                        style={{ color: "#d8e0d0" }}
                      >
                        radio_button_unchecked
                      </span>
                    </button>
                    <div className="min-w-0 flex-1 text-right">
                      <span className="block truncate text-sm text-verdant-ink">{t.text}</span>
                      {t.client && (
                        <span className="mt-0.5 inline-flex items-center gap-1 text-[10px] font-bold text-verdant-accent">
                          <span className="material-symbols-outlined text-[11px]">person</span>
                          {t.client}
                        </span>
                      )}
                    </div>
                    {t.urgent && (
                      <span
                        className="flex-shrink-0 rounded-full px-2 py-0.5 text-[9px] font-extrabold uppercase"
                        style={{ background: "#b91c1c18", color: "#b91c1c" }}
                      >
                        דחוף
                      </span>
                    )}
                  </li>
                ))}
              {todayTasks.filter((t) => !t.done).length === 0 && (
                <li className="py-6 text-center text-sm text-verdant-muted">
                  <span
                    className="material-symbols-outlined mx-auto mb-1 block text-[22px]"
                    style={{ color: "#2B694D" }}
                  >
                    check_circle
                  </span>
                  כל המשימות הושלמו — כל הכבוד!
                </li>
              )}
            </ul>
          </div>
        </section>

        {/* ═══════ Tab Switcher ═══════ */}
        <div className="v-divider mb-0 flex items-center gap-0 border-b">
          {[
            { key: "leads" as CrmTab, label: "מתעניינים", icon: "person_search" },
            { key: "clients" as CrmTab, label: "לקוחות פעילים", icon: "folder_shared" },
          ].map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 border-b-2 px-6 py-3.5 text-sm font-bold transition-colors ${
                tab === t.key
                  ? "border-verdant-accent text-verdant-accent"
                  : "border-transparent text-verdant-muted hover:text-verdant-ink"
              }`}
            >
              <span className="material-symbols-outlined text-[18px]">{t.icon}</span>
              {t.label}
              {mounted && (
                <span
                  className="tabular rounded-full px-2 py-0.5 text-[10px] font-extrabold"
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
          <div className="v-card mt-0 overflow-hidden rounded-t-none border-t-0">
            {/* Toolbar */}
            <div
              className="v-divider flex flex-wrap items-center justify-between gap-3 border-b px-6 py-4"
              style={{ background: "#f4f7ed" }}
            >
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <span className="material-symbols-outlined pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[16px] text-verdant-muted">
                    search
                  </span>
                  <input
                    className="inp !w-[200px] !py-1.5 !pr-8 text-xs"
                    placeholder="חיפוש שם, טלפון, אימייל..."
                    value={searchLeads}
                    onChange={(e) => setSearchLeads(e.target.value)}
                  />
                  {searchLeads && (
                    <button
                      onClick={() => setSearchLeads("")}
                      className="absolute left-2 top-1/2 -translate-y-1/2 text-verdant-muted hover:text-verdant-ink"
                    >
                      <span className="material-symbols-outlined text-[14px]">close</span>
                    </button>
                  )}
                </div>
                <select
                  className="inp !w-auto !min-w-[140px] !py-1.5 text-xs"
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value as LeadStatus | "all")}
                >
                  <option value="all">כל הסטטוסים</option>
                  {(["new", "in_progress", "not_relevant"] as LeadStatus[]).map((k) => (
                    <option key={k} value={k}>
                      {STATUS_META[k].label}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => setShowNewLead(true)}
                  className="btn-botanical flex items-center gap-1.5 px-4 py-1.5 text-xs"
                >
                  <span className="material-symbols-outlined text-[14px]">add</span>
                  מתעניין חדש
                </button>
              </div>
              <div className="text-right">
                <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-verdant-muted">
                  Lead Pipeline
                </div>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr
                    className="v-divider border-b text-[10px] font-bold uppercase tracking-[0.1em] text-verdant-muted"
                    style={{ background: "#fafcf6" }}
                  >
                    <th className="w-[1%] px-5 py-3 text-right" />
                    <th className="px-4 py-3 text-right">שם מלא</th>
                    <th className="px-4 py-3 text-right">טלפון</th>
                    <th className="px-4 py-3 text-right">מקור</th>
                    <th className="px-4 py-3 text-right">סטטוס</th>
                    <th className="px-4 py-3 text-right">תאריך יצירה</th>
                    <th className="px-4 py-3 text-right">פולואו-אפ אחרון</th>
                  </tr>
                </thead>
                <tbody>
                  {activeLeads.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-16 text-center text-sm text-verdant-muted">
                        <span className="material-symbols-outlined mb-2 block text-[36px] opacity-25">
                          inbox
                        </span>
                        {debouncedLeadQ ? "לא נמצאו תוצאות" : "אין מתעניינים בסטטוס זה"}
                      </td>
                    </tr>
                  )}
                  {activeLeads.map((lead) => {
                    const sm = STATUS_META[lead.status];
                    const lastFU =
                      lead.followUps.length > 0 ? lead.followUps[lead.followUps.length - 1] : null;
                    return (
                      <tr
                        key={lead.id}
                        onClick={() => openDrawer(lead)}
                        className="v-divider group cursor-pointer border-b transition-colors hover:bg-[#f4f7ed]"
                      >
                        <td className="px-5 py-3.5">
                          <span
                            className="material-symbols-outlined text-[16px] opacity-0 transition-opacity group-hover:opacity-60"
                            style={{ color: sm.color }}
                          >
                            {sm.icon}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3.5 text-right font-extrabold text-verdant-ink">
                          {lead.name}
                        </td>
                        <td
                          className="tabular px-4 py-3.5 text-right font-bold text-verdant-muted"
                          dir="ltr"
                        >
                          {lead.phone}
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          <span
                            className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-extrabold"
                            style={{
                              background: `${SOURCE_META[lead.source]?.color || "#5a7a6a"}14`,
                              color: SOURCE_META[lead.source]?.color || "#5a7a6a",
                            }}
                          >
                            <span className="material-symbols-outlined text-[13px]">
                              {SOURCE_META[lead.source]?.icon || "link"}
                            </span>
                            {lead.source}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          <span
                            className="inline-block rounded-full px-2.5 py-1 text-[10px] font-extrabold"
                            style={{ background: sm.bg, color: sm.color }}
                          >
                            {sm.label}
                          </span>
                        </td>
                        <td className="tabular whitespace-nowrap px-4 py-3.5 text-right font-bold text-verdant-muted">
                          {fmtDate(lead.createdAt)}
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          {lastFU ? (
                            <span
                              className="block max-w-[220px] truncate text-right text-xs text-verdant-muted"
                              title={lastFU.text}
                            >
                              {lastFU.text}
                            </span>
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
            <div
              className="v-divider flex flex-wrap items-center gap-6 border-t px-6 py-3"
              style={{ background: "#f4f7ed" }}
            >
              {(["new", "in_progress", "not_relevant"] as LeadStatus[]).map((s) => {
                const cnt = leads.filter((l) => l.status === s).length;
                const sm = STATUS_META[s];
                return (
                  <div key={s} className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ background: sm.color }} />
                    <span className="text-[11px] font-bold text-verdant-muted">{sm.label}</span>
                    <span
                      className="tabular text-[11px] font-extrabold"
                      style={{ color: sm.color }}
                    >
                      {cnt}
                    </span>
                  </div>
                );
              })}
              <div className="mr-auto flex items-center gap-2">
                <span className="h-2 w-2 rounded-full" style={{ background: "#1B4332" }} />
                <span className="text-[11px] font-bold text-verdant-muted">הומרו</span>
                <span className="tabular text-[11px] font-extrabold" style={{ color: "#1B4332" }}>
                  {leads.filter((l) => l.status === "converted").length}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════
           TAB 2 — Clients (לקוחות)
           ═══════════════════════════════════════════════════════════════ */}
        {tab === "clients" && (
          <div className="v-card mt-0 overflow-hidden rounded-t-none border-t-0">
            {/* Toolbar */}
            <div
              className="v-divider flex flex-wrap items-center justify-between gap-3 border-b px-6 py-4"
              style={{ background: "#f4f7ed" }}
            >
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <span className="material-symbols-outlined pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[16px] text-verdant-muted">
                    search
                  </span>
                  <input
                    className="inp !w-[200px] !py-1.5 !pr-8 text-xs"
                    placeholder="חיפוש שם משפחה..."
                    value={searchClients}
                    onChange={(e) => setSearchClients(e.target.value)}
                  />
                  {searchClients && (
                    <button
                      onClick={() => setSearchClients("")}
                      className="absolute left-2 top-1/2 -translate-y-1/2 text-verdant-muted hover:text-verdant-ink"
                    >
                      <span className="material-symbols-outlined text-[14px]">close</span>
                    </button>
                  )}
                </div>
                {mounted && (
                  <span className="tabular text-xs font-bold text-verdant-muted">
                    {filteredClients.length} תיקים פעילים
                  </span>
                )}
                <InviteClientButton />
              </div>
              <div className="text-right">
                <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-verdant-muted">
                  Client Portfolio
                </div>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr
                    className="v-divider border-b text-[10px] font-bold uppercase tracking-[0.1em] text-verdant-muted"
                    style={{ background: "#fafcf6" }}
                  >
                    <th className="px-5 py-3 text-right">משפחה / שם</th>
                    <th className="px-4 py-3 text-right">שלב</th>
                    <th className="px-4 py-3 text-right">הון נקי</th>
                    <th className="px-4 py-3 text-right">מגמה</th>
                    <th className="px-4 py-3 text-right">פרופיל סיכון</th>
                    <th className="px-4 py-3 text-right">מסמכים</th>
                    <th className="px-4 py-3 text-right">הצטרפות</th>
                    <th className="px-4 py-3 text-right">פעולות</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredClients.length === 0 && (
                    <tr>
                      <td colSpan={8} className="py-16 text-center text-sm text-verdant-muted">
                        <span className="material-symbols-outlined mb-2 block text-[36px] opacity-25">
                          folder_off
                        </span>
                        {debouncedClientQ ? "לא נמצאו תוצאות" : "אין לקוחות פעילים"}
                      </td>
                    </tr>
                  )}
                  {filteredClients.map((c) => {
                    const docPct =
                      c.docsTotal > 0 ? Math.round((c.docsUploaded / c.docsTotal) * 100) : 0;
                    const stepLabel = c.step === 0 ? "חדש" : `שלב ${c.step}/${c.totalSteps}`;
                    const stepColor =
                      c.step === 0 ? "#f59e0b" : c.step >= c.totalSteps ? "#2B694D" : "#1B4332";
                    return (
                      <tr
                        key={c.id}
                        className="v-divider border-b transition-colors hover:bg-[#f9faf2]"
                      >
                        <td className="px-5 py-3.5 text-right">
                          <div className="font-extrabold text-verdant-ink">{c.family}</div>
                          {c.convertedFromLead && (
                            <div className="mt-0.5 flex items-center justify-end gap-1 text-[10px] font-bold text-verdant-emerald">
                              <span className="material-symbols-outlined text-[12px]">
                                swap_horiz
                              </span>
                              הומר מליד
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          <span
                            className="rounded-full px-2.5 py-1 text-[10px] font-extrabold"
                            style={{ background: `${stepColor}18`, color: stepColor }}
                          >
                            {stepLabel}
                          </span>
                        </td>
                        <td className="tabular px-4 py-3.5 text-right font-bold text-verdant-ink">
                          {c.netWorth > 0 ? fmtILS(c.netWorth) : "—"}
                        </td>
                        <td
                          className="tabular px-4 py-3.5 text-right font-bold"
                          style={{
                            color: c.trend.startsWith("+")
                              ? "#1B4332"
                              : c.trend.startsWith("-")
                                ? "#b91c1c"
                                : "#9ca3af",
                          }}
                        >
                          {c.trend}
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          <span className="text-xs font-bold text-verdant-muted">
                            {c.riskProfile}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <span className="tabular text-[10px] font-bold text-verdant-muted">
                              {c.docsUploaded}/{c.docsTotal}
                            </span>
                            <div
                              className="h-1.5 w-16 overflow-hidden rounded-full"
                              style={{ background: "#eef2e8" }}
                            >
                              <div
                                className="h-full rounded-full"
                                style={{
                                  width: `${docPct}%`,
                                  background: docPct === 100 ? "#2B694D" : "#f59e0b",
                                }}
                              />
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-right font-bold text-verdant-muted">
                          {c.joined}
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Link
                              href={`/onboarding?hh=${c.id}`}
                              className="whitespace-nowrap text-[11px] font-bold text-verdant-muted transition-colors hover:text-verdant-accent"
                            >
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
                              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-4 py-2 text-[11px] font-extrabold transition-all hover:shadow-soft active:scale-95"
                              style={{ background: "#1B4332", color: "#F9FAF2" }}
                            >
                              כניסה לתיק
                              <span className="material-symbols-outlined text-[14px]">
                                arrow_back
                              </span>
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
        <div className="fixed inset-0 z-40 bg-black/20 transition-opacity" />
      )}

      <div
        ref={drawerRef}
        className={`fixed right-0 top-0 z-50 flex h-full w-[440px] max-w-[90vw] flex-col bg-white shadow-2xl transition-transform duration-300 ease-out ${
          drawerLeadId !== null ? "translate-x-0" : "translate-x-full"
        }`}
        style={{ borderLeft: "1px solid var(--verdant-line)" }}
      >
        {selectedLead && (
          <>
            {/* Drawer Header */}
            <div
              className="v-divider flex items-center justify-between border-b px-6 py-5"
              style={{ background: "#f4f7ed" }}
            >
              <button
                onClick={closeDrawer}
                className="text-verdant-muted transition-colors hover:text-verdant-ink"
              >
                <span className="material-symbols-outlined text-[22px]">close</span>
              </button>
              <div className="text-right">
                <div className="mb-0.5 text-[10px] font-bold uppercase tracking-[0.2em] text-verdant-muted">
                  מעקב מתעניין
                </div>
                <h3 className="text-lg font-extrabold text-verdant-ink">{selectedLead.name}</h3>
              </div>
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto">
              {/* Quick edit */}
              <div className="v-divider space-y-3 border-b px-6 py-5">
                <div className="mb-2 text-right text-[10px] font-bold uppercase tracking-[0.15em] text-verdant-muted">
                  עריכה מהירה
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-right text-[10px] font-bold text-verdant-muted">
                      שם מלא
                    </label>
                    <input
                      className="inp text-right"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-right text-[10px] font-bold text-verdant-muted">
                      טלפון
                    </label>
                    <input
                      className="inp"
                      dir="ltr"
                      value={editPhone}
                      onChange={(e) => setEditPhone(e.target.value)}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-right text-[10px] font-bold text-verdant-muted">
                      אימייל
                    </label>
                    <input
                      className="inp"
                      dir="ltr"
                      value={editEmail}
                      onChange={(e) => setEditEmail(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-right text-[10px] font-bold text-verdant-muted">
                      מקור הגעה
                    </label>
                    <select
                      className="inp text-right"
                      value={editSource}
                      onChange={(e) => setEditSource(e.target.value)}
                    >
                      {Object.keys(SOURCE_META).map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-right text-[10px] font-bold text-verdant-muted">
                    סטטוס
                  </label>
                  <div className="flex flex-wrap justify-end gap-2">
                    {(["new", "in_progress", "not_relevant"] as LeadStatus[]).map((s) => {
                      const sm = STATUS_META[s];
                      const active = editStatus === s;
                      return (
                        <button
                          key={s}
                          onClick={() => setEditStatus(s)}
                          className="rounded-full border-2 px-3 py-1.5 text-[11px] font-extrabold transition-all"
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
                  className="w-full rounded-lg py-2 text-sm font-bold transition-colors"
                  style={{ background: "#1B433218", color: "#1B4332" }}
                >
                  שמור שינויים
                </button>
              </div>

              {/* Follow-up Timeline */}
              <div className="v-divider border-b px-6 py-5">
                <div className="mb-4 text-right text-[10px] font-bold uppercase tracking-[0.15em] text-verdant-muted">
                  מעקב פולואו-אפ · Timeline
                </div>

                {selectedLead.followUps.length === 0 ? (
                  <div className="py-8 text-center text-sm text-verdant-muted">
                    <span className="material-symbols-outlined mb-1 block text-[28px] opacity-25">
                      chat_bubble_outline
                    </span>
                    אין הערות עדיין
                  </div>
                ) : (
                  <div className="relative space-y-0">
                    <div
                      className="absolute bottom-2 right-[11px] top-2 w-0.5 rounded-full"
                      style={{ background: "var(--verdant-line)" }}
                    />
                    {selectedLead.followUps.map((fu, idx) => (
                      <div key={fu.id} className="relative flex gap-3 pb-4 last:pb-0">
                        <div
                          className="z-10 mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full"
                          style={{
                            background:
                              idx === selectedLead.followUps.length - 1 ? "#1B4332" : "#d8e0d0",
                          }}
                        >
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{
                              background:
                                idx === selectedLead.followUps.length - 1 ? "#fff" : "#5a7a6a",
                            }}
                          />
                        </div>
                        <div className="flex-1 text-right">
                          <div className="tabular mb-0.5 text-[10px] font-bold text-verdant-muted">
                            {fmtDate(fu.timestamp)} · {fmtTime(fu.timestamp)}
                          </div>
                          <div className="text-sm leading-relaxed text-verdant-ink">{fu.text}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add note */}
                <form
                  className="mt-4 flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    addFollowUp();
                  }}
                >
                  <button
                    type="submit"
                    className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg transition-colors"
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
              <div className="v-divider border-b px-6 py-4">
                {!showSchedule ? (
                  <button
                    onClick={() => setShowSchedule(true)}
                    className="flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-bold transition-colors"
                    style={{ background: "#3b82f618", color: "#3b82f6" }}
                  >
                    <span className="material-symbols-outlined text-[18px]">calendar_add_on</span>
                    קבע פגישה ביומן
                  </button>
                ) : (
                  <div className="space-y-3">
                    <div className="text-right text-[10px] font-bold uppercase tracking-[0.15em] text-verdant-muted">
                      קביעת פגישה · Google Calendar
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="mb-1 block text-right text-[10px] font-bold text-verdant-muted">
                          תאריך
                        </label>
                        <input
                          type="date"
                          className="inp text-xs"
                          value={schedDate}
                          onChange={(e) => setSchedDate(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-right text-[10px] font-bold text-verdant-muted">
                          שעה
                        </label>
                        <input
                          type="time"
                          className="inp text-xs"
                          value={schedTime}
                          onChange={(e) => setSchedTime(e.target.value)}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="mb-1 block text-right text-[10px] font-bold text-verdant-muted">
                        סוג פגישה
                      </label>
                      <select
                        className="inp text-right text-xs"
                        value={schedType}
                        onChange={(e) => setSchedType(e.target.value)}
                      >
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
                                  body: JSON.stringify({
                                    summary,
                                    description: desc,
                                    startDateTime: startDT,
                                    endDateTime: endDT,
                                  }),
                                });
                                if (res.ok) {
                                  setToast("✅ הפגישה נוספה ליומן גוגל");
                                } else {
                                  // Fallback to deep link
                                  const dt =
                                    schedDate.replace(/-/g, "") +
                                    "T" +
                                    schedTime.replace(":", "") +
                                    "00";
                                  window.open(
                                    `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(summary)}&dates=${dt}/${dt}&details=${encodeURIComponent(desc)}`,
                                    "_blank"
                                  );
                                }
                              } catch {
                                setToast("❌ שגיאה ביצירת פגישה");
                              }
                            } else {
                              // No OAuth — use deep link as fallback
                              const dt =
                                schedDate.replace(/-/g, "") +
                                "T" +
                                schedTime.replace(":", "") +
                                "00";
                              window.open(
                                `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(summary)}&dates=${dt}/${dt}&details=${encodeURIComponent(desc)}`,
                                "_blank"
                              );
                            }
                          }
                          setShowSchedule(false);
                          setSchedDate("");
                          setSchedTime("");
                        }}
                        className="flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-bold text-white"
                        style={{ background: "#3b82f6" }}
                      >
                        <span className="material-symbols-outlined text-[16px]">
                          {gcalConnected ? "event_available" : "open_in_new"}
                        </span>
                        {gcalConnected ? "הוסף ליומן" : "פתח ביומן גוגל"}
                      </button>
                      <button
                        onClick={() => setShowSchedule(false)}
                        className="rounded-lg px-4 py-2 text-sm font-bold text-verdant-muted"
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
            <div className="v-divider border-t px-6 py-4" style={{ background: "#f4f7ed" }}>
              {selectedLead.status === "converted" ? (
                <div className="flex items-center justify-center gap-2 text-center text-sm font-bold text-verdant-accent">
                  <span className="material-symbols-outlined text-[18px]">check_circle</span>
                  הומר ללקוח בהצלחה
                </div>
              ) : (
                <button
                  onClick={convertToClient}
                  className="btn-botanical flex w-full items-center justify-center gap-2 text-sm"
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
          className="fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 animate-[fadeInUp_0.3s_ease-out] rounded-xl px-6 py-3 text-sm font-bold text-white shadow-lg"
          style={{ background: "linear-gradient(135deg,#012d1d 0%,#1B4332 100%)" }}
        >
          {toast}
        </div>
      )}

      {/* ═══════ New Lead Modal ═══════ */}
      {showNewLead && (
        <>
          <div className="fixed inset-0 z-[55] bg-black/30" onClick={() => setShowNewLead(false)} />
          <div
            className="fixed left-1/2 top-1/2 z-[56] w-[460px] max-w-[92vw] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-organic bg-white shadow-soft"
            dir="rtl"
          >
            {/* Modal Header */}
            <div
              className="v-divider flex items-center justify-between border-b px-6 py-5"
              style={{ background: "#f4f7ed" }}
            >
              <h3 className="text-lg font-extrabold text-verdant-ink">מתעניין חדש</h3>
              <button
                onClick={() => setShowNewLead(false)}
                className="text-verdant-muted transition-colors hover:text-verdant-ink"
              >
                <span className="material-symbols-outlined text-[22px]">close</span>
              </button>
            </div>

            {/* Modal Body */}
            <form
              className="space-y-4 px-6 py-5"
              onSubmit={(e) => {
                e.preventDefault();
                createNewLead();
              }}
            >
              <div>
                <label className="mb-1 block text-right text-[11px] font-bold text-verdant-muted">
                  שם מלא *
                </label>
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
                  <label className="mb-1 block text-right text-[11px] font-bold text-verdant-muted">
                    טלפון
                  </label>
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
                  <label className="mb-1 block text-right text-[11px] font-bold text-verdant-muted">
                    אימייל
                  </label>
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
                <label className="mb-1 block text-right text-[11px] font-bold text-verdant-muted">
                  מקור הגעה
                </label>
                <select
                  className="inp text-right"
                  value={nlSource}
                  onChange={(e) => setNlSource(e.target.value)}
                >
                  {Object.keys(SOURCE_META).map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-right text-[11px] font-bold text-verdant-muted">
                  הערה ראשונית
                </label>
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
                  className="btn-botanical flex flex-1 items-center justify-center gap-2 text-sm"
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
