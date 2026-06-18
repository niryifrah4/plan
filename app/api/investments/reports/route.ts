/**
 * /api/investments/reports
 *
 * POST  — persist an analyzed broker report into `investment_reports`.
 * GET   — list a household's saved reports (most recent first).
 *
 * Client-scoped: the caller passes the active `householdId`; we verify
 * membership/ownership server-side (defense in depth beyond RLS) before any
 * write, matching the blob-sync route convention.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/supabase/require-user";
import { assertHouseholdAccess } from "@/lib/api/household-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HoldingSchema = z.object({
  securityNumber: z.string().default(""),
  name: z.string().default(""),
  symbol: z.string().default(""),
  assetKind: z.enum(["stock", "etf", "crypto", "bond", "fund", "cash"]).default("stock"),
  quantity: z.number().default(0),
  priceCurrent: z.number().default(0),
  valueIls: z.number().default(0),
  costIls: z.number().default(0),
  pctOfPortfolio: z.number().default(0),
});

const TransactionSchema = z.object({
  date: z.string().default(""),
  type: z.string().default(""),
  name: z.string().default(""),
  quantity: z.number().default(0),
  amount: z.number().default(0),
});

const ReportSchema = z.object({
  broker: z.string().default("לא זוהה"),
  accountNumber: z.string().default(""),
  reportDate: z.string().default(""),
  currency: z.string().default("ILS"),
  totalValueIls: z.number().default(0),
  holdings: z.array(HoldingSchema).default([]),
  transactions: z.array(TransactionSchema).default([]),
  warnings: z.array(z.string()).optional(),
});

const BodySchema = z.object({
  householdId: z.string().uuid(),
  report: ReportSchema,
});

export async function POST(req: NextRequest) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const { user, sb } = auth;

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch (e) {
    const detail = e instanceof z.ZodError ? e.issues.map((i) => i.message).join(", ") : "invalid body";
    return NextResponse.json({ ok: false, error: "invalid_body", detail }, { status: 400 });
  }

  const { householdId, report } = body;
  const allowed = await assertHouseholdAccess(sb, user.id, householdId);
  if (!allowed) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  // Portfolio period identity = (household, broker, account, reportDate).
  // Uploading a statement for the exact same date will replace the snapshot.
  // Uploading a different date creates a new historical period.
  const broker = report.broker || "";
  const accountNumber = report.accountNumber || "";
  const reportDate = report.reportDate || null;

  console.info("[investments/reports] save request:", {
    broker,
    accountNumber,
    reportDate,
    totalValueIls: report.totalValueIls,
    holdingCount: report.holdings.length,
  });

  const { data: existing } = await sb
    .from("investment_reports")
    .select("id, report_date")
    .eq("household_id", householdId)
    .eq("broker", broker)
    .eq("account_number", accountNumber)
    .eq("report_date", reportDate || "1970-01-01")
    .maybeSingle();

  const row = {
    household_id: householdId,
    broker,
    account_number: accountNumber,
    report_date: reportDate,
    currency: report.currency,
    total_value_ils: report.totalValueIls,
    holdings: report.holdings,
    transactions: report.transactions,
    summary: {
      holdingCount: report.holdings.length,
      transactionCount: report.transactions.length,
    },
    created_by: user.id,
    created_at: new Date().toISOString(),
  };

  let data: { id: string } | null = null;
  let error = null as { message: string } | null;
  let replaced = !!existing;

  if (existing) {
    const result = await sb.from("investment_reports").update(row).eq("id", existing.id).select("id").single();
    data = result.data;
    error = result.error;
  } else {
    const result = await sb.from("investment_reports").insert(row).select("id").single();
    data = result.data;
    error = result.error;

    if (error && /duplicate key value/i.test(error.message)) {
      const retry = await sb
        .from("investment_reports")
        .update(row)
        .eq("household_id", householdId)
        .eq("broker", broker)
        .eq("account_number", accountNumber)
        .eq("report_date", reportDate || "1970-01-01")
        .select("id")
        .single();
      data = retry.data;
      error = retry.error;
      replaced = !retry.error;
    }
  }

  if (error || !data) {
    const detail = error?.message || "no_saved_row";
    console.error("[investments/reports] save failed:", detail);
    return NextResponse.json({ ok: false, error: "save_failed", detail }, { status: 500 });
  }

  // Check if there are any newer reports for this portfolio.
  // This helps the client decide if it should overwrite the active local portfolio.
  const { data: newer } = await sb
    .from("investment_reports")
    .select("id")
    .eq("household_id", householdId)
    .eq("broker", broker)
    .eq("account_number", accountNumber)
    .gt("report_date", reportDate || "1970-01-01")
    .limit(1)
    .maybeSingle();

  const isLatest = !newer;

  return NextResponse.json({ ok: true, id: data.id, replaced, isLatest });
}

export async function GET(req: NextRequest) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const { user, sb } = auth;

  const householdId = req.nextUrl.searchParams.get("householdId");
  if (!householdId) {
    return NextResponse.json({ ok: false, error: "missing_household" }, { status: 400 });
  }
  const allowed = await assertHouseholdAccess(sb, user.id, householdId);
  if (!allowed) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { data, error } = await sb
    .from("investment_reports")
    .select(
      "id, broker, account_number, report_date, currency, total_value_ils, holdings, transactions, summary, created_at"
    )
    .eq("household_id", householdId)
    .order("report_date", { ascending: false, nullsFirst: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ ok: false, error: "query_failed", detail: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, reports: data ?? [] });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const { user, sb } = auth;

  const householdId = req.nextUrl.searchParams.get("householdId");
  const reportId = req.nextUrl.searchParams.get("reportId");

  if (!householdId || !reportId) {
    return NextResponse.json({ ok: false, error: "missing_params" }, { status: 400 });
  }

  const allowed = await assertHouseholdAccess(sb, user.id, householdId);
  if (!allowed) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { error } = await sb
    .from("investment_reports")
    .delete()
    .eq("id", reportId)
    .eq("household_id", householdId);

  if (error) {
    console.error("[investments/reports] delete failed:", error.message);
    return NextResponse.json({ ok: false, error: "delete_failed", detail: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
