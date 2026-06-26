import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Leaf, Loader2 } from "lucide-react";
import { getSupabase, isSupabaseConfigured } from "~/lib/supabase";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Card } from "~/components/ui/card";

type Mode = "login" | "signup";

const schema = z.object({
  email: z.string().email("אימייל לא תקין"),
  password: z.string().min(1, "יש להזין סיסמה"),
  fullName: z.string().optional(),
  phone: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

/**
 * Login — Lovable idiom: react-hook-form + zod validation, shadcn primitives,
 * sonner for error toasts. Token-based auth: signInWithPassword sets the
 * session in localStorage, then we navigate to the redirect target.
 */
export function LoginPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const redirect = params.get("redirect") || "/dashboard";
  const inviteToken = params.get("invite");
  const isDemoMode = !isSupabaseConfigured();

  const [mode, setMode] = useState<Mode>("login");
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = async (values: FormValues) => {
    const sb = getSupabase();
    if (isDemoMode || !sb) {
      navigate("/dashboard");
      return;
    }
    try {
      if (mode === "login") {
        const { error } = await sb.auth.signInWithPassword({
          email: values.email,
          password: values.password,
        });
        if (error) throw error;
      } else {
        const { error } = await sb.auth.signUp({
          email: values.email,
          password: values.password,
          options: {
            data: {
              full_name: values.fullName,
              phone: values.phone,
              ...(inviteToken ? { invite_token: inviteToken } : {}),
            },
          },
        });
        if (error) throw error;
      }
      // Instead of blindly navigating to redirect, call resolve-landing to handle advisor logic
      try {
        const res = await fetch("/api/auth/resolve-landing");
        if (res.ok) {
          const { target } = await res.json();
          navigate(target || redirect);
          return;
        }
      } catch (err) {
        // fallback
      }
      navigate(redirect);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "שגיאה בהתחברות");
    }
  };

  const handleGoogleLogin = async () => {
    const sb = getSupabase();
    if (!sb) return navigate("/dashboard");
    await sb.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}${redirect}`,
        ...(inviteToken ? { data: { invite_token: inviteToken } } : {}),
      },
    });
  };

  return (
    <div
      dir="rtl"
      className="flex min-h-screen items-center justify-center px-4 py-10"
      style={{ background: "linear-gradient(135deg, #F4F5F0 0%, #F0F8E3 60%, #E8F4D1 100%)" }}
    >
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl border border-secondary bg-card shadow-card">
            <Leaf className="size-7 text-primary" />
          </div>
          <div className="text-[32px] font-bold lowercase leading-none tracking-tight text-foreground font-display">
            plan
          </div>
          <div className="mt-1 text-[13px] font-medium text-muted-foreground">
            מערכת לתכנון פיננסי
          </div>
        </div>

        <Card className="p-8">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-foreground font-display">
              {mode === "login" ? "היי, שמחים לראות אותך" : "ברוכים הבאים"}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {mode === "login" ? "התחברו כדי להמשיך לתכנון הפיננסי שלכם" : "צרו חשבון והתחילו לתכנן"}
            </p>
          </div>

          {isDemoMode && (
            <div className="mt-5 rounded-md bg-secondary px-3 py-2 text-center text-xs font-medium text-secondary-foreground">
              מצב דמו — ללא חיבור לשרת
            </div>
          )}

          <div className="mt-6 flex gap-1 rounded-xl border border-border bg-muted p-1">
            {(["login", "signup"] as Mode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={
                  "flex-1 rounded-lg py-2 text-[13px] font-semibold transition-all " +
                  (mode === m
                    ? "bg-card text-primary shadow-sm"
                    : "text-muted-foreground")
                }
              >
                {m === "login" ? "התחברות" : "הרשמה"}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="mt-5 space-y-4">
            {mode === "signup" && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="fullName">שם מלא</Label>
                  <Input id="fullName" placeholder="ישראל ישראלי" {...register("fullName")} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="phone">טלפון</Label>
                  <Input id="phone" type="tel" dir="ltr" placeholder="050-1234567" {...register("phone")} />
                </div>
              </>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="email">אימייל</Label>
              <Input id="email" type="email" dir="ltr" placeholder="mail@example.com" autoFocus {...register("email")} />
              {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password">סיסמה</Label>
              <Input id="password" type="password" dir="ltr" placeholder="••••••••" {...register("password")} />
              {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
            </div>

            <Button type="submit" disabled={isSubmitting} className="h-12 w-full text-base">
              {isSubmitting && <Loader2 className="animate-spin" />}
              {isDemoMode ? "כניסה למצב דמו" : mode === "login" ? "כניסה" : "הרשמה"}
            </Button>
          </form>

          {!isDemoMode && (
            <>
              <div className="mt-7 flex items-center gap-3">
                <div className="h-px flex-1 bg-border" />
                <span className="text-[11px] font-medium text-muted-foreground">או</span>
                <div className="h-px flex-1 bg-border" />
              </div>
              <Button type="button" variant="outline" onClick={handleGoogleLogin} className="mt-4 h-11 w-full">
                <svg width="18" height="18" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                המשך עם Google
              </Button>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
