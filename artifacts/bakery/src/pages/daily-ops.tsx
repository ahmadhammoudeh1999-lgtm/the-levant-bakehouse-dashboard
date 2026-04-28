import { useState, useMemo, useEffect } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { format } from "date-fns";
import { todayLocalISO, parseLocalDate, downloadCSV } from "@/lib/utils";
import { downloadXLSX, timestampedFilename } from "@/lib/exports";
import {
  useListOps,
  useCreateOps,
  useUpdateOps,
  useDeleteOps,
  useListStores,
  useCreateStore,
  getListStoresQueryKey,
  useGetSettings,
  useListRecipes,
  useListRestocks,
  useCreateRestock,
  useDeleteRestock,
  useListCash,
  useCreateCash,
  useDeleteCash,
  useGetStoreHistory,
  getGetStoreHistoryQueryKey,
  useListExpenses,
  useCreateExpense,
  useDeleteExpense,
  listRestocks,
  getGetDashboardQueryKey,
  getListOpsQueryKey,
  getListRestocksQueryKey,
  getListCashQueryKey,
  getListExpensesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Wheat, Truck, Trash2, Calendar, FileText, Package, Plus, Download, Wallet, Receipt, Store as StoreIcon } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const productionSchema = z.object({
  date: z.string().min(1, "Date is required"),
  batchUnits: z.coerce.number().min(0.01, "Units must be > 0"),
  packType: z.enum(["regular", "marketing"]),
  note: z.string().optional(),
});

const deliverySchema = z.object({
  date: z.string().min(1, "Date is required"),
  storeId: z.coerce.number().min(1, "Store is required"),
  deliveredPacks: z.coerce.number().min(0),
  returnedPacks: z.coerce.number().min(0),
  samples: z.coerce.number().min(0),
  paid: z.coerce.number().min(0),
  note: z.string().optional(),
});

const restockSchema = z.object({
  date: z.string().min(1, "Date is required"),
  items: z.array(z.object({
    name: z.string().min(1, "Required"),
    qtyKg: z.coerce.number(),
    price: z.coerce.number().min(0, "Must be >= 0"),
  })).min(1, "Add at least one item"),
  notes: z.string().optional(),
});

const paymentSchema = z.object({
  date: z.string().min(1, "Date is required"),
  storeId: z.coerce.number().min(1, "Store is required"),
  amount: z.coerce.number().min(0.01, "Amount must be > 0"),
  note: z.string().optional(),
});

const storeSchema = z.object({
  name: z.string().min(1, "Name is required"),
  address: z.string().optional(),
  contact: z.string().optional(),
  phone: z.string().optional(),
  history: z.string().optional(),
});

const expenseSchema = z.object({
  date: z.string().min(1, "Date is required"),
  category: z.string().min(1, "Category is required"),
  amount: z.coerce.number().min(0.01, "Amount must be > 0"),
  note: z.string().optional(),
});

export function DailyOpsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: ops, isLoading: isLoadingOps } = useListOps();
  const { data: stores, isLoading: isLoadingStores } = useListStores();
  const { data: settings } = useGetSettings();
  const { data: recipes } = useListRecipes();
  const { data: restocks } = useListRestocks();
  const { data: cashList } = useListCash();
  const { data: expenses } = useListExpenses();

  const createOps = useCreateOps();
  const createStore = useCreateStore();
  const updateOps = useUpdateOps();
  const deleteOps = useDeleteOps();
  const createRestock = useCreateRestock();
  const deleteRestock = useDeleteRestock();
  const createCash = useCreateCash();
  const deleteCash = useDeleteCash();
  const createExpense = useCreateExpense();
  const deleteExpense = useDeleteExpense();

  const [isProductionOpen, setIsProductionOpen] = useState(false);
  const [isDeliveryOpen, setIsDeliveryOpen] = useState(false);
  const [isRestockOpen, setIsRestockOpen] = useState(false);
  const [isStoreOpen, setIsStoreOpen] = useState(false);
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);
  const [isExpenseOpen, setIsExpenseOpen] = useState(false);

  const currentRecipe = recipes?.[0];
  const lastRestock = restocks?.[0];

  const pricePerPack = settings?.pricePerPack || 1.0;

  const handleSuccess = (message: string) => {
    toast({ description: message });
    queryClient.invalidateQueries({ queryKey: getListOpsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
  };

  type ActivityItem = {
    key: string;
    date: string;
    sortRank: number;
    createdAt: string;
    icon: LucideIcon;
    badge: string;
    badgeClass: string;
    title: React.ReactNode;
    detail?: React.ReactNode;
    note?: string | null;
    onDelete: () => void;
  };

  const storeNameById = (id: number | null | undefined) =>
    stores?.find((s) => s.id === id)?.name ?? "Unknown store";

  const confirmDelete = (msg: string, fn: () => void) => () => {
    if (confirm(msg)) fn();
  };

  const groupedActivity = useMemo(() => {
    const groups: Record<string, ActivityItem[]> = {};
    const push = (item: ActivityItem) => {
      (groups[item.date] ||= []).push(item);
    };

    for (const o of ops ?? []) {
      if (o.kind === "production") {
        push({
          key: `ops-${o.id}`,
          date: o.date,
          sortRank: 0,
          createdAt: o.createdAt ?? "",
          icon: Wheat,
          badge: "Batch",
          badgeClass: "text-primary",
          title: (
            <p className="font-medium">
              Baked {o.batchUnits} units
              <span className={`ml-2 inline-block text-xs px-2 py-0.5 rounded ${o.packType === "marketing" ? "bg-accent/15 text-accent" : "bg-primary/15 text-primary"}`}>
                {o.packType === "marketing" ? "Marketing" : "Regular"}
              </span>
            </p>
          ),
          note: o.note,
          onDelete: confirmDelete("Delete this batch?", () => deleteOps.mutate({ id: o.id }, { onSuccess: () => handleSuccess("Entry deleted.") })),
        });
      } else {
        push({
          key: `ops-${o.id}`,
          date: o.date,
          sortRank: 1,
          createdAt: o.createdAt ?? "",
          icon: Truck,
          badge: "Deliv",
          badgeClass: "text-accent",
          title: <p className="font-medium">Delivered to <span className="text-accent">{o.storeName}</span></p>,
          detail: (
            <p className="text-sm text-muted-foreground">
              {o.deliveredPacks} packs
              {o.returnedPacks ? ` • ${o.returnedPacks} returned` : ""}
              {" • "}{o.samples} marketing packs • {o.paid?.toFixed(2)} JD paid
            </p>
          ),
          note: o.note,
          onDelete: confirmDelete("Delete this delivery?", () => deleteOps.mutate({ id: o.id }, { onSuccess: () => handleSuccess("Entry deleted.") })),
        });
      }
    }

    for (const c of cashList ?? []) {
      push({
        key: `cash-${c.id}`,
        date: c.date,
        sortRank: 2,
        createdAt: c.createdAt ?? "",
        icon: Wallet,
        badge: "Pmt",
        badgeClass: "text-emerald-700 dark:text-emerald-400",
        title: (
          <p className="font-medium">
            Payment from <span className="text-emerald-700 dark:text-emerald-400">{c.storeName ?? storeNameById(c.storeId)}</span>
            <span className="ml-2 font-semibold">+{Number(c.amount).toFixed(2)} JD</span>
          </p>
        ),
        note: c.note,
        onDelete: confirmDelete("Delete this payment?", () => deleteCash.mutate({ id: c.id }, {
          onSuccess: () => {
            toast({ description: "Payment deleted." });
            queryClient.invalidateQueries({ queryKey: getListCashQueryKey() });
            queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
          },
        })),
      });
    }

    for (const r of restocks ?? []) {
      const items = (r.items ?? []) as Array<{ name: string; qtyKg: number; price?: number | null }>;
      const total = items.reduce((sum, it) => sum + (Number(it.price) || 0), 0);
      const summary = items.map((it) => `${it.name} (${it.qtyKg}kg)`).join(", ");
      push({
        key: `restock-${r.id}`,
        date: r.date,
        sortRank: 3,
        createdAt: r.createdAt ?? "",
        icon: Package,
        badge: "Stock",
        badgeClass: "text-amber-700 dark:text-amber-400",
        title: (
          <p className="font-medium">
            Restocked raw materials
            {total > 0 && <span className="ml-2 font-semibold text-rose-700 dark:text-rose-400">−{total.toFixed(2)} JD</span>}
          </p>
        ),
        detail: <p className="text-sm text-muted-foreground">{summary}</p>,
        note: r.notes,
        onDelete: confirmDelete("Delete this restock? Inventory levels will update.", () => deleteRestock.mutate({ id: r.id }, {
          onSuccess: () => {
            toast({ description: "Restock deleted." });
            queryClient.invalidateQueries({ queryKey: getListRestocksQueryKey() });
            queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
          },
        })),
      });
    }

    for (const e of expenses ?? []) {
      push({
        key: `expense-${e.id}`,
        date: e.date,
        sortRank: 4,
        createdAt: e.createdAt ?? "",
        icon: Receipt,
        badge: "Exp",
        badgeClass: "text-rose-700 dark:text-rose-400",
        title: (
          <p className="font-medium">
            {e.category}
            <span className="ml-2 font-semibold text-rose-700 dark:text-rose-400">−{Number(e.amount).toFixed(2)} JD</span>
          </p>
        ),
        note: e.note,
        onDelete: confirmDelete("Delete this expense?", () => deleteExpense.mutate({ id: e.id }, {
          onSuccess: () => {
            toast({ description: "Expense deleted." });
            queryClient.invalidateQueries({ queryKey: getListExpensesQueryKey() });
          },
        })),
      });
    }

    for (const date in groups) {
      groups[date].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.key.localeCompare(a.key));
    }
    return groups;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ops, cashList, restocks, expenses, stores]);

  const sortedDates = Object.keys(groupedActivity).sort((a, b) => b.localeCompare(a));

  const onProductionSubmit = (values: z.infer<typeof productionSchema>) => {
    createOps.mutate({
      data: {
        kind: "production",
        date: values.date,
        batchUnits: values.batchUnits,
        packType: values.packType,
        note: values.note || null,
      }
    }, {
      onSuccess: () => {
        handleSuccess("Batch logged successfully.");
        setIsProductionOpen(false);
      }
    });
  };

  const onDeliverySubmit = (values: z.infer<typeof deliverySchema>) => {
    createOps.mutate({
      data: {
        kind: "delivery",
        date: values.date,
        storeId: values.storeId,
        deliveredPacks: values.deliveredPacks,
        returnedPacks: values.returnedPacks,
        samples: values.samples,
        paid: values.paid,
        note: values.note || null,
      }
    }, {
      onSuccess: () => {
        handleSuccess("Delivery logged successfully.");
        setIsDeliveryOpen(false);
      }
    });
  };

  const onPaymentSubmit = (values: z.infer<typeof paymentSchema>) => {
    createCash.mutate({
      data: {
        date: values.date,
        storeId: values.storeId,
        amount: values.amount,
        note: values.note?.trim() ? values.note.trim() : null,
      },
    }, {
      onSuccess: () => {
        toast({ description: "Payment logged successfully." });
        queryClient.invalidateQueries({ queryKey: getListCashQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
        setIsPaymentOpen(false);
      },
    });
  };

  const onExpenseSubmit = (values: z.infer<typeof expenseSchema>) => {
    createExpense.mutate({
      data: {
        date: values.date,
        category: values.category.trim(),
        amount: values.amount,
        note: values.note?.trim() ? values.note.trim() : null,
      },
    }, {
      onSuccess: () => {
        toast({ description: "Expense logged successfully." });
        queryClient.invalidateQueries({ queryKey: getListExpensesQueryKey() });
        setIsExpenseOpen(false);
      },
    });
  };

  const onStoreSubmit = (values: z.infer<typeof storeSchema>) => {
    createStore.mutate({
      data: {
        name: values.name,
        address: values.address?.trim() || null,
        contact: values.contact?.trim() || null,
        phone: values.phone?.trim() || null,
        history: values.history?.trim() || null,
      },
    }, {
      onSuccess: () => {
        toast({ description: "Store added successfully." });
        queryClient.invalidateQueries({ queryKey: getListStoresQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
        setIsStoreOpen(false);
      },
    });
  };

  const onRestockSubmit = (values: z.infer<typeof restockSchema>) => {
    const nonZero = values.items.filter((i) => Number(i.qtyKg) !== 0);
    if (nonZero.length === 0) {
      toast({ description: "Enter a non-zero quantity for at least one item.", variant: "destructive" });
      return;
    }
    createRestock.mutate({
      data: {
        date: values.date,
        items: nonZero,
        notes: values.notes?.trim() ? values.notes.trim() : null,
      },
    }, {
      onSuccess: () => {
        toast({ description: `Restock logged for ${values.date}.` });
        queryClient.invalidateQueries({ queryKey: getListRestocksQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
        setIsRestockOpen(false);
      },
    });
  };

  const onExportRestocksCSV = async () => {
    const fresh = await listRestocks();
    if (!fresh?.length) {
      toast({ description: "No restocks to export yet." });
      return;
    }
    queryClient.setQueryData(getListRestocksQueryKey(), fresh);
    const allNames = Array.from(new Set(fresh.flatMap(r => (r.items ?? []).map(i => i.name))));
    const header: string[] = ["Date"];
    for (const n of allNames) {
      header.push(`${n} (kg)`, `${n} price`);
    }
    header.push("Total price", "Notes");
    const sorted = [...fresh].sort((a, b) => a.date.localeCompare(b.date));
    const rows: (string | number | null)[][] = [header];
    for (const r of sorted) {
      const byName = new Map((r.items ?? []).map(i => [i.name, i] as const));
      const cells: (string | number | null)[] = [r.date];
      let total = 0;
      for (const n of allNames) {
        const it = byName.get(n);
        cells.push(it?.qtyKg ?? "", it?.price ?? "");
        if (typeof it?.price === "number") total += it.price;
      }
      cells.push(total, r.notes ?? "");
      rows.push(cells);
    }
    downloadCSV(`inventory-restocks-${todayLocalISO()}.csv`, rows);
  };

  const handleDelete = (id: number) => {
    if (confirm("Are you sure you want to delete this entry?")) {
      deleteOps.mutate({ id }, {
        onSuccess: () => handleSuccess("Entry deleted.")
      });
    }
  };

  if (isLoadingOps || isLoadingStores) {
    return <div className="space-y-4"><Skeleton className="h-20 w-full" /><Skeleton className="h-64 w-full" /></div>;
  }

  return (
    <div className="space-y-10 animate-in fade-in duration-500">
      <div className="relative text-center space-y-1">
        <h2 className="text-2xl font-bold tracking-tight">Operations</h2>
        <p className="text-muted-foreground">What did you bake, restock, or deliver today?</p>
        <div className="sm:absolute sm:right-0 sm:top-0 mt-2 sm:mt-0 flex justify-center">
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            disabled={(ops?.length ?? 0) === 0 && (restocks?.length ?? 0) === 0}
            onClick={() => {
              try {
                const productionRows = (ops ?? [])
                  .filter((o) => o.kind === "production")
                  .map((o) => ({
                    ID: o.id,
                    Date: o.date,
                    BatchUnits: o.batchUnits ?? "",
                    PackType: o.packType ?? "",
                    Note: o.note ?? "",
                    LoggedAt: o.createdAt ?? "",
                  }));
                const deliveryRows = (ops ?? [])
                  .filter((o) => o.kind === "delivery")
                  .map((o) => ({
                    ID: o.id,
                    Date: o.date,
                    Store: stores?.find((s) => s.id === o.storeId)?.name ?? o.storeName ?? "Unknown",
                    StoreID: o.storeId ?? "",
                    PackType: o.packType ?? "",
                    PacksDelivered: o.deliveredPacks ?? "",
                    Returned: o.returnedPacks ?? "",
                    SamplesIncluded: o.samples ?? "",
                    PaidAtDelivery_JD: Number(Number(o.paid ?? 0).toFixed(2)),
                    Note: o.note ?? "",
                    LoggedAt: o.createdAt ?? "",
                  }));
                const restockSheetRows: Array<Record<string, string | number>> = [];
                for (const r of restocks ?? []) {
                  const items = (r.items ?? []) as Array<{ name: string; qtyKg: number; price?: number | null }>;
                  for (const it of items) {
                    restockSheetRows.push({
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
                const storesRows = (stores ?? []).map((s) => ({
                  ID: s.id,
                  Name: s.name,
                  Phone: s.phone ?? "",
                  Contact: s.contact ?? "",
                  Address: s.address ?? "",
                  History: s.history ?? "",
                }));
                downloadXLSX(timestampedFilename("operations"), [
                  { name: "Production", rows: productionRows },
                  { name: "Deliveries", rows: deliveryRows },
                  { name: "Restocks", rows: restockSheetRows },
                  { name: "Stores", rows: storesRows },
                ]);
                toast({ description: "Operations workbook downloaded." });
              } catch (err) {
                toast({ description: "Export failed.", variant: "destructive" });
              }
            }}
          >
            <Download className="w-4 h-4" /> Export to Excel
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-6 gap-4 max-w-6xl mx-auto">
        <Dialog open={isProductionOpen} onOpenChange={setIsProductionOpen}>
          <DialogTrigger asChild>
            <button
              type="button"
              className="group relative flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-primary/30 bg-primary/5 hover:bg-primary/10 hover:border-primary hover:shadow-lg active:scale-[0.98] transition-all duration-150 px-6 py-8 text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              <div className="rounded-full bg-primary/15 group-hover:bg-primary/25 transition-colors p-4">
                <Wheat className="w-8 h-8" />
              </div>
              <div className="text-center">
                <div className="font-semibold text-lg">Log a Batch</div>
                <div className="text-xs text-muted-foreground mt-0.5">A baking session</div>
              </div>
            </button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Log a Batch</DialogTitle>
            </DialogHeader>
            <ProductionForm onSubmit={onProductionSubmit} isLoading={createOps.isPending} />
          </DialogContent>
        </Dialog>

        <Dialog open={isRestockOpen} onOpenChange={setIsRestockOpen}>
          <DialogTrigger asChild>
            <button
              type="button"
              className="group relative flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/10 hover:border-amber-500 hover:shadow-lg active:scale-[0.98] transition-all duration-150 px-6 py-8 text-amber-700 dark:text-amber-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
            >
              <div className="rounded-full bg-amber-500/15 group-hover:bg-amber-500/25 transition-colors p-4">
                <Package className="w-8 h-8" />
              </div>
              <div className="text-center">
                <div className="font-semibold text-lg">Log a Restock</div>
                <div className="text-xs text-muted-foreground mt-0.5">Bought raw materials</div>
              </div>
            </button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Log a Restock</DialogTitle>
            </DialogHeader>
            <RestockForm
              recipeIngredients={(currentRecipe?.ingredients ?? []).map((i) => i.name)}
              lastRestockDate={lastRestock?.date}
              hasAnyRestocks={Boolean(restocks && restocks.length > 0)}
              onExportCSV={onExportRestocksCSV}
              onSubmit={onRestockSubmit}
              isLoading={createRestock.isPending}
            />
          </DialogContent>
        </Dialog>

        <Dialog open={isDeliveryOpen} onOpenChange={setIsDeliveryOpen}>
          <DialogTrigger asChild>
            <button
              type="button"
              className="group relative flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-accent/30 bg-accent/5 hover:bg-accent/10 hover:border-accent hover:shadow-lg active:scale-[0.98] transition-all duration-150 px-6 py-8 text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
            >
              <div className="rounded-full bg-accent/15 group-hover:bg-accent/25 transition-colors p-4">
                <Truck className="w-8 h-8" />
              </div>
              <div className="text-center">
                <div className="font-semibold text-lg">Log a Delivery</div>
                <div className="text-xs text-muted-foreground mt-0.5">Dropped off packs</div>
              </div>
            </button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Log a Delivery</DialogTitle>
            </DialogHeader>
            {stores?.length === 0 ? (
              <Alert>
                <AlertTitle>No Stores</AlertTitle>
                <AlertDescription>Please add a store in Setup first before logging a delivery.</AlertDescription>
              </Alert>
            ) : (
              <DeliveryForm stores={stores || []} pricePerPack={pricePerPack} onSubmit={onDeliverySubmit} isLoading={createOps.isPending} />
            )}
          </DialogContent>
        </Dialog>

        <Dialog open={isPaymentOpen} onOpenChange={setIsPaymentOpen}>
          <DialogTrigger asChild>
            <button
              type="button"
              className="group relative flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-emerald-600/30 bg-emerald-600/5 hover:bg-emerald-600/10 hover:border-emerald-600 hover:shadow-lg active:scale-[0.98] transition-all duration-150 px-6 py-8 text-emerald-700 dark:text-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2"
            >
              <div className="rounded-full bg-emerald-600/15 group-hover:bg-emerald-600/25 transition-colors p-4">
                <Wallet className="w-8 h-8" />
              </div>
              <div className="text-center">
                <div className="font-semibold text-lg">Log Money Received</div>
                <div className="text-xs text-muted-foreground mt-0.5">Payment from a store</div>
              </div>
            </button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Log Money Received</DialogTitle>
            </DialogHeader>
            {stores?.length === 0 ? (
              <Alert>
                <AlertTitle>No Stores</AlertTitle>
                <AlertDescription>Please add a store in Setup first before logging a payment.</AlertDescription>
              </Alert>
            ) : (
              <PaymentForm stores={stores || []} onSubmit={onPaymentSubmit} isLoading={createCash.isPending} />
            )}
          </DialogContent>
        </Dialog>

        <Dialog open={isStoreOpen} onOpenChange={setIsStoreOpen}>
          <DialogTrigger asChild>
            <button
              type="button"
              className="group relative flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-sky-600/30 bg-sky-600/5 hover:bg-sky-600/10 hover:border-sky-600 hover:shadow-lg active:scale-[0.98] transition-all duration-150 px-6 py-8 text-sky-700 dark:text-sky-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 focus-visible:ring-offset-2"
            >
              <div className="rounded-full bg-sky-600/15 group-hover:bg-sky-600/25 transition-colors p-4">
                <StoreIcon className="w-8 h-8" />
              </div>
              <div className="text-center">
                <div className="font-semibold text-lg">Add a Store</div>
                <div className="text-xs text-muted-foreground mt-0.5">A new customer</div>
              </div>
            </button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Add a New Store</DialogTitle>
            </DialogHeader>
            <StoreForm onSubmit={onStoreSubmit} isLoading={createStore.isPending} />
          </DialogContent>
        </Dialog>

        <Dialog open={isExpenseOpen} onOpenChange={setIsExpenseOpen}>
          <DialogTrigger asChild>
            <button
              type="button"
              className="group relative flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-rose-600/30 bg-rose-600/5 hover:bg-rose-600/10 hover:border-rose-600 hover:shadow-lg active:scale-[0.98] transition-all duration-150 px-6 py-8 text-rose-700 dark:text-rose-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-600 focus-visible:ring-offset-2"
            >
              <div className="rounded-full bg-rose-600/15 group-hover:bg-rose-600/25 transition-colors p-4">
                <Receipt className="w-8 h-8" />
              </div>
              <div className="text-center">
                <div className="font-semibold text-lg">Log Money Spent</div>
                <div className="text-xs text-muted-foreground mt-0.5">An expense</div>
              </div>
            </button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Log Money Spent</DialogTitle>
            </DialogHeader>
            <ExpenseForm onSubmit={onExpenseSubmit} isLoading={createExpense.isPending} />
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-6">
        {sortedDates.length === 0 ? (
          <div className="text-center py-12 border border-dashed rounded-lg bg-card text-muted-foreground">
            <Calendar className="mx-auto h-12 w-12 opacity-20 mb-4" />
            <h3 className="text-lg font-medium text-foreground">No entries yet</h3>
            <p>Your batches, deliveries, payments, restocks, and expenses will appear here.</p>
          </div>
        ) : (
          sortedDates.map((date) => (
            <div key={date} className="space-y-4">
              <h3 className="font-semibold text-lg flex items-center gap-2 border-b pb-2">
                <Calendar className="w-5 h-5 text-muted-foreground" />
                {format(parseLocalDate(date), "EEEE, MMMM d, yyyy")}
              </h3>
              <div className="grid gap-3">
                {groupedActivity[date].map((item) => {
                  const Icon = item.icon;
                  return (
                    <Card key={item.key} className="overflow-hidden">
                      <div className="flex flex-col sm:flex-row">
                        <div className="p-4 bg-muted/30 flex items-center justify-center sm:w-24 border-b sm:border-b-0 sm:border-r border-border shrink-0">
                          <div className={`flex flex-col items-center ${item.badgeClass}`}>
                            <Icon className="w-6 h-6 mb-1" />
                            <span className="text-xs font-semibold uppercase">{item.badge}</span>
                          </div>
                        </div>
                        <div className="p-4 flex-1 flex flex-col justify-center space-y-1">
                          {item.title}
                          {item.detail}
                          {item.note && <p className="text-sm text-muted-foreground flex items-center gap-1"><FileText className="w-3 h-3" /> {item.note}</p>}
                        </div>
                        <div className="p-4 border-t sm:border-t-0 sm:border-l border-border flex items-center justify-end gap-2 bg-muted/10 shrink-0">
                          <Button variant="ghost" size="icon" onClick={item.onDelete}>
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function ProductionForm({ onSubmit, isLoading }: { onSubmit: (v: any) => void, isLoading: boolean }) {
  const { data: settings } = useGetSettings();
  const form = useForm<z.infer<typeof productionSchema>>({
    resolver: zodResolver(productionSchema),
    defaultValues: {
      date: todayLocalISO(),
      batchUnits: 0,
      packType: "regular",
      note: "",
    },
  });

  const packType = form.watch("packType");
  const batchUnits = Number(form.watch("batchUnits") || 0);
  const ppi = packType === "marketing"
    ? (settings?.marketingPacksPerInputUnit ?? 15)
    : (settings?.packsPerInputUnit ?? 5);
  const lpp = packType === "marketing"
    ? (settings?.marketingLoavesPerPack ?? 2)
    : (settings?.loavesPerPack ?? 6);
  const totalPacks = Math.round(batchUnits * ppi);
  const totalLoaves = Math.round(batchUnits * ppi * lpp);

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="date"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Date</FormLabel>
              <FormControl>
                <Input type="date" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="packType"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Pack Type</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select pack type" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="regular">Regular (sold)</SelectItem>
                  <SelectItem value="marketing">Marketing (free giveaway)</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="batchUnits"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Batch Units</FormLabel>
              <FormControl>
                <Input type="number" step="0.01" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {batchUnits > 0 && (
          <p className="text-xs text-muted-foreground bg-muted/30 rounded px-3 py-2">
            {batchUnits} input units → <span className="font-medium text-foreground">{totalPacks} {packType} packs</span> ({totalLoaves} loaves)
          </p>
        )}
        <FormField
          control={form.control}
          name="note"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Notes (Optional)</FormLabel>
              <FormControl>
                <Input placeholder="E.g. Extra crusty today" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="pt-4 flex justify-end">
          <Button type="submit" disabled={isLoading}>
            {isLoading ? "Saving..." : "Save Batch"}
          </Button>
        </div>
      </form>
    </Form>
  );
}

function DeliveryForm({ stores, pricePerPack, onSubmit, isLoading }: { stores: any[], pricePerPack: number, onSubmit: (v: any) => void, isLoading: boolean }) {
  const form = useForm<z.infer<typeof deliverySchema>>({
    resolver: zodResolver(deliverySchema),
    defaultValues: {
      date: todayLocalISO(),
      storeId: undefined,
      deliveredPacks: 0,
      returnedPacks: 0,
      samples: 0,
      paid: 0,
      note: "",
    },
  });

  const watchStoreId = form.watch("storeId");
  const watchDelivered = form.watch("deliveredPacks");
  const watchReturned = form.watch("returnedPacks");
  const watchPaid = form.watch("paid");

  const deliveredPacks = Number(watchDelivered) || 0;
  const returnedPacks = Number(watchReturned) || 0;
  const paidAmount = Number(watchPaid) || 0;
  const deliveryCost = deliveredPacks * pricePerPack;
  const returnedValue = -returnedPacks * pricePerPack;

  const selectedStoreId = Number(watchStoreId) || 0;
  const { data: storeHistory } = useGetStoreHistory(
    selectedStoreId,
    {},
    {
      query: {
        enabled: selectedStoreId > 0,
        queryKey: getGetStoreHistoryQueryKey(selectedStoreId, {}),
      },
    }
  );
  const previousOutstanding: number | null =
    selectedStoreId > 0 && storeHistory?.summary
      ? Number(storeHistory.summary.outstandingTotal) || 0
      : null;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="date"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Date</FormLabel>
              <FormControl>
                <Input type="date" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="storeId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Store</FormLabel>
              <Select onValueChange={field.onChange} value={field.value?.toString()}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a store" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {stores.map(store => (
                    <SelectItem key={store.id} value={store.id.toString()}>{store.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="grid grid-cols-3 gap-3">
          <FormField
            control={form.control}
            name="deliveredPacks"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Packs</FormLabel>
                <FormControl>
                  <Input type="number" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="returnedPacks"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Returned</FormLabel>
                <FormControl>
                  <Input type="number" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="samples"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Marketing packs</FormLabel>
                <FormControl>
                  <Input type="number" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <p className="text-xs text-muted-foreground -mt-2">
          Returned = packs the store gave back unsold from a previous visit (no charge).
        </p>
        <div className="bg-muted/50 p-3 rounded-md text-sm space-y-1">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Previous outstanding for this store:</span>
            <span className={`font-medium ${previousOutstanding === null ? "text-muted-foreground" : previousOutstanding > 0.005 ? "text-accent" : "text-emerald-700 dark:text-emerald-400"}`}>
              {previousOutstanding === null ? "— pick a store —" : `${previousOutstanding.toFixed(2)} JD`}
            </span>
          </div>
          <div className="flex justify-between border-t border-border/50 pt-1 mt-1">
            <span className="text-muted-foreground">Cost for this delivery:</span>
            <span className="font-medium">{deliveryCost.toFixed(2)} JD</span>
          </div>
          <div className="flex justify-between border-t border-border/50 pt-1 mt-1">
            <span className="text-muted-foreground">Returned bread:</span>
            <span className={`font-medium ${returnedValue < 0 ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground"}`}>
              {returnedValue.toFixed(2)} JD
            </span>
          </div>
          <div className="flex justify-between border-t border-border pt-2 mt-1">
            <span className="text-foreground font-medium">Total Due:</span>
            <span className={`font-semibold ${previousOutstanding === null ? "text-muted-foreground" : ((previousOutstanding ?? 0) + deliveryCost + returnedValue) > 0.005 ? "text-accent" : "text-emerald-700 dark:text-emerald-400"}`}>
              {previousOutstanding === null ? "—" : `${((previousOutstanding ?? 0) + deliveryCost + returnedValue).toFixed(2)} JD`}
            </span>
          </div>
        </div>

        <FormField
          control={form.control}
          name="paid"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Paid (JD)</FormLabel>
              <FormControl>
                <Input type="number" step="0.01" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {previousOutstanding !== null && (
          <div className="bg-muted/50 p-3 rounded-md text-sm">
            <div className="flex justify-between">
              <span className="text-foreground font-medium">New total outstanding after this trip:</span>
              <span className={`font-semibold ${(previousOutstanding + deliveryCost + returnedValue - paidAmount) > 0.005 ? "text-accent" : "text-emerald-700 dark:text-emerald-400"}`}>
                {(previousOutstanding + deliveryCost + returnedValue - paidAmount).toFixed(2)} JD
              </span>
            </div>
          </div>
        )}

        <FormField
          control={form.control}
          name="note"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Notes (Optional)</FormLabel>
              <FormControl>
                <Input placeholder="E.g. Store owner wasn't there" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="pt-4 flex justify-end">
          <Button type="submit" disabled={isLoading}>
            {isLoading ? "Saving..." : "Save Delivery"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
function RestockForm({
  recipeIngredients,
  lastRestockDate,
  hasAnyRestocks,
  onExportCSV,
  onSubmit,
  isLoading,
}: {
  recipeIngredients: string[];
  lastRestockDate?: string;
  hasAnyRestocks: boolean;
  onExportCSV: () => void;
  onSubmit: (v: z.infer<typeof restockSchema>) => void;
  isLoading: boolean;
}) {
  const form = useForm<z.infer<typeof restockSchema>>({
    resolver: zodResolver(restockSchema),
    defaultValues: {
      date: todayLocalISO(),
      items: recipeIngredients.length
        ? recipeIngredients.map((name) => ({ name, qtyKg: 0, price: 0 }))
        : [{ name: "", qtyKg: 0, price: 0 }],
      notes: "",
    },
  });
  const fields = useFieldArray({ control: form.control, name: "items" });

  useEffect(() => {
    if (recipeIngredients.length && fields.fields.length === 0) {
      form.reset({
        date: todayLocalISO(),
        items: recipeIngredients.map((name) => ({ name, qtyKg: 0, price: 0 })),
        notes: "",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipeIngredients]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs text-muted-foreground">
          {lastRestockDate ? (
            <>Last restock: <span className="font-medium text-foreground">
              {parseLocalDate(lastRestockDate).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}
            </span></>
          ) : "No restocks logged yet."}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1"
          onClick={onExportCSV}
          disabled={!hasAnyRestocks}
        >
          <Download className="w-4 h-4" />
          Export CSV
        </Button>
      </div>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
          <FormField
            control={form.control}
            name="date"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs">Restock date</FormLabel>
                <FormControl>
                  <Input type="date" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="space-y-2">
            {fields.fields.map((field, index) => (
              <div key={field.id} className="flex items-end gap-2">
                <FormField
                  control={form.control}
                  name={`items.${index}.name`}
                  render={({ field: f }) => (
                    <FormItem className="flex-1">
                      {index === 0 && <FormLabel className="text-xs">Raw material</FormLabel>}
                      <FormControl>
                        <Input placeholder="Ingredient name" {...f} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name={`items.${index}.qtyKg`}
                  render={({ field: f }) => (
                    <FormItem className="w-28">
                      {index === 0 && <FormLabel className="text-xs">Qty (kg)</FormLabel>}
                      <FormControl>
                        <Input type="number" step="0.001" placeholder="negative for waste" {...f} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name={`items.${index}.price`}
                  render={({ field: f }) => (
                    <FormItem className="w-24">
                      {index === 0 && <FormLabel className="text-xs">Price</FormLabel>}
                      <FormControl>
                        <Input type="number" step="0.01" min="0" placeholder="0.00" {...f} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 shrink-0"
                  onClick={() => fields.remove(index)}
                  aria-label="Remove item"
                >
                  <Trash2 className="w-4 h-4 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fields.append({ name: "", qtyKg: 0, price: 0 })}
              className="gap-1"
            >
              <Plus className="w-4 h-4" />
              Add Item
            </Button>
          </div>
          <FormField
            control={form.control}
            name="notes"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs">Notes (optional)</FormLabel>
                <FormControl>
                  <Textarea
                    rows={2}
                    placeholder="E.g. Bought from supplier X. Price per kg went up by 5%."
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="pt-2 flex justify-end">
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "Saving..." : "Log Restock"}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}

function PaymentForm({ stores, onSubmit, isLoading }: { stores: any[], onSubmit: (v: any) => void, isLoading: boolean }) {
  const form = useForm<z.infer<typeof paymentSchema>>({
    resolver: zodResolver(paymentSchema),
    defaultValues: {
      date: todayLocalISO(),
      storeId: undefined,
      amount: 0,
      note: "",
    },
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="date"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Date</FormLabel>
              <FormControl>
                <Input type="date" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="storeId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Store</FormLabel>
              <Select onValueChange={field.onChange} value={field.value?.toString()}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a store" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {stores.map(store => (
                    <SelectItem key={store.id} value={store.id.toString()}>{store.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="amount"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Amount (JD)</FormLabel>
              <FormControl>
                <Input type="number" step="0.01" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="note"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Notes (optional)</FormLabel>
              <FormControl>
                <Input placeholder="E.g. Check #123, settled last week's invoice" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <p className="text-xs text-muted-foreground -mt-2">
          Use this for payments collected after delivery. Same-day payments go on the delivery itself.
        </p>
        <div className="pt-2 flex justify-end">
          <Button type="submit" disabled={isLoading}>
            {isLoading ? "Saving..." : "Save Payment"}
          </Button>
        </div>
      </form>
    </Form>
  );
}

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

function ExpenseForm({ onSubmit, isLoading }: { onSubmit: (v: any) => void, isLoading: boolean }) {
  const form = useForm<z.infer<typeof expenseSchema>>({
    resolver: zodResolver(expenseSchema),
    defaultValues: {
      date: todayLocalISO(),
      category: "",
      amount: 0,
      note: "",
    },
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="date"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Date</FormLabel>
              <FormControl>
                <Input type="date" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="category"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Category</FormLabel>
              <Select onValueChange={field.onChange} value={field.value || undefined}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Pick a category" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {EXPENSE_CATEGORIES.map(c => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="amount"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Amount (JD)</FormLabel>
              <FormControl>
                <Input type="number" step="0.01" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="note"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Notes (optional)</FormLabel>
              <FormControl>
                <Input placeholder="E.g. Diesel for the van" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="pt-2 flex justify-end">
          <Button type="submit" disabled={isLoading}>
            {isLoading ? "Saving..." : "Save Expense"}
          </Button>
        </div>
      </form>
    </Form>
  );
}

function StoreForm({ onSubmit, isLoading }: { onSubmit: (v: any) => void, isLoading: boolean }) {
  const form = useForm<z.infer<typeof storeSchema>>({
    resolver: zodResolver(storeSchema),
    defaultValues: { name: "", address: "", contact: "", phone: "", history: "" },
  });
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField control={form.control} name="name" render={({ field }) => (
          <FormItem>
            <FormLabel>Name</FormLabel>
            <FormControl><Input placeholder="Supermarket Al-Amal" {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <FormField control={form.control} name="address" render={({ field }) => (
          <FormItem>
            <FormLabel>Store Address (optional)</FormLabel>
            <FormControl><Input placeholder="Street, neighborhood, city" {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <FormField control={form.control} name="contact" render={({ field }) => (
          <FormItem>
            <FormLabel>Contact Name (optional)</FormLabel>
            <FormControl><Input placeholder="e.g. Abu Khaled, store manager" {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <FormField control={form.control} name="phone" render={({ field }) => (
          <FormItem>
            <FormLabel>Contact Phone (optional)</FormLabel>
            <FormControl><Input placeholder="079..." {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <FormField control={form.control} name="history" render={({ field }) => (
          <FormItem>
            <FormLabel>Notes (optional)</FormLabel>
            <FormControl><Input placeholder="Payment habits, preferences, anything worth remembering..." {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <div className="pt-2 flex justify-end">
          <Button type="submit" disabled={isLoading}>
            {isLoading ? "Saving..." : "Save Store"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
