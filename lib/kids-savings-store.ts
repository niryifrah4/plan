/**
 * ═══════════════════════════════════════════════════════════
 *  חיסכון לכל ילד — Kids Savings Store
 * ═══════════════════════════════════════════════════════════
 *
 * תוכנית חיסכון ממשלתית לכל ילד (מ-2017, חוק ההתייעלות 2015).
 *
 * הפקדות:
 *   - ביטוח לאומי מפקיד ₪57/חודש (צמוד למדד, עדכון שנתי)
 *   - הורים יכולים להוסיף סכום זהה מקצבת הילדים (₪57)
 *   - סה"כ מקסימום: ₪114/חודש
 *
 * בונוסים:
 *   - גיל 3: ₪250 הפקדה חד-פעמית
 *   - בר/בת מצווה (12/13): ₪250 הפקדה חד-פעמית
 *   - גיל 21 (אחרי שירות): ₪568 בונוס
 *
 * משיכה:
 *   - גיל 18: הילד/ה יכולים למשוך את כל הכסף
 *   - עד גיל 18: משיכה רק במקרים חריגים (מוות/מחלה)
 *   - אם משאירים עד 21 + שירות צבאי/לאומי → בונוס ₪568
 *
 * מיסוי:
 *   - קרן: פטור מלא
 *   - רווחים בבנק: 15% מס רווחי הון
 *   - רווחים בקופת גמל: 25% מס רווחי הון
 *
 * מסלולי השקעה (בקופות גמל):
 *   1. סיכון מועט  — אג"ח ממשלתי, ~4.5% שנתי (ממוצע 5 שנים)
 *   2. סיכון בינוני — מניות+אג"ח, ~8% שנתי (ממוצע 5 שנים)
 *   3. סיכון מוגבר — דגש מניות, ~13% שנתי (ממוצע 5 שנים)
 *   + הלכתי (כשר) + שריעה
 *
 * בנקאי (3 מסלולים):
 *   - ריבית קבועה לא-צמודה
 *   - ריבית משתנה צמודת פריים
 *   - ריבית קבועה צמודת מדד
 *
 * localStorage key: verdant:kids_savings
 */

import { scopedKey } from "./client-scope";
import { fireSync } from "./sync-engine";
import { pushBlobInBackground, pullBlob } from "./sync/blob-sync";

const STORAGE_KEY = "verdant:kids_savings";
const BLOB_KEY = "kids_savings";
export const KIDS_SAVINGS_EVENT = "verdant:kids_savings:updated";

/* ── Investment tracks ── */

export interface KidsTrack {
  key: string;
  label: string;
  expectedReturn: number;  // annual %
  description: string;
}

export const KIDS_TRACKS: KidsTrack[] = [
  { key: "low",    label: "סיכון מועט",   expectedReturn: 0.03, description: "אג\"ח ממשלתי ופיקדונות — יציב, תשואה צפויה ~3% בשנה" },
  { key: "medium", label: "סיכון בינוני", expectedReturn: 0.07, description: "שילוב אג\"ח ומניות — איזון סיכון/תשואה. תשואה צפויה ~7% בשנה" },
  { key: "high",   label: "חיסכון מוגבר", expectedReturn: 0.10, description: "דגש על מניות — תשואה צפויה ~10% בשנה, תנודתיות גבוהה" },
  { key: "halacha", label: "הלכתי (כשר)", expectedReturn: 0.06, description: "השקעות לפי ההלכה — ללא ריבית, ללא חברות אסורות" },
];

/* ── Major investment houses ── */

export const KIDS_PROVIDERS = [
  "מגדל", "הראל", "כלל", "הפניקס", "מנורה מבטחים",
  "אלטשולר שחם", "מיטב דש", "פסגות", "אנליסט", "ילין לפידות",
  "מור", "IBI", "אחר",
];

/* ── Monthly deposit amounts (2025, צמוד למדד) ── */
export const GOV_MONTHLY_DEPOSIT = 57;    // ביטוח לאומי
export const PARENT_MONTHLY_MAX = 57;     // הורים יכולים להתאים סכום זהה
export const DEFAULT_MONTHLY = GOV_MONTHLY_DEPOSIT + PARENT_MONTHLY_MAX; // ₪114

/* ── Milestone bonuses ── */
export const BONUS_AGE_3 = 250;           // הפקדה חד-פעמית בגיל 3
export const BONUS_BAR_MITZVA = 250;      // הפקדה חד-פעמית בר/בת מצווה
export const BONUS_AGE_21 = 568;          // בונוס אחרי שירות בגיל 21

/* ── Tax rates ── */
export const TAX_BANK = 0.15;             // 15% מס רווחי הון — בנקאי
export const TAX_GEMEL = 0.25;            // 25% מס רווחי הון — קופת גמל

/* ── Per-child savings record ── */

export interface KidSavings {
  id: string;
  childName: string;
  dob: string;              // YYYY-MM-DD
  provider: string;         // investment house
  track: string;            // key from KIDS_TRACKS
  currentBalance: number;   // current known balance
  monthlyDeposit: number;   // ₪57-114 (gov + parent)
  parentDeposit: number;    // ₪0-57 (parent's share)
  giftTarget?: number;      // יעד מתנה לגיל 21 (e.g. ₪300,000)
  extraMonthly?: number;    // הפקדה נוספת מעבר לחיסכון לכל ילד (קופ"ג/תיק)
  extraVehicle?: string;    // "gemel" | "broker" — כלי ההשקעה הנוסף
  notes?: string;
}

/* ── Projections ── */

export interface KidProjection {
  childName: string;
  currentAge: number;        // years (fractional)
  yearsTo18: number;
  yearsTo21: number;
  projectedAt18: number;     // ₪ at age 18 (gross)
  projectedAt21: number;     // ₪ at age 21 (with service grant, gross)
  projectedAt21NoGrant: number; // ₪ at 21 without grant
  netAt18: number;           // ₪ at age 18 after tax on gains
  netAt21: number;           // ₪ at age 21 after tax on gains
  monthlyDeposit: number;
  track: KidsTrack;
  currentBalance: number;
  // Extra investment channel
  extraAt21: number;         // ₪ from extra monthly investment at age 21
  extraNetAt21: number;      // after tax
  totalNetAt21: number;      // kids savings net + extra net
  // Gift target
  giftTarget: number;        // target amount
  giftGap: number;           // how much is missing (negative = surplus)
  giftMonthlyNeeded: number; // extra monthly to close the gap
}

/** Calculate projected balance using FV formula */
function futureValue(
  presentValue: number,
  monthlyContrib: number,
  annualRate: number,
  years: number,
): number {
  if (years <= 0) return presentValue;
  const r = annualRate / 12;
  if (r === 0) return presentValue + monthlyContrib * years * 12;
  const n = years * 12;
  // FV of lump sum + FV of annuity
  const fvLump = presentValue * Math.pow(1 + r, n);
  const fvAnnuity = monthlyContrib * ((Math.pow(1 + r, n) - 1) / r);
  return fvLump + fvAnnuity;
}

/** Get child age from DOB */
export function childAge(dob: string): number {
  const birth = new Date(dob);
  const now = new Date();
  const diff = now.getTime() - birth.getTime();
  return diff / (365.25 * 24 * 3600 * 1000);
}

/** Calculate net after capital gains tax (only on gains, not principal) */
function netAfterTax(grossValue: number, totalDeposited: number, taxRate: number): number {
  const gains = Math.max(0, grossValue - totalDeposited);
  return grossValue - gains * taxRate;
}

/** Project a single child's savings to age 18 and 21 */
export function projectKidSavings(kid: KidSavings): KidProjection {
  const track = KIDS_TRACKS.find(t => t.key === kid.track) || KIDS_TRACKS[1];
  const age = childAge(kid.dob);
  const yearsTo18 = Math.max(0, 18 - age);
  const yearsTo21 = Math.max(0, 21 - age);

  // Phase 1: birth to 18 — monthly deposits + milestone bonuses
  let at18 = futureValue(kid.currentBalance, kid.monthlyDeposit, track.expectedReturn, yearsTo18);

  // Add milestone bonuses (compounded from when they're deposited)
  const milestoneBonuses: { ageTarget: number; amount: number }[] = [
    { ageTarget: 3, amount: BONUS_AGE_3 },
    { ageTarget: 13, amount: BONUS_BAR_MITZVA },
  ];
  let totalBonuses = 0;
  for (const m of milestoneBonuses) {
    if (age < m.ageTarget) {
      totalBonuses += m.amount;
      const yearsOfGrowth = 18 - m.ageTarget;
      if (yearsOfGrowth > 0) {
        at18 += futureValue(m.amount, 0, track.expectedReturn, yearsOfGrowth);
      } else {
        at18 += m.amount;
      }
    }
  }

  // Phase 2: 18 to 21 — no regular deposits, just growth + age-21 bonus
  const years18to21 = Math.max(0, yearsTo21 - yearsTo18);
  const at21NoGrant = futureValue(at18, 0, track.expectedReturn, years18to21);
  const at21WithGrant = at21NoGrant + BONUS_AGE_21;

  // Total deposited (principal) for tax calculation
  const totalDeposited18 = kid.currentBalance + kid.monthlyDeposit * yearsTo18 * 12 + totalBonuses;
  const totalDeposited21 = totalDeposited18 + BONUS_AGE_21;

  // Net after tax (25% on gains for gemel, principal is tax-free)
  const netAt18 = Math.round(netAfterTax(at18, totalDeposited18, TAX_GEMEL));
  const netAt21 = Math.round(netAfterTax(at21WithGrant, totalDeposited21, TAX_GEMEL));

  // Extra investment channel (קופ"ג להשקעה / תיק מסחר)
  const extraMonthly = kid.extraMonthly || 0;
  const extraVehicle = kid.extraVehicle || "gemel";
  const extraTaxRate = extraVehicle === "broker" ? 0.25 : TAX_GEMEL; // 25% both, but broker has no lock
  const extraGross21 = extraMonthly > 0 ? futureValue(0, extraMonthly, track.expectedReturn, yearsTo21) : 0;
  const extraDeposited = extraMonthly * yearsTo21 * 12;
  const extraNetAt21 = Math.round(netAfterTax(extraGross21, extraDeposited, extraTaxRate));

  const totalNetAt21 = netAt21 + extraNetAt21;

  // Gift target gap analysis
  const giftTarget = kid.giftTarget || 0;
  const giftGap = giftTarget > 0 ? giftTarget - totalNetAt21 : 0;
  // How much extra monthly to close the gap (using same track return)
  let giftMonthlyNeeded = 0;
  if (giftGap > 0 && yearsTo21 > 0) {
    const r = track.expectedReturn / 12;
    const n = yearsTo21 * 12;
    // FV of annuity = PMT * ((1+r)^n - 1) / r → PMT = FV * r / ((1+r)^n - 1)
    const grossNeeded = giftGap / (1 - extraTaxRate * (1 - extraDeposited / Math.max(extraGross21, 1)));
    // Simplified: assume ~75% of future gains are taxable
    const adjustedGap = giftGap / (1 - extraTaxRate * 0.5); // rough after-tax adjustment
    if (r > 0) {
      giftMonthlyNeeded = Math.round(adjustedGap * r / (Math.pow(1 + r, n) - 1));
    } else {
      giftMonthlyNeeded = Math.round(adjustedGap / n);
    }
  }

  return {
    childName: kid.childName,
    currentAge: age,
    yearsTo18,
    yearsTo21,
    projectedAt18: Math.round(at18),
    projectedAt21: Math.round(at21WithGrant),
    projectedAt21NoGrant: Math.round(at21NoGrant),
    netAt18,
    netAt21,
    monthlyDeposit: kid.monthlyDeposit,
    track,
    currentBalance: kid.currentBalance,
    extraAt21: Math.round(extraGross21),
    extraNetAt21,
    totalNetAt21,
    giftTarget,
    giftGap: Math.max(0, giftGap),
    giftMonthlyNeeded,
  };
}

/* ── CRUD ── */

export function loadKidsSavings(): KidSavings[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(scopedKey(STORAGE_KEY));
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
}

export function saveKidsSavings(items: KidSavings[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(scopedKey(STORAGE_KEY), JSON.stringify(items));
  fireSync(KIDS_SAVINGS_EVENT);
  pushBlobInBackground(BLOB_KEY, items);
}

export async function hydrateKidsSavingsFromRemote(): Promise<boolean> {
  const remote = await pullBlob<KidSavings[]>(BLOB_KEY);
  if (!remote || !Array.isArray(remote)) return false;
  try {
    localStorage.setItem(scopedKey(STORAGE_KEY), JSON.stringify(remote));
    fireSync(KIDS_SAVINGS_EVENT);
    return true;
  } catch { return false; }
}

export function addKidSavings(item: KidSavings): void {
  const items = loadKidsSavings();
  items.push(item);
  saveKidsSavings(items);
}

export function updateKidSavings(id: string, patch: Partial<KidSavings>): void {
  const items = loadKidsSavings();
  const idx = items.findIndex(k => k.id === id);
  if (idx >= 0) items[idx] = { ...items[idx], ...patch };
  saveKidsSavings(items);
}

export function deleteKidSavings(id: string): void {
  saveKidsSavings(loadKidsSavings().filter(k => k.id !== id));
}

/** Generate a unique ID */
export function kidSavingsId(): string {
  return `kid_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}
