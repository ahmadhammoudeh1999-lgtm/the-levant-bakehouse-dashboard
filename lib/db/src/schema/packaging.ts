import { pgTable, serial, text, integer, numeric, date, timestamp } from "drizzle-orm/pg-core";

// Packaging restocks — each row is one bulk purchase of regular or marketing
// packaging units. `amountSpent` is what the user actually paid (price varies
// by quantity). When non-null, an expense row is also created in
// `bakery_expenses` (category = 'Packaging') so the cost flows through to the
// existing accounting reports. The id of that expense row is stored in
// `expenseId` so we can clean it up if the restock is deleted.
export const packagingRestocksTable = pgTable("bakery_packaging_restocks", {
  id: serial("id").primaryKey(),
  date: date("date").notNull(),
  type: text("type").notNull(), // 'regular' | 'marketing'
  quantity: integer("quantity").notNull(),
  amountSpent: numeric("amount_spent", { precision: 10, scale: 2 }),
  notes: text("notes"),
  expenseId: integer("expense_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// One configurable critical threshold per packaging type.
export const packagingThresholdsTable = pgTable("bakery_packaging_thresholds", {
  type: text("type").primaryKey(), // 'regular' | 'marketing'
  threshold: integer("threshold").notNull(),
});

export type PackagingRestock = typeof packagingRestocksTable.$inferSelect;
export type PackagingThreshold = typeof packagingThresholdsTable.$inferSelect;
