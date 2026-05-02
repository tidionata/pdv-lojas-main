import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  Link2, Store, Copy, ExternalLink, ShoppingCart,
  UtensilsCrossed, AlertCircle, RefreshCw, Eye, EyeOff,
  FileText, Save, ExternalLink as ExtLink, Shield, Radio, Printer,
  CheckCircle2,
} from "lucide-react";
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
  const [activeTab, setActiveTab] = useState<"links" | "integracoes" | "nfce" | "impostos">("links");
  const [sefazServico, setSefazServico] = useState<SefazServico>("NFeAutorizacao");
  const [showToken, setShowToken] = useState(false);
  const [nfe, setNfe] = useState<NfeConfig>({});
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
        .select("id, name")
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

  // ── Query: store_secrets (só o owner acessa — token NFe isolado) ────────────
  const { data: secrets, isLoading: secretsLoading } = useQuery({
    queryKey: ["store_secrets", profile?.store_id],
    enabled: !!profile?.store_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("store_secrets")
        .select("id, nfe_config")
        .eq("store_id", profile!.store_id!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // Inicializa o formulário NFe quando os secrets chegarem
  useEffect(() => {
    if (!nfeLoaded && secrets?.nfe_config) {
      setNfe(secrets.nfe_config as NfeConfig);
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
          .update({ nfe_config: cleanedNfe })
          .eq("id", secrets.id);
        if (error) throw error;
      } else {
        // Cria novo registro
        const { error } = await supabase
          .from("store_secrets")
          .insert({ store_id: store.id, nfe_config: cleanedNfe });
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
    <div className="space-y-6 max-w-2xl">
      {/* Título */}
      <div>
        <h1 className="text-2xl font-bold font-['Space_Grotesk']">Configurações</h1>
        <p className="text-muted-foreground text-sm">Gerencie os recursos da sua loja</p>
      </div>

      {/* Abas */}
      <div className="flex gap-1 border-b">
        {([
          { id: "links",       label: "🔗 Links" },
          { id: "integracoes", label: "⚙️ Integrações" },
          { id: "nfce",        label: "🧾 NFC-e" },
          { id: "impostos",    label: "⚖️ Impostos" },
          { id: "impressora",  label: "🖨️ Impressora" },
        ] as const).map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
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
              <div className="rounded-lg bg-emerald-50 border border-emerald-100 p-3 text-sm text-emerald-700 space-y-1">
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
          {/* Focus NFe */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <FileText className="h-5 w-5 text-primary" />
                Nota Fiscal Eletrônica — Focus NFe
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">

              {/* Aviso informativo */}
              <div className="rounded-lg bg-blue-50 border border-blue-100 p-3 text-xs text-blue-700 space-y-1">
                <p className="font-semibold">Como configurar:</p>
                <ol className="list-decimal list-inside space-y-0.5">
                  <li>Crie sua conta em <a href="https://focusnfe.com.br" target="_blank" rel="noopener noreferrer" className="underline font-medium">focusnfe.com.br <ExtLink className="h-3 w-3 inline" /></a></li>
                  <li>Cadastre sua empresa (CNPJ + certificado digital A1)</li>
                  <li>Acesse <strong>Painel API → Tokens</strong> e copie o token de produção</li>
                  <li>Cole o token abaixo e salve</li>
                </ol>
              </div>

              {/* Token */}
              <div className="space-y-1.5">
                <Label className="font-semibold flex items-center gap-1.5">
                  <Shield className="h-3.5 w-3.5 text-muted-foreground" />
                  Token de acesso da API
                </Label>
                <div className="flex gap-2">
                  <Input
                    type={showToken ? "text" : "password"}
                    placeholder="Cole aqui o token da Focus NFe..."
                    value={nfe.token ?? ""}
                    onChange={(e) => setNfe({ ...nfe, token: e.target.value })}
                    className="font-mono text-sm"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setShowToken(!showToken)}
                    title={showToken ? "Ocultar" : "Mostrar"}
                  >
                    {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  O token fica salvo por empresa e nunca é exibido publicamente.
                </p>
              </div>

              {/* Ambiente */}
              <div className="space-y-1.5">
                <Label className="font-semibold">Ambiente</Label>
                <div className="flex gap-2">
                  {(["homologacao", "producao"] as const).map((env) => (
                    <button
                      key={env}
                      onClick={() => setNfe({ ...nfe, ambiente: env })}
                      className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors ${
                        nfe.ambiente === env
                          ? env === "producao"
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-amber-100 text-amber-800 border-amber-300"
                          : "bg-muted text-muted-foreground hover:bg-muted/80"
                      }`}
                    >
                      {env === "homologacao" ? "🧪 Homologação (testes)" : "🚀 Produção"}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Use <strong>Homologação</strong> para testar. Notas nesse modo não têm validade fiscal.
                </p>
              </div>

              <hr />

              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Dados fiscais da empresa emissora
              </p>

              {/* CNPJ */}
              <div className="space-y-1.5">
                <Label>CNPJ</Label>
                <Input
                  placeholder="00.000.000/0000-00"
                  value={nfe.cnpj ?? ""}
                  onChange={(e) => setNfe({ ...nfe, cnpj: maskCnpj(e.target.value) })}
                  maxLength={18}
                />
              </div>

              {/* Razão Social */}
              <div className="space-y-1.5">
                <Label>Razão Social</Label>
                <Input
                  placeholder="Nome da empresa como registrado na Receita Federal"
                  value={nfe.razao_social ?? ""}
                  onChange={(e) => setNfe({ ...nfe, razao_social: e.target.value })}
                />
              </div>

              {/* Inscrição Estadual */}
              <div className="space-y-1.5">
                <Label>Inscrição Estadual</Label>
                <Input
                  placeholder="IE da empresa (ou ISENTO)"
                  value={nfe.inscricao_estadual ?? ""}
                  onChange={(e) => setNfe({ ...nfe, inscricao_estadual: e.target.value })}
                />
              </div>

              {/* Regime Tributário */}
              <div className="space-y-1.5">
                <Label>Regime Tributário</Label>
                <select
                  value={nfe.regime_tributario ?? ""}
                  onChange={(e) => setNfe({ ...nfe, regime_tributario: e.target.value as any })}
                  className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">Selecione...</option>
                  <option value="1">1 — Simples Nacional</option>
                  <option value="2">2 — Simples Nacional (excesso de sublimite)</option>
                  <option value="3">3 — Regime Normal</option>
                </select>
              </div>

              {/* Botão salvar */}
              <Button
                className="w-full gap-2"
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending || storeLoading}
              >
                <Save className="h-4 w-4" />
                {saveMutation.isPending ? "Salvando..." : "Salvar configurações"}
              </Button>

              {/* Status salvo */}
              {secrets?.nfe_config && (secrets.nfe_config as NfeConfig).token && (
                <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
                  <Shield className="h-3.5 w-3.5" />
                  Token configurado em modo{" "}
                  <strong>{(secrets.nfe_config as NfeConfig).ambiente === "producao" ? "Produção" : "Homologação"}</strong>
                  {" — "}⛔ isolado por RLS (só o owner acessa)
                </div>
              )}
            </CardContent>
          </Card>

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

      {/* ── ABA: NFC-e ──────────────────────────────────────────────────────── */}
      {activeTab === "nfce" && (
        <>
          {/* Seletor de Estado + Série + CSC */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <FileText className="h-5 w-5 text-primary" />
                Configuração da NFC-e
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800">
                <strong>NFC-e</strong> é a Nota Fiscal de Consumidor Eletrônica emitida no PDV.
                Configure os dados abaixo de acordo com o seu estado e credenciais da SEFAZ.
              </div>

              {/* Estado (UF) */}
              <div className="space-y-1.5">
                <Label className="font-semibold">Estado (UF) da empresa</Label>
                <select
                  value={nfe.uf ?? ""}
                  onChange={(e) => setNfe({ ...nfe, uf: e.target.value })}
                  className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">Selecione o estado...</option>
                  {Object.entries(UF_NAMES).sort(([,a],[,b]) => a.localeCompare(b)).map(([uf, nome]) => (
                    <option key={uf} value={uf}>{uf} — {nome}</option>
                  ))}
                </select>
                {nfe.uf && (
                  <p className="text-xs text-muted-foreground">
                    Autorizador: <strong>{SEFAZ_BY_UF[nfe.uf]?.autorizador}</strong>
                  </p>
                )}
              </div>

              {/* Série NFC-e */}
              <div className="space-y-1.5">
                <Label className="font-semibold">Série NFC-e</Label>
                <Input
                  placeholder="Ex: 1"
                  value={nfe.nfce_serie ?? ""}
                  onChange={(e) => setNfe({ ...nfe, nfce_serie: e.target.value })}
                  maxLength={3}
                />
                <p className="text-xs text-muted-foreground">Número da série configurada na SEFAZ (geralmente 1).</p>
              </div>

              {/* CSC */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="font-semibold">CSC ID</Label>
                  <Input
                    placeholder="Ex: 1"
                    value={nfe.nfce_csc_id ?? ""}
                    onChange={(e) => setNfe({ ...nfe, nfce_csc_id: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="font-semibold">CSC Token</Label>
                  <Input
                    type="password"
                    placeholder="Código de Segurança do Contribuinte"
                    value={nfe.nfce_csc_token ?? ""}
                    onChange={(e) => setNfe({ ...nfe, nfce_csc_token: e.target.value })}
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">O CSC é gerado no portal da SEFAZ do seu estado e é obrigatório para o QR Code da NFC-e.</p>

              <Button
                className="w-full gap-2"
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending}
              >
                <Save className="h-4 w-4" />
                {saveMutation.isPending ? "Salvando..." : "Salvar configurações NFC-e"}
              </Button>
            </CardContent>
          </Card>

          {/* Consulta de endpoints SEFAZ */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Radio className="h-5 w-5 text-primary" />
                Webservices SEFAZ — Consulta de Endpoints
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Selecione o estado e o serviço para ver a URL do endpoint oficial da SEFAZ v4.00.
              </p>

              <div className="grid grid-cols-2 gap-3">
                {/* Seletor UF */}
                <div className="space-y-1.5">
                  <Label>Estado (UF)</Label>
                  <select
                    value={nfe.uf ?? ""}
                    onChange={(e) => setNfe({ ...nfe, uf: e.target.value })}
                    className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="">Selecione...</option>
                    {Object.entries(UF_NAMES).sort(([,a],[,b]) => a.localeCompare(b)).map(([uf, nome]) => (
                      <option key={uf} value={uf}>{uf} — {nome}</option>
                    ))}
                  </select>
                </div>

                {/* Seletor Serviço */}
                <div className="space-y-1.5">
                  <Label>Serviço</Label>
                  <select
                    value={sefazServico}
                    onChange={(e) => setSefazServico(e.target.value as SefazServico)}
                    className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    {(Object.entries(SERVICO_LABELS) as [SefazServico, string][]).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* URL resultado */}
              {nfe.uf && SEFAZ_BY_UF[nfe.uf] && (() => {
                const url = SEFAZ_BY_UF[nfe.uf!].endpoints[sefazServico];
                const aut = SEFAZ_BY_UF[nfe.uf!].autorizador;
                return (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold bg-primary/10 text-primary rounded-full px-2 py-0.5">{aut}</span>
                      <span className="text-xs text-muted-foreground">autorizador para {nfe.uf}</span>
                    </div>
                    <div className="flex gap-2">
                      <div className="flex-1 bg-muted rounded-lg px-3 py-2 border overflow-hidden">
                        <p className="text-xs font-mono text-muted-foreground truncate">{url}</p>
                      </div>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => { navigator.clipboard.writeText(url); toast.success("URL copiada!"); }}
                        title="Copiar URL"
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                      {!url.startsWith("—") && (
                        <Button asChild variant="outline" size="icon" title="Abrir no navegador">
                          <a href={url} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })()}

              {!nfe.uf && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Selecione um estado para ver os endpoints disponíveis.
                </p>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* ── ABA: IMPOSTOS ───────────────────────────────────────────────────── */}
      {activeTab === "impostos" && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Shield className="h-5 w-5 text-primary" />
                Reforma Tributária (IBS e CBS) — Período 2026
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="rounded-lg bg-blue-50 border border-blue-100 p-4 text-sm text-blue-700 space-y-2">
                <p className="font-semibold flex items-center gap-1.5">
                  <AlertCircle className="h-4 w-4" /> Período de Transição 2026
                </p>
                <p className="text-xs leading-relaxed">
                  Em 2026, entramos no período de testes da Reforma Tributária. Os sistemas devem destacar 
                  o IBS (Estadual/Municipal) e a CBS (Federal) com alíquotas reduzidas.
                </p>
                <ul className="list-disc list-inside text-xs space-y-1">
                  <li><strong>CBS:</strong> Alíquota padrão de <strong>0,9%</strong></li>
                  <li><strong>IBS:</strong> Alíquota padrão de <strong>0,1%</strong> (sendo 0,1% Estado e 0% Município)</li>
                  <li>A base de cálculo é o valor do item menos descontos.</li>
                </ul>
              </div>

              <div className="grid gap-6 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="font-semibold">Alíquota CBS (%)</Label>
                  <Input 
                    type="number" step="0.01"
                    value={taxForm.cbs_rate}
                    onChange={e => setTaxForm({ ...taxForm, cbs_rate: parseFloat(e.target.value) || 0 })}
                  />
                  <p className="text-[10px] text-muted-foreground">Padrão 2026: 0,90%</p>
                </div>

                <div className="space-y-1.5">
                  <Label className="font-semibold">Alíquota IBS (%)</Label>
                  <Input 
                    type="number" step="0.01"
                    value={taxForm.ibs_rate}
                    onChange={e => setTaxForm({ ...taxForm, ibs_rate: parseFloat(e.target.value) || 0 })}
                  />
                  <p className="text-[10px] text-muted-foreground">Padrão 2026: 0,10% (Estadual)</p>
                </div>
              </div>

              <Separator />

              <div className="bg-muted/30 p-4 rounded-lg border border-dashed">
                <p className="text-xs font-semibold mb-2 flex items-center gap-1.5 text-muted-foreground uppercase">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Próximos Passos
                </p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Além das alíquotas acima, você deve configurar a <strong>Classificação Tributária</strong> 
                  em cada produto (Cadastro de Produtos → Tributação).
                </p>
              </div>

              <Button 
                className="w-full gap-2" 
                onClick={() => taxMutation.mutate()}
                disabled={taxMutation.isPending || taxLoading}
              >
                <Save className="h-4 w-4" />
                {taxMutation.isPending ? "Salvando..." : "Salvar Alíquotas"}
              </Button>
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
    </div>
  );
}
