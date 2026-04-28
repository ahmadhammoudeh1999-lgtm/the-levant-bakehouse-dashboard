import { pgTable, serial, text, integer, numeric, date, jsonb, timestamp } from "drizzle-orm/pg-core";

export type RecipeIngredient = { name: string; qtyKg: number };

export const DEFAULT_RECIPE: RecipeIngredient[] = [
  { name: "Wholewheat", qtyKg: 0.8 },
  { name: "Oats", qtyKg: 0.2 },
  { name: "Yogurt", qtyKg: 0.14 },
  { name: "Blackseeds", qtyKg: 0.02 },
  { name: "Flaxseeds", qtyKg: 0.02 },
  { name: "Olive oil", qtyKg: 0.002 },
  { name: "Xanthan gum", qtyKg: 0.002 },
  { name: "Lecithin", qtyKg: 0.002 },
  { name: "Salt", qtyKg: 0.007 },
];

export const settingsTable = pgTable("bakery_settings", {
  id: serial("id").primaryKey(),
  pricePerPack: numeric("price_per_pack", { precision: 10, scale: 2 }).notNull().default("1.00"),
  recipe: jsonb("recipe").$type<RecipeIngredient[]>().notNull().default(DEFAULT_RECIPE),
  loavesPerPack: integer("loaves_per_pack").notNull().default(6),
  packsPerInputUnit: integer("packs_per_input_unit").notNull().default(5),
});

export const settingsVersionsTable = pgTable("bakery_settings_versions", {
  id: serial("id").primaryKey(),
  effectiveDate: date("effective_date").notNull(),
  pricePerPack: numeric("price_per_pack", { precision: 10, scale: 2 }).notNull(),
  loavesPerPack: integer("loaves_per_pack").notNull(),
  packsPerInputUnit: integer("packs_per_input_unit").notNull(),
  marketingLoavesPerPack: integer("marketing_loaves_per_pack").notNull().default(2),
  marketingPacksPerInputUnit: integer("marketing_packs_per_input_unit").notNull().default(15),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const recipesTable = pgTable("bakery_recipes", {
  id: serial("id").primaryKey(),
  effectiveDate: date("effective_date").notNull(),
  ingredients: jsonb("ingredients").$type<RecipeIngredient[]>().notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type RestockItem = { name: string; qtyKg: number };

export const criticalLevelsTable = pgTable("bakery_critical_levels", {
  name: text("name").primaryKey(),
  thresholdKg: numeric("threshold_kg", { precision: 10, scale: 3 }).notNull(),
});

export const restocksTable = pgTable("bakery_restocks", {
  id: serial("id").primaryKey(),
  date: date("date").notNull(),
  items: jsonb("items").$type<RestockItem[]>().notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const storesTable = pgTable("bakery_stores", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  address: text("address"),
  contact: text("contact"),
  phone: text("phone"),
  history: text("history"),
});

export const opsEntriesTable = pgTable("bakery_ops", {
  id: serial("id").primaryKey(),
  date: date("date").notNull(),
  kind: text("kind").notNull(), // 'production' | 'delivery'
  storeId: integer("store_id"),
  batchUnits: numeric("batch_units", { precision: 10, scale: 2 }),
  packType: text("pack_type"), // 'regular' | 'marketing' (only for production)
  deliveredPacks: integer("delivered_packs"),
  returnedPacks: integer("returned_packs"),
  samples: integer("samples"),
  paid: numeric("paid", { precision: 10, scale: 2 }),
  unitPrice: numeric("unit_price", { precision: 10, scale: 2 }),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const cashEntriesTable = pgTable("bakery_cash", {
  id: serial("id").primaryKey(),
  date: date("date").notNull(),
  storeId: integer("store_id").notNull(),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const expensesTable = pgTable("bakery_expenses", {
  id: serial("id").primaryKey(),
  date: date("date").notNull(),
  category: text("category").notNull(),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Settings = typeof settingsTable.$inferSelect;
export type Store = typeof storesTable.$inferSelect;
export type OpsEntry = typeof opsEntriesTable.$inferSelect;
export type CashEntry = typeof cashEntriesTable.$inferSelect;
export type Restock = typeof restocksTable.$inferSelect;
export type CriticalLevel = typeof criticalLevelsTable.$inferSelect;
export type Expense = typeof expensesTable.$inferSelect;
