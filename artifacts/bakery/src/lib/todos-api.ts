export type TodoStatus = "open" | "in_progress" | "done";

export type Todo = {
  id: number;
  title: string;
  description: string | null;
  assignedTo: string | null;
  status: TodoStatus;
  createdAt: string;
  updatedAt: string;
};

export type CreateTodoInput = {
  title: string;
  description?: string | null;
  assignedTo?: string | null;
  status?: TodoStatus;
};

export type UpdateTodoInput = Partial<CreateTodoInput>;

const baseUrl = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
const apiUrl = (path: string) => `${baseUrl}/api${path}`;

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let body: unknown = undefined;
    try { body = await res.json(); } catch { /* ignore */ }
    const msg = (body && typeof body === "object" && "error" in body)
      ? String((body as { error?: unknown }).error)
      : `HTTP ${res.status}`;
    throw new Error(msg);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export async function listTodos(): Promise<{ todos: Todo[] }> {
  return handle(await fetch(apiUrl("/todos")));
}

export async function createTodo(input: CreateTodoInput): Promise<{ todo: Todo }> {
  return handle(
    await fetch(apiUrl("/todos"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
}

export async function updateTodo(id: number, input: UpdateTodoInput): Promise<{ todo: Todo }> {
  return handle(
    await fetch(apiUrl(`/todos/${id}`), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
}

export async function deleteTodo(id: number): Promise<void> {
  return handle(await fetch(apiUrl(`/todos/${id}`), { method: "DELETE" }));
}

export const TODOS_QUERY_KEY = ["todos"] as const;
