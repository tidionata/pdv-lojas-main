import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Clock, CheckCircle2, ChefHat, PackageCheck, XCircle,
  MessageSquare, Send, User, Phone, ChevronDown, ChevronUp,
  ShoppingBag, Bell, RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Order {
  id: string;
  store_id: string;
  customer_name: string;
  customer_phone?: string;
  status: string;
  total: number;
  notes?: string;
  payment_method: string;
  created_at: string;
  items?: OrderItem[];
  origin?: string;
}

interface OrderItem {
  id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
  additionals: { name: string; price: number }[];
}

interface OrderMessage {
  id: string;
  order_id: string;
  sender: string;
  sender_name?: string;
  message: string;
  created_at: string;
}

const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const STATUS_CONFIG: Record<string, { label: string; badge: string; next?: string; nextLabel?: string; color: string }> = {
  pending:   { label: "Aguardando",  badge: "bg-gray-100 text-gray-700",    next: "accepted",  nextLabel: "✅ Aceitar",       color: "border-gray-200" },
  accepted:  { label: "Confirmado",  badge: "bg-blue-100 text-blue-700",    next: "preparing", nextLabel: "🔥 Preparando",    color: "border-blue-200" },
  preparing: { label: "Preparando",  badge: "bg-amber-100 text-amber-700",  next: "ready",     nextLabel: "🎉 Ficou Pronto",  color: "border-amber-200" },
  ready:     { label: "Pronto",      badge: "bg-emerald-100 text-emerald-700", next: "delivered", nextLabel: "📦 Entregue",  color: "border-emerald-200" },
  delivered: { label: "Entregue",    badge: "bg-emerald-200 text-emerald-800",                                               color: "border-emerald-300" },
  cancelled: { label: "Cancelado",   badge: "bg-red-100 text-red-700",                                                       color: "border-red-200" },
};

const PAYMENT_LABELS: Record<string, string> = {
  cash: "Dinheiro", pix: "PIX", credit: "Crédito", debit: "Débito", presential: "Pagar na retirada",
};

function OrderCard({ order, storeId }: { order: Order; storeId: string }) {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(order.status === "pending");
  const [message, setMessage] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); });

  const cfg = STATUS_CONFIG[order.status] ?? STATUS_CONFIG["pending"];

  // Itens do pedido
  const { data: items = [] } = useQuery<OrderItem[]>({
    queryKey: ["order-items", order.id],
    queryFn: async () => {
      try {
        const { data, error } = await (supabase as any)
          .from("order_items").select("*").eq("order_id", order.id).order("id");
        if (error) throw error;
        return data as OrderItem[];
      } catch {
        return order.items ?? [];
      }
    },
  });

  // Mensagens
  const { data: messages = [] } = useQuery<OrderMessage[]>({
    queryKey: ["order-messages", order.id],
    enabled: expanded,
    refetchInterval: expanded ? 3000 : false,
    queryFn: async () => {
      try {
        const { data, error } = await (supabase as any)
          .from("order_messages").select("*").eq("order_id", order.id).order("created_at");
        if (error) throw error;
        return data as OrderMessage[];
      } catch {
        return JSON.parse(localStorage.getItem(`order_messages_${order.id}`) || "[]");
      }
    },
  });

  // Avançar status
  const advanceMutation = useMutation({
    mutationFn: async (newStatus: string) => {
      try {
        const { error } = await (supabase as any)
          .from("orders").update({ status: newStatus }).eq("id", order.id);
        if (error) throw error;
      } catch {
        // offline: atualiza localStorage
        const storeKeys = Object.keys(localStorage).filter(k => k.startsWith("orders_offline_"));
        for (const key of storeKeys) {
          const orders = JSON.parse(localStorage.getItem(key) || "[]");
          const idx = orders.findIndex((o: any) => o.id === order.id);
          if (idx !== -1) { orders[idx].status = newStatus; localStorage.setItem(key, JSON.stringify(orders)); }
        }
        queryClient.setQueryData<Order[]>(["store-orders", storeId],
          old => old?.map(o => o.id === order.id ? { ...o, status: newStatus } : o));
      }
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["store-orders", storeId] }); },
  });

  // Cancelar
  const cancelMutation = useMutation({
    mutationFn: async () => {
      try {
        const { error } = await (supabase as any)
          .from("orders").update({ status: "cancelled" }).eq("id", order.id);
        if (error) throw error;
      } catch {
        queryClient.setQueryData<Order[]>(["store-orders", storeId],
          old => old?.map(o => o.id === order.id ? { ...o, status: "cancelled" } : o));
      }
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["store-orders", storeId] }); },
  });

  // Enviar mensagem (como loja)
  const sendMutation = useMutation({
    mutationFn: async (msg: string) => {
      const newMsg: OrderMessage = {
        id: `msg-store-${Date.now()}`,
        order_id: order.id,
        sender: "store",
        sender_name: "Loja",
        message: msg,
        created_at: new Date().toISOString(),
      };
      try {
        // Verifica o erro retornado (Supabase não joga exceção quando offline)
        const { error } = await (supabase as any).from("order_messages").insert({
          order_id: order.id, sender: "store", sender_name: "Loja", message: msg,
        });
        if (error) throw new Error(error.message ?? "offline");
      } catch {
        // Fallback offline: salva em localStorage e atualiza cache local
        const existing = JSON.parse(localStorage.getItem(`order_messages_${order.id}`) || "[]");
        localStorage.setItem(`order_messages_${order.id}`, JSON.stringify([...existing, newMsg]));
        queryClient.setQueryData<OrderMessage[]>(["order-messages", order.id],
          old => [...(old ?? []), newMsg]);
      }
    },
    onSuccess: () => {
      setMessage("");
      // Não invalida para não sobrescrever o cache já atualizado offline
    },
  });

  const unreadCount = messages.filter(m => m.sender === "customer").length;
  const minutesAgo = Math.floor((Date.now() - new Date(order.created_at).getTime()) / 60000);

  return (
    <div className={cn("bg-white rounded-2xl border-2 shadow-sm overflow-hidden transition-all", cfg.color,
      order.status === "pending" && "ring-2 ring-amber-400 ring-offset-1")}>

      {/* Card Header */}
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="flex flex-col gap-0.5">
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="font-bold text-sm">{order.customer_name}</span>
                {order.origin === "public_pdv" ? (
                  <Badge variant="outline" className="text-[9px] h-4 px-1.5 bg-blue-50 text-blue-600 border-blue-100 gap-1 font-bold">
                    📱 Balcão
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-[9px] h-4 px-1.5 bg-purple-50 text-purple-600 border-purple-100 gap-1 font-bold">
                    🌐 Online
                  </Badge>
                )}
                {order.customer_phone && (
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Phone className="h-3 w-3" />{order.customer_phone}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground ml-6">
                <Clock className="h-3 w-3" />
                <span>{minutesAgo === 0 ? "Agora mesmo" : `${minutesAgo} min atrás`}</span>
                <span>·</span>
                <span>{PAYMENT_LABELS[order.payment_method] ?? order.payment_method}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className={cn("text-xs font-semibold px-2.5 py-1 rounded-full", cfg.badge)}>
              {cfg.label}
            </span>
            <span className="font-bold text-sm">{fmt(order.total)}</span>
            <button onClick={() => setExpanded(e => !e)} className="p-1 rounded hover:bg-muted">
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* Itens resumidos */}
        <div className="mt-2 ml-6 flex flex-wrap gap-1.5">
          {items.map((item, i) => (
            <span key={i} className="text-xs bg-muted rounded-full px-2.5 py-0.5 font-medium">
              {item.quantity}x {item.product_name}
            </span>
          ))}
        </div>

        {order.notes && (
          <p className="mt-2 ml-6 text-xs text-muted-foreground bg-amber-50 border border-amber-100 rounded-lg px-3 py-1.5">
            📝 {order.notes}
          </p>
        )}
      </div>

      {/* Actions */}
      {order.status !== "delivered" && order.status !== "cancelled" && (
        <div className={cn("flex gap-2 px-4 pb-3", !expanded && "pb-4")}>
          {cfg.next && (
            <Button size="sm" className="flex-1 h-9"
              disabled={advanceMutation.isPending}
              onClick={() => advanceMutation.mutate(cfg.next!)}>
              {advanceMutation.isPending ? "..." : cfg.nextLabel}
            </Button>
          )}
          {order.status === "pending" && (
            <Button size="sm" variant="outline" className="h-9 text-destructive border-destructive/30 hover:bg-red-50"
              disabled={cancelMutation.isPending}
              onClick={() => { if (confirm("Cancelar este pedido?")) cancelMutation.mutate(); }}>
              <XCircle className="h-4 w-4 mr-1" /> Recusar
            </Button>
          )}
        </div>
      )}

      {/* Expanded: Itens detalhados + Chat */}
      {expanded && (
        <div className="border-t">
          {/* Itens detalhados */}
          <div className="p-4 space-y-1.5">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Itens do Pedido</p>
            {items.map((item, i) => (
              <div key={i} className="flex justify-between text-sm">
                <span className="text-muted-foreground">{item.quantity}× {item.product_name}</span>
                <span className="font-medium">{fmt(item.subtotal)}</span>
              </div>
            ))}
            <div className="border-t pt-1.5 flex justify-between font-bold text-sm">
              <span>Total</span><span>{fmt(order.total)}</span>
            </div>
          </div>

          {/* Chat */}
          <div className="border-t">
            <div className="px-4 py-2 flex items-center gap-2 bg-muted/30">
              <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Chat com cliente</span>
              {unreadCount > 0 && (
                <span className="ml-auto text-xs bg-primary text-primary-foreground rounded-full px-2 py-0.5 font-bold">
                  {unreadCount} msg
                </span>
              )}
            </div>

            <div className="h-40 overflow-y-auto p-3 space-y-2 bg-gray-50/50">
              {messages.length === 0 ? (
                <p className="text-xs text-center text-muted-foreground pt-4">Nenhuma mensagem ainda</p>
              ) : messages.map(msg => (
                <div key={msg.id} className={`flex ${msg.sender === "store" ? "justify-end" : "justify-start"}`}>
                  <div className={cn("max-w-[80%] rounded-xl px-3 py-2 text-xs",
                    msg.sender === "store"
                      ? "bg-primary text-primary-foreground rounded-br-sm"
                      : "bg-white border shadow-sm rounded-bl-sm")}>
                    {msg.sender === "customer" && (
                      <p className="font-semibold text-primary opacity-70 text-[10px] mb-0.5">{msg.sender_name ?? "Cliente"}</p>
                    )}
                    <p>{msg.message}</p>
                    <p className={cn("text-[10px] mt-0.5", msg.sender === "store" ? "text-white/60" : "text-muted-foreground")}>
                      {new Date(msg.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>

            <div className="p-2 border-t flex gap-1.5">
              <Input placeholder="Responder cliente..."
                value={message} onChange={e => setMessage(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (message.trim()) sendMutation.mutate(message.trim()); } }}
                className="h-8 text-xs flex-1" />
              <Button size="icon" className="h-8 w-8"
                disabled={!message.trim() || sendMutation.isPending}
                onClick={() => { if (message.trim()) sendMutation.mutate(message.trim()); }}>
                <Send className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Página Principal ─────────────────────────────────────────────────────────
export default function Pedidos() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<string>("active");

  // Pegar storeId do usuário
  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    enabled: !!user,
    queryFn: async () => {
      try {
        const { data, error } = await supabase.from("profiles")
          .select("store_id").eq("auth_user_id", user!.id).single();
        if (error) throw error;
        return data;
      } catch { return null; }
    },
  });

  const storeId = profile?.store_id ?? user?.id ?? "test-store";

  // Carregar pedidos
  const { data: orders = [], isLoading, refetch } = useQuery<Order[]>({
    queryKey: ["store-orders", storeId],
    refetchInterval: 10000,
    queryFn: async () => {
      try {
        const { data, error } = await (supabase as any)
          .from("orders").select("*")
          .eq("store_id", storeId).order("created_at", { ascending: false });
        if (error) throw error;
        return data as Order[];
      } catch {
        // offline
        const key = `orders_offline_${storeId}`;
        return JSON.parse(localStorage.getItem(key) || "[]") as Order[];
      }
    },
  });

  // Realtime: novos pedidos
  useEffect(() => {
    if (!storeId) return;
    try {
      const channel = supabase
        .channel(`store-orders-${storeId}`)
        .on("postgres_changes", {
          event: "*", schema: "public", table: "orders", filter: `store_id=eq.${storeId}`,
        }, () => {
          queryClient.invalidateQueries({ queryKey: ["store-orders", storeId] });
          toast("🔔 Novo pedido recebido!", { duration: 4000 });
        })
        .subscribe();
      return () => { supabase.removeChannel(channel); };
    } catch { /* offline */ }
  }, [storeId, queryClient]);

  const filtered = orders.filter(o => {
    if (filter === "active") return !["delivered", "cancelled"].includes(o.status);
    if (filter === "done") return ["delivered", "cancelled"].includes(o.status);
    if (filter === "public_pdv") return o.origin === "public_pdv";
    if (filter === "menu") return o.origin === "menu" || !o.origin;
    return true;
  });

  const pendingCount = orders.filter(o => o.status === "pending").length;
  const activeCount = orders.filter(o => !["delivered", "cancelled"].includes(o.status)).length;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-['Space_Grotesk'] flex items-center gap-2">
            <ShoppingBag className="h-6 w-6" /> Pedidos
            {pendingCount > 0 && (
              <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-700 text-xs font-bold px-2 py-0.5 rounded-full animate-pulse">
                <Bell className="h-3 w-3" /> {pendingCount} novo{pendingCount > 1 ? "s" : ""}
              </span>
            )}
          </h1>
          <p className="text-muted-foreground text-sm">{activeCount} pedido{activeCount !== 1 ? "s" : ""} ativo{activeCount !== 1 ? "s" : ""}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1.5">
          <RefreshCw className="h-4 w-4" /> Atualizar
        </Button>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-2">
        {[
          { key: "active",     label: "Ativos" },
          { key: "public_pdv", label: "📱 Balcão (Mobile)" },
          { key: "menu",       label: "🌐 Online" },
          { key: "all",        label: "Todos" },
          { key: "done",       label: "Concluídos" },
        ].map(f => (
          <button 
            key={f.key} 
            onClick={() => setFilter(f.key as any)}
            className={cn(
              "px-4 py-1.5 rounded-full text-sm font-medium transition-colors border",
              filter === f.key 
                ? "bg-primary text-primary-foreground border-primary" 
                : "bg-white text-muted-foreground hover:bg-muted border-border"
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Lista */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20 gap-3 text-muted-foreground">
          <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          Carregando pedidos...
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
          <ShoppingBag className="h-12 w-12 opacity-20" />
          <p className="font-medium">Nenhum pedido {filter === "active" ? "ativo" : ""}</p>
          <p className="text-sm text-center max-w-xs">
            Quando clientes fizerem pedidos pelo cardápio, eles aparecerão aqui.
          </p>
        </div>
      ) : (
        <div className="space-y-3 pb-8">
          {filtered.map(order => (
            <OrderCard key={order.id} order={order} storeId={storeId} />
          ))}
        </div>
      )}
    </div>
  );
}
