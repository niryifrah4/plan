interface PageHeaderProps {
  /** English subtitle, e.g. "Wealth Map · הון עצמי מתגלגל" */
  subtitle: string;
  /** Hebrew main title */
  title: string;
  /** Description line under title */
  description?: string;
}

/**
 * Page header — matches the original HTML pattern exactly:
 *   text-[10px] subtitle · text-3xl title · text-xs description · border-b separator
 */
export function PageHeader({ subtitle, title, description }: PageHeaderProps) {
  return (
    <header className="mb-6 pb-5 border-b v-divider">
      <div className="text-[10px] uppercase tracking-[0.25em] text-verdant-muted font-bold mb-2">
        {subtitle}
      </div>
      <h1 className="text-3xl md:text-4xl font-extrabold text-verdant-ink tracking-tight leading-tight">
        {title}
      </h1>
      {description && (
        <p className="text-xs md:text-sm text-verdant-muted mt-2">{description}</p>
      )}
    </header>
  );
}
