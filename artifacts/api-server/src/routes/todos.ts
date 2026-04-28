import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { db, todosTable } from "@workspace/db";
import { eq, desc, sql } from "drizzle-orm";
import { z } from "zod";

const router: IRouter = Router();

const ALLOWED_STATUSES = ["open", "in_progress", "done"] as const;

const createTodoSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(500),
  description: z.string().trim().max(5000).optional().nullable(),
  assignedTo: z.string().trim().max(200).optional().nullable(),
  status: z.enum(ALLOWED_STATUSES).optional(),
});

const updateTodoSchema = z.object({
  title: z.string().trim().min(1).max(500).optional(),
  description: z.string().trim().max(5000).optional().nullable(),
  assignedTo: z.string().trim().max(200).optional().nullable(),
  status: z.enum(ALLOWED_STATUSES).optional(),
});

const idParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

function badRequest(res: Response, error: z.ZodError) {
  res.status(400).json({ error: "ValidationError", details: error.flatten() });
}

router.get("/todos", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const todos = await db.select().from(todosTable).orderBy(desc(todosTable.createdAt));
    res.json({ todos });
  } catch (err) {
    next(err);
  }
});

router.post("/todos", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = createTodoSchema.safeParse(req.body);
    if (!parsed.success) return badRequest(res, parsed.error);
    const [todo] = await db
      .insert(todosTable)
      .values({
        title: parsed.data.title,
        description: parsed.data.description ?? null,
        assignedTo: parsed.data.assignedTo ?? null,
        status: parsed.data.status ?? "open",
      })
      .returning();
    res.status(201).json({ todo });
  } catch (err) {
    next(err);
  }
});

router.patch("/todos/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const params = idParamSchema.safeParse(req.params);
    if (!params.success) return badRequest(res, params.error);
    const body = updateTodoSchema.safeParse(req.body);
    if (!body.success) return badRequest(res, body.error);
    if (Object.keys(body.data).length === 0) {
      return res.status(400).json({ error: "EmptyUpdate", message: "No fields to update" });
    }
    const updates: Record<string, unknown> = { updatedAt: sql`now()` };
    if (body.data.title !== undefined) updates.title = body.data.title;
    if (body.data.description !== undefined) updates.description = body.data.description;
    if (body.data.assignedTo !== undefined) updates.assignedTo = body.data.assignedTo;
    if (body.data.status !== undefined) updates.status = body.data.status;
    const [todo] = await db
      .update(todosTable)
      .set(updates)
      .where(eq(todosTable.id, params.data.id))
      .returning();
    if (!todo) return res.status(404).json({ error: "NotFound" });
    res.json({ todo });
  } catch (err) {
    next(err);
  }
});

router.delete("/todos/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const params = idParamSchema.safeParse(req.params);
    if (!params.success) return badRequest(res, params.error);
    const [todo] = await db
      .delete(todosTable)
      .where(eq(todosTable.id, params.data.id))
      .returning();
    if (!todo) return res.status(404).json({ error: "NotFound" });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
