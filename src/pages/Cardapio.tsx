import { useState, useMemo, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  ShoppingCart, Search, Plus, Minus, Trash2, X,
  Store, ChevronRight, User, Phone, MessageSquare,
  Banknote, CreditCard, QrCode, UtensilsCrossed,
} from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

type Product = Tables<"products">;

interface CartItem {
  cartItemId: string;
  product: Product;
  quantity: number;
  additionals: { name: string; price: number }[];
  unitPrice: number;
}

const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const STATUS_LABELS: Record<string, string> = {
  pending: "Aguardando confirmação",
  accepted: "Pedido confirmado!",
  preparing: "Sendo preparado 🔥",
  ready: "Pronto para retirar! 🎉",
  delivered: "Entregue",
  cancelled: "Cancelado",
};

export default function Cardapio() {
  const { storeId } = useParams<{ storeId: string }>();
  const navigate = useNavigate();

  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const searchRef = useRef<HTMLInputElement>(null);

  // Modal de Produto (Peso e Adicionais)
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [productModalOpen, setProductModalOpen] = useState(false);
  const [modalQty, setModalQty] = useState<number | string>(1);
  const [modalPrice, setModalPrice] = useState<number | string>("");
  const [selectedAdds, setSelectedAdds] = useState<any[]>([]);

  useEffect(() => { searchRef.current?.focus(); }, []);

  // Dados da loja
  const { data: store } = useQuery({
    queryKey: ["store-cardapio", storeId],
    enabled: !!storeId,
    queryFn: async () => {
      const { data, error } = await supabase.from("stores").select("*").eq("id", storeId!).single();
      if (error) throw error;
      return data;
    },
  });

  // Produtos ativos
  const { data: products = [], isLoading } = useQuery({
    queryKey: ["products-cardapio", storeId],
    enabled: !!storeId,
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("products").select("*")
          .eq("store_id", storeId!).eq("active", true).order("category").order("name");
        if (error) throw error;
        return data as Product[];
      } catch {
        // fallback offline
        try {
          const offline = JSON.parse(localStorage.getItem(`products_offline_${storeId}`) || "[]") as Product[];
          return offline.filter(p => p.active);
        } catch { return []; }
      }
    },
  });

  // Adicionais para modal
  const { data: productAdditionals = [] } = useQuery({
    queryKey: ["product_additionals_cardapio", selectedProduct?.id],
    enabled: !!selectedProduct && !!(selectedProduct as any).has_additionals,
    queryFn: async () => {
      if ((selectedProduct as any).additionals_data) {
        return (selectedProduct as any).additionals_data;
      }
      if (selectedProduct!.id.startsWith("local-")) {
        return [];
      }
      const { data } = await (supabase as any)
        .from("product_additionals")
        .select("*")
        .eq("product_id", selectedProduct!.id)
        .eq("active", true)
        .order("created_at");
      return (data || []) as any[];
    }
  });

  // Agrupado por categoria
  const categories = useMemo(() => {
    const activeMenu = (store as any)?.active_menu_type || 'both';

    const filtered = products.filter(p => {
      // 1. Filtro de Busca
      const matchesSearch = !search.trim() || 
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.category?.toLowerCase().includes(search.toLowerCase());
      
      if (!matchesSearch) return false;

      // 2. Filtro de Turno (Dia/Noite)
      // Se a loja está em modo 'both', mostra tudo.
      // Caso contrário, mostra apenas o que é 'both' ou o turno específico da loja.
      if (activeMenu === 'both') return true;
      
      const prodMenu = (p as any).menu_type || 'both';
      return prodMenu === 'both' || prodMenu === activeMenu;
    });

    const map = new Map<string, Product[]>();
    filtered.forEach(p => {
      const cat = p.category || "Outros";
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(p);
    });
    return map;
  }, [products, search, store]);

  // Cart helpers
  const cartCount = cart.reduce((s, i) => s + i.quantity, 0);
  const cartTotal = cart.reduce((s, i) => s + i.unitPrice * i.quantity, 0);

  const handleProductClick = (p: Product) => {
    const hasAdds = (p as any).has_additionals;
    const isWeight = (p as any).unit === "KG" || (p as any).unit === "G" || (p as any).unit === "L";
    
    if (hasAdds || isWeight) {
      setSelectedProduct(p);
      setModalQty(isWeight ? "" : 1);
      setModalPrice(isWeight ? "" : p.price);
      setSelectedAdds([]);
      setProductModalOpen(true);
    } else {
      addToCart(p, 1, [], p.price);
    }
  };

  const addToCart = (product: Product, quantity: number, adds: any[], unitPrice: number) => {
    if (quantity <= 0) return;
    setCart(prev => {
      const addsStr = JSON.stringify(adds);
      const ex = prev.find(i => i.product.id === product.id && JSON.stringify(i.additionals) === addsStr);
      if (ex) return prev.map(i => i.cartItemId === ex.cartItemId ? { ...i, quantity: i.quantity + quantity } : i);
      return [...prev, { cartItemId: Math.random().toString(36).substring(7), product, quantity, additionals: adds, unitPrice }];
    });
    setProductModalOpen(false);
    toast.success(`${product.name} adicionado!`, { duration: 800 });
  };

  const updateQty = (cartItemId: string, delta: number) => {
    setCart(prev => prev.map(i => i.cartItemId === cartItemId
      ? { ...i, quantity: i.quantity + delta }
      : i).filter(i => i.quantity > 0));
  };

  const removeFromCart = (cartItemId: string) =>
    setCart(prev => prev.filter(i => i.cartItemId !== cartItemId));

  // Enviar pedido
  const orderMutation = useMutation({
    mutationFn: async () => {
      if (!customerName.trim()) throw new Error("Informe seu nome");
      if (cart.length === 0) throw new Error("Carrinho vazio");

      // Tenta Supabase
      try {
        const { data: order, error: orderError } = await (supabase as any)
          .from("orders")
          .insert({
            store_id: storeId,
            customer_name: customerName.trim(),
            customer_phone: customerPhone.trim() || null,
            total: cartTotal,
            notes: notes.trim() || null,
            payment_method: paymentMethod,
            status: "pending",
          })
          .select("id").single();
        if (orderError) throw orderError;

        const items = cart.map(i => ({
          order_id: order.id,
          product_id: i.product.id,
          product_name: i.product.name,
          unit_price: i.unitPrice,
          quantity: i.quantity,
          additionals: i.additionals,
          subtotal: i.unitPrice * i.quantity,
        }));
        await (supabase as any).from("order_items").insert(items);
        return order.id as string;
      } catch {
        // fallback offline: salva em localStorage
        const orderId = `order-local-${Date.now()}`;
        const order = {
          id: orderId,
          store_id: storeId,
          customer_name: customerName.trim(),
          customer_phone: customerPhone.trim() || null,
          total: cartTotal,
          notes: notes.trim() || null,
          payment_method: paymentMethod,
          status: "pending",
          created_at: new Date().toISOString(),
          items: cart.map(i => ({
            product_name: i.product.name,
            quantity: i.quantity,
            unit_price: i.unitPrice,
            subtotal: i.unitPrice * i.quantity,
            additionals: i.additionals,
          })),
        };
        const existing = JSON.parse(localStorage.getItem(`orders_offline_${storeId}`) || "[]");
        localStorage.setItem(`orders_offline_${storeId}`, JSON.stringify([order, ...existing]));
        return orderId;
      }
    },
    onSuccess: (orderId) => {
      setCart([]);
      setCheckoutOpen(false);
      setCartOpen(false);
      navigate(`/pedido/${orderId}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const paymentMethods = [
    { value: "cash", label: "Dinheiro", icon: Banknote },
    { value: "pix", label: "PIX", icon: QrCode },
    { value: "credit", label: "Crédito", icon: CreditCard },
    { value: "debit", label: "Débito", icon: CreditCard },
  ];

  if (!storeId) return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-muted-foreground">Link inválido.</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-white border-b shadow-sm">
        <div className="max-w-3xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <UtensilsCrossed className="h-6 w-6 text-primary" />
            <div>
              <p className="font-bold text-base font-['Space_Grotesk'] leading-tight">
                {store?.name ?? "Cardápio"}
              </p>
              <p className="text-xs text-muted-foreground">Faça seu pedido</p>
            </div>
          </div>

          <div className="relative flex-1 max-w-xs hidden sm:block">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input ref={searchRef} placeholder="Buscar item..." value={search}
              onChange={e => setSearch(e.target.value)} className="pl-10 h-9" />
          </div>

          <button onClick={() => setCartOpen(true)}
            className="relative flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg font-medium text-sm hover:bg-primary/90 transition-colors">
            <ShoppingCart className="h-4 w-4" />
            <span className="hidden sm:inline">Carrinho</span>
            {cartCount > 0 && (
              <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center font-bold">
                {cartCount}
              </span>
            )}
          </button>
        </div>

        {/* Mobile search */}
        <div className="sm:hidden px-4 pb-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar item..." value={search}
              onChange={e => setSearch(e.target.value)} className="pl-10" />
          </div>
        </div>
      </header>

      {/* Products */}
      <main className="max-w-3xl mx-auto px-4 py-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground gap-2">
            <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            Carregando cardápio...
          </div>
        ) : products.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
            <Store className="h-12 w-12 opacity-30" />
            <p>Nenhum item disponível no momento.</p>
          </div>
        ) : (
          <div className="space-y-8">
            {Array.from(categories.entries()).map(([cat, prods]) => (
              <div key={cat}>
                <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-2">
                  <span className="h-px flex-1 bg-border" />{cat}<span className="h-px flex-1 bg-border" />
                </h2>
                <div className="space-y-2">
                  {prods.map(p => {
                    const inCart = cart.find(i => i.product.id === p.id);
                    const outOfStock = p.stock_display <= 0;
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const imageUrl = (p as any).image_url;
                    return (
                      <div key={p.id}
                        className={`flex items-stretch gap-4 p-4 rounded-2xl bg-white border shadow-sm transition-all
                          ${outOfStock ? "opacity-50" : "hover:shadow-md hover:border-primary/20"}`}>

                        {/* Info */}
                        <div className="flex-1 min-w-0 flex flex-col justify-between">
                          <div>
                            <p className="font-semibold text-sm">{p.name}</p>
                            {p.description && (
                              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{p.description}</p>
                            )}
                          </div>
                          <div className="flex items-center justify-between mt-3">
                            <p className="text-base font-bold text-primary">{fmt(p.price)}</p>
                            {outOfStock ? (
                              <Badge variant="secondary" className="text-xs">Esgotado</Badge>
                            ) : inCart ? (
                              <div className="flex items-center gap-1">
                                <button onClick={() => updateQty(p.id, -1)}
                                  className="h-8 w-8 rounded-full border flex items-center justify-center hover:bg-muted">
                                  <Minus className="h-3.5 w-3.5" />
                                </button>
                                <span className="w-6 text-center font-bold text-sm">{inCart.quantity}</span>
                                <button onClick={() => updateQty(p.id, 1)}
                                  className="h-8 w-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90">
                                  <Plus className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            ) : (
                              <button onClick={() => handleProductClick(p)}
                                className="h-8 w-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 transition-colors shadow-sm">
                                <Plus className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Foto */}
                        {imageUrl ? (
                          <div className="relative shrink-0">
                            <img src={imageUrl} alt={p.name}
                              className="h-24 w-24 rounded-xl object-cover border" />
                            {outOfStock && (
                              <span className="absolute inset-0 bg-white/60 rounded-xl flex items-center justify-center text-[10px] font-bold text-red-600">Esgotado</span>
                            )}
                          </div>
                        ) : (
                          <div className="h-24 w-24 shrink-0 rounded-xl bg-muted border flex items-center justify-center">
                            <UtensilsCrossed className="h-8 w-8 text-muted-foreground/30" />
                          </div>
                        )}
                      </div>
                    );
                  })}

                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Floating cart button mobile */}
      {cartCount > 0 && (
        <div className="fixed bottom-4 left-0 right-0 flex justify-center z-20 px-4">
          <button onClick={() => setCartOpen(true)}
            className="flex items-center justify-between gap-4 bg-primary text-primary-foreground px-6 py-3 rounded-2xl shadow-xl font-semibold text-sm max-w-sm w-full hover:bg-primary/90 transition-all">
            <span className="bg-white/20 rounded-full h-6 w-6 flex items-center justify-center text-xs font-bold">{cartCount}</span>
            <span>Ver carrinho</span>
            <span>{fmt(cartTotal)}</span>
          </button>
        </div>
      )}

      {/* Cart Drawer */}
      {cartOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={() => setCartOpen(false)} />
          <div className="fixed inset-y-0 right-0 z-50 w-full max-w-sm bg-white shadow-2xl flex flex-col">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="font-bold text-lg flex items-center gap-2">
                <ShoppingCart className="h-5 w-5" /> Seu Pedido
              </h2>
              <button onClick={() => setCartOpen(false)} className="p-1 rounded hover:bg-muted">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {cart.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-3">
                  <ShoppingCart className="h-12 w-12 opacity-30" />
                  <p className="text-sm">Nenhum item adicionado</p>
                </div>
              ) : cart.map((item, idx) => (
                <div key={item.cartItemId} className="flex flex-col gap-1 p-3 rounded-lg bg-muted/40 border">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{item.product.name}</p>
                      <p className="text-xs text-muted-foreground">{fmt(item.unitPrice)} × {item.quantity} {(item.product as any).unit ?? "un"}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => updateQty(item.cartItemId, -1)}
                        className="h-7 w-7 rounded border flex items-center justify-center hover:bg-muted">
                        <Minus className="h-3 w-3" />
                      </button>
                      <span className="w-7 text-center text-sm font-semibold">{item.quantity}</span>
                      <button onClick={() => updateQty(item.cartItemId, 1)}
                        className="h-7 w-7 rounded border flex items-center justify-center hover:bg-muted">
                        <Plus className="h-3 w-3" />
                      </button>
                      <button onClick={() => removeFromCart(item.cartItemId)}
                        className="h-7 w-7 rounded flex items-center justify-center text-destructive hover:bg-red-50">
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                    <span className="text-sm font-bold w-16 text-right">
                      {fmt(item.unitPrice * item.quantity)}
                    </span>
                  </div>
                  {item.additionals && item.additionals.length > 0 && (
                    <div className="text-xs text-muted-foreground pl-1 border-l-2 border-border ml-1 mt-1">
                      + {item.additionals.map(a => a.name).join(", ")}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {cart.length > 0 && (
              <div className="border-t p-4 space-y-3">
                <div className="flex justify-between text-lg font-bold">
                  <span>Total</span>
                  <span>{fmt(cartTotal)}</span>
                </div>
                <Button className="w-full h-12 text-base" onClick={() => { setCartOpen(false); setCheckoutOpen(true); }}>
                  Finalizar Pedido <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            )}
          </div>
        </>
      )}

      {/* Checkout Modal */}
      {checkoutOpen && (
        <>
          <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
            <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
              <div className="flex items-center justify-between p-5 border-b">
                <h2 className="font-bold text-lg">Confirmar Pedido</h2>
                <button onClick={() => setCheckoutOpen(false)} className="p-1 rounded hover:bg-muted">
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="p-5 space-y-4">
                {/* Resumo */}
                <div className="bg-muted/40 rounded-xl p-3 space-y-1">
                  {cart.map((item, idx) => (
                    <div key={item.cartItemId} className="flex flex-col text-sm border-b border-border/50 pb-1 mb-1 last:border-0 last:pb-0 last:mb-0">
                      <div className="flex justify-between">
                        <span>{item.quantity}x {item.product.name}</span>
                        <span className="font-medium">{fmt(item.unitPrice * item.quantity)}</span>
                      </div>
                      {item.additionals && item.additionals.length > 0 && (
                        <span className="text-[10px] text-muted-foreground ml-4">
                          + {item.additionals.map(a => a.name).join(", ")}
                        </span>
                      )}
                    </div>
                  ))}
                  <div className="border-t pt-1 mt-1 flex justify-between font-bold">
                    <span>Total</span><span>{fmt(cartTotal)}</span>
                  </div>
                </div>

                {/* Dados do cliente */}
                <div className="space-y-3">
                  <div>
                    <label className="text-sm font-medium flex items-center gap-1.5 mb-1.5">
                      <User className="h-4 w-4" /> Seu nome *
                    </label>
                    <Input placeholder="Ex: João Silva" value={customerName}
                      onChange={e => setCustomerName(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-sm font-medium flex items-center gap-1.5 mb-1.5">
                      <Phone className="h-4 w-4" /> WhatsApp (opcional)
                    </label>
                    <Input placeholder="(11) 99999-9999" value={customerPhone}
                      onChange={e => setCustomerPhone(e.target.value)} />
                  </div>

                  {/* Pagamento */}
                  <div>
                    <p className="text-sm font-medium mb-1.5">Forma de pagamento</p>
                    <div className="grid grid-cols-4 gap-1.5">
                      {paymentMethods.map(pm => (
                        <button key={pm.value} onClick={() => setPaymentMethod(pm.value)}
                          className={`flex flex-col items-center gap-1 p-2 rounded-lg border text-xs font-medium transition-colors
                            ${paymentMethod === pm.value ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted"}`}>
                          <pm.icon className="h-4 w-4" />{pm.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-medium flex items-center gap-1.5 mb-1.5">
                      <MessageSquare className="h-4 w-4" /> Observações (opcional)
                    </label>
                    <Textarea placeholder="Ex: Sem cebola, alergia a amendoim..."
                      value={notes} onChange={e => setNotes(e.target.value)} rows={2} />
                  </div>
                </div>

                <Button className="w-full h-12 text-base" disabled={orderMutation.isPending}
                  onClick={() => orderMutation.mutate()}>
                  {orderMutation.isPending ? (
                    <span className="flex items-center gap-2">
                      <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Enviando...
                    </span>
                  ) : "Enviar Pedido 🚀"}
                </Button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Product Options Modal */}
      {productModalOpen && selectedProduct && (
        <>
          <div className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-4" onClick={() => setProductModalOpen(false)}>
            <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between p-5 border-b">
                <h2 className="font-bold text-lg">{selectedProduct.name}</h2>
                <button onClick={() => setProductModalOpen(false)} className="p-1 rounded hover:bg-muted">
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="p-5 space-y-6 max-h-[70vh] overflow-y-auto">
                {/* Peso / Quantidade */}
                {((selectedProduct as any).unit === "KG" || (selectedProduct as any).unit === "G" || (selectedProduct as any).unit === "L") && (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Quantidade ({(selectedProduct as any).unit})</label>
                      <Input
                        type="number"
                        step="0.001"
                        min="0.001"
                        className="text-lg h-12"
                        value={modalQty}
                        onChange={(e) => {
                          const val = e.target.value;
                          setModalQty(val);
                          if (val && !isNaN(Number(val))) {
                            setModalPrice((Number(val) * selectedProduct.price).toFixed(2));
                          } else {
                            setModalPrice("");
                          }
                        }}
                        placeholder={`Ex: 0.500`}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Valor (R$)</label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0.01"
                        className="text-lg h-12"
                        value={modalPrice}
                        onChange={(e) => {
                          const val = e.target.value;
                          setModalPrice(val);
                          if (val && !isNaN(Number(val)) && selectedProduct.price > 0) {
                            setModalQty((Number(val) / selectedProduct.price).toFixed(3));
                          } else {
                            setModalQty("");
                          }
                        }}
                        placeholder={`Ex: 20.00`}
                      />
                    </div>
                  </div>
                )}

                {/* Adicionais */}
                {(selectedProduct as any).has_additionals && productAdditionals.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex justify-between items-end">
                      <div>
                        <label className="text-sm font-medium">Acompanhamentos</label>
                        {(selectedProduct as any).max_additionals > 0 && (
                          <p className="text-[10px] text-muted-foreground">
                            Escolha até {(selectedProduct as any).max_additionals} {(selectedProduct as any).max_additionals === 1 ? "opção" : "opções"}
                          </p>
                        )}
                      </div>
                      <Badge variant="secondary" className="text-[10px] font-bold">
                        {selectedAdds.length} / {(selectedProduct as any).max_additionals || "∞"}
                      </Badge>
                    </div>
                    <div className="grid gap-2">
                      {productAdditionals.map((add) => {
                        const isSelected = selectedAdds.some((a) => a.id === add.id);
                        const maxReached = (selectedProduct as any).max_additionals > 0 && 
                                         selectedAdds.length >= (selectedProduct as any).max_additionals;
                        
                        return (
                          <div
                            key={add.id}
                            className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors ${
                              isSelected 
                                ? "border-primary bg-primary/5" 
                                : maxReached 
                                  ? "opacity-50 grayscale cursor-not-allowed" 
                                  : "hover:bg-muted/50"
                            }`}
                            onClick={() => {
                              if (isSelected) {
                                setSelectedAdds(selectedAdds.filter((a) => a.id !== add.id));
                              } else {
                                if (maxReached) {
                                  toast.error(`Você só pode escolher até ${(selectedProduct as any).max_additionals} acompanhamentos.`);
                                  return;
                                }
                                setSelectedAdds([...selectedAdds, add]);
                              }
                            }}
                          >
                            <span className={isSelected ? "font-semibold" : ""}>{add.name}</span>
                            <span className="text-sm font-medium text-muted-foreground">
                              {add.price > 0 ? `+ ${fmt(add.price)}` : "Grátis"}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Botão Salvar */}
                <Button
                  className="w-full h-12 text-base mt-4"
                  onClick={() => {
                    const qtyNum = parseFloat(modalQty as string);
                    if (isNaN(qtyNum) || qtyNum <= 0) {
                      toast.error("Informe uma quantidade/peso válido.");
                      return;
                    }
                    
                    const extraPrice = selectedAdds.reduce((sum: number, add: any) => sum + (add.price || 0), 0);

                    const finalUnitPrice = selectedProduct.price + extraPrice;
                    addToCart(selectedProduct, qtyNum, selectedAdds, finalUnitPrice);
                  }}
                >
                  Adicionar ao Carrinho
                </Button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
