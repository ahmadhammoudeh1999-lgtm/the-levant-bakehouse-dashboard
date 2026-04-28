import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { Layout } from "@/components/layout";
import { DashboardPage } from "@/pages/dashboard";
import { DailyOpsPage } from "@/pages/daily-ops";
import { CashLogPage } from "@/pages/cash-log";
import { StoresPage } from "@/pages/stores";
import { SetupPage } from "@/pages/setup";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      refetchOnMount: true,
      refetchInterval: 5000,
      refetchIntervalInBackground: false,
      staleTime: 0,
    },
  },
});

function Router() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={DashboardPage} />
        <Route path="/daily" component={DailyOpsPage} />
        <Route path="/cash" component={CashLogPage} />
        <Route path="/stores" component={StoresPage} />
        <Route path="/setup" component={SetupPage} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;