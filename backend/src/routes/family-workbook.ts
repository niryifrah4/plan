import { Router } from "express";
import * as XLSX from "xlsx";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { requireUser } from "../middleware/auth.js";
import { asyncHandler } from "../lib/async-handler.js";
import { fillTemplate } from "../../../lib/family-workbook-export.js";

const rowSchema = z.object({
  id: z.string(),
  label: z.string(),
  value: z.string(),
  cells: z.array(z.string()).optional(),
  note: z.string().optional(),
  calculated: z.boolean().optional(),
});
const bodySchema = z.object({
  familyName: z.string().trim().max(120).default("לקוח"),
  data: z.record(z.array(rowSchema)),
});

export const familyWorkbookRouter = Router();
familyWorkbookRouter.use(requireUser);

familyWorkbookRouter.post("/export", asyncHandler(async (req, res) => {
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: "invalid_workbook" });
    return;
  }
  const candidates = [
    path.resolve(process.cwd(), "frontend/public/family-workbook-template.xlsx"),
    path.resolve(process.cwd(), "../frontend/public/family-workbook-template.xlsx"),
  ];
  let templatePath: string | undefined;
  for (const candidate of candidates) {
    try { await fs.access(candidate); templatePath = candidate; break; } catch { /* try next */ }
  }
  if (!templatePath) {
    res.status(500).json({ ok: false, error: "template_missing" });
    return;
  }
  const book = fillTemplate(XLSX.read(await fs.readFile(templatePath), { type: "buffer", cellStyles: true }), parsed.data.data);
  const spouse1 = parsed.data.data.questionnaire?.find((row) => row.label === "שם בן/בת זוג 1")?.value;
  if (spouse1) {
    const cell = book.Sheets["שאלון"]["C6"] || {};
    book.Sheets["שאלון"]["C6"] = { ...cell, t: "s", v: spouse1 };
  }
  const buffer = XLSX.write(book, { type: "buffer", bookType: "xlsx", cellStyles: true }) as Buffer;
  const safeName = parsed.data.familyName.replace(/[\\/:*?"<>|]/g, "_") || "לקוח";
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(`חוברת-משפחה-${safeName}.xlsx`)}`);
  res.send(buffer);
}));
