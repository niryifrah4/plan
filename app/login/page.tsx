import { redirect } from "next/navigation";

// Login wall removed — פלאן is a personal local app.
// Preserving the route so old links redirect cleanly.
export default function LoginPage() {
  redirect("/dashboard");
}
