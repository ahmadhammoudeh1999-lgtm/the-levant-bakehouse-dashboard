import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { db } from "@workspace/db";
import {
  settingsTable,
  settingsVersionsTable,
  storesTable,
  opsEntriesTable,
  cashEntriesTable,
  expensesTable,
  recipesTable,
  restocksTable,
  criticalLevelsTable,
  DEFAULT_RECIPE,
} from "@workspace/db";
import { and, eq, desc, asc } from "drizzle-orm";
import {
  CreateSettingsVersionBody,
  CreateStoreBody,
  UpdateStoreBody,
  UpdateStoreParams,
  DeleteStoreParams,
  CreateOpsBody,
  UpdateOpsBody,
  UpdateOpsParams,
  DeleteOpsParams,
  CreateCashBody,
  UpdateCashBody,
  UpdateCashParams,
  DeleteCashParams,
  CreateExpenseBody,
  DeleteExpenseParams,
  CreateRecipeBody,
  CreateRestockBody,
  DeleteRestockParams,
  ReplaceCriticalLevelsBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

type SettingsVersionRow = typeof settingsVersionsTable.$inferSelect;

async function listSettingsVersions(): Promise<SettingsVersionRow[]> {
  let rows = await db.select().from(settingsVersionsTable).orderBy(asc(settingsVersionsTable.effectiveDate), asc(settingsVersionsTable.id));
  if (rows.length === 0) {
    await db.insert(settingsVersionsTable).values({
      effectiveDate: "2000-01-01",
      pricePerPack: "1.00",
      loavesPerPack: 6,
      packsPerInputUnit: 5,
    });
    rows = await db.select().from(settingsVersionsTable).orderBy(asc(settingsVersionsTable.effectiveDate), asc(settingsVersionsTable.id));
  }
  return rows;
}

async function getLatestSettings(): Promise<SettingsVersionRow> {
  const rows = await listSettingsVersions();
  return rows[rows.length - 1]!;
}

function shapeSettings(row: SettingsVersionRow) {
  return {
    pricePerPack: Number(row.pricePerPack),
    loavesPerInputUnit: row.loavesPerPack * row.packsPerInputUnit,
    loavesPerPack: row.loavesPerPack,
    packsPerInputUnit: row.packsPerInputUnit,
    marketingLoavesPerPack: row.marketingLoavesPerPack,
    marketingPacksPerInputUnit: row.marketingPacksPerInputUnit,
    effectiveDate: typeof row.effectiveDate === "string" ? row.effectiveDate : toDateString(row.effectiveDate as unknown as Date),
  };
}

// Resolve the unit price for a delivery row. Prefers the snapshot stored on
// the row at creation time (so historical balances are immutable). Falls back
// to the version effective on its date for legacy rows that pre-date the
// snapshot column.
function deliveryUnitPrice(o: typeof opsEntriesTable.$inferSelect, versionsAsc: SettingsVersionRow[]): number {
  if (o.unitPrice != null) return Number(o.unitPrice);
  const dStr = typeof o.date === "string" ? o.date : toDateString(o.date as unknown as Date);
  return Number(pickEffectiveSettings(versionsAsc, dStr).pricePerPack);
}

function pickEffectiveSettings(versionsAsc: SettingsVersionRow[], date: string): SettingsVersionRow {
  let active = versionsAsc[0]!;
  for (const v of versionsAsc) {
    const ed = typeof v.effectiveDate === "string" ? v.effectiveDate : toDateString(v.effectiveDate as unknown as Date);
    if (ed <= date) active = v;
    else break;
  }
  return active;
}

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

function toDateString(d: Date | string): string {
  if (typeof d === "string") return d;
  return d.toISOString().slice(0, 10);
}

// ============ Settings ============
router.get("/settings", asyncHandler(async (req, res) => {
  const versions = await listSettingsVersions();
  const dateParam = typeof req.query.date === "string" ? req.query.date : toDateString(new Date());
  const row = pickEffectiveSettings(versions, dateParam);
  res.json(shapeSettings(row));
}));

router.get("/settings/versions", asyncHandler(async (_req, res) => {
  const versions = await listSettingsVersions();
  res.json(versions.map((v) => ({
    id: v.id,
    effectiveDate: typeof v.effectiveDate === "string" ? v.effectiveDate : toDateString(v.effectiveDate as unknown as Date),
    pricePerPack: Number(v.pricePerPack),
    loavesPerPack: v.loavesPerPack,
    packsPerInputUnit: v.packsPerInputUnit,
    marketingLoavesPerPack: v.marketingLoavesPerPack,
    marketingPacksPerInputUnit: v.marketingPacksPerInputUnit,
    createdAt: (v.createdAt instanceof Date ? v.createdAt : new Date(v.createdAt as unknown as string)).toISOString(),
  })));
}));

router.post("/settings", asyncHandler(async (req, res) => {
  const body = CreateSettingsVersionBody.parse(req.body);
  const [row] = await db.insert(settingsVersionsTable).values({
    effectiveDate: toDateString(body.effectiveDate),
    pricePerPack: body.pricePerPack.toFixed(2),
    loavesPerPack: body.loavesPerPack,
    packsPerInputUnit: body.packsPerInputUnit,
    marketingLoavesPerPack: body.marketingLoavesPerPack,
    marketingPacksPerInputUnit: body.marketingPacksPerInputUnit,
  }).returning();
  res.status(201).json(shapeSettings(row!));
}));

// ============ Recipes ============
function shapeRecipe(row: typeof recipesTable.$inferSelect) {
  return {
    id: row.id,
    effectiveDate: typeof row.effectiveDate === "string" ? row.effectiveDate : toDateString(row.effectiveDate as unknown as Date),
    ingredients: row.ingredients ?? [],
    notes: row.notes ?? null,
    createdAt: (row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt as unknown as string)).toISOString(),
  };
}

async function ensureRecipes() {
  const rows = await db.select().from(recipesTable).orderBy(desc(recipesTable.effectiveDate), desc(recipesTable.id));
  if (rows.length === 0) {
    const [seed] = await db.insert(recipesTable).values({
      effectiveDate: toDateString(new Date()),
      ingredients: DEFAULT_RECIPE,
    }).returning();
    return [seed!];
  }
  return rows;
}

router.get("/recipes", asyncHandler(async (_req, res) => {
  const rows = await ensureRecipes();
  res.json(rows.map(shapeRecipe));
}));

router.post("/recipes", asyncHandler(async (req, res) => {
  const body = CreateRecipeBody.parse(req.body);
  if (!body.ingredients.length) { res.status(400).json({ error: "ingredients must not be empty" }); return; }
  const [row] = await db.insert(recipesTable).values({
    effectiveDate: toDateString(body.effectiveDate),
    ingredients: body.ingredients,
    notes: body.notes ?? null,
  }).returning();
  res.status(201).json(shapeRecipe(row!));
}));

// ============ Restocks (Inventory Levels) ============
function shapeRestock(row: typeof restocksTable.$inferSelect) {
  return {
    id: row.id,
    date: typeof row.date === "string" ? row.date : toDateString(row.date as unknown as Date),
    items: row.items ?? [],
    notes: row.notes ?? null,
    createdAt: (row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt as unknown as string)).toISOString(),
  };
}

router.get("/restocks", asyncHandler(async (_req, res) => {
  const rows = await db.select().from(restocksTable).orderBy(desc(restocksTable.date), desc(restocksTable.id));
  res.json(rows.map(shapeRestock));
}));

router.post("/restocks", asyncHandler(async (req, res) => {
  const body = CreateRestockBody.parse(req.body);
  if (!body.items.length) { res.status(400).json({ error: "items must not be empty" }); return; }
  const [row] = await db.insert(restocksTable).values({
    date: toDateString(body.date),
    items: body.items,
    notes: body.notes ?? null,
  }).returning();
  res.status(201).json(shapeRestock(row!));
}));

router.delete("/restocks/:id", asyncHandler(async (req, res) => {
  const { id } = DeleteRestockParams.parse(req.params);
  await db.delete(restocksTable).where(eq(restocksTable.id, id));
  res.status(204).end();
}));

// ============ Critical levels ============
function shapeCriticalLevel(row: typeof criticalLevelsTable.$inferSelect) {
  return { name: row.name, thresholdKg: Number(row.thresholdKg) };
}

router.get("/critical-levels", asyncHandler(async (_req, res) => {
  const rows = await db.select().from(criticalLevelsTable).orderBy(asc(criticalLevelsTable.name));
  res.json(rows.map(shapeCriticalLevel));
}));

router.put("/critical-levels", asyncHandler(async (req, res) => {
  const body = ReplaceCriticalLevelsBody.parse(req.body);
  // Replace-all: easier UX since the form posts the full set every time.
  await db.delete(criticalLevelsTable);
  const cleaned = body.items
    .map((i) => ({ name: i.name.trim(), thresholdKg: i.thresholdKg }))
    .filter((i) => i.name.length > 0);
  if (cleaned.length) {
    await db.insert(criticalLevelsTable).values(
      cleaned.map((i) => ({ name: i.name, thresholdKg: String(i.thresholdKg) })),
    );
  }
  const rows = await db.select().from(criticalLevelsTable).orderBy(asc(criticalLevelsTable.name));
  res.json(rows.map(shapeCriticalLevel));
}));

// ============ Stores ============
function shapeStore(row: typeof storesTable.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    address: row.address,
    contact: row.contact,
    phone: row.phone,
    history: row.history,
  };
}

router.get("/stores", asyncHandler(async (_req, res) => {
  const rows = await db.select().from(storesTable).orderBy(storesTable.name);
  res.json(rows.map(shapeStore));
}));

router.post("/stores", asyncHandler(async (req, res) => {
  const body = CreateStoreBody.parse(req.body);
  const [row] = await db.insert(storesTable).values({
    name: body.name,
    address: body.address ?? null,
    contact: body.contact ?? null,
    phone: body.phone ?? null,
    history: body.history ?? null,
  }).returning();
  res.status(201).json(shapeStore(row!));
}));

router.patch("/stores/:id", asyncHandler(async (req, res) => {
  const { id } = UpdateStoreParams.parse(req.params);
  const body = UpdateStoreBody.parse(req.body);
  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) updates["name"] = body.name;
  if (body.address !== undefined) updates["address"] = body.address;
  if (body.contact !== undefined) updates["contact"] = body.contact;
  if (body.phone !== undefined) updates["phone"] = body.phone;
  if (body.history !== undefined) updates["history"] = body.history;
  if (Object.keys(updates).length === 0) {
    const [existing] = await db.select().from(storesTable).where(eq(storesTable.id, id)).limit(1);
    if (!existing) { res.status(404).json({ error: "Not found" }); return; }
    res.json(shapeStore(existing));
    return;
  }
  const [row] = await db.update(storesTable).set(updates).where(eq(storesTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(shapeStore(row));
}));

router.delete("/stores/:id", asyncHandler(async (req, res) => {
  const { id } = DeleteStoreParams.parse(req.params);
  await db.delete(storesTable).where(eq(storesTable.id, id));
  res.status(204).end();
}));

// ============ Ops ============
async function getStoreNameMap(): Promise<Map<number, string>> {
  const rows = await db.select().from(storesTable);
  const m = new Map<number, string>();
  for (const r of rows) m.set(r.id, r.name);
  return m;
}

function shapeOps(row: typeof opsEntriesTable.$inferSelect, storeMap: Map<number, string>) {
  return {
    id: row.id,
    date: row.date,
    kind: row.kind as "production" | "delivery",
    storeId: row.storeId,
    storeName: row.storeId != null ? storeMap.get(row.storeId) ?? null : null,
    batchUnits: row.batchUnits != null ? Number(row.batchUnits) : null,
    packType: (row.packType as "regular" | "marketing" | null) ?? null,
    createdAt: (row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt as unknown as string)).toISOString(),
    deliveredPacks: row.deliveredPacks,
    returnedPacks: row.returnedPacks,
    samples: row.samples,
    paid: row.paid != null ? Number(row.paid) : null,
    note: row.note,
  };
}

router.get("/ops", asyncHandler(async (_req, res) => {
  const rows = await db.select().from(opsEntriesTable).orderBy(desc(opsEntriesTable.date), desc(opsEntriesTable.id));
  const storeMap = await getStoreNameMap();
  res.json(rows.map(r => shapeOps(r, storeMap)));
}));

async function assertStoreExists(storeId: number) {
  const [s] = await db.select().from(storesTable).where(eq(storesTable.id, storeId)).limit(1);
  if (!s) {
    const err = new Error("Store not found") as Error & { status?: number };
    err.status = 400;
    throw err;
  }
}

router.post("/ops", asyncHandler(async (req, res) => {
  const body = CreateOpsBody.parse(req.body);
  if (body.kind === "delivery") {
    if (body.storeId == null) { res.status(400).json({ error: "storeId is required for delivery" }); return; }
    if (body.deliveredPacks == null || body.deliveredPacks < 0) { res.status(400).json({ error: "deliveredPacks must be >= 0" }); return; }
    if (body.returnedPacks != null && body.returnedPacks < 0) { res.status(400).json({ error: "returnedPacks must be >= 0" }); return; }
    if (body.samples != null && body.samples < 0) { res.status(400).json({ error: "samples must be >= 0" }); return; }
    if (body.paid != null && body.paid < 0) { res.status(400).json({ error: "paid must be >= 0" }); return; }
    await assertStoreExists(body.storeId);
  } else if (body.kind === "production") {
    if (body.batchUnits == null || body.batchUnits <= 0) { res.status(400).json({ error: "batchUnits must be > 0" }); return; }
  }
  const packType = body.kind === "production" ? (body.packType ?? "regular") : null;
  // Snapshot the unit price at delivery time so historical balances never
  // change if pricing is updated later. Locked at creation; PATCH never edits.
  let unitPriceSnapshot: string | null = null;
  if (body.kind === "delivery") {
    const versions = await listSettingsVersions();
    const v = pickEffectiveSettings(versions, toDateString(body.date));
    unitPriceSnapshot = Number(v.pricePerPack).toFixed(2);
  }
  const [row] = await db.insert(opsEntriesTable).values({
    date: toDateString(body.date),
    kind: body.kind,
    storeId: body.storeId ?? null,
    batchUnits: body.batchUnits != null ? String(body.batchUnits) : null,
    packType,
    deliveredPacks: body.deliveredPacks ?? null,
    returnedPacks: body.kind === "delivery" ? (body.returnedPacks ?? 0) : null,
    samples: body.samples ?? null,
    paid: body.paid != null ? Number(body.paid).toFixed(2) : null,
    unitPrice: unitPriceSnapshot,
    note: body.note ?? null,
  }).returning();
  const storeMap = await getStoreNameMap();
  res.status(201).json(shapeOps(row!, storeMap));
}));

router.patch("/ops/:id", asyncHandler(async (req, res) => {
  const { id } = UpdateOpsParams.parse(req.params);
  const body = UpdateOpsBody.parse(req.body);
  if (body.storeId != null) await assertStoreExists(body.storeId);
  const updates: Record<string, unknown> = {};
  if (body.date !== undefined) updates["date"] = toDateString(body.date);
  if (body.storeId !== undefined) updates["storeId"] = body.storeId;
  if (body.batchUnits !== undefined) updates["batchUnits"] = body.batchUnits != null ? String(body.batchUnits) : null;
  if (body.packType !== undefined) updates["packType"] = body.packType;
  if (body.deliveredPacks !== undefined) updates["deliveredPacks"] = body.deliveredPacks;
  if (body.returnedPacks !== undefined) updates["returnedPacks"] = body.returnedPacks;
  if (body.samples !== undefined) updates["samples"] = body.samples;
  if (body.paid !== undefined) updates["paid"] = body.paid != null ? Number(body.paid).toFixed(2) : null;
  if (body.note !== undefined) updates["note"] = body.note;
  if (Object.keys(updates).length === 0) {
    const [existing] = await db.select().from(opsEntriesTable).where(eq(opsEntriesTable.id, id)).limit(1);
    if (!existing) { res.status(404).json({ error: "Not found" }); return; }
    const sm = await getStoreNameMap();
    res.json(shapeOps(existing, sm));
    return;
  }
  const [row] = await db.update(opsEntriesTable).set(updates).where(eq(opsEntriesTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  const storeMap = await getStoreNameMap();
  res.json(shapeOps(row, storeMap));
}));

router.delete("/ops/:id", asyncHandler(async (req, res) => {
  const { id } = DeleteOpsParams.parse(req.params);
  await db.delete(opsEntriesTable).where(eq(opsEntriesTable.id, id));
  res.status(204).end();
}));

// ============ Cash ============
function shapeCash(row: typeof cashEntriesTable.$inferSelect, storeMap: Map<number, string>) {
  return {
    id: row.id,
    date: row.date,
    storeId: row.storeId,
    storeName: storeMap.get(row.storeId) ?? null,
    amount: Number(row.amount),
    note: row.note,
    createdAt: (row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt as unknown as string)).toISOString(),
  };
}

router.get("/cash", asyncHandler(async (_req, res) => {
  const rows = await db.select().from(cashEntriesTable).orderBy(desc(cashEntriesTable.date), desc(cashEntriesTable.id));
  const storeMap = await getStoreNameMap();
  res.json(rows.map(r => shapeCash(r, storeMap)));
}));

router.post("/cash", asyncHandler(async (req, res) => {
  const body = CreateCashBody.parse(req.body);
  if (body.amount < 0) { res.status(400).json({ error: "amount must be >= 0" }); return; }
  await assertStoreExists(body.storeId);
  const [row] = await db.insert(cashEntriesTable).values({
    date: toDateString(body.date),
    storeId: body.storeId,
    amount: Number(body.amount).toFixed(2),
    note: body.note ?? null,
  }).returning();
  const storeMap = await getStoreNameMap();
  res.status(201).json(shapeCash(row!, storeMap));
}));

router.patch("/cash/:id", asyncHandler(async (req, res) => {
  const { id } = UpdateCashParams.parse(req.params);
  const body = UpdateCashBody.parse(req.body);
  if (body.storeId != null) await assertStoreExists(body.storeId);
  if (body.amount != null && body.amount < 0) { res.status(400).json({ error: "amount must be >= 0" }); return; }
  const updates: Record<string, unknown> = {};
  if (body.date !== undefined) updates["date"] = toDateString(body.date);
  if (body.storeId !== undefined) updates["storeId"] = body.storeId;
  if (body.amount !== undefined) updates["amount"] = Number(body.amount).toFixed(2);
  if (body.note !== undefined) updates["note"] = body.note;
  const [row] = await db.update(cashEntriesTable).set(updates).where(eq(cashEntriesTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  const storeMap = await getStoreNameMap();
  res.json(shapeCash(row, storeMap));
}));

router.delete("/cash/:id", asyncHandler(async (req, res) => {
  const { id } = DeleteCashParams.parse(req.params);
  await db.delete(cashEntriesTable).where(eq(cashEntriesTable.id, id));
  res.status(204).end();
}));

// ============ Expenses ============
function shapeExpense(row: typeof expensesTable.$inferSelect) {
  return {
    id: row.id,
    date: row.date,
    category: row.category,
    amount: Number(row.amount),
    note: row.note,
    createdAt: (row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt as unknown as string)).toISOString(),
  };
}

router.get("/expenses", asyncHandler(async (_req, res) => {
  const rows = await db.select().from(expensesTable).orderBy(desc(expensesTable.date), desc(expensesTable.id));
  res.json(rows.map(shapeExpense));
}));

router.post("/expenses", asyncHandler(async (req, res) => {
  const body = CreateExpenseBody.parse(req.body);
  if (body.amount < 0) { res.status(400).json({ error: "amount must be >= 0" }); return; }
  const category = body.category.trim();
  if (!category) { res.status(400).json({ error: "category is required" }); return; }
  const [row] = await db.insert(expensesTable).values({
    date: toDateString(body.date),
    category,
    amount: Number(body.amount).toFixed(2),
    note: body.note ?? null,
  }).returning();
  res.status(201).json(shapeExpense(row!));
}));

router.delete("/expenses/:id", asyncHandler(async (req, res) => {
  const { id } = DeleteExpenseParams.parse(req.params);
  await db.delete(expensesTable).where(eq(expensesTable.id, id));
  res.status(204).end();
}));

// ============ Store History ============
router.get("/stores/:id/history", asyncHandler(async (req, res) => {
  const { id } = UpdateStoreParams.parse(req.params);

  const from = typeof req.query.from === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.query.from) ? req.query.from : null;
  const to = typeof req.query.to === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.query.to) ? req.query.to : null;
  if (from && to && from > to) { res.status(400).json({ error: "'from' must be on or before 'to'" }); return; }

  const [storeRow] = await db.select().from(storesTable).where(eq(storesTable.id, id)).limit(1);
  if (!storeRow) { res.status(404).json({ error: "Store not found" }); return; }

  const versions = await listSettingsVersions();
  const ops = await db.select().from(opsEntriesTable).where(and(eq(opsEntriesTable.storeId, id), eq(opsEntriesTable.kind, "delivery")));
  const cash = await db.select().from(cashEntriesTable).where(eq(cashEntriesTable.storeId, id));

  const opsDate = (o: typeof opsEntriesTable.$inferSelect) =>
    typeof o.date === "string" ? o.date : toDateString(o.date as unknown as Date);
  const cashDate = (c: typeof cashEntriesTable.$inferSelect) =>
    typeof c.date === "string" ? c.date : toDateString(c.date as unknown as Date);
  const inRange = (d: string) => (!from || d >= from) && (!to || d <= to);

  // Build per-delivery allocation. Cash Log payments are auto-applied to the
  // OLDEST delivery with remaining balance first, so each delivery row's
  // "Paid" reflects on-spot pay + any catch-up payments allocated to it.
  type Alloc = {
    o: typeof opsEntriesTable.$inferSelect;
    date: string;
    amount: number;        // net amount owed for this delivery
    paidOnSpot: number;
    allocatedLater: number; // from cash log
  };
  const allocs: Alloc[] = ops
    .map((o) => {
      const net = Math.max(0, (o.deliveredPacks ?? 0) - (o.returnedPacks ?? 0));
      return {
        o,
        date: opsDate(o),
        amount: net * deliveryUnitPrice(o, versions),
        paidOnSpot: o.paid != null ? Number(o.paid) : 0,
        allocatedLater: 0,
      };
    })
    .sort((a, b) => (a.date === b.date ? a.o.id - b.o.id : a.date.localeCompare(b.date)));

  const cashSorted = [...cash].sort((a, b) => {
    const ad = cashDate(a), bd = cashDate(b);
    return ad === bd ? a.id - b.id : ad.localeCompare(bd);
  });
  let cashRemainder = 0; // payments that couldn't be applied (overpayment / credit)
  for (const c of cashSorted) {
    let remaining = Number(c.amount);
    for (const a of allocs) {
      if (remaining <= 0) break;
      const owed = a.amount - a.paidOnSpot - a.allocatedLater;
      if (owed <= 0) continue;
      const apply = Math.min(owed, remaining);
      a.allocatedLater += apply;
      remaining -= apply;
    }
    cashRemainder += remaining;
  }

  // Cumulative current balance (all-time). Negative = store has credit.
  let revenueAll = 0, paidAll = 0;
  for (const a of allocs) { revenueAll += a.amount; paidAll += a.paidOnSpot + a.allocatedLater; }
  paidAll += cashRemainder; // unallocated overpayments still reduce balance
  const outstandingTotal = round2(revenueAll - paidAll);

  // Period-filtered summary (uses allocated paid amounts so it matches the table).
  let totalOrders = 0, packsDelivered = 0, samples = 0, revenue = 0, paidAtDelivery = 0, paidLater = 0;
  for (const a of allocs) {
    if (!inRange(a.date)) continue;
    totalOrders += 1;
    packsDelivered += a.o.deliveredPacks ?? 0;
    if (a.o.samples != null) samples += a.o.samples;
    revenue += a.amount;
    paidAtDelivery += a.paidOnSpot;
    paidLater += a.allocatedLater;
  }
  const collected = paidAtDelivery + paidLater;
  const outstandingInPeriod = round2(revenue - collected);

  // Build delivery-only transaction list (one row per visit), newest first.
  type Tx = {
    id: string;
    date: string;
    type: "delivery";
    packs: number | null;
    returned: number | null;
    samples: number | null;
    amount: number;
    paid: number;
    outstanding: number;
    balanceAfter: number;
    note: string | null;
    sortKey: number;
  };

  const txs: Tx[] = [];
  for (const a of allocs) {
    if (!inRange(a.date)) continue;
    const totalPaid = a.paidOnSpot + a.allocatedLater;
    txs.push({
      id: `ops-${a.o.id}`,
      date: a.date,
      type: "delivery",
      packs: a.o.deliveredPacks ?? null,
      returned: a.o.returnedPacks ?? null,
      samples: a.o.samples ?? null,
      amount: round2(a.amount),
      paid: round2(totalPaid),
      outstanding: round2(a.amount - totalPaid),
      balanceAfter: 0,
      note: a.o.note ?? null,
      sortKey: a.o.id,
    });
  }
  txs.sort((a, b) => (a.date === b.date ? b.sortKey - a.sortKey : b.date.localeCompare(a.date)));

  res.json({
    store: {
      id: storeRow.id,
      name: storeRow.name,
      address: storeRow.address ?? null,
      contact: storeRow.contact ?? null,
      phone: storeRow.phone ?? null,
      history: storeRow.history ?? null,
    },
    from,
    to,
    summary: {
      totalOrders,
      packsDelivered,
      samples,
      revenue: round2(revenue),
      paidAtDelivery: round2(paidAtDelivery),
      paidLater: round2(paidLater),
      collected: round2(collected),
      outstandingInPeriod,
      outstandingTotal,
    },
    transactions: txs.map(({ sortKey: _s, ...rest }) => rest),
  });
}));

// ============ Dashboard ============
router.get("/dashboard", asyncHandler(async (req, res) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.removeHeader("ETag");
  const from = typeof req.query.from === "string" && req.query.from ? req.query.from : null;
  const to = typeof req.query.to === "string" && req.query.to ? req.query.to : null;
  const inRange = (d: string) => (!from || d >= from) && (!to || d <= to);
  const versions = await listSettingsVersions();

  const ops = await db.select().from(opsEntriesTable);
  const cash = await db.select().from(cashEntriesTable);
  const stores = await db.select().from(storesTable).orderBy(storesTable.name);
  const recipes = await db.select().from(recipesTable).orderBy(asc(recipesTable.effectiveDate), asc(recipesTable.id));
  const restocks = await db.select().from(restocksTable);
  const expenses = await db.select().from(expensesTable);
  const critical = await db.select().from(criticalLevelsTable);
  const thresholdByName = new Map<string, number>(
    critical.map((c) => [c.name, Number(c.thresholdKg)]),
  );

  const recipeDate = (r: typeof recipesTable.$inferSelect) =>
    typeof r.effectiveDate === "string" ? r.effectiveDate : toDateString(r.effectiveDate as unknown as Date);
  const pickEffectiveRecipe = (date: string): typeof recipesTable.$inferSelect | null => {
    if (recipes.length === 0) return null;
    let active: typeof recipesTable.$inferSelect | null = null;
    for (const r of recipes) {
      if (recipeDate(r) <= date) active = r;
      else break;
    }
    return active ?? recipes[0]!;
  };

  const opsDate = (o: typeof opsEntriesTable.$inferSelect) =>
    typeof o.date === "string" ? o.date : toDateString(o.date as unknown as Date);
  const opsRevenue = (o: typeof opsEntriesTable.$inferSelect) => {
    if (o.deliveredPacks == null) return 0;
    const net = Math.max(0, o.deliveredPacks - (o.returnedPacks ?? 0));
    return net * deliveryUnitPrice(o, versions);
  };
  const opsPacksMade = (o: typeof opsEntriesTable.$inferSelect) => {
    if (o.batchUnits == null) return 0;
    const v = pickEffectiveSettings(versions, opsDate(o));
    const isMarketing = (o.packType ?? "regular") === "marketing";
    const ppi = isMarketing ? v.marketingPacksPerInputUnit : v.packsPerInputUnit;
    return Number(o.batchUnits) * ppi;
  };

  // Cumulative totals (always full history) — used for current stock levels.
  let packsMadeAll = 0, marketingPacksMadeAll = 0, packsDeliveredAll = 0, packsSamplesAll = 0;
  for (const o of ops) {
    const made = opsPacksMade(o);
    if ((o.packType ?? "regular") === "marketing") marketingPacksMadeAll += made;
    else packsMadeAll += made;
    if (o.deliveredPacks != null) packsDeliveredAll += o.deliveredPacks;
    if (o.samples != null) packsSamplesAll += o.samples;
  }
  const packsInStock = packsMadeAll - packsDeliveredAll;
  const marketingPacksInStock = marketingPacksMadeAll - packsSamplesAll;

  // Period-scoped totals — respect from/to filter.
  let packsMade = 0, marketingPacksMade = 0, packsDelivered = 0, regularPacksDelivered = 0, marketingPacksDelivered = 0, packsSamples = 0, paidAtDelivery = 0, revenue = 0;
  for (const o of ops) {
    if (!inRange(opsDate(o))) continue;
    const made = opsPacksMade(o);
    const isMarketing = (o.packType ?? "regular") === "marketing";
    if (isMarketing) marketingPacksMade += made;
    else packsMade += made;
    if (o.deliveredPacks != null) {
      packsDelivered += o.deliveredPacks;
      regularPacksDelivered += o.deliveredPacks;
    }
    if (o.samples != null) {
      packsSamples += o.samples;
      marketingPacksDelivered += o.samples;
    }
    if (o.paid != null) paidAtDelivery += Number(o.paid);
    revenue += opsRevenue(o);
  }
  let paidLater = 0;
  for (const c of cash) {
    const cd = typeof c.date === "string" ? c.date : toDateString(c.date as unknown as Date);
    if (!inRange(cd)) continue;
    paidLater += Number(c.amount);
  }

  const collected = paidAtDelivery + paidLater;
  const outstanding = revenue - collected;

  // Period-scoped money spent: expenses + restock costs.
  let expensesTotal = 0;
  for (const e of expenses) {
    const ed = typeof e.date === "string" ? e.date : toDateString(e.date as unknown as Date);
    if (!inRange(ed)) continue;
    expensesTotal += Number(e.amount);
  }
  let restockCostTotal = 0;
  for (const r of restocks) {
    const rd = typeof r.date === "string" ? r.date : toDateString(r.date as unknown as Date);
    if (!inRange(rd)) continue;
    const items = (r.items ?? []) as Array<{ price?: number | null }>;
    for (const it of items) restockCostTotal += Number(it.price ?? 0);
  }
  const moneySpent = expensesTotal + restockCostTotal;

  const byStore = stores.map(s => {
    let delivered = 0, samples = 0, paidD = 0, paidL = 0, rev = 0;
    for (const o of ops) {
      if (o.storeId !== s.id) continue;
      if (!inRange(opsDate(o))) continue;
      if (o.deliveredPacks != null) delivered += o.deliveredPacks;
      if (o.samples != null) samples += o.samples;
      if (o.paid != null) paidD += Number(o.paid);
      rev += opsRevenue(o);
    }
    for (const c of cash) {
      if (c.storeId !== s.id) continue;
      const cd = typeof c.date === "string" ? c.date : toDateString(c.date as unknown as Date);
      if (!inRange(cd)) continue;
      paidL += Number(c.amount);
    }
    const col = paidD + paidL;
    return {
      storeId: s.id,
      storeName: s.name,
      packsDelivered: delivered,
      samples,
      revenue: round2(rev),
      collected: round2(col),
      outstanding: round2(rev - col),
    };
  });

  // Inventory levels: total restocked per ingredient minus total used by productions.
  const restockedByName = new Map<string, number>();
  for (const r of restocks) {
    const items = (r.items ?? []) as Array<{ name: string; qtyKg: number }>;
    for (const it of items) {
      const key = it.name.trim();
      if (!key) continue;
      restockedByName.set(key, (restockedByName.get(key) ?? 0) + Number(it.qtyKg));
    }
  }
  const usedByName = new Map<string, number>();
  for (const o of ops) {
    if (o.kind !== "production" || o.batchUnits == null) continue;
    const date = opsDate(o);
    const recipe = pickEffectiveRecipe(date);
    if (!recipe) continue;
    const inputUnits = Number(o.batchUnits);
    for (const ing of recipe.ingredients) {
      const key = ing.name.trim();
      if (!key) continue;
      usedByName.set(key, (usedByName.get(key) ?? 0) + inputUnits * Number(ing.qtyKg));
    }
  }
  const inventoryNames = Array.from(new Set([...restockedByName.keys(), ...usedByName.keys()])).sort();
  const round3 = (n: number) => Math.round(n * 1000) / 1000;
  const inventoryLevels = inventoryNames.map((name) => {
    const restocked = round3(restockedByName.get(name) ?? 0);
    const used = round3(usedByName.get(name) ?? 0);
    const threshold = thresholdByName.has(name) ? thresholdByName.get(name)! : null;
    return { name, restocked, used, current: round3(restocked - used), threshold };
  });

  res.json({
    packsMade: Math.round(packsMade),
    packsDelivered,
    regularPacksDelivered,
    marketingPacksDelivered,
    packsSamples,
    packsInStock: Math.round(packsInStock),
    marketingPacksMade: Math.round(marketingPacksMade),
    marketingPacksInStock: Math.round(marketingPacksInStock),
    revenue: round2(revenue),
    collected: round2(collected),
    outstanding: round2(outstanding),
    moneySpent: round2(moneySpent),
    byStore,
    inventoryLevels,
  });
}));

function round2(n: number) { return Math.round(n * 100) / 100; }

// ============ Analytics ============
router.get("/analytics", asyncHandler(async (_req, res) => {
  const versions = await listSettingsVersions();
  const ops = await db.select().from(opsEntriesTable);
  const cash = await db.select().from(cashEntriesTable);
  const expenses = await db.select().from(expensesTable);
  const restocks = await db.select().from(restocksTable);
  const stores = await db.select().from(storesTable).orderBy(storesTable.name);

  const dStr = (d: unknown) => typeof d === "string" ? d : toDateString(d as Date);
  const monthOf = (d: string) => d.slice(0, 7);

  type MonthBucket = {
    revenue: number; collected: number; expenses: number; restockCost: number;
    packsDelivered: number; deliveriesCount: number; newStores: number;
  };
  const months = new Map<string, MonthBucket>();
  const ensure = (m: string): MonthBucket => {
    let b = months.get(m);
    if (!b) {
      b = { revenue: 0, collected: 0, expenses: 0, restockCost: 0, packsDelivered: 0, deliveriesCount: 0, newStores: 0 };
      months.set(m, b);
    }
    return b;
  };

  // Revenue + delivery stats from ops
  const revenuePerStore = new Map<number, { revenue: number; packs: number; name: string }>();
  for (const s of stores) revenuePerStore.set(s.id, { revenue: 0, packs: 0, name: s.name });

  for (const o of ops) {
    const date = dStr(o.date);
    const m = monthOf(date);
    const b = ensure(m);
    if (o.kind === "delivery" && o.deliveredPacks != null) {
      const net = Math.max(0, o.deliveredPacks - (o.returnedPacks ?? 0));
      const rev = net * deliveryUnitPrice(o, versions);
      b.revenue += rev;
      b.packsDelivered += o.deliveredPacks;
      b.deliveriesCount += 1;
      if (o.paid != null) b.collected += Number(o.paid);
      if (o.storeId != null) {
        const r = revenuePerStore.get(o.storeId);
        if (r) { r.revenue += rev; r.packs += o.deliveredPacks; }
      }
    }
  }

  // Later cash payments
  const collectedPerStore = new Map<number, number>();
  for (const c of cash) {
    const date = dStr(c.date);
    const b = ensure(monthOf(date));
    b.collected += Number(c.amount);
    collectedPerStore.set(c.storeId, (collectedPerStore.get(c.storeId) ?? 0) + Number(c.amount));
  }

  // Expenses
  const expByCat = new Map<string, number>();
  for (const e of expenses) {
    const date = dStr(e.date);
    ensure(monthOf(date)).expenses += Number(e.amount);
    const cat = (e.category ?? "Uncategorized").trim() || "Uncategorized";
    expByCat.set(cat, (expByCat.get(cat) ?? 0) + Number(e.amount));
  }

  // Restock costs
  for (const r of restocks) {
    const date = dStr(r.date);
    const items = (r.items ?? []) as Array<{ name: string; qtyKg: number; price?: number | null }>;
    let cost = 0;
    for (const it of items) cost += Number(it.price ?? 0);
    ensure(monthOf(date)).restockCost += cost;
  }

  // New stores per month — first-activity heuristic (delivery/payment dated month)
  const firstSeen = new Map<number, string>();
  for (const o of ops) {
    if (o.storeId == null) continue;
    const d = dStr(o.date);
    const cur = firstSeen.get(o.storeId);
    if (!cur || d < cur) firstSeen.set(o.storeId, d);
  }
  for (const c of cash) {
    const d = dStr(c.date);
    const cur = firstSeen.get(c.storeId);
    if (!cur || d < cur) firstSeen.set(c.storeId, d);
  }
  for (const [, d] of firstSeen) ensure(monthOf(d)).newStores += 1;

  const monthly = Array.from(months.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, b]) => ({
      month,
      revenue: round2(b.revenue),
      collected: round2(b.collected),
      expenses: round2(b.expenses),
      restockCost: round2(b.restockCost),
      netCash: round2(b.collected - b.expenses - b.restockCost),
      packsDelivered: b.packsDelivered,
      deliveriesCount: b.deliveriesCount,
      newStores: b.newStores,
    }));

  const expensesByCategory = Array.from(expByCat.entries())
    .map(([category, amount]) => ({ category, amount: round2(amount) }))
    .sort((a, b) => b.amount - a.amount);

  const topStoresByRevenue = Array.from(revenuePerStore.entries())
    .map(([storeId, r]) => ({ storeId, storeName: r.name, revenue: round2(r.revenue), packsDelivered: r.packs }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  // Outstanding by store (revenue - collected at delivery - cash later)
  const outstandingByStore: Array<{ storeId: number; storeName: string; outstanding: number }> = [];
  for (const s of stores) {
    let rev = 0, paidD = 0;
    for (const o of ops) {
      if (o.storeId !== s.id || o.kind !== "delivery" || o.deliveredPacks == null) continue;
      const net = Math.max(0, o.deliveredPacks - (o.returnedPacks ?? 0));
      rev += net * deliveryUnitPrice(o, versions);
      if (o.paid != null) paidD += Number(o.paid);
    }
    const paidL = collectedPerStore.get(s.id) ?? 0;
    const outstanding = round2(rev - paidD - paidL);
    if (outstanding > 0) outstandingByStore.push({ storeId: s.id, storeName: s.name, outstanding });
  }
  outstandingByStore.sort((a, b) => b.outstanding - a.outstanding);

  // KPIs
  const totalStores = stores.length;
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 30);
  const cutoffStr = toDateString(cutoff);
  const validStoreIds = new Set(stores.map((s) => s.id));
  const activeStoreIds = new Set<number>();
  for (const o of ops) {
    if (o.kind === "delivery" && o.storeId != null && validStoreIds.has(o.storeId) && dStr(o.date) >= cutoffStr) {
      activeStoreIds.add(o.storeId);
    }
  }
  const totalRevenue = monthly.reduce((s, m) => s + m.revenue, 0);
  const totalDeliveries = monthly.reduce((s, m) => s + m.deliveriesCount, 0);
  const totalPacks = monthly.reduce((s, m) => s + m.packsDelivered, 0);
  const totalExpenses = monthly.reduce((s, m) => s + m.expenses + m.restockCost, 0);
  const grossMargin = totalRevenue > 0 ? round2((totalRevenue - totalExpenses) / totalRevenue) : null;

  res.json({
    monthly,
    expensesByCategory,
    topStoresByRevenue,
    outstandingByStore,
    kpis: {
      totalStores,
      activeStoresLast30Days: activeStoreIds.size,
      avgRevenuePerStore: totalStores > 0 ? round2(totalRevenue / totalStores) : 0,
      avgPacksPerDelivery: totalDeliveries > 0 ? round2(totalPacks / totalDeliveries) : 0,
      grossMargin,
    },
  });
}));

// Error handler
router.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (err && typeof err === "object" && "issues" in err) {
    res.status(400).json({ error: "Validation failed", details: (err as { issues: unknown }).issues });
    return;
  }
  if (err && typeof err === "object" && "status" in err && typeof (err as { status?: number }).status === "number") {
    const e = err as { status: number; message?: string };
    res.status(e.status).json({ error: e.message ?? "Bad request" });
    return;
  }
  next(err);
});

export default router;
