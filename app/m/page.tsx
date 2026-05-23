import { redirect } from "next/navigation";

/**
 * /m is just an alias — the mobile experience IS the cashflow tool.
 * No separate "home page" anymore (per Nir 2026-05-23: ה"דף הבית" מיותר,
 * /m/budget הוא העמוד האמיתי).
 */
export default function MobileRoot() {
  redirect("/m/budget");
}
