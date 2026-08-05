/**
 * Stable, dependency-free app boot screen.
 *
 * Keep this markup in sync with the static fallback in index.html so the
 * first paint, auth restore, and client-data bootstrap look like one phase.
 */
export function AppBootScreen() {
  return (
    <div className="app-boot" role="status" aria-live="polite" aria-busy="true">
      <div className="app-boot__mark" aria-hidden="true">
        <img src="/plan-leaf-logo.png" alt="" />
      </div>
      <div className="app-boot__track" aria-hidden="true">
        <span />
      </div>
      <span className="sr-only">המערכת נטענת</span>
    </div>
  );
}
