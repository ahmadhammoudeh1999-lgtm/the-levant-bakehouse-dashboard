import { useMemo, useState } from "react";
import { useListStores, useGetStoreHistory, getGetStoreHistoryQueryKey, getStoreHistory } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Store as StoreIcon, Package, Wallet, AlertCircle, ShoppingCart, Download } from "lucide-react";
import { todayLocalISO, parseLocalDate, downloadCSV } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

type Period = "7d" | "30d" | "90d" | "month" | "ytd" | "all" | "custom";

function periodRange(period: Period): { from: string | null; to: string | null } {
  const today = todayLocalISO();
  const now = parseLocalDate(today);
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  switch (period) {
    case "7d": {
      const d = new Date(now); d.setDate(d.getDate() - 6);
      return { from: fmt(d), to: today };
    }
    case "30d": {
      const d = new Date(now); d.setDate(d.getDate() - 29);
      return { from: fmt(d), to: today };
    }
    case "90d": {
      const d = new Date(now); d.setDate(d.getDate() - 89);
      return { from: fmt(d), to: today };
    }
    case "month":
      return { from: fmt(new Date(now.getFullYear(), now.getMonth(), 1)), to: today };
    case "ytd":
      return { from: fmt(new Date(now.getFullYear(), 0, 1)), to: today };
    case "all":
    case "custom":
    default:
      return { from: null, to: null };
  }
}

const fmtJD = (n: number) => `${n.toFixed(2)} JD`;

export function StoresPage() {
  const { toast } = useToast();
  const { data: stores, isLoading: loadingStores } = useListStores();
  const [storeId, setStoreId] = useState<number | null>(null);
  const [period, setPeriod] = useState<Period>("30d");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [exportIds, setExportIds] = useState<number[]>([]);
  const [exporting, setExporting] = useState(false);

  // Auto-select first store
  const selectedId = useMemo(() => {
    if (storeId != null) return storeId;
    return stores && stores.length > 0 ? stores[0].id : null;
  }, [storeId, stores]);

  const { from, to } = useMemo(() => {
    if (period === "custom") {
      return { from: customFrom || null, to: customTo || null };
    }
    return periodRange(period);
  }, [period, customFrom, customTo]);

  const historyParams = { from: from ?? undefined, to: to ?? undefined };
  const { data: history, isLoading: loadingHistory, isFetching } = useGetStoreHistory(
    selectedId ?? 0,
    historyParams,
    {
      query: {
        enabled: selectedId != null,
        queryKey: getGetStoreHistoryQueryKey(selectedId ?? 0, historyParams),
      },
    }
  );

  const summary = history?.summary;
  const txs = history?.transactions ?? [];

  // Default the export selection to the currently viewed store.
  const effectiveExportIds = useMemo(() => {
    if (exportIds.length > 0) return exportIds;
    return selectedId != null ? [selectedId] : [];
  }, [exportIds, selectedId]);

  const periodLabel: Record<Period, string> = {
    "7d": "Last 7 days",
    "30d": "Last 30 days",
    "90d": "Last 90 days",
    month: "This month",
    ytd: "Year to date",
    all: "All time",
    custom: "Custom range",
  };

  const handleExport = async () => {
    if (!stores || effectiveExportIds.length === 0) return;
    setExporting(true);
    try {
      const params = { from: from ?? undefined, to: to ?? undefined };
      const results = await Promise.all(
        effectiveExportIds.map(async (id) => ({
          store: stores.find((s) => s.id === id),
          data: await getStoreHistory(id, params),
        }))
      );

      const rows: (string | number | null)[][] = [];
      // Period meta row
      rows.push(["Period", periodLabel[period], "From", from ?? "earliest", "To", to ?? "today"]);
      rows.push([]);

      // Per-store summary block
      rows.push([
        "Store ID",
        "Store",
        "Total Orders",
        "Packs Delivered",
        "Marketing packs",
        "Revenue (JD)",
        "Paid at Delivery (JD)",
        "Paid Later (JD)",
        "Total Paid (JD)",
        "Outstanding in Period (JD)",
        "Outstanding (current, JD)",
      ]);
      for (const r of results) {
        const s = r.data.summary;
        rows.push([
          r.store?.id ?? "",
          r.store?.name ?? "",
          s.totalOrders,
          s.packsDelivered,
          s.samples,
          s.revenue.toFixed(2),
          s.paidAtDelivery.toFixed(2),
          s.paidLater.toFixed(2),
          s.collected.toFixed(2),
          s.outstandingInPeriod.toFixed(2),
          s.outstandingTotal.toFixed(2),
        ]);
      }
      rows.push([]);

      // Per-delivery rows
      rows.push([
        "Store ID",
        "Store",
        "Date",
        "Packs",
        "Returned",
        "Marketing packs",
        "Amount (JD)",
        "Paid (JD)",
        "Outstanding (JD)",
        "Status",
        "Note",
      ]);
      for (const r of results) {
        for (const t of r.data.transactions) {
          const fullyPaid = t.amount > 0 && t.paid >= t.amount - 0.005;
          const status = fullyPaid ? "Paid" : t.paid > 0 ? "Partial" : "Unpaid";
          rows.push([
            r.store?.id ?? "",
            r.store?.name ?? "",
            t.date,
            t.packs ?? "",
            t.returned ?? "",
            t.samples ?? "",
            t.amount.toFixed(2),
            t.paid.toFixed(2),
            t.outstanding.toFixed(2),
            status,
            t.note ?? "",
          ]);
        }
      }

      const tag = effectiveExportIds.length === 1
        ? (results[0]?.store?.name ?? `store-${effectiveExportIds[0]}`).toLowerCase().replace(/[^a-z0-9]+/g, "-")
        : `${effectiveExportIds.length}-stores`;
      const range = (from || to) ? `_${from ?? "start"}_to_${to ?? "today"}` : "";
      downloadCSV(`store-history_${tag}${range}.csv`, rows);
      toast({ description: `Exported ${effectiveExportIds.length} store(s).` });
    } catch (e) {
      toast({ description: "Export failed.", variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  const allSelected = stores != null && exportIds.length === stores.length && stores.length > 0;
  const toggleAll = () => {
    if (!stores) return;
    setExportIds(allSelected ? [] : stores.map((s) => s.id));
  };
  const toggleOne = (id: number, on: boolean) => {
    setExportIds((prev) => {
      const set = new Set(prev.length === 0 && selectedId != null ? [selectedId] : prev);
      if (on) set.add(id); else set.delete(id);
      return Array.from(set);
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <StoreIcon className="w-6 h-6" /> Store History
          </h2>
          <p className="text-sm text-muted-foreground">
            Pick a store to see all of its orders, payments, and outstanding balance.
          </p>
        </div>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="gap-2" disabled={!stores || stores.length === 0}>
              <Download className="w-4 h-4" /> Export to Excel
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72">
            <div className="space-y-3">
              <div>
                <p className="text-sm font-medium">Export stores</p>
                <p className="text-xs text-muted-foreground">
                  Uses the period chosen below. If none selected, the current store is exported.
                </p>
              </div>
              <div className="flex items-center justify-between border-b pb-2">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={toggleAll}
                  />
                  Select all
                </label>
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => setExportIds([])}
                >
                  Clear
                </button>
              </div>
              <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1">
                {(stores ?? []).map((s) => {
                  const checked = exportIds.includes(s.id) || (exportIds.length === 0 && s.id === selectedId);
                  return (
                    <label key={s.id} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(v) => toggleOne(s.id, !!v)}
                      />
                      <span className="truncate">#{s.id} — {s.name}</span>
                    </label>
                  );
                })}
              </div>
              <Button
                className="w-full"
                onClick={handleExport}
                disabled={exporting || effectiveExportIds.length === 0}
              >
                {exporting ? "Exporting…" : `Export ${effectiveExportIds.length} store${effectiveExportIds.length === 1 ? "" : "s"}`}
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Store</label>
              {loadingStores ? (
                <Skeleton className="h-9 w-full" />
              ) : (
                <Select
                  value={selectedId != null ? String(selectedId) : ""}
                  onValueChange={(v) => setStoreId(Number(v))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a store" />
                  </SelectTrigger>
                  <SelectContent>
                    {(stores ?? []).map((s) => (
                      <SelectItem key={s.id} value={String(s.id)}>
                        #{s.id} — {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Time period</label>
              <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7d">Last 7 days</SelectItem>
                  <SelectItem value="30d">Last 30 days</SelectItem>
                  <SelectItem value="90d">Last 90 days</SelectItem>
                  <SelectItem value="month">This month</SelectItem>
                  <SelectItem value="ytd">Year to date</SelectItem>
                  <SelectItem value="all">All time</SelectItem>
                  <SelectItem value="custom">Custom range</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {period === "custom" && (
              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">From</label>
                  <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
                </div>
                <div className="flex-1">
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">To</label>
                  <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {selectedId == null ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            {loadingStores ? "Loading stores..." : "Add a store on the Setup page to get started."}
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <SummaryCard
              icon={<ShoppingCart className="w-4 h-4" />}
              label="Total Orders"
              value={summary ? String(summary.totalOrders) : "--"}
              footer={summary ? `${summary.packsDelivered} packs · ${summary.samples} marketing packs` : ""}
              loading={loadingHistory}
            />
            <SummaryCard
              icon={<Package className="w-4 h-4" />}
              label="Revenue"
              value={summary ? fmtJD(summary.revenue) : "--"}
              footer={summary ? `${summary.packsDelivered} packs delivered` : ""}
              loading={loadingHistory}
            />
            <SummaryCard
              icon={<Wallet className="w-4 h-4 text-emerald-600" />}
              label="Total Payments"
              value={summary ? fmtJD(summary.collected) : "--"}
              footer={
                summary
                  ? `${fmtJD(summary.paidAtDelivery)} on delivery · ${fmtJD(summary.paidLater)} later`
                  : ""
              }
              loading={loadingHistory}
            />
            <SummaryCard
              icon={<AlertCircle className="w-4 h-4 text-amber-600" />}
              label="Outstanding (current)"
              value={summary ? fmtJD(summary.outstandingTotal) : "--"}
              footer={summary ? `In period: ${fmtJD(summary.outstandingInPeriod)}` : ""}
              loading={loadingHistory}
              highlight={summary != null && summary.outstandingTotal > 0}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Transactions
                {from || to ? (
                  <span className="text-xs font-normal text-muted-foreground ml-2">
                    {from ?? "earliest"} → {to ?? "today"}
                  </span>
                ) : (
                  <span className="text-xs font-normal text-muted-foreground ml-2">All time</span>
                )}
                {isFetching && <span className="text-xs text-muted-foreground ml-2">Loading…</span>}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[20%]">Date</TableHead>
                      <TableHead className="w-[14%] text-right">Packs</TableHead>
                      <TableHead className="w-[12%] text-right">Marketing packs</TableHead>
                      <TableHead className="w-[12%] text-right">Returned</TableHead>
                      <TableHead className="w-[14%] text-right">Amount</TableHead>
                      <TableHead className="w-[14%] text-right">Paid</TableHead>
                      <TableHead className="w-[14%] text-right">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loadingHistory && (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground py-6">
                          Loading deliveries…
                        </TableCell>
                      </TableRow>
                    )}
                    {!loadingHistory && txs.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground py-6">
                          No deliveries in this period.
                        </TableCell>
                      </TableRow>
                    )}
                    {txs.map((t) => {
                      const fullyPaid = t.amount > 0 && t.paid >= t.amount - 0.005;
                      const partial = t.paid > 0 && !fullyPaid;
                      return (
                        <TableRow key={t.id}>
                          <TableCell className="whitespace-nowrap">
                            {parseLocalDate(t.date).toLocaleDateString(undefined, {
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                            })}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {t.packs != null ? t.packs : "—"}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">
                            {t.samples ? t.samples : "—"}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">
                            {t.returned ? t.returned : "—"}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{fmtJD(t.amount)}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmtJD(t.paid)}</TableCell>
                          <TableCell className="text-right">
                            {fullyPaid ? (
                              <Badge className="bg-emerald-600 hover:bg-emerald-600">Paid</Badge>
                            ) : partial ? (
                              <Badge variant="outline" className="border-amber-400 text-amber-700">Partial</Badge>
                            ) : (
                              <Badge variant="outline" className="border-red-400 text-red-700">Unpaid</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  footer,
  loading,
  highlight,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  footer?: string;
  loading?: boolean;
  highlight?: boolean;
}) {
  return (
    <Card className={highlight ? "border-amber-300 bg-amber-50/40" : ""}>
      <CardContent className="pt-5">
        <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium uppercase tracking-wide">
          {icon}
          {label}
        </div>
        <div className="mt-2 text-2xl font-bold">
          {loading ? <Skeleton className="h-7 w-24" /> : value}
        </div>
        {footer && (
          <div className="mt-1 text-xs text-muted-foreground">
            {loading ? <Skeleton className="h-3 w-32" /> : footer}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
