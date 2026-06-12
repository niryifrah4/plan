import { scopedKey } from "@/lib/client-scope";
import { pullBlob, pushBlobInBackground } from "@/lib/sync/blob-sync";
import { normalizeRecurringDescription, type RecurringGroup } from "@/lib/doc-parser/recurring";
import { reportError } from "@/lib/report-error";

const STORAGE_KEY = "verdant:subscriptions_radar_exclusions";
const BLOB_KEY = "subscriptions_radar_exclusions";

export const SUBSCRIPTIONS_RADAR_EXCLUSIONS_EVENT =
  "verdant:subscriptions_radar_exclusions:updated";

const SIGNATURE_BUCKET_SIZE = 10;
const MIN_AMOUNT_TOLERANCE = 5;

export interface SubscriptionRadarExclusion {
  signature: string;
  normalizedDescription: string;
  representativeAmount: number;
  amountBucket: number;
  label: string;
  addedAt: string;
}

export function normalizeSubscriptionRadarDescription(description: string): string {
  const normalized = normalizeRecurringDescription(description);
  const root = normalized
    .replace(/\s*(סניף|branch|#|מס['\u0027]?|snif)\s*\d+.*$/i, "")
    .replace(/\s*\d{3,}.*$/, "")
    .replace(/\s+/g, " ")
    .trim();
  return root || normalized;
}

export function buildSubscriptionRadarSignature(
  description: string,
  amount: number
): SubscriptionRadarExclusion {
  const normalizedDescription = normalizeSubscriptionRadarDescription(description);
  const representativeAmount = roundAmount(amount);
  return {
    signature: `${normalizedDescription}|${bucketAmount(representativeAmount)}`,
    normalizedDescription,
    representativeAmount,
    amountBucket: bucketAmount(representativeAmount),
    label: description.trim() || normalizedDescription,
    addedAt: new Date().toISOString(),
  };
}

export function loadSubscriptionRadarExclusions(): SubscriptionRadarExclusion[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(scopedKey(STORAGE_KEY));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return sanitizeExclusions(Array.isArray(parsed) ? parsed : []);
  } catch {
    return [];
  }
}

export function saveSubscriptionRadarExclusions(
  exclusions: SubscriptionRadarExclusion[]
): SubscriptionRadarExclusion[] {
  if (typeof window === "undefined") return exclusions;
  const sanitized = sanitizeExclusions(exclusions);
  try {
    localStorage.setItem(scopedKey(STORAGE_KEY), JSON.stringify(sanitized));
    window.dispatchEvent(new Event(SUBSCRIPTIONS_RADAR_EXCLUSIONS_EVENT));
    pushBlobInBackground(BLOB_KEY, sanitized);
  } catch (e) { reportError("subscriptions-radar-exclusions", e); }
  return sanitized;
}

export async function hydrateSubscriptionRadarExclusionsFromRemote(): Promise<boolean> {
  const remote = await pullBlob<SubscriptionRadarExclusion[]>(BLOB_KEY);
  if (!remote || !Array.isArray(remote)) return false;
  if (typeof window === "undefined") return false;
  try {
    const sanitized = sanitizeExclusions(remote);
    localStorage.setItem(scopedKey(STORAGE_KEY), JSON.stringify(sanitized));
    window.dispatchEvent(new Event(SUBSCRIPTIONS_RADAR_EXCLUSIONS_EVENT));
    return true;
  } catch {
    return false;
  }
}

export function isSubscriptionRadarExcluded(
  group: RecurringGroup,
  exclusions: SubscriptionRadarExclusion[]
): boolean {
  const signature = buildSubscriptionRadarSignature(group.description, group.amount);
  return exclusions.some((exclusion) => matchesExclusion(group, signature, exclusion));
}

export function excludeSubscriptionRadarGroup(
  group: RecurringGroup
): SubscriptionRadarExclusion[] {
  const current = loadSubscriptionRadarExclusions();
  const next = buildSubscriptionRadarSignature(group.description, group.amount);
  if (current.some((exclusion) => exclusion.signature === next.signature)) {
    return current;
  }
  return saveSubscriptionRadarExclusions([...current, next]);
}

export function unexcludeSubscriptionRadarGroup(signature: string): SubscriptionRadarExclusion[] {
  const current = loadSubscriptionRadarExclusions();
  return saveSubscriptionRadarExclusions(
    current.filter((exclusion) => exclusion.signature !== signature)
  );
}

function matchesExclusion(
  group: RecurringGroup,
  next: SubscriptionRadarExclusion,
  exclusion: SubscriptionRadarExclusion
): boolean {
  if (exclusion.signature === next.signature) return true;
  if (exclusion.normalizedDescription !== next.normalizedDescription) return false;
  return amountsClose(group.amount, exclusion.representativeAmount);
}

function amountsClose(amount: number, referenceAmount: number): boolean {
  const tolerance = Math.max(MIN_AMOUNT_TOLERANCE, referenceAmount * 0.02);
  return Math.abs(amount - referenceAmount) <= tolerance;
}

function bucketAmount(amount: number): number {
  return Math.round(amount / SIGNATURE_BUCKET_SIZE) * SIGNATURE_BUCKET_SIZE;
}

function roundAmount(amount: number): number {
  return Math.round(Number(amount) || 0);
}

function sanitizeExclusions(items: unknown[]): SubscriptionRadarExclusion[] {
  const out: SubscriptionRadarExclusion[] = [];
  for (const item of items) {
    const candidate = normalizeExclusion(item);
    if (!candidate) continue;
    if (out.some((existing) => existing.signature === candidate.signature)) continue;
    out.push(candidate);
  }
  out.sort((a, b) => b.addedAt.localeCompare(a.addedAt));
  return out;
}

function normalizeExclusion(item: unknown): SubscriptionRadarExclusion | null {
  if (!item || typeof item !== "object") return null;
  const raw = item as Partial<SubscriptionRadarExclusion> & Record<string, unknown>;
  const signature =
    typeof raw.signature === "string" && raw.signature.trim()
      ? raw.signature.trim()
      : "";
  const normalizedDescription =
    typeof raw.normalizedDescription === "string" && raw.normalizedDescription.trim()
      ? raw.normalizedDescription.trim()
      : signature.split("|")[0] || "";
  const representativeAmount = Number(raw.representativeAmount);
  const amountBucket = Number(raw.amountBucket);
  const label =
    typeof raw.label === "string" && raw.label.trim()
      ? raw.label.trim()
      : normalizedDescription;
  const addedAt =
    typeof raw.addedAt === "string" && raw.addedAt.trim()
      ? raw.addedAt.trim()
      : new Date().toISOString();

  if (!signature || !normalizedDescription || !Number.isFinite(representativeAmount)) {
    return null;
  }

  return {
    signature,
    normalizedDescription,
    representativeAmount: Math.round(representativeAmount),
    amountBucket: Number.isFinite(amountBucket)
      ? Math.round(amountBucket)
      : bucketAmount(Math.round(representativeAmount)),
    label,
    addedAt,
  };
}
