import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  TODOS_QUERY_KEY,
  createTodo,
  deleteTodo,
  listTodos,
  updateTodo,
  type Todo,
  type TodoStatus,
} from "@/lib/todos-api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ListTodo, Plus, Pencil, Trash2, Check, X, AlertCircle } from "lucide-react";

const STATUS_LABEL: Record<TodoStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  done: "Done",
};

const STATUS_BADGE: Record<TodoStatus, string> = {
  open: "bg-amber-100 text-amber-900 border-amber-300",
  in_progress: "bg-blue-100 text-blue-900 border-blue-300",
  done: "bg-emerald-100 text-emerald-900 border-emerald-300",
};

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

export function TodoList() {
  const qc = useQueryClient();
  const { data, isLoading, isError, error } = useQuery({
    queryKey: TODOS_QUERY_KEY,
    queryFn: listTodos,
  });

  const create = useMutation({
    mutationFn: createTodo,
    onSuccess: () => qc.invalidateQueries({ queryKey: TODOS_QUERY_KEY }),
  });
  const update = useMutation({
    mutationFn: ({ id, input }: { id: number; input: Parameters<typeof updateTodo>[1] }) =>
      updateTodo(id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: TODOS_QUERY_KEY }),
  });
  const remove = useMutation({
    mutationFn: deleteTodo,
    onSuccess: () => qc.invalidateQueries({ queryKey: TODOS_QUERY_KEY }),
  });

  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const todos = data?.todos ?? [];
  const openCount = todos.filter((t) => t.status !== "done").length;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ListTodo className="w-5 h-5" />
              Things to do
              {openCount > 0 && (
                <Badge variant="secondary" className="ml-1">
                  {openCount} open
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              Free-form task list. Assign to anyone, edit anytime, mark done when complete.
            </CardDescription>
          </div>
          {!showAdd && !editingId && (
            <Button size="sm" onClick={() => setShowAdd(true)}>
              <Plus className="w-4 h-4 mr-1" /> Add task
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {showAdd && (
          <TodoForm
            submitLabel="Add task"
            onCancel={() => setShowAdd(false)}
            onSubmit={(input) => {
              create.mutate(input, {
                onSuccess: () => setShowAdd(false),
              });
            }}
            isLoading={create.isPending}
          />
        )}

        {isError && (
          <Alert variant="destructive">
            <AlertCircle className="w-4 h-4" />
            <AlertTitle>Could not load tasks</AlertTitle>
            <AlertDescription>{(error as Error)?.message ?? "Unknown error"}</AlertDescription>
          </Alert>
        )}

        {isLoading && (
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        )}

        {!isLoading && todos.length === 0 && !showAdd && (
          <p className="text-sm text-muted-foreground italic py-4 text-center">
            No tasks yet. Click "Add task" to create one.
          </p>
        )}

        <ul className="space-y-2">
          {todos.map((todo) => (
            <li key={todo.id}>
              {editingId === todo.id ? (
                <TodoForm
                  initial={todo}
                  submitLabel="Save"
                  onCancel={() => setEditingId(null)}
                  onSubmit={(input) =>
                    update.mutate(
                      { id: todo.id, input },
                      { onSuccess: () => setEditingId(null) },
                    )
                  }
                  isLoading={update.isPending}
                />
              ) : (
                <TodoRow
                  todo={todo}
                  onEdit={() => setEditingId(todo.id)}
                  onStatusChange={(status) =>
                    update.mutate({ id: todo.id, input: { status } })
                  }
                  onDelete={() => {
                    if (confirm(`Delete task "${todo.title}"?`)) {
                      remove.mutate(todo.id);
                    }
                  }}
                  isUpdating={update.isPending}
                />
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function TodoRow({
  todo,
  onEdit,
  onStatusChange,
  onDelete,
  isUpdating,
}: {
  todo: Todo;
  onEdit: () => void;
  onStatusChange: (status: TodoStatus) => void;
  onDelete: () => void;
  isUpdating: boolean;
}) {
  const isDone = todo.status === "done";
  return (
    <div
      className={`rounded-md border p-3 flex flex-col sm:flex-row sm:items-start gap-3 ${isDone ? "opacity-60" : ""}`}
    >
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`font-medium ${isDone ? "line-through" : ""}`}>{todo.title}</span>
          <Badge variant="outline" className={STATUS_BADGE[todo.status]}>
            {STATUS_LABEL[todo.status]}
          </Badge>
          {todo.assignedTo && (
            <Badge variant="secondary" className="font-normal">
              @{todo.assignedTo}
            </Badge>
          )}
        </div>
        {todo.description && (
          <p className={`text-sm text-muted-foreground mt-1 whitespace-pre-wrap ${isDone ? "line-through" : ""}`}>
            {todo.description}
          </p>
        )}
        <p className="text-xs text-muted-foreground mt-1">
          Added {formatDate(todo.createdAt)}
          {todo.updatedAt !== todo.createdAt && ` · Updated ${formatDate(todo.updatedAt)}`}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Select
          value={todo.status}
          onValueChange={(v) => onStatusChange(v as TodoStatus)}
          disabled={isUpdating}
        >
          <SelectTrigger className="w-36 h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(STATUS_LABEL) as TodoStatus[]).map((s) => (
              <SelectItem key={s} value={s}>
                {STATUS_LABEL[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="icon" variant="ghost" onClick={onEdit} title="Edit">
          <Pencil className="w-4 h-4" />
        </Button>
        <Button size="icon" variant="ghost" onClick={onDelete} title="Delete">
          <Trash2 className="w-4 h-4 text-destructive" />
        </Button>
      </div>
    </div>
  );
}

function TodoForm({
  initial,
  onSubmit,
  onCancel,
  submitLabel,
  isLoading,
}: {
  initial?: Partial<Todo>;
  onSubmit: (input: { title: string; description: string | null; assignedTo: string | null; status: TodoStatus }) => void;
  onCancel: () => void;
  submitLabel: string;
  isLoading: boolean;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [assignedTo, setAssignedTo] = useState(initial?.assignedTo ?? "");
  const [status, setStatus] = useState<TodoStatus>((initial?.status as TodoStatus) ?? "open");

  const trimmedTitle = title.trim();
  const canSubmit = trimmedTitle.length > 0 && !isLoading;

  return (
    <form
      className="rounded-md border p-3 space-y-3 bg-muted/30"
      onSubmit={(e) => {
        e.preventDefault();
        if (!canSubmit) return;
        onSubmit({
          title: trimmedTitle,
          description: description.trim() ? description.trim() : null,
          assignedTo: assignedTo.trim() ? assignedTo.trim() : null,
          status,
        });
      }}
    >
      <div className="grid gap-2">
        <Label htmlFor="todo-title">Task</Label>
        <Input
          id="todo-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What needs doing?"
          autoFocus
          maxLength={500}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="todo-desc">Notes (optional)</Label>
        <Textarea
          id="todo-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Any extra details"
          rows={2}
          maxLength={5000}
        />
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="grid gap-2">
          <Label htmlFor="todo-assigned">Assigned to (optional)</Label>
          <Input
            id="todo-assigned"
            value={assignedTo}
            onChange={(e) => setAssignedTo(e.target.value)}
            placeholder="e.g. Sara"
            maxLength={200}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="todo-status">Status</Label>
          <Select value={status} onValueChange={(v) => setStatus(v as TodoStatus)}>
            <SelectTrigger id="todo-status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(STATUS_LABEL) as TodoStatus[]).map((s) => (
                <SelectItem key={s} value={s}>
                  {STATUS_LABEL[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={isLoading}>
          <X className="w-4 h-4 mr-1" /> Cancel
        </Button>
        <Button type="submit" size="sm" disabled={!canSubmit}>
          <Check className="w-4 h-4 mr-1" /> {submitLabel}
        </Button>
      </div>
    </form>
  );
}
