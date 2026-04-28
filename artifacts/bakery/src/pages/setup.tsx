import { useState, useEffect } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  useGetSettings,
  useCreateSettingsVersion,
  useListStores,
  useCreateStore,
  useUpdateStore,
  useDeleteStore,
  useListRecipes,
  useCreateRecipe,
  useListCriticalLevels,
  useReplaceCriticalLevels,
  getGetSettingsQueryKey,
  getListStoresQueryKey,
  getListRecipesQueryKey,
  getListCriticalLevelsQueryKey,
  getGetDashboardQueryKey
} from "@workspace/api-client-react";
import type { Store } from "@workspace/api-client-react";
import { todayLocalISO, parseLocalDate, downloadCSV } from "@/lib/utils";
import { downloadXLSX, timestampedFilename } from "@/lib/exports";
import {
  listOps,
  listCash,
  listExpenses,
  listRestocks,
  listStores as fetchAllStores,
  listRecipes as fetchAllRecipes,
  listCriticalLevels,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Settings as SettingsIcon, Store as StoreIcon, BookOpen, Trash2, Plus, Pencil, Download, AlertTriangle } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

const settingsSchema = z.object({
  effectiveDate: z.string().min(1, "Effective date is required"),
  pricePerPack: z.coerce.number().min(0.01, "Price must be > 0"),
  loavesPerPack: z.coerce.number().int().min(1, "Must be >= 1"),
  packsPerInputUnit: z.coerce.number().int().min(1, "Must be >= 1"),
  marketingLoavesPerPack: z.coerce.number().int().min(1, "Must be >= 1"),
  marketingPacksPerInputUnit: z.coerce.number().int().min(1, "Must be >= 1"),
});

const recipeSchema = z.object({
  effectiveDate: z.string().min(1, "Effective date is required"),
  recipe: z.array(z.object({
    name: z.string().min(1, "Required"),
    qtyKg: z.coerce.number().min(0, "Must be >= 0"),
  })).min(1, "Recipe needs at least one ingredient"),
  notes: z.string().optional(),
});

const criticalSchema = z.object({
  items: z.array(z.object({
    name: z.string().min(1, "Required"),
    thresholdKg: z.coerce.number().min(0, "Must be >= 0"),
  })),
});

function exportRecipesCSV(recipes: Array<{ effectiveDate: string; createdAt: string; ingredients: Array<{ name: string; qtyKg: number }>; notes?: string | null }>) {
  if (!recipes.length) return;
  const header = ["Effective Date", "Created At", "Ingredients", "Notes"];
  const sorted = [...recipes].sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate));
  const rows: (string | number | null)[][] = [header];
  for (const r of sorted) {
    const ing = (r.ingredients ?? []).map(i => `${i.name}: ${i.qtyKg} kg`).join("; ");
    rows.push([r.effectiveDate, r.createdAt, ing, r.notes ?? ""]);
  }
  downloadCSV(`recipes-${todayLocalISO()}.csv`, rows);
}

const storeSchema = z.object({
  name: z.string().min(1, "Name is required"),
  address: z.string().optional(),
  contact: z.string().optional(),
  phone: z.string().optional(),
  history: z.string().optional(),
});

export function SetupPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: settings, isLoading: isLoadingSettings } = useGetSettings();
  const { data: stores, isLoading: isLoadingStores } = useListStores();
  const { data: recipes } = useListRecipes();

  const updateSettings = useCreateSettingsVersion();
  const createStore = useCreateStore();
  const updateStore = useUpdateStore();
  const deleteStore = useDeleteStore();
  const createRecipe = useCreateRecipe();
  const { data: criticalLevels } = useListCriticalLevels();
  const replaceCriticalLevels = useReplaceCriticalLevels();

  const currentRecipe = recipes?.[0];

  const [isStoreOpen, setIsStoreOpen] = useState(false);
  const [editingStore, setEditingStore] = useState<Store | null>(null);

  const settingsForm = useForm<z.infer<typeof settingsSchema>>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      effectiveDate: todayLocalISO(),
      pricePerPack: 1.0,
      loavesPerPack: 6,
      packsPerInputUnit: 5,
      marketingLoavesPerPack: 2,
      marketingPacksPerInputUnit: 15,
    },
  });

  const recipeForm = useForm<z.infer<typeof recipeSchema>>({
    resolver: zodResolver(recipeSchema),
    defaultValues: { effectiveDate: todayLocalISO(), recipe: [], notes: "" },
  });

  const recipeFields = useFieldArray({ control: recipeForm.control, name: "recipe" });

  const criticalForm = useForm<z.infer<typeof criticalSchema>>({
    resolver: zodResolver(criticalSchema),
    defaultValues: { items: [] },
  });
  const criticalFields = useFieldArray({ control: criticalForm.control, name: "items" });

  const storeForm = useForm<z.infer<typeof storeSchema>>({
    resolver: zodResolver(storeSchema),
    defaultValues: {
      name: "",
      address: "",
      contact: "",
      phone: "",
      history: "",
    },
  });

  useEffect(() => {
    if (settings) {
      settingsForm.reset({
        effectiveDate: todayLocalISO(),
        pricePerPack: settings.pricePerPack,
        loavesPerPack: settings.loavesPerPack,
        packsPerInputUnit: settings.packsPerInputUnit,
        marketingLoavesPerPack: settings.marketingLoavesPerPack ?? 2,
        marketingPacksPerInputUnit: settings.marketingPacksPerInputUnit ?? 15,
      });
    }
  }, [settings, settingsForm]);

  useEffect(() => {
    if (currentRecipe) {
      const ingredients = currentRecipe.ingredients ?? [];
      recipeForm.reset({ effectiveDate: todayLocalISO(), recipe: ingredients, notes: "" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentRecipe]);

  useEffect(() => {
    // Build the critical-thresholds form from the union of recipe ingredients
    // and any saved thresholds, so users see one row per material.
    const recipeNames = (currentRecipe?.ingredients ?? []).map((i) => i.name);
    const savedByName = new Map((criticalLevels ?? []).map((c) => [c.name, c.thresholdKg]));
    const allNames = Array.from(new Set([...recipeNames, ...savedByName.keys()]));
    if (allNames.length === 0) return;
    const items = allNames.map((name) => ({ name, thresholdKg: savedByName.get(name) ?? 0 }));
    criticalForm.reset({ items });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentRecipe, criticalLevels]);

  const onCriticalSubmit = (values: z.infer<typeof criticalSchema>) => {
    const items = values.items
      .map((i) => ({ name: i.name.trim(), thresholdKg: Number(i.thresholdKg) }))
      .filter((i) => i.name.length > 0);
    replaceCriticalLevels.mutate({ data: { items } }, {
      onSuccess: () => {
        toast({ description: "Critical stock levels saved." });
        queryClient.invalidateQueries({ queryKey: getListCriticalLevelsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
      },
    });
  };

  const onSettingsSubmit = (values: z.infer<typeof settingsSchema>) => {
    updateSettings.mutate({
      data: values,
    }, {
      onSuccess: () => {
        toast({ description: `New settings saved, effective ${values.effectiveDate}. Past entries are unchanged.` });
        queryClient.invalidateQueries({ queryKey: getGetSettingsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
      },
    });
  };

  const onRecipeSubmit = (values: z.infer<typeof recipeSchema>) => {
    createRecipe.mutate({
      data: {
        effectiveDate: values.effectiveDate,
        ingredients: values.recipe,
        notes: values.notes?.trim() ? values.notes.trim() : null,
      },
    }, {
      onSuccess: () => {
        toast({ description: `New recipe saved, effective ${values.effectiveDate}. Past entries are unchanged.` });
        queryClient.invalidateQueries({ queryKey: getListRecipesQueryKey() });
      },
    });
  };

  const closeStoreDialog = () => {
    setIsStoreOpen(false);
    setEditingStore(null);
    storeForm.reset({ name: "", address: "", contact: "", phone: "", history: "" });
  };

  const nextStoreId = (stores ?? []).reduce((max, s) => (s.id > max ? s.id : max), 0) + 1;

  const openCreateStore = () => {
    setEditingStore(null);
    storeForm.reset({ name: "", address: "", contact: "", phone: "", history: "" });
    setIsStoreOpen(true);
  };

  const openEditStore = (store: Store) => {
    setEditingStore(store);
    storeForm.reset({
      name: store.name,
      address: store.address ?? "",
      contact: store.contact ?? "",
      phone: store.phone ?? "",
      history: store.history ?? "",
    });
    setIsStoreOpen(true);
  };

  const onStoreSubmit = (values: z.infer<typeof storeSchema>) => {
    const data = {
      name: values.name,
      address: values.address || null,
      contact: values.contact || null,
      phone: values.phone || null,
      history: values.history || null,
    };
    const onSuccess = (description: string) => {
      toast({ description });
      closeStoreDialog();
      queryClient.invalidateQueries({ queryKey: getListStoresQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
    };
    if (editingStore) {
      updateStore.mutate(
        { id: editingStore.id, data },
        { onSuccess: () => onSuccess("Store updated.") }
      );
    } else {
      createStore.mutate(
        { data },
        { onSuccess: () => onSuccess("Store added successfully.") }
      );
    }
  };

  const handleDeleteStore = (id: number) => {
    if (confirm("Are you sure you want to delete this store? It may break existing records.")) {
      deleteStore.mutate({ id }, {
        onSuccess: () => {
          toast({ description: "Store deleted." });
          queryClient.invalidateQueries({ queryKey: getListStoresQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
        }
      });
    }
  };

  if (isLoadingSettings || isLoadingStores) {
    return <div className="space-y-4"><Skeleton className="h-64 w-full" /></div>;
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Settings</h2>
          <p className="text-muted-foreground">Manage your settings, prices, and stores.</p>
        </div>
        <Button
          variant="outline"
          onClick={async () => {
            try {
              const versionsRes = await fetch("/api/settings/versions");
              const settingsVersions = versionsRes.ok ? await versionsRes.json() : [];
              const [opsRows, cashRows, expensesRows, restocksRows, storesRows, recipesRows, criticalRows] = await Promise.all([
                listOps(),
                listCash(),
                listExpenses(),
                listRestocks(),
                fetchAllStores(),
                fetchAllRecipes(),
                listCriticalLevels(),
              ]);
              const storeNameById = new Map<number, string>(
                (storesRows as any[]).map((s) => [s.id, s.name])
              );
              const ledger: Array<Record<string, string | number | null>> = [];
              for (const o of opsRows as any[]) {
                if (o.kind === "delivery" && Number(o.paid) > 0) {
                  ledger.push({
                    Date: o.date,
                    Direction: "Money In",
                    Type: "Paid at delivery",
                    Store: o.storeName ?? storeNameById.get(o.storeId) ?? "",
                    Amount: Number(o.paid),
                    Note: o.note ?? "",
                    SourceTable: "bakery_ops",
                    SourceId: o.id,
                    CreatedAt: o.createdAt ?? "",
                  });
                }
              }
              for (const c of cashRows as any[]) {
                ledger.push({
                  Date: c.date,
                  Direction: "Money In",
                  Type: "Later payment",
                  Store: c.storeName ?? storeNameById.get(c.storeId) ?? "",
                  Amount: Number(c.amount),
                  Note: c.note ?? "",
                  SourceTable: "bakery_cash",
                  SourceId: c.id,
                  CreatedAt: c.createdAt ?? "",
                });
              }
              for (const r of restocksRows as any[]) {
                const items = (r.items ?? []) as Array<{ name: string; qtyKg: number; price?: number | null }>;
                const total = items.reduce((sum, it) => sum + (Number(it.price) || 0), 0);
                if (total <= 0) continue;
                ledger.push({
                  Date: r.date,
                  Direction: "Money Out",
                  Type: "Raw materials (restock)",
                  Store: "",
                  Amount: total,
                  Note: r.notes ?? "",
                  SourceTable: "bakery_restocks",
                  SourceId: r.id,
                  CreatedAt: r.createdAt ?? "",
                });
              }
              for (const e of expensesRows as any[]) {
                ledger.push({
                  Date: e.date,
                  Direction: "Money Out",
                  Type: e.category,
                  Store: "",
                  Amount: Number(e.amount),
                  Note: e.note ?? "",
                  SourceTable: "bakery_expenses",
                  SourceId: e.id,
                  CreatedAt: e.createdAt ?? "",
                });
              }
              ledger.sort((a, b) =>
                String(b.Date).localeCompare(String(a.Date)) ||
                String(b.CreatedAt).localeCompare(String(a.CreatedAt))
              );

              const sheets = [
                {
                  name: "Cash Log (Combined)",
                  rows: ledger,
                },
                {
                  name: "Stores",
                  rows: (storesRows as any[]).map((s) => ({
                    id: s.id, name: s.name, address: s.address ?? "",
                    contact: s.contact ?? "", phone: s.phone ?? "", history: s.history ?? "",
                  })),
                },
                {
                  name: "Ops (Production & Deliveries)",
                  rows: (opsRows as any[]).map((o) => ({
                    id: o.id, date: o.date, kind: o.kind,
                    storeId: o.storeId ?? "", storeName: o.storeName ?? "",
                    batchUnits: o.batchUnits ?? "", packType: o.packType ?? "",
                    deliveredPacks: o.deliveredPacks ?? "", returnedPacks: o.returnedPacks ?? "",
                    samples: o.samples ?? "", paid: o.paid ?? "",
                    note: o.note ?? "", createdAt: o.createdAt ?? "",
                  })),
                },
                {
                  name: "Cash Payments",
                  rows: (cashRows as any[]).map((c) => ({
                    id: c.id, date: c.date, storeId: c.storeId, storeName: c.storeName ?? "",
                    amount: c.amount, note: c.note ?? "", createdAt: c.createdAt ?? "",
                  })),
                },
                {
                  name: "Expenses",
                  rows: (expensesRows as any[]).map((e) => ({
                    id: e.id, date: e.date, category: e.category,
                    amount: e.amount, note: e.note ?? "", createdAt: e.createdAt ?? "",
                  })),
                },
                {
                  name: "Restocks",
                  rows: (restocksRows as any[]).flatMap((r) =>
                    ((r.items ?? []) as Array<{ name: string; qtyKg: number }>).map((it) => ({
                      restockId: r.id, date: r.date, ingredient: it.name, qtyKg: it.qtyKg,
                      notes: r.notes ?? "", createdAt: r.createdAt ?? "",
                    }))
                  ),
                },
                {
                  name: "Recipes",
                  rows: (recipesRows as any[]).flatMap((r) =>
                    ((r.ingredients ?? []) as Array<{ name: string; qtyKg: number }>).map((it) => ({
                      recipeId: r.id, effectiveDate: r.effectiveDate,
                      ingredient: it.name, qtyKg: it.qtyKg,
                      notes: r.notes ?? "", createdAt: r.createdAt ?? "",
                    }))
                  ),
                },
                {
                  name: "Settings Versions",
                  rows: (settingsVersions as any[]).map((v) => ({
                    id: v.id, effectiveDate: v.effectiveDate, pricePerPack: v.pricePerPack,
                    loavesPerPack: v.loavesPerPack, packsPerInputUnit: v.packsPerInputUnit,
                    marketingLoavesPerPack: v.marketingLoavesPerPack,
                    marketingPacksPerInputUnit: v.marketingPacksPerInputUnit,
                    createdAt: v.createdAt ?? "",
                  })),
                },
                {
                  name: "Critical Levels",
                  rows: (criticalRows as any[]).map((c) => ({
                    name: c.name, thresholdKg: c.thresholdKg,
                  })),
                },
              ];
              downloadXLSX(timestampedFilename("bakery-all-data"), sheets);
              toast({ title: "Export complete", description: "All raw data downloaded." });
            } catch (err) {
              toast({ title: "Export failed", description: String(err), variant: "destructive" });
            }
          }}
        >
          <Download className="w-4 h-4 mr-2" />
          Export all data (Excel)
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <SettingsIcon className="w-5 h-5" />
              General
            </CardTitle>
            <CardDescription>
              Saving creates a new version that applies going forward only — past entries keep the values that were in effect on their date.
            </CardDescription>
            {settings?.effectiveDate && (
              <div className="text-xs text-muted-foreground pt-1">
                Last updated: <span className="font-medium text-foreground">
                  {parseLocalDate(settings.effectiveDate).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}
                </span>
              </div>
            )}
          </CardHeader>
          <CardContent>
            <Form {...settingsForm}>
              <form onSubmit={settingsForm.handleSubmit(onSettingsSubmit)} className="space-y-4">
                <FormField
                  control={settingsForm.control}
                  name="effectiveDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Effective from</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="rounded-md border p-3 space-y-3">
                  <div className="text-sm font-semibold">Regular Packs <span className="font-normal text-xs text-muted-foreground">(sold)</span></div>
                  <FormField
                    control={settingsForm.control}
                    name="pricePerPack"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Price per pack (JD)</FormLabel>
                        <FormControl>
                          <Input type="number" step="0.01" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <FormField
                      control={settingsForm.control}
                      name="packsPerInputUnit"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Packs per input unit</FormLabel>
                          <FormControl>
                            <Input type="number" step="1" min="1" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={settingsForm.control}
                      name="loavesPerPack"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Loaves per pack</FormLabel>
                          <FormControl>
                            <Input type="number" step="1" min="1" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    1 input unit = {settingsForm.watch("packsPerInputUnit") || 0} packs ={" "}
                    {(Number(settingsForm.watch("packsPerInputUnit") || 0) * Number(settingsForm.watch("loavesPerPack") || 0)) || 0} loaves
                  </p>
                </div>

                <div className="rounded-md border border-dashed p-3 space-y-3 bg-muted/20">
                  <div className="text-sm font-semibold">Marketing Packs <span className="font-normal text-xs text-muted-foreground">(given away free)</span></div>
                  <div className="grid grid-cols-2 gap-3">
                    <FormField
                      control={settingsForm.control}
                      name="marketingPacksPerInputUnit"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Packs per input unit</FormLabel>
                          <FormControl>
                            <Input type="number" step="1" min="1" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={settingsForm.control}
                      name="marketingLoavesPerPack"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Loaves per pack</FormLabel>
                          <FormControl>
                            <Input type="number" step="1" min="1" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    1 input unit = {settingsForm.watch("marketingPacksPerInputUnit") || 0} marketing packs ={" "}
                    {(Number(settingsForm.watch("marketingPacksPerInputUnit") || 0) * Number(settingsForm.watch("marketingLoavesPerPack") || 0)) || 0} loaves
                  </p>
                </div>

                <Button type="submit" disabled={updateSettings.isPending}>
                  {updateSettings.isPending ? "Saving..." : "Save Settings"}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>

        <Card className="bg-accent/5 border-accent/20">
          <CardHeader>
            <div className="flex items-start justify-between gap-2">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <BookOpen className="w-5 h-5 text-accent" />
                  Base Recipe
                </CardTitle>
                <CardDescription className="mt-1">
                  Saving creates a new version that applies going forward only — past entries keep their original recipe.
                </CardDescription>
                {currentRecipe && (
                  <div className="text-xs text-muted-foreground pt-1">
                    Last updated: <span className="font-medium text-foreground">
                      {parseLocalDate(currentRecipe.effectiveDate).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}
                    </span>
                  </div>
                )}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1 shrink-0"
                onClick={() => exportRecipesCSV(recipes ?? [])}
                disabled={!recipes || recipes.length === 0}
              >
                <Download className="w-4 h-4" />
                Export
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <Form {...recipeForm}>
              <form onSubmit={recipeForm.handleSubmit(onRecipeSubmit)} className="space-y-3">
                <FormField
                  control={recipeForm.control}
                  name="effectiveDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Effective from</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="space-y-2">
                  {recipeFields.fields.map((field, index) => (
                    <div key={field.id} className="flex items-end gap-2">
                      <FormField
                        control={recipeForm.control}
                        name={`recipe.${index}.name`}
                        render={({ field: f }) => (
                          <FormItem className="flex-1">
                            {index === 0 && <FormLabel className="text-xs">Ingredient</FormLabel>}
                            <FormControl>
                              <Input placeholder="Ingredient name" {...f} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={recipeForm.control}
                        name={`recipe.${index}.qtyKg`}
                        render={({ field: f }) => (
                          <FormItem className="w-28">
                            {index === 0 && <FormLabel className="text-xs">Qty (kg)</FormLabel>}
                            <FormControl>
                              <Input type="number" step="0.001" min="0" {...f} />
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
                        onClick={() => recipeFields.remove(index)}
                        aria-label="Remove ingredient"
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => recipeFields.append({ name: "", qtyKg: 0 })}
                  className="gap-1"
                >
                  <Plus className="w-4 h-4" />
                  Add Ingredient
                </Button>
                <FormField
                  control={recipeForm.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Notes / Observations</FormLabel>
                      <FormControl>
                        <Textarea
                          rows={3}
                          placeholder="E.g. Reduced salt slightly. Dough was stickier than usual — added 1 tbsp extra flour."
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="flex justify-end pt-2">
                  <Button type="submit" size="sm" disabled={createRecipe.isPending}>
                    {createRecipe.isPending ? "Saving..." : "Save Recipe"}
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              Critical Stock Levels
            </CardTitle>
            <CardDescription className="mt-1">
              When the on-hand amount of a raw material drops at or below its critical value, the dashboard highlights it in red.
              Restocks themselves are logged from the Daily Log page.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
              <Form {...criticalForm}>
                <form onSubmit={criticalForm.handleSubmit(onCriticalSubmit)} className="space-y-3">
                  <div className="space-y-2">
                    {criticalFields.fields.map((field, index) => (
                      <div key={field.id} className="flex items-end gap-2">
                        <FormField
                          control={criticalForm.control}
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
                          control={criticalForm.control}
                          name={`items.${index}.thresholdKg`}
                          render={({ field: f }) => (
                            <FormItem className="w-32">
                              {index === 0 && <FormLabel className="text-xs">Critical (kg)</FormLabel>}
                              <FormControl>
                                <Input type="number" step="0.001" min="0" placeholder="0.000" {...f} />
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
                          onClick={() => criticalFields.remove(index)}
                          aria-label="Remove threshold"
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => criticalFields.append({ name: "", thresholdKg: 0 })}
                      className="gap-1"
                    >
                      <Plus className="w-4 h-4" />
                      Add Material
                    </Button>
                    <Button type="submit" size="sm" disabled={replaceCriticalLevels.isPending}>
                      {replaceCriticalLevels.isPending ? "Saving..." : "Save thresholds"}
                    </Button>
                  </div>
                </form>
              </Form>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <StoreIcon className="w-5 h-5" />
                Stores
              </CardTitle>
              <CardDescription>Corner stores that you deliver to.</CardDescription>
            </div>
            <Button size="sm" className="gap-1" onClick={openCreateStore}>
              <Plus className="w-4 h-4" />
              Add Store
            </Button>
            <Dialog open={isStoreOpen} onOpenChange={(open) => { if (!open) closeStoreDialog(); else setIsStoreOpen(true); }}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{editingStore ? `Edit ${editingStore.name}` : "Add a New Store"}</DialogTitle>
                </DialogHeader>
                <Form {...storeForm}>
                  <form onSubmit={storeForm.handleSubmit(onStoreSubmit)} className="space-y-4">
                    {!editingStore && (
                      <div className="rounded-md border bg-muted/40 px-3 py-2 flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Store ID (assigned on save)</span>
                        <span className="font-mono font-semibold text-sm">#{nextStoreId}</span>
                      </div>
                    )}
                    <FormField
                      control={storeForm.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Name</FormLabel>
                          <FormControl>
                            <Input placeholder="Supermarket Al-Amal" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={storeForm.control}
                      name="address"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Store Address (Optional)</FormLabel>
                          <FormControl>
                            <Input placeholder="Street, neighborhood, city" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={storeForm.control}
                      name="contact"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Contact Name (Optional)</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g. Abu Khaled, store manager" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={storeForm.control}
                      name="phone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Contact Phone (Optional)</FormLabel>
                          <FormControl>
                            <Input placeholder="079..." {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={storeForm.control}
                      name="history"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Notes (Optional)</FormLabel>
                          <FormControl>
                            <Input placeholder="Payment habits, preferences, anything worth remembering..." {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div className="pt-2 flex justify-end">
                      <Button type="submit" disabled={createStore.isPending}>
                        {createStore.isPending ? "Saving..." : "Save Store"}
                      </Button>
                    </div>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          </CardHeader>
          <CardContent>
            {stores?.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground border rounded-md bg-muted/20 border-dashed">
                <StoreIcon className="w-10 h-10 mx-auto opacity-20 mb-2" />
                <p>No stores added yet.</p>
                <Button variant="link" onClick={() => setIsStoreOpen(true)}>Add your first store</Button>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="w-[80px]">ID</TableHead>
                      <TableHead>Store Name</TableHead>
                      <TableHead>Address</TableHead>
                      <TableHead>Contact Name</TableHead>
                      <TableHead>Contact Phone</TableHead>
                      <TableHead>Notes</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stores?.map((store) => (
                      <TableRow key={store.id}>
                        <TableCell className="font-mono text-sm text-muted-foreground">
                          #{String(store.id).padStart(3, "0")}
                        </TableCell>
                        <TableCell className="font-medium">{store.name}</TableCell>
                        <TableCell className="text-sm max-w-[200px] truncate">{store.address || <span className="text-muted-foreground">--</span>}</TableCell>
                        <TableCell>{store.contact || <span className="text-muted-foreground text-sm">--</span>}</TableCell>
                        <TableCell>{store.phone || <span className="text-muted-foreground text-sm">--</span>}</TableCell>
                        <TableCell className="text-muted-foreground text-sm max-w-[240px] truncate">
                          {store.history || "--"}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon" onClick={() => openEditStore(store)} className="h-8 w-8" aria-label="Edit store">
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => handleDeleteStore(store.id)} className="h-8 w-8" aria-label="Delete store">
                              <Trash2 className="w-4 h-4 text-destructive" />
                            </Button>
                          </div>
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