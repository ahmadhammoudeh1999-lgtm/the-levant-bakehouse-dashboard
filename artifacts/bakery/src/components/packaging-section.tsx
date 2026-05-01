import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Package, Plus, Trash2, AlertTriangle, Pencil, Check, X } from "lucide-react";
import {
  packagingApi,
  type PackagingResponse,
  type PackagingRestock,
  type PackagingThresholds,
  type PackagingType,
} from "@/lib/packaging-api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const SUMMARY_QK = ["packaging-summary"];
const RESTOCKS_QK = ["packaging-restocks"];
const THRESHOLDS_QK = ["packaging-thresholds"];

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function fmtNum(n: number): string {
  return new Intl.NumberFormat().format(n);
}

function fmtMoney(n: number | null): string {
  if (n == null) return "—";
  return `${n.toFixed(2)} JD`;
}

export function PackagingSection() {
  const qc = useQueryClient();

  const summary = useQuery<PackagingResponse>({
    queryKey: SUMMARY_QK,
    queryFn: packagingApi.summary,
    refetchInterval: 5000,
  });
  const restocks = useQuery<PackagingRestock[]>({
    queryKey: RESTOCKS_QK,
    queryFn: packagingApi.listRestocks,
    refetchInterval: 5000,
  });
  const thresholds = useQuery<PackagingThresholds>({
    queryKey: THRESHOLDS_QK,
    queryFn: packagingApi.getThresholds,
  });

  const [addOpen, setAddOpen] = useState(false);
  const [editingThresholds, setEditingThresholds] = useState(false);
  const [thresholdDraft, setThresholdDraft] = useState<{ regular: string; marketing: string }>({
    regular: "",
    marketing: "",
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: SUMMARY_QK });
    qc.invalidateQueries({ queryKey: RESTOCKS_QK });
  };

  const createRestock = useMutation({
    mutationFn: packagingApi.createRestock,
    onSuccess: invalidate,
  });
  const deleteRestock = useMutation({
    mutationFn: packagingApi.deleteRestock,
    onSuccess: invalidate,
  });
  const updateThresholds = useMutation({
    mutationFn: packagingApi.updateThresholds,
    onSuccess: (data) => {
      qc.setQueryData(THRESHOLDS_QK, data);
      qc.invalidateQueries({ queryKey: SUMMARY_QK });
      setEditingThresholds(false);
    },
  });

  const data = summary.data;
  const isCriticalAny =
    !!data && (data.regular.isCritical || data.marketing.isCritical);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Packaging Stock
          </CardTitle>
          <CardDescription>
            Bulk packaging on hand. Each pack produced uses one packaging unit of its type.
          </CardDescription>
        </div>
        <Button onClick={() => setAddOpen(true)} data-testid="button-add-packaging-restock">
          <Plus className="mr-2 h-4 w-4" />
          Log packaging order
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {summary.isLoading ? (
          <div className="grid gap-3 md:grid-cols-2">
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </div>
        ) : summary.error ? (
          <Alert variant="destructive">
            <AlertDescription>Failed to load packaging stock.</AlertDescription>
          </Alert>
        ) : data ? (
          <>
            {isCriticalAny && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Packaging is at or below the critical threshold. Order more soon.
                </AlertDescription>
              </Alert>
            )}
            <div className="grid gap-3 md:grid-cols-2">
              <StockTile label="Regular packaging" tone="regular" s={data.regular} />
              <StockTile label="Marketing packaging" tone="marketing" s={data.marketing} />
            </div>

            {/* Critical thresholds editor */}
            <div className="flex flex-wrap items-center gap-3 rounded-md border bg-muted/30 px-3 py-2 text-sm">
              <span className="font-medium">Critical thresholds:</span>
              {editingThresholds ? (
                <>
                  <label className="flex items-center gap-2">
                    Regular
                    <Input
                      type="number"
                      min="0"
                      className="h-8 w-24"
                      value={thresholdDraft.regular}
                      onChange={(e) => setThresholdDraft((d) => ({ ...d, regular: e.target.value }))}
                      data-testid="input-threshold-regular"
                    />
                  </label>
                  <label className="flex items-center gap-2">
                    Marketing
                    <Input
                      type="number"
                      min="0"
                      className="h-8 w-24"
                      value={thresholdDraft.marketing}
                      onChange={(e) => setThresholdDraft((d) => ({ ...d, marketing: e.target.value }))}
                      data-testid="input-threshold-marketing"
                    />
                  </label>
                  <Button
                    size="sm"
                    onClick={() => {
                      const r = Number(thresholdDraft.regular);
                      const m = Number(thresholdDraft.marketing);
                      const body: Partial<PackagingThresholds> = {};
                      if (Number.isFinite(r) && r >= 0) body.regular = Math.floor(r);
                      if (Number.isFinite(m) && m >= 0) body.marketing = Math.floor(m);
                      updateThresholds.mutate(body);
                    }}
                    disabled={updateThresholds.isPending}
                    data-testid="button-save-thresholds"
                  >
                    <Check className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditingThresholds(false)}>
                    <X className="h-4 w-4" />
                  </Button>
                </>
              ) : (
                <>
                  <span>
                    Regular ≤ <strong>{thresholds.data?.regular ?? data.regular.threshold}</strong>
                  </span>
                  <span>
                    Marketing ≤ <strong>{thresholds.data?.marketing ?? data.marketing.threshold}</strong>
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setThresholdDraft({
                        regular: String(thresholds.data?.regular ?? data.regular.threshold),
                        marketing: String(thresholds.data?.marketing ?? data.marketing.threshold),
                      });
                      setEditingThresholds(true);
                    }}
                    data-testid="button-edit-thresholds"
                  >
                    <Pencil className="mr-1 h-3.5 w-3.5" />
                    Edit
                  </Button>
                </>
              )}
            </div>

            {/* Recent orders */}
            <div className="space-y-2">
              <div className="text-sm font-medium">Recent packaging orders</div>
              {restocks.isLoading ? (
                <Skeleton className="h-20" />
              ) : !restocks.data || restocks.data.length === 0 ? (
                <div className="rounded-md border bg-muted/20 px-3 py-4 text-center text-sm text-muted-foreground">
                  No packaging orders logged yet.
                </div>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead className="text-right">Quantity</TableHead>
                        <TableHead className="text-right">Spent</TableHead>
                        <TableHead>Notes</TableHead>
                        <TableHead className="w-12"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {restocks.data.map((r) => (
                        <TableRow key={r.id} data-testid={`row-packaging-restock-${r.id}`}>
                          <TableCell>{r.date}</TableCell>
                          <TableCell>
                            <Badge variant={r.type === "marketing" ? "secondary" : "default"}>
                              {r.type}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{fmtNum(r.quantity)}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmtMoney(r.amountSpent)}</TableCell>
                          <TableCell className="text-muted-foreground">{r.notes ?? ""}</TableCell>
                          <TableCell>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                if (window.confirm("Delete this packaging order?" + (r.expenseId ? " The linked expense entry will also be removed." : ""))) {
                                  deleteRestock.mutate(r.id);
                                }
                              }}
                              data-testid={`button-delete-packaging-restock-${r.id}`}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          </>
        ) : null}
      </CardContent>

      <AddPackagingDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onSubmit={(payload) => {
          createRestock.mutate(payload, { onSuccess: () => setAddOpen(false) });
        }}
        pending={createRestock.isPending}
        error={createRestock.error instanceof Error ? createRestock.error.message : null}
      />
    </Card>
  );
}

function StockTile({
  label,
  tone,
  s,
}: {
  label: string;
  tone: PackagingType;
  s: { added: number; used: number; remaining: number; threshold: number; isCritical: boolean };
}) {
  return (
    <div
      className={`rounded-lg border p-4 ${s.isCritical ? "border-destructive/40 bg-destructive/5" : "bg-card"}`}
      data-testid={`tile-packaging-${tone}`}
    >
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">{label}</div>
        <Badge variant={tone === "marketing" ? "secondary" : "default"}>{tone}</Badge>
      </div>
      <div className={`mt-1 text-3xl font-bold tabular-nums ${s.isCritical ? "text-destructive" : ""}`}>
        {fmtNum(s.remaining)}
      </div>
      <div className="text-xs text-muted-foreground">
        units left {s.isCritical ? `(critical ≤ ${s.threshold})` : `(critical ≤ ${s.threshold})`}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
        <div>
          Total ordered: <span className="font-medium text-foreground tabular-nums">{fmtNum(s.added)}</span>
        </div>
        <div>
          Total used: <span className="font-medium text-foreground tabular-nums">{fmtNum(s.used)}</span>
        </div>
      </div>
    </div>
  );
}

function AddPackagingDialog({
  open,
  onOpenChange,
  onSubmit,
  pending,
  error,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSubmit: (payload: { date: string; type: PackagingType; quantity: number; amountSpent: number | null; notes: string | null }) => void;
  pending: boolean;
  error: string | null;
}) {
  const [date, setDate] = useState(todayStr());
  const [type, setType] = useState<PackagingType>("regular");
  const [quantity, setQuantity] = useState("");
  const [amountSpent, setAmountSpent] = useState("");
  const [notes, setNotes] = useState("");

  const reset = () => {
    setDate(todayStr());
    setType("regular");
    setQuantity("");
    setAmountSpent("");
    setNotes("");
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) reset();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Log packaging order</DialogTitle>
          <DialogDescription>
            Records the bulk quantity and (optionally) the amount paid. The cost is logged as a Packaging expense in your accounting.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="pkg-date">Date</Label>
              <Input id="pkg-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} data-testid="input-packaging-date" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="pkg-type">Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as PackagingType)}>
                <SelectTrigger id="pkg-type" data-testid="select-packaging-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="regular">Regular</SelectItem>
                  <SelectItem value="marketing">Marketing</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="pkg-qty">Quantity (units)</Label>
              <Input
                id="pkg-qty"
                type="number"
                min="1"
                step="1"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="e.g. 500"
                data-testid="input-packaging-quantity"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="pkg-amount">Amount spent (JD)</Label>
              <Input
                id="pkg-amount"
                type="number"
                min="0"
                step="0.01"
                value={amountSpent}
                onChange={(e) => setAmountSpent(e.target.value)}
                placeholder="optional, e.g. 35.00"
                data-testid="input-packaging-amount"
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="pkg-notes">Notes (optional)</Label>
            <Textarea
              id="pkg-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Supplier, batch, etc."
              data-testid="input-packaging-notes"
            />
          </div>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={() => {
              const q = Number(quantity);
              if (!Number.isFinite(q) || q <= 0) return;
              const a = amountSpent.trim() === "" ? null : Number(amountSpent);
              onSubmit({
                date,
                type,
                quantity: Math.floor(q),
                amountSpent: a != null && Number.isFinite(a) ? a : null,
                notes: notes.trim() === "" ? null : notes.trim(),
              });
            }}
            disabled={pending || !quantity}
            data-testid="button-submit-packaging-restock"
          >
            {pending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
