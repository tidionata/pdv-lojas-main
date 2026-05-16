import { useState, useEffect } from "react";
import { Link, useLocation, Outlet } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard, ShoppingCart, Package, TrendingUp,
  BarChart3, Settings, LogOut, Menu, X, ShoppingBag, FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export default function DashboardLayout() {
  const { signOut, user } = useAuth();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // ── Profile ──────────────────────────────────────────────────────────────
  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles")
        .select("store_id").eq("auth_user_id", user!.id).single();
      if (error) throw error;
      return data;
    },
  });

  // ── Store config (incl. config_orcamento) ────────────────────────────────────────
  const { data: storeConfig } = useQuery({
    queryKey: ["store-config", profile?.store_id],
    enabled: !!profile?.store_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stores")
        .select("config_orcamento")
        .eq("id", profile!.store_id!)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const navItems = [
    { to: "/dashboard",          icon: LayoutDashboard, label: "Dashboard" },
    { to: "/dashboard/pdv",      icon: ShoppingCart,    label: "PDV" },
    { to: "/dashboard/pedidos",  icon: ShoppingBag,     label: "Pedidos", badge: true },
    { to: "/dashboard/products", icon: Package,         label: "Produtos" },
    { to: "/dashboard/stock",    icon: TrendingUp,      label: "Estoque" },
    { to: "/dashboard/reports",  icon: BarChart3,       label: "Relatórios" },
    // Orçamentos (apenas se a loja habilitar)
    ...(storeConfig?.config_orcamento ? [{ to: "/dashboard/orcamentos", icon: FileText, label: "Orçamentos" }] : []),
    { to: "/dashboard/settings", icon: Settings,        label: "Configurações" },
  ];

  // Badge: pedidos pendentes
  const storeId = profile?.store_id ?? user?.id ?? "";
  const { data: pendingOrders = [] } = useQuery({
    queryKey: ["store-orders-pending", storeId],
    refetchInterval: 15000,
    enabled: !!storeId,
    queryFn: async () => {
      try {
        const { data } = await (supabase as any)
          .from("orders").select("id,status").eq("store_id", storeId).eq("status", "pending");
        return data ?? [];
      } catch {
        const key = `orders_offline_${storeId}`;
        const all = JSON.parse(localStorage.getItem(key) || "[]");
        return Array.isArray(all) ? all.filter((o: any) => o.status === "pending") : [];
      }
    },
  });
  const pendingCount = pendingOrders.length;


  return (
    <div className="min-h-screen flex bg-background">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-64 bg-sidebar text-sidebar-foreground flex flex-col transition-transform duration-200 lg:static lg:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex items-center justify-between h-16 px-6 border-b border-sidebar-border">
          <span className="text-lg font-bold text-sidebar-primary font-['Space_Grotesk']">PDVTOTAL</span>
          <button className="lg:hidden text-sidebar-foreground" onClick={() => setSidebarOpen(false)}>
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 py-4 px-3 space-y-1">
          {navItems.map((item) => {
            const active = location.pathname === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setSidebarOpen(false)}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-primary"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                )}
              >
                <item.icon className="h-5 w-5" />
                {item.label}
                {item.badge && pendingCount > 0 && (
                  <span className="ml-auto bg-amber-500 text-white text-[10px] font-bold rounded-full h-5 min-w-5 px-1 flex items-center justify-center animate-pulse">
                    {pendingCount}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>


        <div className="p-4 border-t border-sidebar-border">
          <Button
            variant="ghost"
            className="w-full justify-start text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
            onClick={signOut}
          >
            <LogOut className="h-4 w-4 mr-2" /> Sair
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="h-16 flex items-center justify-between px-4 border-b border-border bg-card">
          <button className="lg:hidden" onClick={() => setSidebarOpen(true)}>
            <Menu className="h-6 w-6" />
          </button>
          <div className="flex-1" />
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="hidden sm:inline">{user?.email}</span>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 p-4 md:p-6 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
