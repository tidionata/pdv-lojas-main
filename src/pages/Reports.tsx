import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import {
  FileDown,
  TrendingUp,
  DollarSign,
  ShoppingCart,
  Package,
  RefreshCw,
  BarChart3,
  Receipt,
  Target,
} from "lucide-react";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

// ─── Formatters ──────────────────────────────────────────────────────────────
const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const fmtDate = (dateStr: string) =>
  new Date(dateStr).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });

// ─── Types ───────────────────────────────────────────────────────────────────
interface SaleRow {
  id: string;
  total: number;
  created_at: string;
  status: string;
}

interface SaleItem {
  sale_id: string;
  quantity: number;
  unit_price: number;
  product_id: string;
}

interface Product {
  id: string;
  name: string;
  cost: number;
}

interface DailyData {
  date: string;
  faturamento: number;
  lucro: number;
  vendas: number;
}

interface TopProduct {
  name: string;
  quantidade: number;
  faturamento: number;
  lucro: number;
}

type PeriodKey = "7d" | "30d" | "90d" | "mes_atual" | "mes_passado";

const PERIOD_OPTIONS: { value: PeriodKey; label: string }[] = [
  { value: "mes_atual", label: "Mês atual" },
  { value: "7d", label: "Últimos 7 dias" },
  { value: "30d", label: "Últimos 30 dias" },
  { value: "90d", label: "Últimos 90 dias" },
  { value: "mes_passado", label: "Mês passado" },
];

const CHART_COLORS = ["#8b5cf6", "#06b6d4", "#10b981", "#f59e0b", "#ef4444", "#6366f1"];

function getPeriodRange(period: PeriodKey): { start: Date; end: Date } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  switch (period) {
    case "7d":
      return { start: new Date(today.getTime() - 6 * 86400000), end: now };
    case "30d":
      return { start: new Date(today.getTime() - 29 * 86400000), end: now };
    case "90d":
      return { start: new Date(today.getTime() - 89 * 86400000), end: now };
    case "mes_atual":
      return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: now };
    case "mes_passado": {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 1);
      return { start, end };
    }
  }
}

// ─── KPI Card ────────────────────────────────────────────────────────────────
function KpiCard({
  title, value, sub, icon: Icon, iconColor, bgColor, loading,
}: {
  title: string; value: string; sub?: string;
  icon: React.ElementType; iconColor: string; bgColor: string; loading: boolean;
}) {
  return (
    <Card className="relative overflow-hidden group hover:shadow-md transition-shadow">
      <div className={`absolute inset-0 opacity-5 ${bgColor}`} />
      <CardHeader className="flex flex-row items-center justify-between pb-2 relative">
        <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{title}</CardTitle>
        <div className={`p-2 rounded-lg ${bgColor} bg-opacity-15`}>
          <Icon className={`h-4 w-4 ${iconColor}`} />
        </div>
      </CardHeader>
      <CardContent className="relative">
        {loading ? (
          <div className="h-8 w-28 bg-muted animate-pulse rounded" />
        ) : (
          <div className="text-2xl font-bold tracking-tight">{value}</div>
        )}
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  );
}

// ─── Reports Page ─────────────────────────────────────────────────────────────
export default function Reports() {
  const { user } = useAuth();
  const reportRef = useRef<HTMLDivElement>(null);

  const [period, setPeriod] = useState<PeriodKey>("mes_atual");
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [storeName, setStoreName] = useState("");

  // Metrics
  const [totalFaturamento, setTotalFaturamento] = useState(0);
  const [totalLucro, setTotalLucro] = useState(0);
  const [totalVendas, setTotalVendas] = useState(0);
  const [ticketMedio, setTicketMedio] = useState(0);
  const [totalUnidades, setTotalUnidades] = useState(0);
  const [margemMedia, setMargemMedia] = useState(0);

  // Chart data
  const [dailyData, setDailyData] = useState<DailyData[]>([]);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [paymentMethodData, setPaymentMethodData] = useState<{ name: string; value: number }[]>([]);

  const loadReport = async () => {
    if (!user) return;
    setLoading(true);

    try {
      // Profile & store
      const { data: profile } = await supabase
        .from("profiles")
        .select("store_id, full_name")
        .eq("auth_user_id", user.id)
        .single();
      if (!profile) return;

      const { data: store } = await supabase
        .from("stores")
        .select("name")
        .eq("id", profile.store_id)
        .single();
      if (store) setStoreName(store.name);

      const sid = profile.store_id;
      const { start, end } = getPeriodRange(period);

      // Fetch sales
      const { data: sales } = await supabase
        .from("sales")
        .select("id, total, created_at, status, payment_method")
        .eq("store_id", sid)
        .eq("status", "completed")
        .gte("created_at", start.toISOString())
        .lte("created_at", end.toISOString())
        .order("created_at", { ascending: true });

      if (!sales || sales.length === 0) {
        setTotalFaturamento(0);
        setTotalLucro(0);
        setTotalVendas(0);
        setTicketMedio(0);
        setTotalUnidades(0);
        setMargemMedia(0);
        setDailyData([]);
        setTopProducts([]);
        setPaymentMethodData([]);
        setLoading(false);
        return;
      }

      const saleIds = sales.map((s) => s.id);

      // Fetch sale items
      const { data: saleItemsRaw } = await supabase
        .from("sale_items")
        .select("sale_id, quantity, unit_price, product_id")
        .in("sale_id", saleIds);

      const saleItems: SaleItem[] = (saleItemsRaw ?? []) as SaleItem[];

      // Fetch product costs and names
      const productIds = [...new Set(saleItems.map((i) => i.product_id))];
      const { data: productsRaw } = productIds.length > 0
        ? await supabase.from("products").select("id, name, cost").in("id", productIds)
        : { data: [] };

      const products: Product[] = (productsRaw ?? []) as Product[];
      const costMap: Record<string, number> = {};
      const nameMap: Record<string, string> = {};
      products.forEach((p) => {
        costMap[p.id] = Number(p.cost);
        nameMap[p.id] = p.name;
      });

      // Profit per sale
      const profitBySale: Record<string, number> = {};
      saleItems.forEach((item) => {
        const cost = costMap[item.product_id] ?? 0;
        const lucroItem = (Number(item.unit_price) - cost) * Number(item.quantity);
        profitBySale[item.sale_id] = (profitBySale[item.sale_id] ?? 0) + lucroItem;
      });

      // Totals
      const fat = sales.reduce((acc, s) => acc + Number(s.total), 0);
      const luc = sales.reduce((acc, s) => acc + (profitBySale[s.id] ?? 0), 0);
      const uni = saleItems.reduce((acc, i) => acc + Number(i.quantity), 0);

      setTotalFaturamento(fat);
      setTotalLucro(luc);
      setTotalVendas(sales.length);
      setTicketMedio(sales.length > 0 ? fat / sales.length : 0);
      setTotalUnidades(uni);
      setMargemMedia(fat > 0 ? (luc / fat) * 100 : 0);

      // Daily data grouped by date
      const byDay: Record<string, { faturamento: number; lucro: number; vendas: number }> = {};
      sales.forEach((s) => {
        const day = new Date(s.created_at).toISOString().slice(0, 10);
        if (!byDay[day]) byDay[day] = { faturamento: 0, lucro: 0, vendas: 0 };
        byDay[day].faturamento += Number(s.total);
        byDay[day].lucro += profitBySale[s.id] ?? 0;
        byDay[day].vendas += 1;
      });
      const daily: DailyData[] = Object.entries(byDay)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, vals]) => ({ date: fmtDate(date), ...vals }));
      setDailyData(daily);

      // Top products
      const byProduct: Record<string, { quantidade: number; faturamento: number; lucro: number }> = {};
      saleItems.forEach((item) => {
        const pid = item.product_id;
        if (!byProduct[pid]) byProduct[pid] = { quantidade: 0, faturamento: 0, lucro: 0 };
        byProduct[pid].quantidade += Number(item.quantity);
        byProduct[pid].faturamento += Number(item.unit_price) * Number(item.quantity);
        byProduct[pid].lucro += (Number(item.unit_price) - (costMap[pid] ?? 0)) * Number(item.quantity);
      });
      const top: TopProduct[] = Object.entries(byProduct)
        .map(([id, vals]) => ({ name: nameMap[id] ?? "Produto", ...vals }))
        .sort((a, b) => b.faturamento - a.faturamento)
        .slice(0, 8);
      setTopProducts(top);

      // Payment methods
      const byPayment: Record<string, number> = {};
      (sales as (SaleRow & { payment_method?: string })[]).forEach((s) => {
        const method = (s as any).payment_method ?? "Outros";
        byPayment[method] = (byPayment[method] ?? 0) + Number(s.total);
      });
      const paymentLabels: Record<string, string> = {
        cash: "Dinheiro",
        card: "Cartão",
        pix: "PIX",
        credit: "Crédito",
        debit: "Débito",
      };
      const paymentData = Object.entries(byPayment).map(([k, v]) => ({
        name: paymentLabels[k] ?? k,
        value: v,
      }));
      setPaymentMethodData(paymentData);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadReport(); }, [user, period]);

  // ─── PDF Export ──────────────────────────────────────────────────────────────
  const handleDownloadPDF = async () => {
    if (!reportRef.current) return;
    setDownloading(true);
    try {
      const canvas = await html2canvas(reportRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
      });
      const imgData = canvas.toDataURL("image/png");

      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
      });

      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = pageWidth - 20;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      // Header
      pdf.setFillColor(99, 102, 241);
      pdf.rect(0, 0, pageWidth, 18, "F");
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(14);
      pdf.setFont("helvetica", "bold");
      pdf.text("Relatório de Vendas", 10, 11);

      const periodLabel = PERIOD_OPTIONS.find((p) => p.value === period)?.label ?? period;
      pdf.setFontSize(9);
      pdf.setFont("helvetica", "normal");
      pdf.text(`${storeName} · ${periodLabel} · Gerado em ${new Date().toLocaleString("pt-BR")}`, 10, 16);

      // Content
      let yPos = 22;
      const maxContentHeight = pageHeight - yPos - 10;

      if (imgHeight <= maxContentHeight) {
        pdf.addImage(imgData, "PNG", 10, yPos, imgWidth, imgHeight);
      } else {
        // Multi-page
        let remainingHeight = imgHeight;
        let sourceY = 0;
        const sliceHeight = (maxContentHeight / imgHeight) * canvas.height;

        while (remainingHeight > 0) {
          const currentSlice = Math.min(sliceHeight, canvas.height - sourceY);
          const sliceCanvas = document.createElement("canvas");
          sliceCanvas.width = canvas.width;
          sliceCanvas.height = currentSlice;
          const ctx = sliceCanvas.getContext("2d");
          ctx?.drawImage(canvas, 0, -sourceY);

          const sliceData = sliceCanvas.toDataURL("image/png");
          const sliceDisplayHeight = (currentSlice / canvas.height) * imgHeight;
          pdf.addImage(sliceData, "PNG", 10, yPos, imgWidth, sliceDisplayHeight);

          sourceY += currentSlice;
          remainingHeight -= sliceDisplayHeight;

          if (remainingHeight > 0) {
            pdf.addPage();
            yPos = 10;
          }
        }
      }

      const filename = `relatorio_${period}_${new Date().toISOString().slice(0, 10)}.pdf`;
      pdf.save(filename);
    } finally {
      setDownloading(false);
    }
  };

  const periodLabel = PERIOD_OPTIONS.find((p) => p.value === period)?.label ?? "";

  return (
    <div className="space-y-6">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold font-['Space_Grotesk'] flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-primary" />
            Relatórios
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {storeName || "Carregando..."} · {periodLabel}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Select value={period} onValueChange={(v) => setPeriod(v as PeriodKey)}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERIOD_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button variant="outline" size="sm" onClick={loadReport} disabled={loading} className="gap-2">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>

          <Button
            size="sm"
            onClick={handleDownloadPDF}
            disabled={loading || downloading}
            className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white"
          >
            <FileDown className={`h-4 w-4 ${downloading ? "animate-bounce" : ""}`} />
            {downloading ? "Gerando PDF..." : "Baixar PDF"}
          </Button>
        </div>
      </div>

      {/* ── Printable area ──────────────────────────────────────────────────── */}
      <div ref={reportRef} className="space-y-6 bg-white rounded-lg p-1">

        {/* Report title (visible in PDF) */}
        <div className="flex items-center justify-between px-1">
          <p className="text-xs text-muted-foreground">
            Período: <strong>{periodLabel}</strong> · Gerado em {new Date().toLocaleString("pt-BR")}
          </p>
        </div>

        {/* ── KPI Cards ─────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
          <KpiCard
            title="Faturamento"
            value={fmt(totalFaturamento)}
            icon={DollarSign} iconColor="text-emerald-600" bgColor="bg-emerald-500"
            loading={loading}
          />
          <KpiCard
            title="Lucro Total"
            value={fmt(totalLucro)}
            sub={totalFaturamento > 0 ? `Margem: ${margemMedia.toFixed(1)}%` : undefined}
            icon={TrendingUp} iconColor="text-violet-600" bgColor="bg-violet-500"
            loading={loading}
          />
          <KpiCard
            title="Total de Vendas"
            value={totalVendas.toString()}
            icon={Receipt} iconColor="text-amber-600" bgColor="bg-amber-500"
            loading={loading}
          />
          <KpiCard
            title="Ticket Médio"
            value={fmt(ticketMedio)}
            icon={Target} iconColor="text-cyan-600" bgColor="bg-cyan-500"
            loading={loading}
          />
          <KpiCard
            title="Unidades Vendidas"
            value={totalUnidades.toString()}
            icon={Package} iconColor="text-rose-600" bgColor="bg-rose-500"
            loading={loading}
          />
          <KpiCard
            title="Margem de Lucro"
            value={`${margemMedia.toFixed(1)}%`}
            icon={ShoppingCart} iconColor="text-indigo-600" bgColor="bg-indigo-500"
            loading={loading}
          />
        </div>

        {/* ── Charts row ────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* Faturamento & Lucro by day */}
          <Card className="lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" />
                Faturamento & Lucro por Dia
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="h-56 bg-muted animate-pulse rounded" />
              ) : dailyData.length === 0 ? (
                <div className="h-56 flex items-center justify-center text-muted-foreground text-sm">
                  Nenhuma venda no período
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={dailyData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} width={46} />
                    <Tooltip
                      formatter={(value: number, name: string) => [
                        fmt(value),
                        name === "faturamento" ? "Faturamento" : "Lucro",
                      ]}
                    />
                    <Legend formatter={(v) => (v === "faturamento" ? "Faturamento" : "Lucro")} />
                    <Bar dataKey="faturamento" fill="#8b5cf6" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="lucro" fill="#06b6d4" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Payment methods pie */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Receipt className="h-4 w-4 text-primary" />
                Formas de Pagamento
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="h-56 bg-muted animate-pulse rounded" />
              ) : paymentMethodData.length === 0 ? (
                <div className="h-56 flex items-center justify-center text-muted-foreground text-sm">
                  Sem dados
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={paymentMethodData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={70}
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      labelLine={false}
                    >
                      {paymentMethodData.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: number) => fmt(v)} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Vendas por dia (linha) ─────────────────────────────────────── */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <ShoppingCart className="h-4 w-4 text-primary" />
              Número de Vendas por Dia
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="h-44 bg-muted animate-pulse rounded" />
            ) : dailyData.length === 0 ? (
              <div className="h-44 flex items-center justify-center text-muted-foreground text-sm">
                Nenhuma venda no período
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={dailyData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} width={30} />
                  <Tooltip formatter={(v: number) => [v, "Vendas"]} />
                  <Line
                    type="monotone"
                    dataKey="vendas"
                    stroke="#10b981"
                    strokeWidth={2}
                    dot={{ fill: "#10b981", r: 3 }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* ── Top Products Table ────────────────────────────────────────── */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Package className="h-4 w-4 text-primary" />
              Produtos Mais Vendidos
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="h-8 bg-muted animate-pulse rounded" />
                ))}
              </div>
            ) : topProducts.length === 0 ? (
              <p className="text-muted-foreground text-sm py-4 text-center">Nenhuma venda no período</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left border-b border-border">
                      <th className="pb-2 font-semibold text-muted-foreground text-xs uppercase">#</th>
                      <th className="pb-2 font-semibold text-muted-foreground text-xs uppercase">Produto</th>
                      <th className="pb-2 font-semibold text-muted-foreground text-xs uppercase text-right">Qtd</th>
                      <th className="pb-2 font-semibold text-muted-foreground text-xs uppercase text-right">Faturamento</th>
                      <th className="pb-2 font-semibold text-muted-foreground text-xs uppercase text-right">Lucro</th>
                      <th className="pb-2 font-semibold text-muted-foreground text-xs uppercase text-right">Margem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topProducts.map((p, i) => {
                      const margem = p.faturamento > 0 ? (p.lucro / p.faturamento) * 100 : 0;
                      return (
                        <tr key={i} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                          <td className="py-2.5 pr-2">
                            <Badge
                              variant="outline"
                              className={
                                i === 0
                                  ? "border-amber-400 text-amber-600"
                                  : i === 1
                                    ? "border-slate-400 text-slate-600"
                                    : i === 2
                                      ? "border-orange-400 text-orange-600"
                                      : "border-border text-muted-foreground"
                              }
                            >
                              {i + 1}º
                            </Badge>
                          </td>
                          <td className="py-2.5 font-medium">{p.name}</td>
                          <td className="py-2.5 text-right text-muted-foreground">{p.quantidade}</td>
                          <td className="py-2.5 text-right font-semibold text-emerald-600">{fmt(p.faturamento)}</td>
                          <td className="py-2.5 text-right font-semibold text-violet-600">{fmt(p.lucro)}</td>
                          <td className="py-2.5 text-right">
                            <span
                              className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${margem >= 40
                                  ? "bg-emerald-100 text-emerald-700"
                                  : margem >= 20
                                    ? "bg-amber-100 text-amber-700"
                                    : "bg-red-100 text-red-700"
                                }`}
                            >
                              {margem.toFixed(1)}%
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-border bg-muted/20">
                      <td colSpan={2} className="py-2 font-semibold text-xs uppercase text-muted-foreground pl-1">
                        Total (top {topProducts.length})
                      </td>
                      <td className="py-2 text-right font-semibold text-sm">
                        {topProducts.reduce((s, p) => s + p.quantidade, 0)}
                      </td>
                      <td className="py-2 text-right font-semibold text-sm text-emerald-600">
                        {fmt(topProducts.reduce((s, p) => s + p.faturamento, 0))}
                      </td>
                      <td className="py-2 text-right font-semibold text-sm text-violet-600">
                        {fmt(topProducts.reduce((s, p) => s + p.lucro, 0))}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Summary footer ─────────────────────────────────────────────── */}
        <Card className="bg-gradient-to-r from-indigo-50 to-violet-50 border-indigo-100">
          <CardContent className="pt-4 pb-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
              {[
                { label: "Faturamento Total", value: fmt(totalFaturamento), color: "text-emerald-700" },
                { label: "Lucro Total", value: fmt(totalLucro), color: "text-violet-700" },
                { label: "Margem Média", value: `${margemMedia.toFixed(1)}%`, color: "text-indigo-700" },
                { label: "Total de Vendas", value: totalVendas.toString(), color: "text-amber-700" },
              ].map((item) => (
                <div key={item.label} className="space-y-0.5">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">{item.label}</p>
                  <p className={`text-lg font-bold ${item.color}`}>
                    {loading ? "..." : item.value}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

      </div>
    </div>
  );
}
