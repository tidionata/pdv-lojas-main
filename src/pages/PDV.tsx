import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  ShoppingCart, Search, Plus, Minus, Trash2, CreditCard,
  Banknote, QrCode, Receipt, Percent, DollarSign, X, Printer,
  CheckCircle2,
} from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

type Product = Tables<"products">;

interface CartItem {
  product: Product;
  quantity: number;
}

// ─── Ticket de Dados para o Cupom ───────────────────────────────────────────
interface SaleTicket {
  saleId: string;
  senha: number;
  items: CartItem[];
  subtotal: number;
  discountValue: number;
  total: number;
  paymentMethod: string;
  cashierName: string;
  storeName: string;
  storeCnpj: string;
  storeAddress: string;
  storeCity: string;
  createdAt: Date;
}

const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const fmtQty = (v: number) =>
  v.toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 });

const paymentLabel: Record<string, string> = {
  cash: "DINHEIRO",
  credit: "CARTÃO CRÉDITO",
  debit: "CARTÃO DÉBITO",
  pix: "PIX",
};

// ─── Componente Cupom (só para impressão + visualização) ─────────────────────
function Cupom({ ticket, printRef }: { ticket: SaleTicket; printRef: React.RefObject<HTMLDivElement> }) {
  const dateStr = ticket.createdAt.toLocaleString("pt-BR");
  const totalItems = ticket.items.reduce((s, i) => s + i.quantity, 0);

  return (
    <div
      ref={printRef}
      className="bg-white text-black font-mono text-[11px] leading-tight p-4 w-[320px] mx-auto select-text"
      style={{ fontFamily: "'Courier New', Courier, monospace" }}
    >
      {/* Cabeçalho */}
      <div className="text-center space-y-0.5 mb-2">
        <p className="text-[15px] font-bold tracking-widest">SENHA: {String(ticket.senha).padStart(3, "0")}</p>
        <p className="font-bold text-[12px]">{ticket.storeName}</p>
        {ticket.storeCnpj && (
          <p>CNPJ {ticket.storeCnpj} IE: 000000000000</p>
        )}
        {ticket.storeAddress && <p className="underline">{ticket.storeAddress}</p>}
        {ticket.storeCity && <p>{ticket.storeCity}</p>}
        <p className="text-[10px]">Documento Auxiliar da Nota Fiscal de Consumidor Eletrônica</p>
        <p className="text-[10px]">{dateStr}</p>
      </div>

      <div className="border-t border-dashed border-black my-1" />

      {/* Cabeçalho da tabela */}
      <div className="flex justify-between text-[10px] font-bold mb-0.5">
        <span className="w-8">Cód</span>
        <span className="flex-1 text-center underline">Descrição</span>
      </div>
      <div className="flex justify-between text-[10px] mb-1">
        <span className="w-10">Qtd</span>
        <span className="w-10">Und</span>
        <span className="w-16 text-right">Vl Unit</span>
        <span className="w-16 text-right">Vl Total</span>
      </div>

      <div className="border-t border-dashed border-black mb-1" />

      {/* Itens */}
      {ticket.items.map((item, idx) => (
        <div key={item.product.id} className="mb-1.5">
          <div className="flex justify-between">
            <span className="w-10 text-[10px]">{String(idx + 1).padStart(3, "0")}</span>
            <span className="flex-1 text-[10px] font-medium truncate">{item.product.name}</span>
          </div>
          <div className="flex justify-between text-[10px]">
            <span className="w-10">{fmtQty(item.quantity)}</span>
            <span className="w-10">Und</span>
            <span className="w-16 text-right">{fmt(item.product.price)}</span>
            <span className="w-16 text-right font-semibold">{fmt(item.product.price * item.quantity)}</span>
          </div>
        </div>
      ))}

      <div className="border-t border-dashed border-black my-1" />

      {/* Totais */}
      <div className="space-y-0.5 text-[11px]">
        <div className="flex justify-between">
          <span>Qtd Total de Itens</span>
          <span>{totalItems}</span>
        </div>
        <div className="flex justify-between">
          <span>Valor Total dos Itens R$</span>
          <span>{ticket.subtotal.toFixed(2).replace(".", ",")}</span>
        </div>
        <div className="flex justify-between">
          <span>Valor Descontos R$</span>
          <span>{ticket.discountValue.toFixed(2).replace(".", ",")}</span>
        </div>
        <div className="flex justify-between font-bold">
          <span>Valor Total a Pagar R$</span>
          <span>{ticket.total.toFixed(2).replace(".", ",")}</span>
        </div>
        <div className="flex justify-between">
          <span>Tipo de pagamento</span>
          <span>{paymentLabel[ticket.paymentMethod] ?? ticket.paymentMethod.toUpperCase()}</span>
        </div>
      </div>

      <div className="border-t border-dashed border-black my-1" />

      {/* Tributos */}
      <div className="text-[10px] space-y-0.5">
        <div className="flex justify-between">
          <span className="underline">Informação dos Tributos Totais</span>
          <span>00,00</span>
        </div>
        <p>Incidentes (Lei Federal 12.741/2012)</p>
      </div>

      <div className="border-t border-dashed border-black my-1" />

      {/* Rodapé */}
      <div className="text-center text-[10px] space-y-0.5">
        <p>Cx: Caixa 1 OP :{ticket.cashierName}</p>
        <p>VND: {String(ticket.saleId?.slice(-4) ?? "0000").toUpperCase()}</p>
        <p className="font-bold">SENHA :{String(ticket.senha).padStart(3, "0")}</p>
      </div>
    </div>
  );
}

// ─── Modal de Cupom ──────────────────────────────────────────────────────────
function CupomModal({
  ticket,
  open,
  onClose,
}: {
  ticket: SaleTicket | null;
  open: boolean;
  onClose: () => void;
}) {
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    const content = printRef.current;
    if (!content) return;

    const printWindow = window.open("", "_blank", "width=400,height=700");
    if (!printWindow) return;

    printWindow.document.write(`
      <html>
        <head>
          <title>Cupom Fiscal</title>
          <style>
            @page { size: 80mm auto; margin: 0; }
            body { margin: 0; padding: 8px; font-family: 'Courier New', monospace; font-size: 11px; line-height: 1.3; color: #000; background: #fff; }
            .border-t { border-top: 1px dashed #000; margin: 4px 0; }
            * { box-sizing: border-box; }
          </style>
        </head>
        <body>${content.innerHTML}</body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => { printWindow.print(); printWindow.close(); }, 300);
  };

  if (!ticket) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-emerald-600">
            <CheckCircle2 className="h-5 w-5" />
            Venda Finalizada!
          </DialogTitle>
        </DialogHeader>

        {/* Cupom Preview */}
        <div className="border rounded-lg overflow-hidden bg-white shadow-sm">
          <Cupom ticket={ticket} printRef={printRef} />
        </div>

        {/* Ações */}
        <div className="flex gap-2 pt-1">
          <Button onClick={handlePrint} className="flex-1 gap-2 bg-gray-900 hover:bg-gray-700">
            <Printer className="h-4 w-4" />
            Imprimir Cupom
          </Button>
          <Button onClick={onClose} variant="outline" className="flex-1">
            Nova Venda
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── PDV Principal ────────────────────────────────────────────────────────────
export default function PDV() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [discount, setDiscount] = useState(0);
  const [discountType, setDiscountType] = useState<"fixed" | "percent">("fixed");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const searchRef = useRef<HTMLInputElement>(null);
  const [cupomOpen, setCupomOpen] = useState(false);
  const [lastTicket, setLastTicket] = useState<SaleTicket | null>(null);
  const [saleCounter, setSaleCounter] = useState(1);

  useEffect(() => { searchRef.current?.focus(); }, []);

  // Profile / store
  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, store_id, full_name")
        .eq("auth_user_id", user!.id)
        .single();
      if (error) throw error;
      return data;
    },
  });

  // Usa store_id do perfil ou, em modo offline, usa o próprio user.id
  const storeId = profile?.store_id ?? user?.id ?? "test-store";
  const profileId = profile?.id ?? user?.id;


  // Store info
  const { data: store } = useQuery({
    queryKey: ["store", storeId],
    enabled: !!storeId,
    queryFn: async () => {
      const { data, error } = await supabase.from("stores").select("*").eq("id", storeId!).single();
      if (error) throw error;
      return data;
    },
  });

  // Products — com fallback offline em localStorage
  const { data: products = [] } = useQuery({
    queryKey: ["products", storeId],
    enabled: !!storeId,
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("products")
          .select("*")
          .eq("store_id", storeId!)
          .eq("active", true)
          .order("name");
        if (error) throw error;
        return data as Product[];
      } catch {
        // Supabase offline → usa localStorage
        try {
          const list: Product[] = JSON.parse(
            localStorage.getItem(`products_offline_${storeId}`) || "[]"
          );
          return list.filter(p => p.active);
        } catch { return []; }
      }
    },
  });


  // Filtered products
  const filtered = useMemo(() => {
    if (!search.trim()) return products.slice(0, 20);
    const q = search.toLowerCase();
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.barcode?.toLowerCase().includes(q) ||
        p.category?.toLowerCase().includes(q)
    );
  }, [products, search]);

  // Cart helpers
  const addToCart = (product: Product) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.product.id === product.id);
      if (existing) {
        if (existing.quantity >= product.stock_display) {
          toast.error("Estoque insuficiente em exposição");
          return prev;
        }
        return prev.map((i) =>
          i.product.id === product.id ? { ...i, quantity: i.quantity + 1 } : i
        );
      }
      if (product.stock_display <= 0) {
        toast.error("Produto sem estoque em exposição");
        return prev;
      }
      return [...prev, { product, quantity: 1 }];
    });
    setSearch("");
    searchRef.current?.focus();
  };

  const updateQty = (productId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((i) => {
          if (i.product.id !== productId) return i;
          const newQty = i.quantity + delta;
          if (newQty > i.product.stock_display) {
            toast.error("Estoque insuficiente");
            return i;
          }
          return { ...i, quantity: newQty };
        })
        .filter((i) => i.quantity > 0)
    );
  };

  const removeFromCart = (productId: string) =>
    setCart((prev) => prev.filter((i) => i.product.id !== productId));

  const clearCart = () => { setCart([]); setDiscount(0); };

  // Totals
  const subtotal = cart.reduce((sum, i) => sum + i.product.price * i.quantity, 0);
  const discountValue = discountType === "percent" ? subtotal * (discount / 100) : discount;
  const total = Math.max(0, subtotal - discountValue);

  // Finalize sale
  const saleMutation = useMutation({
    mutationFn: async () => {
      if (!storeId || !profileId) throw new Error("Sem loja/perfil");
      if (cart.length === 0) throw new Error("Carrinho vazio");

      const { data: sale, error: saleError } = await supabase
        .from("sales")
        .insert({
          store_id: storeId,
          user_id: profileId,
          total,
          discount: discountValue,
          discount_type: discountType,
          payment_method: paymentMethod,
          status: "completed",
        })
        .select("id")
        .single();
      if (saleError) throw saleError;

      const items = cart.map((i) => ({
        sale_id: sale.id,
        product_id: i.product.id,
        quantity: i.quantity,
        unit_price: i.product.price,
        subtotal: i.product.price * i.quantity,
      }));
      const { error: itemsError } = await supabase.from("sale_items").insert(items);
      if (itemsError) throw itemsError;

      return sale;
    },
    onSuccess: (sale) => {
      // Monta o ticket do cupom
      const ticket: SaleTicket = {
        saleId: sale.id,
        senha: saleCounter,
        items: [...cart],
        subtotal,
        discountValue,
        total,
        paymentMethod,
        cashierName: profile?.full_name ?? user?.email ?? "Operador",
        storeName: store?.name ?? "Minha Loja",
        storeCnpj: (store as { cnpj?: string })?.cnpj ?? "",
        storeAddress: (store as { address?: string })?.address ?? "",
        storeCity: (store as { city?: string })?.city ?? "",
        createdAt: new Date(),
      };
      setLastTicket(ticket);
      setSaleCounter((n) => n + 1);
      setCupomOpen(true);

      clearCart();
      queryClient.invalidateQueries({ queryKey: ["products"] });
    },
    onError: (e) => toast.error("Erro na venda: " + e.message),
  });

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

  const paymentMethods = [
    { value: "cash", label: "Dinheiro", icon: Banknote },
    { value: "credit", label: "Crédito", icon: CreditCard },
    { value: "debit", label: "Débito", icon: CreditCard },
    { value: "pix", label: "PIX", icon: QrCode },
  ];

  return (
    <>
      <div className="flex flex-col lg:flex-row gap-4 h-[calc(100vh-8rem)]">
        {/* Left: Product search & grid */}
        <div className="flex-1 flex flex-col min-w-0 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              ref={searchRef}
              placeholder="Buscar produto por nome ou código de barras..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 h-12 text-base"
            />
          </div>

          <div className="flex-1 overflow-y-auto">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {filtered.map((p) => (
                <button
                  key={p.id}
                  onClick={() => addToCart(p)}
                  className="flex flex-col items-start p-3 rounded-lg border border-border bg-card hover:bg-accent/50 hover:border-primary/30 transition-colors text-left"
                >
                  <span className="font-medium text-sm line-clamp-2">{p.name}</span>
                  {p.barcode && (
                    <span className="text-xs text-muted-foreground mt-0.5">{p.barcode}</span>
                  )}
                  <div className="flex items-center justify-between w-full mt-2">
                    <span className="text-sm font-bold text-primary">{formatCurrency(p.price)}</span>
                    <Badge variant="secondary" className="text-xs">
                      {p.stock_display} un
                    </Badge>
                  </div>
                </button>
              ))}
              {filtered.length === 0 && (
                <div className="col-span-full flex items-center justify-center py-12 text-muted-foreground">
                  Nenhum produto encontrado
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right: Cart */}
        <Card className="w-full lg:w-96 flex flex-col lg:max-h-full">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-lg">
                <ShoppingCart className="h-5 w-5" />
                Carrinho
                {cart.length > 0 && (
                  <Badge variant="secondary">{cart.reduce((s, i) => s + i.quantity, 0)}</Badge>
                )}
              </CardTitle>
              {cart.length > 0 && (
                <Button variant="ghost" size="sm" onClick={clearCart} className="text-destructive hover:text-destructive">
                  <X className="h-4 w-4 mr-1" /> Limpar
                </Button>
              )}
            </div>
          </CardHeader>

          <CardContent className="flex-1 flex flex-col gap-4 overflow-hidden">
            <div className="flex-1 overflow-y-auto space-y-2 min-h-0">
              {cart.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-muted-foreground gap-2">
                  <Receipt className="h-8 w-8" />
                  <p className="text-sm">Carrinho vazio</p>
                </div>
              ) : (
                cart.map((item) => (
                  <div key={item.product.id} className="flex items-center gap-2 p-2 rounded-lg bg-muted/50">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.product.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatCurrency(item.product.price)} × {item.quantity}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => updateQty(item.product.id, -1)}>
                        <Minus className="h-3 w-3" />
                      </Button>
                      <span className="w-8 text-center text-sm font-semibold">{item.quantity}</span>
                      <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => updateQty(item.product.id, 1)}>
                        <Plus className="h-3 w-3" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeFromCart(item.product.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                    <span className="text-sm font-semibold w-20 text-right">
                      {formatCurrency(item.product.price * item.quantity)}
                    </span>
                  </div>
                ))
              )}
            </div>

            {cart.length > 0 && (
              <>
                <Separator />

                {/* Discount */}
                <div className="flex items-center gap-2">
                  <Select value={discountType} onValueChange={(v) => setDiscountType(v as "fixed" | "percent")}>
                    <SelectTrigger className="w-24 h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fixed">
                        <div className="flex items-center gap-1"><DollarSign className="h-3 w-3" /> R$</div>
                      </SelectItem>
                      <SelectItem value="percent">
                        <div className="flex items-center gap-1"><Percent className="h-3 w-3" /> %</div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    type="number" min="0" step="0.01"
                    placeholder="Desconto"
                    value={discount || ""}
                    onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)}
                    className="h-9"
                  />
                </div>

                {/* Payment method */}
                <div className="grid grid-cols-4 gap-1.5">
                  {paymentMethods.map((pm) => (
                    <button
                      key={pm.value}
                      onClick={() => setPaymentMethod(pm.value)}
                      className={`flex flex-col items-center gap-1 p-2 rounded-lg border text-xs font-medium transition-colors ${paymentMethod === pm.value
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border hover:bg-muted"
                        }`}
                    >
                      <pm.icon className="h-4 w-4" />
                      {pm.label}
                    </button>
                  ))}
                </div>

                {/* Totals */}
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between text-muted-foreground">
                    <span>Subtotal</span>
                    <span>{formatCurrency(subtotal)}</span>
                  </div>
                  {discountValue > 0 && (
                    <div className="flex justify-between text-destructive">
                      <span>Desconto</span>
                      <span>-{formatCurrency(discountValue)}</span>
                    </div>
                  )}
                  <Separator />
                  <div className="flex justify-between text-lg font-bold">
                    <span>Total</span>
                    <span>{formatCurrency(total)}</span>
                  </div>
                </div>

                {/* Finalize */}
                <Button
                  size="lg"
                  className="w-full h-12 text-base"
                  onClick={() => saleMutation.mutate()}
                  disabled={saleMutation.isPending || cart.length === 0}
                >
                  {saleMutation.isPending
                    ? "Finalizando..."
                    : `Finalizar Venda — ${formatCurrency(total)}`}
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Cupom Modal */}
      <CupomModal
        ticket={lastTicket}
        open={cupomOpen}
        onClose={() => setCupomOpen(false)}
      />
    </>
  );
}
