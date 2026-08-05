import { Link } from "react-router-dom";

export default function NotFoundPage() {
  return (
    <main
      id="main-content"
      dir="rtl"
      className="flex min-h-screen items-center justify-center bg-background px-4 py-12 text-foreground"
    >
      <section className="w-full max-w-lg rounded-3xl border border-border bg-card p-8 text-center shadow-card">
        <p className="text-sm font-bold text-primary" aria-hidden="true">
          404
        </p>
        <h1 className="mt-2 font-display text-3xl font-bold">העמוד לא נמצא</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          יכול להיות שהכתובת השתנתה, או שהקישור כבר לא פעיל.
        </p>
        <Link
          to="/dashboard"
          className="mt-7 inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-6 py-3 text-sm font-bold text-primary-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          חזרה לעמוד הראשי
        </Link>
      </section>
    </main>
  );
}
