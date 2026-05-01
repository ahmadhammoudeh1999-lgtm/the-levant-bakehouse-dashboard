// Tiny standalone fetch wrapper for the Packaging addon.
// Bypasses the OpenAPI codegen on purpose so this addon stays drop-in.

const BASE = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");

export type PackagingType = "regular" | "marketing";

export type PackagingSummary = {
  added: number;
  used: number;
  remaining: number;
  threshold: number;
  isCritical: boolean;
};

export type PackagingResponse = {
  regular: PackagingSummary;
  marketing: PackagingSummary;
};

export type PackagingRestock = {
  id: number;
  date: string;
  type: PackagingType;
  quantity: number;
  amountSpent: number | null;
  notes: string | null;
  expenseId: number | null;
  createdAt: string;
};

export type PackagingThresholds = { regular: number; marketing: number };

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}/api${path}`, {
    headers: { "content-type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const body = await res.json();
      if (body?.error) msg = body.error;
    } catch {
      /* ignore */
    }
    throw new Error(msg || `Request failed: ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const packagingApi = {
  summary: () => request<PackagingResponse>("/packaging"),
  listRestocks: () => request<PackagingRestock[]>("/packaging/restocks"),
  createRestock: (body: {
    date: string;
    type: PackagingType;
    quantity: number;
    amountSpent?: number | null;
    notes?: string | null;
  }) =>
    request<PackagingRestock>("/packaging/restocks", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  deleteRestock: (id: number) =>
    request<void>(`/packaging/restocks/${id}`, { method: "DELETE" }),
  getThresholds: () => request<PackagingThresholds>("/packaging/thresholds"),
  updateThresholds: (body: Partial<PackagingThresholds>) =>
    request<PackagingThresholds>("/packaging/thresholds", {
      method: "PUT",
      body: JSON.stringify(body),
    }),
};
