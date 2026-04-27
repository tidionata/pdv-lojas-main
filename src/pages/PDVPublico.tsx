import { useState, useMemo, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
    ShoppingCart, Search, Plus, Minus, Trash2, CreditCard,
    Banknote, QrCode, Receipt, Percent, DollarSign, X,
    CheckCircle2, Printer, Store,
} from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";
import {
    Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

type Product = Tables<"products">;

interface CartItem {
    product: Product;
    quantity: number;
}

interface SaleTicket {
    saleId: string;
    senha: number;
    items: CartItem[];
    subtotal: number;
    discountValue: number;
    total: number;
    paymentMethod: string;
    storeName: string;
    createdAt: Date;
}

const fmt = (v: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const paymentLabel: Record<string, string> = {
    cash: "DINHEIRO",
    credit: "CARTÃO CRÉDITO",
    debit: "CARTÃO DÉBITO",
    pix: "PIX",
};

// ─── Cupom Simples ───────────────────────────────────────────────────────────
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
        const w = window.open("", "_blank", "width=400,height=700");
        if (!w) return;
        w.document.write(`
      <html><head><title>Cupom</title>
      <style>
        @page { size: 80mm auto; margin: 0; }
        body { margin: 0; padding: 8px; font-family: 'Courier New', monospace; font-size: 11px; line-height: 1.3; color: #000; }
      </style></head>
      <body>${content.innerHTML}</body></html>
    `);
        w.document.close();
        w.focus();
        setTimeout(() => { w.print(); w.close(); }, 300);
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
                <div
                    ref={printRef}
                    className="bg-white text-black font-mono text-[11px] leading-tight p-4 border rounded-lg"
                >
                    <div className="text-center space-y-0.5 mb-2">
                        <p className="text-[15px] font-bold tracking-widest">
                            SENHA: {String(ticket.senha).padStart(3, "0")}
                        </p>
                        <p className="font-bold text-[12px]">{ticket.storeName}</p>
                        <p className="text-[10px]">{ticket.createdAt.toLocaleString("pt-BR")}</p>
                    </div>
                    <div className="border-t border-dashed border-black my-1" />
                    {ticket.items.map((item, idx) => (
                        <div key={item.product.id} className="mb-1">
                            <div className="flex justify-between text-[10px]">
                                <span className="w-8">{String(idx + 1).padStart(3, "0")}</span>
                                <span className="flex-1 truncate">{item.product.name}</span>
                            </div>
                            <div className="flex justify-between text-[10px]">
                                <span className="w-12">{item.quantity} Und</span>
                                <span>{fmt(item.product.price)}</span>
                                <span className="font-bold">{fmt(item.product.price * item.quantity)}</span>
                            </div>
                        </div>
                    ))}
                    <div className="border-t border-dashed border-black my-1" />
                    <div className="text-[11px] space-y-0.5">
                        <div className="flex justify-between">
                            <span>Subtotal</span>
                            <span>{fmt(ticket.subtotal)}</span>
                        </div>
                        {ticket.discountValue > 0 && (
                            <div className="flex justify-between">
                                <span>Desconto</span>
                                <span>-{fmt(ticket.discountValue)}</span>
                            </div>
                        )}
                        <div className="flex justify-between font-bold">
                            <span>TOTAL</span>
                            <span>{fmt(ticket.total)}</span>
                        </div>
                        <div className="flex justify-between">
                            <span>Pagamento</span>
                            <span>{paymentLabel[ticket.paymentMethod] ?? ticket.paymentMethod.toUpperCase()}</span>
                        </div>
                    </div>
                </div>
                <div className="flex gap-2">
                    <Button onClick={handlePrint} className="flex-1 gap-2 bg-gray-900 hover:bg-gray-700">
                        <Printer className="h-4 w-4" /> Imprimir
                    </Button>
                    <Button onClick={onClose} variant="outline" className="flex-1">
                        Nova Venda
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}

// ─── PDV Público Principal ────────────────────────────────────────────────────
export default function PDVPublico() {
    const { storeId } = useParams<{ storeId: string }>();
    const [search, setSearch] = useState("");
    const [cart, setCart] = useState<CartItem[]>([]);
    const [discount, setDiscount] = useState(0);
    const [discountType, setDiscountType] = useState<"fixed" | "percent">("fixed");
    const [paymentMethod, setPaymentMethod] = useState("cash");
    const [cartOpen, setCartOpen] = useState(false);
    const [cupomOpen, setCupomOpen] = useState(false);
    const [lastTicket, setLastTicket] = useState<SaleTicket | null>(null);
    const [saleCounter, setSaleCounter] = useState(1);
    const searchRef = useRef<HTMLInputElement>(null);

    useEffect(() => { searchRef.current?.focus(); }, []);

    // Store info
    const { data: store } = useQuery({
        queryKey: ["store-public", storeId],
        enabled: !!storeId,
        queryFn: async () => {
            const { data, error } = await supabase
                .from("stores")
                .select("*")
                .eq("id", storeId!)
                .single();
            if (error) throw error;
            return data;
        },
    });

    // Products
    const { data: products = [], isLoading } = useQuery({
        queryKey: ["products-public", storeId],
        enabled: !!storeId,
        queryFn: async () => {
            const { data, error } = await supabase
                .from("products")
                .select("*")
                .eq("store_id", storeId!)
                .eq("active", true)
                .order("name");
            if (error) throw error;
            return data as Product[];
        },
    });

    const filtered = useMemo(() => {
        if (!search.trim()) return products;
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
                    toast.error("Estoque insuficiente");
                    return prev;
                }
                return prev.map((i) =>
                    i.product.id === product.id ? { ...i, quantity: i.quantity + 1 } : i
                );
            }
            if (product.stock_display <= 0) {
                toast.error("Produto sem estoque");
                return prev;
            }
            return [...prev, { product, quantity: 1 }];
        });
        toast.success(`${product.name} adicionado!`, { duration: 1000 });
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

    const subtotal = cart.reduce((sum, i) => sum + i.product.price * i.quantity, 0);
    const discountValue = discountType === "percent" ? subtotal * (discount / 100) : discount;
    const total = Math.max(0, subtotal - discountValue);
    const cartCount = cart.reduce((s, i) => s + i.quantity, 0);

    // Finalize sale
    const saleMutation = useMutation({
        mutationFn: async () => {
            if (cart.length === 0) throw new Error("Carrinho vazio");
            if (!storeId) throw new Error("Loja não encontrada");

            // Busca um perfil da loja para usar como user_id
            const { data: profile, error: profileError } = await supabase
                .from("profiles")
                .select("id")
                .eq("store_id", storeId)
                .limit(1)
                .single();
            if (profileError) throw profileError;

            const { data: sale, error: saleError } = await supabase
                .from("sales")
                .insert({
                    store_id: storeId,
                    user_id: profile.id,
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
            const ticket: SaleTicket = {
                saleId: sale.id,
                senha: saleCounter,
                items: [...cart],
                subtotal,
                discountValue,
                total,
                paymentMethod,
                storeName: store?.name ?? "Loja",
                createdAt: new Date(),
            };
            setLastTicket(ticket);
            setSaleCounter((n) => n + 1);
            setCupomOpen(true);
            setCartOpen(false);
            clearCart();
        },
        onError: (e) => toast.error("Erro na venda: " + e.message),
    });

    const paymentMethods = [
        { value: "cash", label: "Dinheiro", icon: Banknote },
        { value: "credit", label: "Crédito", icon: CreditCard },
        { value: "debit", label: "Débito", icon: CreditCard },
        { value: "pix", label: "PIX", icon: QrCode },
    ];

    // Group by category
    const categories = useMemo(() => {
        const cats = new Map<string, Product[]>();
        filtered.forEach((p) => {
            const cat = p.category || "Outros";
            if (!cats.has(cat)) cats.set(cat, []);
            cats.get(cat)!.push(p);
        });
        return cats;
    }, [filtered]);

    if (!storeId) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="text-center space-y-2">
                    <Store className="h-12 w-12 text-gray-300 mx-auto" />
                    <p className="text-gray-500">Link inválido. ID da loja não encontrado.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            <header className="sticky top-0 z-30 bg-white border-b shadow-sm">
                <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                        <Store className="h-6 w-6 text-primary" />
                        <span className="font-bold text-lg font-['Space_Grotesk'] truncate max-w-[180px] sm:max-w-none">
                            {store?.name ?? "Carregando..."}
                        </span>
                    </div>

                    {/* Search */}
                    <div className="relative flex-1 max-w-md hidden sm:block">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            ref={searchRef}
                            placeholder="Buscar produto..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="pl-10"
                        />
                    </div>

                    {/* Cart button */}
                    <button
                        onClick={() => setCartOpen(true)}
                        className="relative flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg font-medium text-sm hover:bg-primary/90 transition-colors"
                    >
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
                        <Input
                            placeholder="Buscar produto..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="pl-10"
                        />
                    </div>
                </div>
            </header>

            {/* Products */}
            <main className="max-w-5xl mx-auto px-4 py-6">
                {isLoading ? (
                    <div className="flex items-center justify-center py-20 text-muted-foreground">
                        Carregando produtos...
                    </div>
                ) : products.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
                        <Store className="h-12 w-12 opacity-30" />
                        <p>Nenhum produto disponível no momento.</p>
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
                        <Search className="h-12 w-12 opacity-30" />
                        <p>Nenhum produto encontrado para "{search}"</p>
                    </div>
                ) : (
                    <div className="space-y-8">
                        {Array.from(categories.entries()).map(([cat, prods]) => (
                            <div key={cat}>
                                <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-2">
                                    <span className="h-px flex-1 bg-border" />
                                    {cat}
                                    <span className="h-px flex-1 bg-border" />
                                </h2>
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                                    {prods.map((p) => {
                                        const inCart = cart.find((i) => i.product.id === p.id);
                                        const outOfStock = p.stock_display <= 0;
                                        return (
                                            <button
                                                key={p.id}
                                                onClick={() => !outOfStock && addToCart(p)}
                                                disabled={outOfStock}
                                                className={`relative flex flex-col items-start p-3 rounded-xl border bg-white text-left transition-all shadow-sm
                          ${outOfStock
                                                        ? "opacity-50 cursor-not-allowed"
                                                        : "hover:shadow-md hover:border-primary/30 hover:-translate-y-0.5 cursor-pointer"
                                                    }
                          ${inCart ? "border-primary/40 ring-1 ring-primary/20" : "border-border"}
                        `}
                                            >
                                                {inCart && (
                                                    <span className="absolute top-2 right-2 bg-primary text-primary-foreground text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center">
                                                        {inCart.quantity}
                                                    </span>
                                                )}
                                                {outOfStock && (
                                                    <span className="absolute top-2 left-2 bg-red-100 text-red-600 text-[10px] font-semibold px-1.5 py-0.5 rounded">
                                                        Esgotado
                                                    </span>
                                                )}
                                                <span className="font-medium text-sm line-clamp-2 mt-1 pr-6">{p.name}</span>
                                                {p.barcode && (
                                                    <span className="text-xs text-muted-foreground mt-0.5 font-mono">{p.barcode}</span>
                                                )}
                                                <div className="flex items-center justify-between w-full mt-2">
                                                    <span className="text-base font-bold text-primary">{fmt(p.price)}</span>
                                                    {!outOfStock && (
                                                        <Badge variant="secondary" className="text-xs">
                                                            {p.stock_display} un
                                                        </Badge>
                                                    )}
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </main>

            {/* Cart Sidebar / Drawer */}
            {cartOpen && (
                <>
                    <div
                        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
                        onClick={() => setCartOpen(false)}
                    />
                    <div className="fixed inset-y-0 right-0 z-50 w-full max-w-sm bg-white shadow-2xl flex flex-col">
                        {/* Cart Header */}
                        <div className="flex items-center justify-between p-4 border-b">
                            <h2 className="font-bold text-lg flex items-center gap-2">
                                <ShoppingCart className="h-5 w-5" />
                                Carrinho
                                {cartCount > 0 && (
                                    <Badge variant="secondary">{cartCount}</Badge>
                                )}
                            </h2>
                            <div className="flex items-center gap-2">
                                {cart.length > 0 && (
                                    <button
                                        onClick={clearCart}
                                        className="text-xs text-destructive hover:underline flex items-center gap-1"
                                    >
                                        <X className="h-3 w-3" /> Limpar
                                    </button>
                                )}
                                <button onClick={() => setCartOpen(false)} className="p-1 rounded hover:bg-muted">
                                    <X className="h-5 w-5" />
                                </button>
                            </div>
                        </div>

                        {/* Cart Items */}
                        <div className="flex-1 overflow-y-auto p-4 space-y-2">
                            {cart.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-3">
                                    <Receipt className="h-12 w-12 opacity-30" />
                                    <p className="text-sm">Carrinho vazio</p>
                                </div>
                            ) : (
                                cart.map((item) => (
                                    <div key={item.product.id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/40 border">
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium truncate">{item.product.name}</p>
                                            <p className="text-xs text-muted-foreground">{fmt(item.product.price)} × {item.quantity}</p>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <button
                                                onClick={() => updateQty(item.product.id, -1)}
                                                className="h-7 w-7 rounded border flex items-center justify-center hover:bg-muted"
                                            >
                                                <Minus className="h-3 w-3" />
                                            </button>
                                            <span className="w-8 text-center text-sm font-semibold">{item.quantity}</span>
                                            <button
                                                onClick={() => updateQty(item.product.id, 1)}
                                                className="h-7 w-7 rounded border flex items-center justify-center hover:bg-muted"
                                            >
                                                <Plus className="h-3 w-3" />
                                            </button>
                                            <button
                                                onClick={() => removeFromCart(item.product.id)}
                                                className="h-7 w-7 rounded flex items-center justify-center text-destructive hover:bg-red-50"
                                            >
                                                <Trash2 className="h-3 w-3" />
                                            </button>
                                        </div>
                                        <span className="text-sm font-bold w-20 text-right">
                                            {fmt(item.product.price * item.quantity)}
                                        </span>
                                    </div>
                                ))
                            )}
                        </div>

                        {/* Cart Footer */}
                        {cart.length > 0 && (
                            <div className="border-t p-4 space-y-4">
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

                                {/* Payment */}
                                <div className="grid grid-cols-4 gap-1.5">
                                    {paymentMethods.map((pm) => (
                                        <button
                                            key={pm.value}
                                            onClick={() => setPaymentMethod(pm.value)}
                                            className={`flex flex-col items-center gap-1 p-2 rounded-lg border text-xs font-medium transition-colors
                        ${paymentMethod === pm.value
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
                                        <span>{fmt(subtotal)}</span>
                                    </div>
                                    {discountValue > 0 && (
                                        <div className="flex justify-between text-destructive">
                                            <span>Desconto</span>
                                            <span>-{fmt(discountValue)}</span>
                                        </div>
                                    )}
                                    <Separator />
                                    <div className="flex justify-between text-lg font-bold">
                                        <span>Total</span>
                                        <span>{fmt(total)}</span>
                                    </div>
                                </div>

                                <Button
                                    size="lg"
                                    className="w-full h-12 text-base"
                                    onClick={() => saleMutation.mutate()}
                                    disabled={saleMutation.isPending}
                                >
                                    {saleMutation.isPending
                                        ? "Finalizando..."
                                        : `Finalizar — ${fmt(total)}`}
                                </Button>
                            </div>
                        )}
                    </div>
                </>
            )}

            {/* Cupom */}
            <CupomModal
                ticket={lastTicket}
                open={cupomOpen}
                onClose={() => setCupomOpen(false)}
            />
        </div>
    );
}
