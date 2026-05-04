/**
 * Recurring Transaction Detector
 * Scans 3-month transaction history, identifies identical amounts appearing
 * at the same date (±3 days) across multiple months.
 */

import type { ParsedTransaction } from "./types";

export interface RecurringGroup {
  description: string; // representative description
  amount: number; // consistent amount
  category: string;
  categoryLabel: string;
  frequency: "monthly" | "bi-monthly" | "quarterly";
  dayOfMonth: number; // average day (1–31)
  matchCount: number; // how many occurrences found
  occurrences: string[]; // dates of each occurrence
}

/**
 * Detect recurring transactions from a list of parsed transactions.
 * Algorithm:
 *   1. Group by (normalized description, amount within ±2% tolerance)
 *   2. For each group, check if dates span different months at similar day-of-month (±3 days)
 *   3. If ≥2 months match → mark as recurring
 */
export function detectRecurring(transactions: ParsedTransaction[]): RecurringGroup[] {
  if (transactions.length < 2) return [];

  // Only look at expenses (positive amounts)
  const expenses = transactions.filter((t) => t.amount > 0 && t.date);

  // Normalize description for grouping (trim numbers, lowercase, collapse spaces)
  const normalize = (d: string) =>
    d
      .toLowerCase()
      .replace(/[\u200F\u200E"]/g, "")
      .replace(/\d{4,}/g, "") // remove long numbers (phone, reference)
      .replace(/\s+/g, " ")
      .trim()
      .substring(0, 40); // cap length

  // Group by (normalizedDesc, amount ± 2%)
  interface GroupEntry {
    desc: string;
    origDesc: string;
    amount: number;
    day: number;
    month: string; // yyyy-mm
    date: string;
    category: string;
    categoryLabel: string;
  }

  const entries: GroupEntry[] = expenses.map((t) => {
    const [y, m, d] = t.date.split("-");
    return {
      desc: normalize(t.description),
      origDesc: t.description,
      amount: t.amount,
      day: parseInt(d) || 0,
      month: `${y}-${m}`,
      date: t.date,
      category: t.category,
      categoryLabel: t.categoryLabel,
    };
  });

  // Cluster: group entries with same normalized desc and similar amount
  const clusters = new Map<string, GroupEntry[]>();

  for (const entry of entries) {
    let placed = false;
    for (const [key, group] of clusters) {
      if (!key.startsWith(entry.desc)) continue;
      const refAmount = group[0].amount;
      const tolerance = refAmount * 0.02; // 2% tolerance
      if (Math.abs(entry.amount - refAmount) <= tolerance) {
        group.push(entry);
        placed = true;
        break;
      }
    }
    if (!placed) {
      const key = `${entry.desc}|${Math.round(entry.amount)}`;
      clusters.set(key, [entry]);
    }
  }

  // Analyze each cluster for recurring pattern
  const recurring: RecurringGroup[] = [];

  for (const [, group] of clusters) {
    if (group.length < 2) continue;

    // Check if entries span different months
    const months = new Set(group.map((g) => g.month));
    if (months.size < 2) continue;

    // Check day-of-month consistency (±3 days)
    const days = group.map((g) => g.day);
    const avgDay = Math.round(days.reduce((a, b) => a + b, 0) / days.length);
    const allClose = days.every((d) => Math.abs(d - avgDay) <= 3 || Math.abs(d - avgDay + 30) <= 3);
    if (!allClose) continue;

    // Determine frequency
    const sortedMonths = Array.from(months).sort();
    let frequency: "monthly" | "bi-monthly" | "quarterly" = "monthly";
    if (sortedMonths.length >= 2) {
      const gaps: number[] = [];
      for (let i = 1; i < sortedMonths.length; i++) {
        const [y1, m1] = sortedMonths[i - 1].split("-").map(Number);
        const [y2, m2] = sortedMonths[i].split("-").map(Number);
        gaps.push(y2 * 12 + m2 - (y1 * 12 + m1));
      }
      const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
      if (avgGap >= 2.5) frequency = "quarterly";
      else if (avgGap >= 1.5) frequency = "bi-monthly";
    }

    recurring.push({
      description: group[0].origDesc,
      amount: group[0].amount,
      category: group[0].category,
      categoryLabel: group[0].categoryLabel,
      frequency,
      dayOfMonth: avgDay,
      matchCount: group.length,
      occurrences: group.map((g) => g.date).sort(),
    });
  }

  // Sort by amount descending
  recurring.sort((a, b) => b.amount - a.amount);
  return recurring;
}

/**
 * Tag transactions as "recurring" in-place by matching against detected groups.
 */
export function tagRecurring(
  transactions: ParsedTransaction[],
  groups: RecurringGroup[]
): (ParsedTransaction & { isRecurring?: boolean })[] {
  const recurDates = new Set<string>();
  for (const g of groups) {
    for (const d of g.occurrences) recurDates.add(d + "|" + Math.round(g.amount));
  }

  return transactions.map((t) => ({
    ...t,
    isRecurring: recurDates.has(t.date + "|" + Math.round(t.amount)),
  }));
}
