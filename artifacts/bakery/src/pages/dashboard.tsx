import { useState, useMemo } from "react";
import { useGetDashboard, useGetAnalytics } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PackageOpen, Wheat, Wallet, PiggyBank, Package, Activity, AlertCircle, Boxes, Download, Receipt } from "lucide-react";
import { downloadXLSX, timestampedFilename, type Sheet } from "@/lib/exports";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AnalyticsSection } from "@/components/analytics-section";
import { TodoList } from "@/components/todo-list";
import { PackagingSection } from "@/components/packaging-section";

type RangeKey = "today" | "week" | "month" | "custom" | "all";

function toDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function computeRange(key: RangeKey, customFrom: string, customTo: string): { from?: string; to?: string } {
  const today = new Date();
  const todayStr = toDate(today);
  if (key === "today") return { from: todayStr, to: todayStr };
  if (key === "week") {
    const start = new Date(today);
    const dow = start.getDay(); // 0 = Sun
    const diff = (dow + 6) % 7; // make Monday the start
    start.setDate(start.getDate() - diff);
    return { from: toDate(start), to: todayStr };
  }
  if (key === "month") {
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    return { from: toDate(start), to: todayStr };
  }
  if (key === "custom") {
    return { from: customFrom || undefined, to: customTo || undefined };
  }
  return {};
}

export function DashboardPage() {
  const [rangeKey, setRangeKey] = useState<RangeKey>("today");
  const [customFrom, setCustomFrom] = useState<string>(toDate(new Date()));
  const [customTo, setCustomTo] = useState<string>(toDate(new Date()));
  const range = useMemo(() => computeRange(rangeKey, customFrom, customTo), [rangeKey, customFrom, customTo]);
  const { data: dashboard, isLoading, isError } = useGetDashboard(range);
  const { data: analytics } = useGetAnalytics();

  const rangeLabel = (() => {
    if (rangeKey === "today") return "Today";
    if (rangeKey === "week") return "This Week";
    if (rangeKey === "month") return "This Month";
    if (rangeKey === "all") return "All Time";
    if (range.from && range.to) return `${range.from} → ${range.to}`;
    return "Custom";
  })();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-4 w-4" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-full mb-1" />
                <Skeleton className="h-3 w-2/3" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (isError || !dashboard) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>Failed to load dashboard data. Please try again.</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Reports</h2>
          <p className="text-sm text-muted-foreground">Showing: {rangeLabel}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(["today", "week", "month", "custom", "all"] as RangeKey[]).map((k) => (
            <Button
              key={k}
              size="sm"
              variant={rangeKey === k ? "default" : "outline"}
              onClick={() => setRangeKey(k)}
            >
              {k === "today" ? "Today" : k === "week" ? "This Week" : k === "month" ? "This Month" : k === "custom" ? "Custom" : "All Time"}
            </Button>
          ))}
          <Button
            size="sm"
            variant="outline"
            className="gap-2"
            onClick={() => {
              try {
                const summary: Sheet = {
                  name: "Summary",
                  rows: [
                    { Metric: "Range", Value: rangeLabel },
                    { Metric: "Packs in Stock", Value: dashboard.packsInStock },
                    { Metric: "Packs Made", Value: dashboard.packsMade ?? 0 },
                    { Metric: "Marketing Packs in Stock", Value: dashboard.marketingPacksInStock ?? 0 },
                    { Metric: "Marketing Packs Made", Value: dashboard.marketingPacksMade ?? 0 },
                    { Metric: "Packs Delivered", Value: dashboard.packsDelivered },
                    { Metric: "Revenue (JD)", Value: Number(dashboard.revenue.toFixed(2)) },
                    { Metric: "Money Collected (JD)", Value: Number(dashboard.collected.toFixed(2)) },
                    { Metric: "Outstanding (JD)", Value: Number(dashboard.outstanding.toFixed(2)) },
                  ],
                };
                const inventory: Sheet = {
                  name: "Inventory Levels",
                  rows: (dashboard.inventoryLevels ?? []).map((it) => ({
                    Material: it.name,
                    Restocked_Kg: Number(Number(it.restocked).toFixed(3)),
                    Used_Kg: Number(Number(it.used).toFixed(3)),
                    OnHand_Kg: Number(Number(it.current).toFixed(3)),
                    Threshold_Kg: it.threshold ?? "",
                    Status: it.threshold != null && Number(it.current) <= Number(it.threshold) ? "CRITICAL" : "OK",
                  })),
                };
                const byStore: Sheet = {
                  name: "By Store",
                  rows: (dashboard.byStore ?? []).map((s) => ({
                    Store: s.storeName,
                    PacksDelivered: s.packsDelivered,
                    Samples: s.samples,
                    Revenue_JD: Number(Number(s.revenue).toFixed(2)),
                    Collected_JD: Number(Number(s.collected).toFixed(2)),
                    Outstanding_JD: Number(Number(s.outstanding).toFixed(2)),
                  })),
                };
                const sheets: Sheet[] = [summary, inventory, byStore];
                if (analytics) {
                  sheets.push({
                    name: "KPIs",
                    rows: [
                      { Metric: "Total Stores", Value: analytics.kpis.totalStores },
                      { Metric: "Active Stores (last 30d)", Value: analytics.kpis.activeStoresLast30Days },
                      { Metric: "Avg Revenue / Store (JD)", Value: Number(Number(analytics.kpis.avgRevenuePerStore).toFixed(2)) },
                      { Metric: "Avg Packs / Delivery", Value: Number(Number(analytics.kpis.avgPacksPerDelivery).toFixed(2)) },
                      { Metric: "Gross Margin", Value: analytics.kpis.grossMargin != null ? `${(Number(analytics.kpis.grossMargin) * 100).toFixed(1)}%` : "—" },
                    ],
                  });
                  sheets.push({
                    name: "Monthly Trends",
                    rows: analytics.monthly.map((m) => ({
                      Month: m.month,
                      Revenue_JD: Number(m.revenue.toFixed(2)),
                      Collected_JD: Number(m.collected.toFixed(2)),
                      Expenses_JD: Number(m.expenses.toFixed(2)),
                      RestockCost_JD: Number(m.restockCost.toFixed(2)),
                      NetCash_JD: Number(m.netCash.toFixed(2)),
                      PacksDelivered: m.packsDelivered,
                      DeliveriesCount: m.deliveriesCount,
                      NewStores: m.newStores,
                    })),
                  });
                  sheets.push({
                    name: "Expenses by Category",
                    rows: analytics.expensesByCategory.map((e) => ({
                      Category: e.category,
                      Amount_JD: Number(e.amount.toFixed(2)),
                    })),
                  });
                  sheets.push({
                    name: "Top Stores by Revenue",
                    rows: analytics.topStoresByRevenue.map((s) => ({
                      Store: s.storeName,
                      StoreID: s.storeId,
                      PacksDelivered: s.packsDelivered,
                      Revenue_JD: Number(s.revenue.toFixed(2)),
                    })),
                  });
                  sheets.push({
                    name: "Outstanding by Store",
                    rows: analytics.outstandingByStore.map((s) => ({
                      Store: s.storeName,
                      StoreID: s.storeId,
                      Outstanding_JD: Number(s.outstanding.toFixed(2)),
                    })),
                  });
                }
                downloadXLSX(timestampedFilename("dashboard"), sheets);
              } catch (err) {
                console.error("Export failed", err);
              }
            }}
          >
            <Download className="w-4 h-4" /> Export
          </Button>
        </div>
      </div>
      {rangeKey === "custom" && (
        <div className="flex flex-wrap items-end gap-3 rounded-md border bg-muted/30 p-3">
          <div className="space-y-1">
            <Label htmlFor="from">From</Label>
            <Input id="from" type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="w-44" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="to">To</Label>
            <Input id="to" type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="w-44" />
          </div>
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <Card className="bg-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Packs in Stock</CardTitle>
            <PackageOpen className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {dashboard.packsInStock}
              <span className="ml-2 text-sm font-normal text-muted-foreground opacity-70">({dashboard.packsMade ?? 0} made)</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Regular packs ready for delivery
            </p>
            <div className="text-xs text-muted-foreground mt-2 pt-2 border-t">
              <span className="font-medium text-foreground">{dashboard.marketingPacksInStock ?? 0}</span> marketing packs
              {" "}<span className="opacity-70">({dashboard.marketingPacksMade ?? 0} made)</span>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Packs Delivered</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{dashboard.regularPacksDelivered ?? 0}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Regular packs delivered
            </p>
            <div className="text-xs text-muted-foreground mt-2 pt-2 border-t">
              <span className="font-medium text-foreground">{dashboard.marketingPacksDelivered ?? 0}</span> marketing packs delivered
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Money Collected</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{dashboard.collected.toFixed(2)} JD</div>
            <p className="text-xs text-muted-foreground mt-1">
              Total cash received
            </p>
          </CardContent>
        </Card>

        <Card className="bg-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Money Spent</CardTitle>
            <Receipt className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{(dashboard.moneySpent ?? 0).toFixed(2)} JD</div>
            <p className="text-xs text-muted-foreground mt-1">
              Expenses + restocks
            </p>
          </CardContent>
        </Card>

        <Card className="bg-card border-accent/20">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Outstanding</CardTitle>
            <PiggyBank className="h-4 w-4 text-accent" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-accent">{dashboard.outstanding.toFixed(2)} JD</div>
            <p className="text-xs text-muted-foreground mt-1">
              To be collected
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Boxes className="h-5 w-5" />
            Inventory Levels
          </CardTitle>
          <CardDescription>
            Raw materials on hand. Critically low items are shown in red.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!dashboard.inventoryLevels || dashboard.inventoryLevels.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>Log a restock on the Daily Log page to start tracking inventory.</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>Raw material</TableHead>
                    <TableHead className="text-right">On hand (kg)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dashboard.inventoryLevels.map((it) => {
                    const threshold = (it as { threshold?: number | null }).threshold ?? null;
                    const isCritical = threshold != null
                      ? it.current <= threshold
                      : it.current <= 0;
                    return (
                      <TableRow key={it.name}>
                        <TableCell className="font-medium">{it.name}</TableCell>
                        <TableCell className={cn(
                          "text-right font-medium tabular-nums",
                          isCritical ? "text-destructive font-semibold" : ""
                        )}>
                          {it.current.toFixed(3)}
                          {threshold != null && (
                            <span className="ml-2 text-xs text-muted-foreground font-normal">
                              (critical ≤ {threshold})
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <AnalyticsSection />
      <PackagingSection />
      <TodoList />

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Store Summary
            </CardTitle>
            <CardDescription>
              Outstanding balances and deliveries per store.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {dashboard.byStore.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <p>No stores with activity yet.</p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead>Store</TableHead>
                      <TableHead className="text-right">Delivered</TableHead>
                      <TableHead className="text-right">Marketing packs</TableHead>
                      <TableHead className="text-right">Revenue</TableHead>
                      <TableHead className="text-right">Collected</TableHead>
                      <TableHead className="text-right">Outstanding</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dashboard.byStore.map((store) => (
                      <TableRow key={store.storeId}>
                        <TableCell className="font-medium">{store.storeName}</TableCell>
                        <TableCell className="text-right">{store.packsDelivered}</TableCell>
                        <TableCell className="text-right">{store.samples}</TableCell>
                        <TableCell className="text-right">{store.revenue.toFixed(2)} JD</TableCell>
                        <TableCell className="text-right">{store.collected.toFixed(2)} JD</TableCell>
                        <TableCell className={cn(
                          "text-right font-medium",
                          store.outstanding > 0 ? "text-accent" : "text-muted-foreground"
                        )}>
                          {store.outstanding.toFixed(2)} JD
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
