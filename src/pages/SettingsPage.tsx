import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  Link2, Store, Copy, ExternalLink, ShoppingCart,
  UtensilsCrossed, AlertCircle, RefreshCw, Eye, EyeOff,
  FileText, Save, ExternalLink as ExtLink, Shield, Radio, Printer,
  CheckCircle2, Star, Clock, ShoppingBag, Receipt, Percent,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  SEFAZ_BY_UF, UF_NAMES, SERVICO_LABELS,
  type SefazServico,
} from "@/lib/sefaz-endpoints";

// ── Tipos ─────────────────────────────────────────────────────────────────────
interface NfeConfig {
  token?: string;
  ambiente?: "homologacao" | "producao";
  cnpj?: string;
  razao_social?: string;
  inscricao_estadual?: string;
  regime_tributario?: "1" | "2" | "3";
  uf?: string;
  nfce_serie?: string;
  nfce_csc_id?: string;
  nfce_csc_token?: string;
}

interface IfoodConfig {
  merchant_id?: string;
  client_id?: string;
  client_secret?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function maskCnpj(v: string) {
  return v
    .replace(/\D/g, "")
    .slice(0, 14)
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}

// ═══════════════════════════════════════════════════════════════════════════════
export default function SettingsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"links" | "integracoes" | "assinatura" | "ifood" | "impressora" | "pdv">("links");
  const [sefazServico, setSefazServico] = useState<SefazServico>("NFeAutorizacao");
  const [showToken, setShowToken] = useState(false);
  const [nfe, setNfe] = useState<NfeConfig>({});
  const [ifood, setIfood] = useState<IfoodConfig>({});
  const [nfeLoaded, setNfeLoaded] = useState(false);

  // ── Query: perfil ──────────────────────────────────────────────────────────
  const {
    data: profile,
    isLoading: profileLoading,
    isError: profileError,
    refetch: retryProfile,
  } = useQuery({
    queryKey: ["profile", user?.id],
    enabled: !!user,
    retry: 2,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("store_id, full_name")
        .eq("auth_user_id", user!.id)
        .single();
      if (error) throw error;
      return data;
    },
  });

  // ── Query: store (dados públicos da loja) ────────────────────────────────
  const { data: store, isLoading: storeLoading } = useQuery({
    queryKey: ["store", profile?.store_id],
    enabled: !!profile?.store_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stores")
        .select("id, name, active_menu_type")
        .eq("id", profile!.store_id!)
        .single();
      if (error) throw error;
      return data;
    },
  });

  // ── Query: store_tax_config (Reforma 2026) ───────────────────────────────
  const { data: taxConfig, isLoading: taxLoading } = useQuery({
    queryKey: ["store_tax_config", profile?.store_id],
    enabled: !!profile?.store_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("store_tax_config")
        .select("*")
        .eq("store_id", profile!.store_id!)
        .maybeSingle();
      if (error) throw error;
      return data || { cbs_rate: 0.9, ibs_rate: 0.1 };
    },
  });

  const [taxForm, setTaxForm] = useState({ cbs_rate: 0.9, ibs_rate: 0.1 });

  const [printers, setPrinters] = useState<any[]>([]);
  const [selectedCaixaPrinter, setSelectedCaixaPrinter] = useState(localStorage.getItem('pdv_printer_caixa') || '');
  const [selectedCozinhaPrinter, setSelectedCozinhaPrinter] = useState(localStorage.getItem('pdv_printer_cozinha') || '');

  useEffect(() => {
    // @ts-ignore
    if (window.electronAPI) {
      // @ts-ignore
      window.electronAPI.getPrinters().then(setPrinters).catch(console.error);
    }
  }, []);

  useEffect(() => {
    if (taxConfig) {
      setTaxForm({ 
        cbs_rate: Number(taxConfig.cbs_rate), 
        ibs_rate: Number(taxConfig.ibs_rate) 
      });
    }
  }, [taxConfig]);

  // ── Mutation: salvar impostos ──────────────────────────────────────────────
  const taxMutation = useMutation({
    mutationFn: async () => {
      if (!store?.id) throw new Error("Loja não encontrada");
      
      const { error } = await supabase
        .from("store_tax_config")
        .upsert({ 
          store_id: store.id, 
          cbs_rate: taxForm.cbs_rate, 
          ibs_rate: taxForm.ibs_rate,
          updated_at: new Date().toISOString()
        }, { onConflict: "store_id" });
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["store_tax_config"] });
      toast.success("Configurações de impostos atualizadas!");
    },
    onError: (e: any) => toast.error(`Erro ao salvar impostos: ${e.message}`),
  });

  // ── Query: assinatura (Stripe) ─────────────────────────────────────────────
  const { data: subscription, isLoading: subLoading } = useQuery({
    queryKey: ["subscription", profile?.store_id],
    enabled: !!profile?.store_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subscriptions")
        .select("*")
        .eq("store_id", profile!.store_id!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // ── Mutation: criar checkout stripe ─────────────────────────────────────────
  const checkoutMutation = useMutation({
    mutationFn: async (plan: string) => {
      if (!profile?.store_id) throw new Error("Loja não encontrada");

      const { data, error } = await supabase.functions.invoke("stripe-checkout", {
        body: { 
          plan, 
          storeId: profile.store_id,
          successUrl: `${window.location.origin}/dashboard/settings?activeTab=assinatura&success=true`,
          cancelUrl: `${window.location.origin}/dashboard/settings?activeTab=assinatura&cancel=true`,
        },
      });

      if (error) throw error;
      if (data?.url) window.location.href = data.url;
    },
    onError: (e: any) => toast.error(`Erro ao iniciar pagamento: ${e.message}`),
  });

  // ── Query: store_secrets (só o owner acessa — token NFe isolado) ────────────
  const { data: secrets, isLoading: secretsLoading } = useQuery({
    queryKey: ["store_secrets", profile?.store_id],
    enabled: !!profile?.store_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("store_secrets")
        .select("id, nfe_config, ifood_config")
        .eq("store_id", profile!.store_id!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // Inicializa o formulário NFe quando os secrets chegarem
  useEffect(() => {
    if (!nfeLoaded && secrets) {
      if (secrets.nfe_config) setNfe(secrets.nfe_config as NfeConfig);
      if (secrets.ifood_config) setIfood(secrets.ifood_config as IfoodConfig);
      setNfeLoaded(true);
    }
  }, [secrets, nfeLoaded]);

  // ── Mutation: salvar NFe config em store_secrets ─────────────────────────────
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!store?.id) throw new Error("Loja não encontrada");

      // Limpa espaços em branco dos tokens antes de salvar
      const cleanedNfe = {
        ...nfe,
        token: nfe.token?.trim(),
        nfce_csc_token: nfe.nfce_csc_token?.trim(),
      };

      if (secrets?.id) {
        // Atualiza registro existente
        const { error } = await supabase
          .from("store_secrets")
          .update({ 
            nfe_config: cleanedNfe,
            ifood_config: ifood
          })
          .eq("id", secrets.id);
        if (error) throw error;
      } else {
        // Cria novo registro
        const { error } = await supabase
          .from("store_secrets")
          .insert({ 
            store_id: store.id, 
            nfe_config: cleanedNfe,
            ifood_config: ifood
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["store_secrets"] });
      toast.success("Configurações salvas com segurança!");
    },
    onError: (e: any) => toast.error(`Erro ao salvar: ${e.message}`),
  });

  const storeId     = profile?.store_id ?? null;
  const pdvUrl      = storeId ? `${window.location.origin}/pdv/${storeId}`      : null;
  const cardapioUrl = storeId ? `${window.location.origin}/cardapio/${storeId}` : null;

  const copyLink = (url: string | null) => {
    if (!url) return;
    navigator.clipboard.writeText(url);
    toast.success("Link copiado!");
  };

  // ── Mutation: trocar cardápio ativo ──────────────────────────────────────
  const menuMutation = useMutation({
    mutationFn: async (type: string) => {
      if (!store?.id) throw new Error("Loja não encontrada");
      const { error } = await supabase
        .from("stores")
        .update({ active_menu_type: type })
        .eq("id", store.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["store"] });
      toast.success("Cardápio online atualizado!");
    },
    onError: (e: any) => toast.error(`Erro ao trocar cardápio: ${e.message}`),
  });

  // ── Componente: caixa de link ──────────────────────────────────────────────
  function LinkBox({ url }: { url: string | null }) {
    if (profileLoading) return <Skeleton className="h-10 w-full rounded-lg" />;
    if (profileError) return (
      <div className="flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 gap-3">
        <div className="flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>Não foi possível carregar o link.</span>
        </div>
        <Button size="sm" variant="outline" className="gap-1.5 border-red-300 text-red-700 hover:bg-red-100 shrink-0" onClick={() => retryProfile()}>
          <RefreshCw className="h-3.5 w-3.5" /> Tentar novamente
        </Button>
      </div>
    );
    if (!storeId) return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 flex items-center gap-2">
        <AlertCircle className="h-4 w-4 shrink-0" />
        Loja não configurada. Entre em contato com o suporte.
      </div>
    );
    return (
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="flex-1 flex items-center gap-2 bg-muted rounded-lg px-3 py-2 border overflow-hidden">
          <Link2 className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="text-sm font-mono truncate text-muted-foreground">{url}</span>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => copyLink(url)} className="gap-2 shrink-0">
            <Copy className="h-4 w-4" /> Copiar
          </Button>
          <Button asChild className="gap-2 shrink-0">
            <a href={url!} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4" /> Abrir
            </a>
          </Button>
        </div>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      {/* Título */}
      <div>
        <h1 className="text-2xl font-bold font-['Space_Grotesk']">Configurações</h1>
        <p className="text-muted-foreground text-sm">Gerencie os recursos da sua loja</p>
      </div>

      {/* Grade de Ícones (Tabs) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-8 gap-3">
        {([
          { id: "links",       label: "Links",       icon: Link2 },
          { id: "integracoes", label: "Integrações", icon: Radio },
          { id: "ifood",       label: "iFood",       icon: Store },
          { id: "assinatura",  label: "Assinatura",  icon: Star },
          { id: "impressora",  label: "Impressora",  icon: Printer },
          { id: "pdv",         label: "PDV",         icon: ShoppingCart },
        ] as const).map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={cn(
                "flex flex-col items-center justify-center p-4 bg-white border rounded-xl transition-all duration-300 group",
                isActive 
                  ? "border-blue-500 shadow-md ring-2 ring-blue-500/20 bg-blue-50/30 scale-105" 
                  : "border-slate-200 hover:border-blue-400 hover:shadow-lg hover:-translate-y-1"
              )}
            >
              <Icon 
                strokeWidth={1.5} 
                className={cn(
                  "w-10 h-10 mb-3 transition-colors",
                  isActive ? "text-blue-600" : "text-blue-500 group-hover:text-blue-600"
                )} 
              />
              <span className={cn(
                "text-xs font-semibold text-center leading-tight",
                isActive ? "text-blue-900" : "text-slate-600 group-hover:text-slate-900"
              )}>
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── ABA: LINKS ──────────────────────────────────────────────────────── */}
      {activeTab === "links" && (
        <>
          {/* Link do PDV */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ShoppingCart className="h-5 w-5 text-primary" />
                Link do PDV — Acesso para atendentes
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Compartilhe este link com seus atendentes. Ele abre uma versão simplificada do PDV
                com apenas os produtos — sem precisar de login de administrador.
              </p>
              <LinkBox url={pdvUrl} />
              <div className="rounded-lg bg-blue-50 border border-blue-100 p-3 text-sm text-blue-700 space-y-1">
                <p className="font-semibold flex items-center gap-1.5"><Store className="h-4 w-4" /> Como funciona:</p>
                <ul className="list-disc list-inside space-y-0.5 text-xs">
                  <li>O atendente acessa o link e vê todos os produtos ativos</li>
                  <li>Pode pesquisar por nome, código de barras ou categoria</li>
                  <li>Adiciona itens ao carrinho e finaliza a venda normalmente</li>
                  <li>A venda é registrada no sistema automaticamente</li>
                  <li>Não é necessário nenhum login de administrador</li>
                </ul>
              </div>
            </CardContent>
          </Card>

          {/* Link do Cardápio */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <UtensilsCrossed className="h-5 w-5 text-primary" />
                Cardápio Online — Link para clientes
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Compartilhe este link com seus clientes. Eles podem fazer pedidos pelo celular
                e você recebe direto na tela de <strong>Pedidos</strong>.
              </p>
              <LinkBox url={cardapioUrl} />

              <div className="p-4 rounded-xl border-2 bg-primary/5 border-primary/20 space-y-3 mt-4">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-primary" />
                  <Label className="font-bold text-primary text-sm uppercase tracking-wider">Qual cardápio mostrar agora?</Label>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: "morning", label: "Churrascaria", sub: "Manhã" },
                    { id: "night", label: "Macarrão", sub: "Noite" },
                    { id: "both", label: "Ambos", sub: "Dia Todo" },
                  ].map((m) => (
                    <button
                      key={m.id}
                      onClick={() => menuMutation.mutate(m.id)}
                      disabled={menuMutation.isPending || (store as any)?.active_menu_type === m.id}
                      className={cn(
                        "flex flex-col items-center justify-center p-2.5 rounded-lg border-2 transition-all gap-0.5",
                        (store as any)?.active_menu_type === m.id 
                          ? "border-primary bg-primary text-primary-foreground" 
                          : "border-border bg-white hover:border-primary/40 disabled:opacity-50"
                      )}
                    >
                      <span className="text-xs font-bold">{m.label}</span>
                      <span className={cn("text-[10px] opacity-70", (store as any)?.active_menu_type === m.id ? "text-white" : "text-muted-foreground")}>
                        {m.sub}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-lg bg-emerald-50 border border-emerald-100 p-3 text-sm text-emerald-700 space-y-1 mt-4">
                <p className="font-semibold flex items-center gap-1.5"><UtensilsCrossed className="h-4 w-4" /> Como funciona:</p>
                <ul className="list-disc list-inside space-y-0.5 text-xs">
                  <li>Cliente acessa o link e vê o cardápio com fotos e preços</li>
                  <li>Adiciona itens ao carrinho e informa nome e telefone</li>
                  <li>Envia o pedido — você recebe na tela de Pedidos</li>
                  <li>Você aceita, muda o status e o cliente acompanha em tempo real</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* ── ABA: INTEGRAÇÕES ────────────────────────────────────────────────── */}
      {activeTab === "integracoes" && (
        <>


          {/* Placeholder outras integrações */}
          <Card className="opacity-60">
            <CardHeader>
              <CardTitle className="text-base text-muted-foreground">
                Mais integrações — em breve
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Pix automático, WhatsApp, iFood e mais serão adicionados em breve.
              </p>
            </CardContent>
          </Card>
        </>
      )}


      {/* ── ABA: IFOOD ────────────────────────────────────────────────────────── */}
      {activeTab === "ifood" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShoppingBag className="h-5 w-5 text-red-600" />
              Configuração iFood
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="rounded-lg bg-red-50 border border-red-100 p-4 text-sm text-red-800">
              <p className="font-semibold flex items-center gap-1.5">🚀 Integração em Tempo Real</p>
              <p className="text-xs mt-1 leading-relaxed">
                Para receber pedidos do iFood, você deve primeiro criar um App no <strong>iFood Developer Portal</strong> e obter as chaves abaixo.
              </p>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Merchant ID (ID da Loja no iFood)</Label>
                <Input 
                  placeholder="Ex: 00000000-0000-0000-0000-000000000000"
                  value={ifood.merchant_id ?? ""}
                  onChange={e => setIfood({ ...ifood, merchant_id: e.target.value })}
                />
              </div>

              <div className="space-y-1.5">
                <Label>Client ID</Label>
                <Input 
                  placeholder="Seu Client ID do iFood"
                  value={ifood.client_id ?? ""}
                  onChange={e => setIfood({ ...ifood, client_id: e.target.value })}
                />
              </div>

              <div className="space-y-1.5">
                <Label>Client Secret</Label>
                <div className="relative">
                  <Input 
                    type={showToken ? "text" : "password"}
                    placeholder="Seu Client Secret do iFood"
                    value={ifood.client_secret ?? ""}
                    onChange={e => setIfood({ ...ifood, client_secret: e.target.value })}
                  />
                  <button
                    type="button"
                    onClick={() => setShowToken(!showToken)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <Button 
                className="w-full gap-2 bg-red-600 hover:bg-red-700 text-white"
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending}
              >
                <Save className="h-4 w-4" />
                {saveMutation.isPending ? "Salvando..." : "Salvar Chaves iFood"}
              </Button>
            </div>

            <Separator />

            <div className="space-y-2">
              <h4 className="text-sm font-bold">Instruções para Teste:</h4>
              <ul className="text-xs text-muted-foreground list-disc list-inside space-y-1">
                <li>Habilite o "Modo Teste" no portal do iFood.</li>
                <li>Use o endereço de teste: <strong>Ramal Bujari, 100 - Bujari</strong>.</li>
                <li>Os pedidos aparecerão automaticamente na sua aba <strong>Pedidos</strong>.</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── ABA: ASSINATURA ─────────────────────────────────────────────────── */}
      {activeTab === "assinatura" && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Star className="h-5 w-5 text-primary" />
                Sua Assinatura
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {subLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-4 w-1/3" />
                  <Skeleton className="h-4 w-1/2" />
                </div>
              ) : (
                <div className="grid gap-6 sm:grid-cols-2">
                  <div className="space-y-4">
                    <div>
                      <Label className="text-muted-foreground uppercase text-[10px] font-bold tracking-wider">Plano Atual</Label>
                      <p className="text-2xl font-bold capitalize">
                        {subscription?.plan || "Nenhum"}
                        {subscription?.status === 'trialing' && (
                          <Badge variant="secondary" className="ml-2 bg-amber-100 text-amber-700 hover:bg-amber-100 border-amber-200">Período de Teste</Badge>
                        )}
                        {subscription?.status === 'active' && (
                          <Badge variant="secondary" className="ml-2 bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-emerald-200">Ativa</Badge>
                        )}
                      </p>
                    </div>

                    {subscription?.status === 'trialing' && subscription?.trial_ends_at && (
                      <div className="rounded-lg bg-amber-50 border border-amber-100 p-4 text-sm text-amber-800">
                        <p className="font-semibold flex items-center gap-1.5">
                          <Clock className="h-4 w-4" /> Teste Grátis Ativo
                        </p>
                        <p className="text-xs mt-1">
                          Você tem <strong>{Math.max(0, Math.ceil((new Date(subscription.trial_ends_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))} dias</strong> de acesso gratuito restantes. 
                          Assine um plano agora para não perder o acesso após o período.
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="space-y-4 border-l pl-6 hidden sm:block">
                    <div>
                      <Label className="text-muted-foreground uppercase text-[10px] font-bold tracking-wider">Expiração / Renovação</Label>
                      <p className="text-sm font-medium mt-1 text-gray-700">
                        {subscription?.trial_ends_at 
                          ? new Date(subscription.trial_ends_at).toLocaleDateString('pt-BR') 
                          : "Não disponível"}
                      </p>
                    </div>
                  </div>
                </div>
              )}
              
              <Separator />

              <h3 className="font-bold text-lg">Trocar ou Assinar Plano</h3>
              <p className="text-sm text-muted-foreground -mt-4">Escolha o plano ideal para o seu negócio e faça o upgrade instantaneamente.</p>
              <div className="grid gap-4 sm:grid-cols-3">
                {[
                  { 
                    id: "starter", 
                    name: "Starter", 
                    price: "59,90", 
                    items: "50 prod.", 
                    user: "1 usuário",
                    description: "Ideal para começar"
                  },
                  { 
                    id: "pro", 
                    name: "Pro", 
                    price: "89,90", 
                    items: "150 prod.", 
                    user: "3 usuários",
                    description: "O melhor custo-benefício"
                  },
                  { 
                    id: "business", 
                    name: "Business", 
                    price: "149,99", 
                    items: "Ilimitado", 
                    user: "Ilimitado",
                    description: "Para grandes operações"
                  },
                ].map((p) => (
                  <div key={p.id} className={cn(
                    "relative p-5 rounded-2xl border-2 transition-all flex flex-col gap-4 shadow-sm",
                    subscription?.plan === p.id 
                      ? "border-primary bg-primary/5 ring-1 ring-primary/20" 
                      : "border-border hover:border-primary/40 hover:shadow-md bg-card"
                  )}>
                    {subscription?.plan === p.id && (
                      <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-white text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider shadow-sm">
                        Plano Atual
                      </span>
                    )}
                    
                    <div className="space-y-1">
                      <h4 className="font-bold text-lg">{p.name}</h4>
                      <p className="text-[11px] text-muted-foreground leading-tight">{p.description}</p>
                    </div>

                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl font-black text-foreground">R${p.price}</span>
                      <span className="text-xs text-muted-foreground">/mês</span>
                    </div>

                    <ul className="space-y-2 flex-1">
                      <li className="flex items-center gap-2 text-xs text-muted-foreground">
                        <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" /> {p.items}
                      </li>
                      <li className="flex items-center gap-2 text-xs text-muted-foreground">
                        <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" /> {p.user}
                      </li>
                    </ul>

                    <Button 
                      className={cn(
                        "w-full font-bold transition-all",
                        subscription?.plan === p.id ? "bg-muted text-muted-foreground" : "hover:scale-[1.02] active:scale-[0.98]"
                      )}
                      variant={subscription?.plan === p.id ? "secondary" : "default"}
                      disabled={checkoutMutation.isPending || subscription?.plan === p.id}
                      onClick={() => checkoutMutation.mutate(p.id)}
                    >
                      {checkoutMutation.isPending 
                        ? "Carregando..." 
                        : subscription?.plan === p.id 
                          ? "Plano Ativo" 
                          : "Assinar Agora"}
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── ABA: IMPRESSORA ─────────────────────────────────────────────────── */}
      {activeTab === "impressora" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Printer className="h-5 w-5 text-primary" />
              Configuração de Impressão
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-3">
              <h3 className="font-semibold">Impressão Automática</h3>
              <p className="text-sm text-muted-foreground">
                Ao ativar esta opção, o sistema tentará abrir a tela de impressão automaticamente
                logo após você clicar em "Finalizar Venda" no PDV.
              </p>
              
              <div className="flex items-center gap-2 mt-2">
                <input 
                  type="checkbox" 
                  id="autoPrint" 
                  className="w-4 h-4 text-primary rounded border-gray-300 focus:ring-primary"
                  checked={localStorage.getItem("pdv_autoprint") === "true"}
                  onChange={(e) => {
                    localStorage.setItem("pdv_autoprint", e.target.checked ? "true" : "false");
                    // Força re-render para atualizar o checkbox visualmente
                    setNfe({ ...nfe });
                    toast.success(e.target.checked ? "Impressão automática ativada!" : "Impressão automática desativada!");
                  }}
                />
                <Label htmlFor="autoPrint" className="font-medium cursor-pointer">
                  Imprimir recibo automaticamente ao finalizar venda
                </Label>
              </div>
            </div>

            <Separator />

            <div className="space-y-3">
              <h3 className="font-semibold text-primary">Seleção de Impressoras (App Desktop)</h3>
              <p className="text-sm text-muted-foreground">
                Selecione as impressoras específicas para o Caixa (recibo fiscal) e para a Cozinha (pedidos).
              </p>
              
              {printers.length > 0 ? (
                <div className="grid gap-6 sm:grid-cols-2 mt-4">
                  <div className="space-y-1.5">
                    <Label className="font-semibold text-blue-600">Impressora do Caixa (Notas/Recibos)</Label>
                    <select 
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                      value={selectedCaixaPrinter}
                      onChange={e => {
                        setSelectedCaixaPrinter(e.target.value);
                        localStorage.setItem('pdv_printer_caixa', e.target.value);
                        toast.success("Impressora do caixa salva!");
                      }}
                    >
                      <option value="">-- Usar impressora padrão do sistema --</option>
                      {printers.map(p => (
                        <option key={p.name} value={p.name}>{p.name} {p.isDefault ? '(Padrão)' : ''}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="font-semibold text-orange-600">Impressora da Cozinha (Pedidos)</Label>
                    <select 
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                      value={selectedCozinhaPrinter}
                      onChange={e => {
                        setSelectedCozinhaPrinter(e.target.value);
                        localStorage.setItem('pdv_printer_cozinha', e.target.value);
                        toast.success("Impressora da cozinha salva!");
                      }}
                    >
                      <option value="">-- Não imprimir na cozinha --</option>
                      {printers.map(p => (
                        <option key={p.name} value={p.name}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              ) : (
                <div className="rounded-lg bg-yellow-50 border border-yellow-200 p-4 text-sm text-yellow-800">
                  <p className="font-semibold flex items-center gap-1.5">
                    Aviso
                  </p>
                  <p className="text-xs mt-1">
                    Nenhuma impressora encontrada ou você não está usando o aplicativo Desktop. A seleção de impressoras só está disponível no App Desktop instalado.
                  </p>
                </div>
              )}
            </div>

            <Separator />

            <div className="space-y-3">
              <h3 className="font-semibold flex items-center gap-2">
                🚀 Como configurar a Impressão Silenciosa (Sem tela de confirmação)
              </h3>
              <p className="text-sm text-muted-foreground">
                Por questões de segurança, os navegadores web não deixam um site imprimir sem a sua confirmação. 
                Porém, se você usa o PDV em um computador de caixa fixo (Windows), você pode configurar o Google Chrome ou Microsoft Edge para <strong>imprimir direto (Kiosk Printing)</strong>.
              </p>
              
              <div className="bg-muted p-4 rounded-lg space-y-2 text-sm">
                <p className="font-medium">Passo a passo (Google Chrome no Windows):</p>
                <ol className="list-decimal list-inside space-y-2 text-muted-foreground ml-2">
                  <li>Feche todos os navegadores Chrome abertos.</li>
                  <li>Clique com botão direito no atalho do Google Chrome na sua Área de Trabalho e vá em <strong>Propriedades</strong>.</li>
                  <li>Na aba Atalho, procure o campo <strong>Destino</strong>.</li>
                  <li>
                    No final do texto (depois das aspas), dê um espaço e adicione o código:<br/>
                    <code className="bg-background px-2 py-1 rounded text-primary mt-1 inline-block select-all">--kiosk-printing</code>
                  </li>
                  <li>O Destino ficará parecido com: <code>"C:\...\chrome.exe" --kiosk-printing</code></li>
                  <li>Clique em <strong>Aplicar</strong> e depois em <strong>OK</strong>.</li>
                  <li>Defina sua impressora térmica como a <strong>Impressora Padrão</strong> no Windows.</li>
                  <li>Abra o Chrome por esse atalho. Agora toda impressão irá direto para o papel!</li>
                </ol>
              </div>
              <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800">
                <strong>Atenção:</strong> Ao abrir o Chrome com esse atalho, qualquer coisa que você mandar imprimir em qualquer site será impresso direto na impressora padrão sem perguntar. Use esse atalho apenas no computador do caixa.
              </div>
            </div>
          </CardContent>
        </Card>
      )}
      {/* ── ABA: PDV ────────────────────────────────────────────────────────── */}
      {activeTab === "pdv" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShoppingCart className="h-5 w-5 text-primary" />
              Configurações do PDV
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-3">
              <h3 className="font-semibold">Rastreio de Pedido (QR Code)</h3>
              <p className="text-sm text-muted-foreground">
                Gere um QR Code no cupom fiscal impresso, permitindo que o cliente acompanhe o status do pedido.
              </p>
              
              <div className="flex items-center gap-2 mt-2">
                <input 
                  type="checkbox" 
                  id="qrTrack" 
                  className="w-4 h-4 text-primary rounded border-gray-300 focus:ring-primary"
                  checked={localStorage.getItem("pdv_tracking_qr") === "true"}
                  onChange={(e) => {
                    localStorage.setItem("pdv_tracking_qr", e.target.checked ? "true" : "false");
                    setNfe({ ...nfe });
                    toast.success(e.target.checked ? "QR Code de rastreio ativado!" : "QR Code de rastreio desativado!");
                  }}
                />
                <Label htmlFor="qrTrack" className="font-medium cursor-pointer">
                  Gerar QR Code de acompanhamento no cupom
                </Label>
              </div>
            </div>

            </div>
          </CardContent>
        </Card>
      )}

    </div>
  );
}
