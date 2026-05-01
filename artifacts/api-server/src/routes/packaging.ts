import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { db } from "@workspace/db";
import {
  packagingRestocksTable,
  packagingThresholdsTable,
  expensesTable,
  opsEntriesTable,
  settingsVersionsTable,
} from "@workspace/db";
import { eq, desc, asc } from "drizzle-orm";
import { z } from "zod";

const router: IRouter = Router();

const TYPES = ["regular", "marketing"] as const;
type PackagingType = (typeof TYPES)[number];

const DEFAULT_THRESHOLD = 100;

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

function toDateString(d: Date | string): string {
  if (typeof d === "string") return d;
  return d.toISOString().slice(0, 10);
}

type SettingsVersionRow = typeof settingsVersionsTable.$inferSelect;

function pickEffectiveSettings(versionsAsc: SettingsVersionRow[], date: string): SettingsVersionRow {
  let active = versionsAsc[0]!;
  for (const v of versionsAsc) {
    const ed = typeof v.effectiveDate === "string" ? v.effectiveDate : toDateString(v.effectiveDate as unknown as Date);
    if (ed <= date) active = v;
    else break;
  }
  return active;
}

async function ensureThresholds(): Promise<Record<PackagingType, number>> {
  const rows = await db.select().from(packagingThresholdsTable);
  const map: Record<string, number> = {};
  for (const r of rows) map[r.type] = r.threshold;
  for (const t of TYPES) {
    if (map[t] == null) {
      await db.insert(packagingThresholdsTable).values({ type: t, threshold: DEFAULT_THRESHOLD }).onConflictDoNothing();
      map[t] = DEFAULT_THRESHOLD;
    }
  }
  return { regular: map["regular"]!, marketing: map["marketing"]! };
}

async function computeUsage(): Promise<Record<PackagingType, number>> {
  const versions = await db.select().from(settingsVersionsTable).orderBy(asc(settingsVersionsTable.effectiveDate), asc(settingsVersionsTable.id));
  if (versions.length === 0) return { regular: 0, marketing: 0 };
  const ops = await db.select().from(opsEntriesTable);
  let regular = 0;
  let marketing = 0;
  for (const o of ops) {
    if (o.kind !== "production" || o.batchUnits == null) continue;
    const dStr = typeof o.date === "string" ? o.date : toDateString(o.date as unknown as Date);
    const v = pickEffectiveSettings(versions, dStr);
    const isMarketing = (o.packType ?? "regular") === "marketing";
    const ppi = isMarketing ? v.marketingPacksPerInputUnit : v.packsPerInputUnit;
    const made = Math.round(Number(o.batchUnits) * ppi);
    if (isMarketing) marketing += made;
    else regular += made;
  }
  return { regular, marketing };
}

async function computeAdded(): Promise<Record<PackagingType, number>> {
  const rows = await db.select().from(packagingRestocksTable);
  const totals: Record<PackagingType, number> = { regular: 0, marketing: 0 };
  for (const r of rows) {
    if (r.type === "regular") totals.regular += r.quantity;
    else if (r.type === "marketing") totals.marketing += r.quantity;
  }
  return totals;
}

// ============ Summary ============
// GET /api/packaging — { regular: { added, used, remaining, threshold, isCritical }, marketing: {...} }
router.get("/packaging", asyncHandler(async (_req, res) => {
  const [thresholds, used, added] = await Promise.all([
    ensureThresholds(),
    computeUsage(),
    computeAdded(),
  ]);
  const summary = (t: PackagingType) => {
    const remaining = added[t] - used[t];
    return {
      added: added[t],
      used: used[t],
      remaining,
      threshold: thresholds[t],
      isCritical: remaining <= thresholds[t],
    };
  };
  res.json({ regular: summary("regular"), marketing: summary("marketing") });
}));

// ============ Restocks list / create / delete ============
router.get("/packaging/restocks", asyncHandler(async (_req, res) => {
  const rows = await db.select().from(packagingRestocksTable).orderBy(desc(packagingRestocksTable.date), desc(packagingRestocksTable.id));
  res.json(rows.map((r) => ({
    id: r.id,
    date: typeof r.date === "string" ? r.date : toDateString(r.date as unknown as Date),
    type: r.type,
    quantity: r.quantity,
    amountSpent: r.amountSpent != null ? Number(r.amountSpent) : null,
    notes: r.notes,
    expenseId: r.expenseId,
    createdAt: r.createdAt,
  })));
}));

const CreateRestockBody = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD"),
  type: z.enum(["regular", "marketing"]),
  quantity: z.number().int().positive(),
  amountSpent: z.number().nonnegative().nullable().optional(),
  notes: z.string().nullable().optional(),
});

router.post("/packaging/restocks", asyncHandler(async (req, res) => {
  const parsed = CreateRestockBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message ?? "invalid body" }); return; }
  const body = parsed.data;

  let expenseId: number | null = null;
  if (body.amountSpent != null && body.amountSpent > 0) {
    const [exp] = await db.insert(expensesTable).values({
      date: body.date,
      category: "Packaging",
      amount: String(body.amountSpent),
      note: `Packaging restock: ${body.quantity} ${body.type}${body.notes ? ` — ${body.notes}` : ""}`,
    }).returning();
    expenseId = exp?.id ?? null;
  }

  const [row] = await db.insert(packagingRestocksTable).values({
    date: body.date,
    type: body.type,
    quantity: body.quantity,
    amountSpent: body.amountSpent != null ? String(body.amountSpent) : null,
    notes: body.notes ?? null,
    expenseId,
  }).returning();

  res.status(201).json({
    id: row!.id,
    date: typeof row!.date === "string" ? row!.date : toDateString(row!.date as unknown as Date),
    type: row!.type,
    quantity: row!.quantity,
    amountSpent: row!.amountSpent != null ? Number(row!.amountSpent) : null,
    notes: row!.notes,
    expenseId: row!.expenseId,
    createdAt: row!.createdAt,
  });
}));

router.delete("/packaging/restocks/:id", asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "invalid id" }); return; }
  // Look up the restock first so we can clean up its linked expense row.
  const [existing] = await db.select().from(packagingRestocksTable).where(eq(packagingRestocksTable.id, id));
  if (!existing) { res.status(404).json({ error: "not found" }); return; }
  if (existing.expenseId != null) {
    await db.delete(expensesTable).where(eq(expensesTable.id, existing.expenseId));
  }
  await db.delete(packagingRestocksTable).where(eq(packagingRestocksTable.id, id));
  res.status(204).end();
}));

// ============ Thresholds ============
router.get("/packaging/thresholds", asyncHandler(async (_req, res) => {
  const t = await ensureThresholds();
  res.json(t);
}));

const UpdateThresholdsBody = z.object({
  regular: z.number().int().nonnegative().optional(),
  marketing: z.number().int().nonnegative().optional(),
});

router.put("/packaging/thresholds", asyncHandler(async (req, res) => {
  const parsed = UpdateThresholdsBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message ?? "invalid body" }); return; }
  await ensureThresholds(); // make sure rows exist
  const body = parsed.data;
  for (const t of TYPES) {
    const v = body[t];
    if (v != null) {
      await db.update(packagingThresholdsTable).set({ threshold: v }).where(eq(packagingThresholdsTable.type, t));
    }
  }
  const t = await ensureThresholds();
  res.json(t);
}));

export default router;
