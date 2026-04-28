import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { Wheat, LayoutDashboard, CalendarDays, Wallet, Settings, Store } from "lucide-react";
import { cn } from "@/lib/utils";

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const [location] = useLocation();

  const navItems = [
    { href: "/", label: "Dashboard", icon: LayoutDashboard },
    { href: "/daily", label: "Operations", icon: CalendarDays },
    { href: "/cash", label: "Accounting", icon: Wallet },
    { href: "/stores", label: "Stores", icon: Store },
    { href: "/setup", label: "Settings", icon: Settings },
  ];

  return (
    <div className="min-h-screen flex flex-col w-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
      <header className="py-6 border-b border-border flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 bg-primary/10 rounded-full flex items-center justify-center text-primary">
            <Wheat className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">The Levant Bakehouse</h1>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">The Healthy Loaf · Oat Bread</p>
          </div>
        </div>
        
        <nav className="flex items-center space-x-1 overflow-x-auto w-full sm:w-auto pb-2 sm:pb-0">
          {navItems.map((item) => {
            const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
            const Icon = item.icon;
            
            return (
              <Link 
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap",
                  isActive 
                    ? "bg-secondary text-secondary-foreground" 
                    : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
                )}
              >
                <Icon className="w-4 h-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>

      <main className="flex-1 py-8">
        {children}
      </main>
    </div>
  );
}