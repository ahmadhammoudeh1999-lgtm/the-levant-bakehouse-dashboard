import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const todosTable = pgTable("bakery_todos", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  assignedTo: text("assigned_to"),
  status: text("status").notNull().default("open"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Todo = typeof todosTable.$inferSelect;
export type InsertTodo = typeof todosTable.$inferInsert;
