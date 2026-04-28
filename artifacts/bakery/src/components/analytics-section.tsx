import { useGetAnalytics } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  TrendingUp,
  Users,
  Store as StoreIcon,
  Receipt,
  Trophy,
  AlertCircle,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
  ComposedChart,
} from "recharts";

const PIE_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
  "#a78bfa",
  "#f472b6",
  "#22d3ee",
];

function fmtMonth(m: string) {
  // m = YYYY-MM -> "Apr '26"
  const [y, mo] = m.split("-");
  const d = new Date(Number(y), Number(mo) - 1, 1);
  return d.toLocaleString("en-US", { month: "short", year: "2-digit" }).replace(" ", " '");
}

export function AnalyticsSection() {
  const { data, isLoading } = useGetAnalytics();

  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-72 w-full" />
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-72 w-full" />
          <Skeleton className="h-72 w-full" />
        </div>
      </div>
    );
  }

  const monthlyDisplay = data.monthly.map((m) => ({ ...m, label: fmtMonth(m.month) }));
  const totalExpenses = data.expensesByCategory.reduce((s, e) => s + e.amount, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <TrendingUp className="h-5 w-5 text-primary" />
        <h3 className="text-xl font-semibold tracking-tight">Executive Reports</h3>
      </div>

      {/* KPI strip */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Stores</CardTitle>
            <StoreIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.kpis.totalStores}</div>
            <p className="text-xs text-muted-foreground mt-1">
              <span className="font-medium text-foreground">{data.kpis.activeStoresLast30Days}</span> active in last 30 days
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Revenue / Store</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.kpis.avgRevenuePerStore.toFixed(2)} JD</div>
            <p className="text-xs text-muted-foreground mt-1">All-time, per active store</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Packs / Delivery</CardTitle>
            <Receipt className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.kpis.avgPacksPerDelivery.toFixed(1)}</div>
            <p className="text-xs text-muted-foreground mt-1">Average drop size</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Gross Margin</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {data.kpis.grossMargin == null ? "—" : `${(data.kpis.grossMargin * 100).toFixed(1)}%`}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Revenue minus all costs</p>
          </CardContent>
        </Card>
      </div>

      {/* Revenue & Orders by month */}
      <Card>
        <CardHeader>
          <CardTitle>Revenue & Orders — Month over Month</CardTitle>
          <CardDescription>Revenue (bars) vs. number of deliveries (line)</CardDescription>
        </CardHeader>
        <CardContent>
          {monthlyDisplay.length === 0 ? (
            <EmptyState message="No deliveries yet — log a delivery to see trends." />
          ) : (
            <div className="h-72 w-full">
              <ResponsiveContainer>
                <ComposedChart data={monthlyDisplay} margin={{ top: 8, right: 24, left: 8, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} className="text-xs" />
                  <YAxis yAxisId="left" tickLine={false} axisLine={false} className="text-xs" />
                  <YAxis yAxisId="right" orientation="right" tickLine={false} axisLine={false} className="text-xs" />
                  <Tooltip
                    contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                    formatter={(v: number, name: string) => name === "Revenue (JD)" ? [`${v.toFixed(2)} JD`, name] : [v, name]}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar yAxisId="left" dataKey="revenue" name="Revenue (JD)" fill="hsl(var(--chart-1))" radius={[6, 6, 0, 0]} />
                  <Line yAxisId="right" type="monotone" dataKey="deliveriesCount" name="Deliveries" stroke="hsl(var(--chart-2))" strokeWidth={2} dot={{ r: 3 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Money In vs Out + Net */}
      <Card>
        <CardHeader>
          <CardTitle>Cash Flow — Money In vs Out</CardTitle>
          <CardDescription>Cash collected vs. expenses + restock costs each month, plus net</CardDescription>
        </CardHeader>
        <CardContent>
          {monthlyDisplay.length === 0 ? (
            <EmptyState message="No cash activity yet." />
          ) : (
            <div className="h-72 w-full">
              <ResponsiveContainer>
                <ComposedChart data={monthlyDisplay} margin={{ top: 8, right: 24, left: 8, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} className="text-xs" />
                  <YAxis tickLine={false} axisLine={false} className="text-xs" />
                  <Tooltip
                    contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                    formatter={(v: number, name: string) => [`${v.toFixed(2)} JD`, name]}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="collected" name="Money In" fill="hsl(var(--chart-2))" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="restockCost" name="Restocks" fill="hsl(var(--chart-3))" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="expenses" name="Expenses" fill="hsl(var(--chart-4))" radius={[6, 6, 0, 0]} />
                  <Line type="monotone" dataKey="netCash" name="Net" stroke="hsl(var(--chart-1))" strokeWidth={2} dot={{ r: 3 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Two-up: Expenses pie + New stores bar */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Expenses by Category</CardTitle>
            <CardDescription>
              {totalExpenses === 0 ? "No expenses logged yet" : `${totalExpenses.toFixed(2)} JD total`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {data.expensesByCategory.length === 0 ? (
              <EmptyState message="Log expenses on the Operations page." />
            ) : (
              <div className="h-64 w-full">
                <ResponsiveContainer>
                  <PieChart>
                    <Tooltip
                      contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                      formatter={(v: number, name: string) => [`${v.toFixed(2)} JD`, name]}
                    />
                    <Pie
                      data={data.expensesByCategory}
                      dataKey="amount"
                      nameKey="category"
                      innerRadius={50}
                      outerRadius={90}
                      paddingAngle={2}
                    >
                      {data.expensesByCategory.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>New Stores Acquired</CardTitle>
            <CardDescription>Stores ordering from us for the first time, by month</CardDescription>
          </CardHeader>
          <CardContent>
            {monthlyDisplay.length === 0 ? (
              <EmptyState message="No store activity yet." />
            ) : (
              <div className="h-64 w-full">
                <ResponsiveContainer>
                  <BarChart data={monthlyDisplay} margin={{ top: 8, right: 24, left: 8, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} className="text-xs" />
                    <YAxis allowDecimals={false} tickLine={false} axisLine={false} className="text-xs" />
                    <Tooltip
                      contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                    />
                    <Bar dataKey="newStores" name="New stores" fill="hsl(var(--chart-2))" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top stores + Outstanding */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-amber-500" />
              Top Stores by Revenue
            </CardTitle>
            <CardDescription>Best 5 customers, all-time</CardDescription>
          </CardHeader>
          <CardContent>
            {data.topStoresByRevenue.length === 0 || data.topStoresByRevenue[0]!.revenue === 0 ? (
              <EmptyState message="No store revenue yet." />
            ) : (
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead>#</TableHead>
                      <TableHead>Store</TableHead>
                      <TableHead className="text-right">Packs</TableHead>
                      <TableHead className="text-right">Revenue</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.topStoresByRevenue.map((s, i) => (
                      <TableRow key={s.storeId}>
                        <TableCell className="font-medium">{i + 1}</TableCell>
                        <TableCell>{s.storeName}</TableCell>
                        <TableCell className="text-right">{s.packsDelivered}</TableCell>
                        <TableCell className="text-right font-medium">{s.revenue.toFixed(2)} JD</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-accent" />
              Outstanding by Store
            </CardTitle>
            <CardDescription>Money still to be collected</CardDescription>
          </CardHeader>
          <CardContent>
            {data.outstandingByStore.length === 0 ? (
              <EmptyState message="Everyone is paid up. " />
            ) : (
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead>Store</TableHead>
                      <TableHead className="text-right">Outstanding</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.outstandingByStore.map((s) => (
                      <TableRow key={s.storeId}>
                        <TableCell className="font-medium">{s.storeName}</TableCell>
                        <TableCell className="text-right">
                          <Badge variant="outline" className="text-accent border-accent/30">
                            {s.outstanding.toFixed(2)} JD
                          </Badge>
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

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
      {message}
    </div>
  );
}
