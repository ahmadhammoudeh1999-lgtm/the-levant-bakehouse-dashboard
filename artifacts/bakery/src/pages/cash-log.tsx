import { useMemo, useState } from "react";
import { format } from "date-fns";
import { parseLocalDate, todayLocalISO } from "@/lib/utils";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  useListCash,
  useDeleteCash,
  useListOps,
  useDeleteOps,
  useListRestocks,
  useDeleteRestock,
  useListExpenses,
  useDeleteExpense,
  useListStores,
  useCreateCash,
  useCreateExpense,
  getListCashQueryKey,
  getListOpsQueryKey,
  getListRestocksQueryKey,
  getListExpensesQueryKey,
  getGetDashboardQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ArrowDownCircle, ArrowUpCircle, Trash2, Wallet, Receipt, Package, Truck, TrendingUp, Download, Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { downloadXLSX, timestampedFilename, type Sheet } from "@/lib/exports";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const paymentSchema = z.object({
  date: z.string().min(1, "Date is required"),
  storeId: z.coerce.number().min(1, "Store is required"),
  amount: z.coerce.number().min(0.01, "Amount must be > 0"),
  note: z.string().optional(),
});

const expenseSchema = z.object({
  date: z.string().min(1, "Date is required"),
  category: z.string().min(1, "Category is required"),
  amount: z.coerce.number().min(0.01, "Amount must be > 0"),
  note: z.string().optional(),
});

const EXPENSE_CATEGORIES = [
  "Ingredients",
  "Packaging",
  "Fuel / transport",
  "Utilities",
  "Rent",
  "Equipment",
  "Marketing",
  "Wages",
  "Other",
];

type LedgerEntry = {
  key: string;
  date: string;
  createdAt: string;
  direction: "in" | "out";
  source: "delivery_payment" | "later_payment" | "restock" | "expense";
  label: string;
  detail: string;
  amount: number;
  note: string | null;
  onDelete?: () => void;
};

const SOURCE_META: Record<LedgerEntry["source"], { label: string; icon: React.ComponentType<{ className?: string }>; color: string }> = {
  delivery_payment: { label: "Delivery", icon: Truck, color: "text-emerald-700 bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-300" },
  later_payment: { label: "Payment", icon: Wallet, color: "text-emerald-700 bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-300" },
  restock: { label: "Restock", icon: Package, color: "text-amber-700 bg-amber-100 dark:bg-amber-900/30 dark:text-amber-300" },
  expense: { label: "Expense", icon: Receipt, color: "text-rose-700 bg-rose-100 dark:bg-rose-900/30 dark:text-rose-300" },
};

export function CashLogPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: cashList, isLoading: l1 } = useListCash();
  const { data: ops, isLoading: l2 } = useListOps();
  const { data: restocks, isLoading: l3 } = useListRestocks();
  const { data: expenses, isLoading: l4 } = useListExpenses();
  const { data: stores } = useListStores();

  const deleteCash = useDeleteCash();
  const deleteOps = useDeleteOps();
  const deleteRestock = useDeleteRestock();
  const deleteExpense = useDeleteExpense();
  const createCash = useCreateCash();
  const createExpense = useCreateExpense();

  const [payOpen, setPayOpen] = useState(false);
  const [expOpen, setExpOpen] = useState(false);

  const submitPayment = (values: z.infer<typeof paymentSchema>) => {
    createCash.mutate(
      { data: { date: values.date, storeId: values.storeId, amount: values.amount, note: values.note?.trim() || null } },
      {
        onSuccess: () => {
          toast({ description: "Payment logged." });
          queryClient.invalidateQueries({ queryKey: getListCashQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
          setPayOpen(false);
        },
      }
    );
  };

  const submitExpense = (values: z.infer<typeof expenseSchema>) => {
    createExpense.mutate(
      { data: { date: values.date, category: values.category.trim(), amount: values.amount, note: values.note?.trim() || null } },
      {
        onSuccess: () => {
          toast({ description: "Expense logged." });
          queryClient.invalidateQueries({ queryKey: getListExpensesQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
          setExpOpen(false);
        },
      }
    );
  };

  const isLoading = l1 || l2 || l3 || l4;

  const storeName = (id: number | null | undefined) =>
    stores?.find((s) => s.id === id)?.name ?? "Unknown store";

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: getListCashQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListOpsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListRestocksQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListExpensesQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
  };

  const entries = useMemo<LedgerEntry[]>(() => {
    const list: LedgerEntry[] = [];

    // Money IN — payments collected at delivery
    for (const o of ops ?? []) {
      if (o.kind === "delivery" && (o.paid ?? 0) > 0) {
        list.push({
          key: `ops-${o.id}`,
          date: o.date,
          createdAt: o.createdAt ?? "",
          direction: "in",
          source: "delivery_payment",
          label: "Paid at delivery",
          detail: storeName(o.storeId),
          amount: Number(o.paid),
          note: o.note ?? null,
          onDelete: () => {
            if (!confirm("This payment was logged with a delivery. Deleting it will remove the entire delivery entry too. Continue?")) return;
            deleteOps.mutate({ id: o.id }, {
              onSuccess: () => { toast({ description: "Delivery (and its payment) deleted." }); invalidateAll(); },
            });
          },
        });
      }
    }

    // Money IN — later payments
    for (const c of cashList ?? []) {
      list.push({
        key: `cash-${c.id}`,
        date: c.date,
        createdAt: c.createdAt ?? "",
        direction: "in",
        source: "later_payment",
        label: "Later payment",
        detail: c.storeName ?? storeName(c.storeId),
        amount: Number(c.amount),
        note: c.note ?? null,
        onDelete: () => {
          if (!confirm("Delete this payment?")) return;
          deleteCash.mutate({ id: c.id }, {
            onSuccess: () => { toast({ description: "Payment deleted." }); invalidateAll(); },
          });
        },
      });
    }

    // Money OUT — restocks (sum of item prices)
    for (const r of restocks ?? []) {
      const items = (r.items ?? []) as Array<{ name: string; qtyKg: number; price?: number | null }>;
      const total = items.reduce((sum, it) => sum + (Number(it.price) || 0), 0);
      if (total <= 0) continue;
      const summary = items
        .filter((it) => Number(it.price) > 0)
        .map((it) => `${it.name} (${it.qtyKg}kg)`)
        .join(", ");
      list.push({
        key: `restock-${r.id}`,
        date: r.date,
        createdAt: r.createdAt ?? "",
        direction: "out",
        source: "restock",
        label: "Raw materials",
        detail: summary || `${items.length} item${items.length === 1 ? "" : "s"}`,
        amount: total,
        note: r.notes ?? null,
        onDelete: () => {
          if (!confirm("Delete this restock? Inventory levels will also update.")) return;
          deleteRestock.mutate({ id: r.id }, {
            onSuccess: () => { toast({ description: "Restock deleted." }); invalidateAll(); },
          });
        },
      });
    }

    // Money OUT — expenses
    for (const e of expenses ?? []) {
      list.push({
        key: `expense-${e.id}`,
        date: e.date,
        createdAt: e.createdAt ?? "",
        direction: "out",
        source: "expense",
        label: e.category,
        detail: "Expense",
        amount: Number(e.amount),
        note: e.note ?? null,
        onDelete: () => {
          if (!confirm("Delete this expense?")) return;
          deleteExpense.mutate({ id: e.id }, {
            onSuccess: () => { toast({ description: "Expense deleted." }); invalidateAll(); },
          });
        },
      });
    }

    list.sort((a, b) =>
      b.date.localeCompare(a.date) ||
      b.createdAt.localeCompare(a.createdAt) ||
      b.key.localeCompare(a.key)
    );
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cashList, ops, restocks, expenses, stores]);

  const buildAccountingSheets = (): Sheet[] => {
    const ledger = entries.map((e) => ({
      Date: e.date,
      Direction: e.direction === "in" ? "Money In" : "Money Out",
      Type: SOURCE_META[e.source].label,
      Label: e.label,
      Detail: e.detail,
      Amount_JD: Number(e.amount.toFixed(2)),
      Note: e.note ?? "",
      LoggedAt: e.createdAt,
    }));

    const cashRows = (cashList ?? []).map((c) => ({
      ID: c.id,
      Date: c.date,
      Store: c.storeName ?? storeName(c.storeId),
      StoreID: c.storeId,
      Amount_JD: Number(Number(c.amount).toFixed(2)),
      Note: c.note ?? "",
      LoggedAt: c.createdAt ?? "",
    }));

    const expenseRows = (expenses ?? []).map((e) => ({
      ID: e.id,
      Date: e.date,
      Category: e.category,
      Amount_JD: Number(Number(e.amount).toFixed(2)),
      Note: e.note ?? "",
      LoggedAt: e.createdAt ?? "",
    }));

    const restockRows: Array<Record<string, string | number>> = [];
    for (const r of restocks ?? []) {
      const items = (r.items ?? []) as Array<{ name: string; qtyKg: number; price?: number | null }>;
      for (const it of items) {
        restockRows.push({
          RestockID: r.id,
          Date: r.date,
          Material: it.name,
          QtyKg: Number(Number(it.qtyKg).toFixed(3)),
          Price_JD: Number(Number(it.price ?? 0).toFixed(2)),
          Notes: r.notes ?? "",
          LoggedAt: r.createdAt ?? "",
        });
      }
    }

    return [
      { name: "Ledger", rows: ledger },
      { name: "Cash Payments", rows: cashRows },
      { name: "Expenses", rows: expenseRows },
      { name: "Restocks", rows: restockRows },
    ];
  };

  const handleExportAll = () => {
    downloadXLSX(timestampedFilename("accounting"), buildAccountingSheets());
    toast({ description: "Accounting workbook downloaded." });
  };

  const handleExportSingle = (which: "Ledger" | "Cash Payments" | "Expenses" | "Restocks") => {
    const sheets = buildAccountingSheets().filter((s) => s.name === which);
    downloadXLSX(timestampedFilename(which.toLowerCase().replace(/\s+/g, "-")), sheets);
    toast({ description: `${which} downloaded.` });
  };

  const totals = useMemo(() => {
    let inSum = 0, outSum = 0;
    for (const e of entries) {
      if (e.direction === "in") inSum += e.amount;
      else outSum += e.amount;
    }
    return { inSum, outSum, net: inSum - outSum };
  }, [entries]);

  if (isLoading) {
    return <div className="space-y-4"><Skeleton className="h-32 w-full" /><Skeleton className="h-96 w-full" /></div>;
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Cash Log</h2>
          <p className="text-muted-foreground">Every payment received and every cost paid, in one place.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="default" className="gap-2" onClick={() => setPayOpen(true)}>
            <Plus className="w-4 h-4" /> Log Payment
          </Button>
          <Button variant="outline" className="gap-2" onClick={() => setExpOpen(true)}>
            <Plus className="w-4 h-4" /> Log Expense
          </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="gap-2" disabled={entries.length === 0}>
              <Download className="w-4 h-4" /> Export to Excel
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuLabel>Export accounting data</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleExportAll}>
              Everything (workbook with all sheets)
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => handleExportSingle("Ledger")}>
              Unified ledger only
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleExportSingle("Cash Payments")}>
              Cash payments only
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleExportSingle("Expenses")}>
              Expenses only
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleExportSingle("Restocks")}>
              Restocks only
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="bg-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Money In</CardTitle>
            <ArrowDownCircle className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">{totals.inSum.toFixed(2)} JD</div>
            <p className="text-xs text-muted-foreground mt-1">Payments at delivery + later payments</p>
          </CardContent>
        </Card>
        <Card className="bg-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Money Out</CardTitle>
            <ArrowUpCircle className="h-4 w-4 text-rose-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-rose-700 dark:text-rose-400">{totals.outSum.toFixed(2)} JD</div>
            <p className="text-xs text-muted-foreground mt-1">Raw material restocks + expenses</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-primary/20">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Net</CardTitle>
            <TrendingUp className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${totals.net >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400"}`}>
              {totals.net >= 0 ? "" : "-"}{Math.abs(totals.net).toFixed(2)} JD
            </div>
            <p className="text-xs text-muted-foreground mt-1">In minus out (cash basis)</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All transactions</CardTitle>
        </CardHeader>
        <CardContent>
          {entries.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p>No money has moved yet.</p>
              <p className="text-sm mt-1">Log a delivery, a payment, a restock, or an expense from the Daily Log page.</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="w-[120px]">Date</TableHead>
                    <TableHead className="w-[120px]">Type</TableHead>
                    <TableHead>Detail</TableHead>
                    <TableHead className="text-right w-[140px]">Amount</TableHead>
                    <TableHead className="w-[60px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((e) => {
                    const meta = SOURCE_META[e.source];
                    const Icon = meta.icon;
                    const isIn = e.direction === "in";
                    return (
                      <TableRow key={e.key}>
                        <TableCell className="whitespace-nowrap text-sm">
                          {format(parseLocalDate(e.date), "MMM d, yyyy")}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={`${meta.color} border-0 gap-1 font-medium`}>
                            <Icon className="w-3 h-3" />
                            {meta.label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{e.label}</div>
                          <div className="text-xs text-muted-foreground">
                            {e.detail}
                            {e.note ? ` · ${e.note}` : ""}
                          </div>
                        </TableCell>
                        <TableCell className={`text-right font-semibold tabular-nums ${isIn ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400"}`}>
                          {isIn ? "+" : "−"}{e.amount.toFixed(2)} JD
                        </TableCell>
                        <TableCell>
                          {e.onDelete && (
                            <Button variant="ghost" size="icon" onClick={e.onDelete} className="h-8 w-8">
                              <Trash2 className="w-4 h-4 text-destructive" />
                            </Button>
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

      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Log a Payment</DialogTitle>
            <DialogDescription>Record money received from a store after a delivery.</DialogDescription>
          </DialogHeader>
          {payOpen && (
            <PaymentDialogForm
              stores={stores ?? []}
              isLoading={createCash.isPending}
              onSubmit={submitPayment}
              onCancel={() => setPayOpen(false)}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={expOpen} onOpenChange={setExpOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Log an Expense</DialogTitle>
            <DialogDescription>Record an operating cost (fuel, packaging, rent, etc.).</DialogDescription>
          </DialogHeader>
          {expOpen && (
            <ExpenseDialogForm
              isLoading={createExpense.isPending}
              onSubmit={submitExpense}
              onCancel={() => setExpOpen(false)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PaymentDialogForm({
  stores,
  isLoading,
  onSubmit,
  onCancel,
}: {
  stores: Array<{ id: number; name: string }>;
  isLoading: boolean;
  onSubmit: (v: z.infer<typeof paymentSchema>) => void;
  onCancel: () => void;
}) {
  const form = useForm<z.infer<typeof paymentSchema>>({
    resolver: zodResolver(paymentSchema),
    defaultValues: { date: todayLocalISO(), storeId: undefined as unknown as number, amount: 0, note: "" },
  });
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField control={form.control} name="date" render={({ field }) => (
          <FormItem>
            <FormLabel>Date</FormLabel>
            <FormControl><Input type="date" {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <FormField control={form.control} name="storeId" render={({ field }) => (
          <FormItem>
            <FormLabel>Store</FormLabel>
            <Select onValueChange={field.onChange} value={field.value?.toString()}>
              <FormControl><SelectTrigger><SelectValue placeholder="Select a store" /></SelectTrigger></FormControl>
              <SelectContent>
                {stores.map(s => <SelectItem key={s.id} value={s.id.toString()}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )} />
        <FormField control={form.control} name="amount" render={({ field }) => (
          <FormItem>
            <FormLabel>Amount (JD)</FormLabel>
            <FormControl><Input type="number" step="0.01" {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <FormField control={form.control} name="note" render={({ field }) => (
          <FormItem>
            <FormLabel>Notes (optional)</FormLabel>
            <FormControl><Input placeholder="E.g. Settled last week's invoice" {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <p className="text-xs text-muted-foreground -mt-2">
          Use this for payments collected after delivery. Same-day payments go on the delivery itself.
        </p>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
          <Button type="submit" disabled={isLoading}>{isLoading ? "Saving..." : "Save Payment"}</Button>
        </div>
      </form>
    </Form>
  );
}

function ExpenseDialogForm({
  isLoading,
  onSubmit,
  onCancel,
}: {
  isLoading: boolean;
  onSubmit: (v: z.infer<typeof expenseSchema>) => void;
  onCancel: () => void;
}) {
  const form = useForm<z.infer<typeof expenseSchema>>({
    resolver: zodResolver(expenseSchema),
    defaultValues: { date: todayLocalISO(), category: "", amount: 0, note: "" },
  });
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField control={form.control} name="date" render={({ field }) => (
          <FormItem>
            <FormLabel>Date</FormLabel>
            <FormControl><Input type="date" {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <FormField control={form.control} name="category" render={({ field }) => (
          <FormItem>
            <FormLabel>Category</FormLabel>
            <Select onValueChange={field.onChange} value={field.value || undefined}>
              <FormControl><SelectTrigger><SelectValue placeholder="Pick a category" /></SelectTrigger></FormControl>
              <SelectContent>
                {EXPENSE_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )} />
        <FormField control={form.control} name="amount" render={({ field }) => (
          <FormItem>
            <FormLabel>Amount (JD)</FormLabel>
            <FormControl><Input type="number" step="0.01" {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <FormField control={form.control} name="note" render={({ field }) => (
          <FormItem>
            <FormLabel>Notes (optional)</FormLabel>
            <FormControl><Input placeholder="E.g. Diesel for the van" {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
          <Button type="submit" disabled={isLoading}>{isLoading ? "Saving..." : "Save Expense"}</Button>
        </div>
      </form>
    </Form>
  );
}
