interface PageHeaderProps {
  /** English subtitle, e.g. "Wealth Map · הון עצמי מתגלגל" */
  subtitle: string;
  /** Hebrew main title */
  title: string;
  /** Description line under title */
  description?: string;
}

/**
 * Page header — REMOVED visually 2026-04-28 per Nir:
 * "תוריד את כל החלק הזה. תמשוך את הכל למעלה בעמוד תנצל את כל העמוד."
 *
 * Returns null so every page that imports PageHeader loses the title block
 * automatically. Page-name remains in the sidebar (active highlight) and
 * in the browser tab — that's enough orientation.
 *
 * Props kept on the signature so callers don't break.
 */
export function PageHeader({ subtitle, title, description }: PageHeaderProps) {
  void subtitle; void title; void description;
  return null;
}
