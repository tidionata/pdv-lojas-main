import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  Link2, Store, Copy, ExternalLink, ShoppingCart,
  UtensilsCrossed, AlertCircle, RefreshCw,
} from "lucide-react";


export default function SettingsPage() {
  const { user } = useAuth();

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

  const storeId = profile?.store_id ?? null;
  const pdvUrl      = storeId ? `${window.location.origin}/pdv/${storeId}`      : null;
  const cardapioUrl = storeId ? `${window.location.origin}/cardapio/${storeId}` : null;

  const copyLink = (url: string | null) => {
    if (!url) return;
    navigator.clipboard.writeText(url);
    toast.success("Link copiado!");
  };

  // ── Componente reutilizável para exibir o link ──────────────────────────────
  function LinkBox({ url, label }: { url: string | null; label: string }) {
    if (profileLoading) {
      return (
        <div className="flex gap-2">
          <Skeleton className="flex-1 h-10 rounded-lg" />
          <Skeleton className="w-24 h-10 rounded-lg" />
          <Skeleton className="w-20 h-10 rounded-lg" />
        </div>
      );
    }

    if (profileError) {
      return (
        <div className="flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 gap-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>Não foi possível carregar o link. Verifique sua conexão.</span>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 border-red-300 text-red-700 hover:bg-red-100 shrink-0"
            onClick={() => retryProfile()}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Tentar novamente
          </Button>
        </div>
      );
    }

    if (!storeId) {
      return (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          Loja não configurada. Entre em contato com o suporte.
        </div>
      );
    }

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

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold font-['Space_Grotesk']">Configurações</h1>
        <p className="text-muted-foreground text-sm">Gerencie os recursos da sua loja</p>
      </div>

      {/* Link do PDV Público */}
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

          <LinkBox url={pdvUrl} label="PDV" />

          <div className="rounded-lg bg-blue-50 border border-blue-100 p-3 text-sm text-blue-700 space-y-1">
            <p className="font-semibold flex items-center gap-1.5">
              <Store className="h-4 w-4" /> Como funciona:
            </p>
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

      {/* Cardápio Online */}
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

          <LinkBox url={cardapioUrl} label="Cardápio" />

          <div className="rounded-lg bg-emerald-50 border border-emerald-100 p-3 text-sm text-emerald-700 space-y-1">
            <p className="font-semibold flex items-center gap-1.5">
              <UtensilsCrossed className="h-4 w-4" /> Como funciona:
            </p>
            <ul className="list-disc list-inside space-y-0.5 text-xs">
              <li>Cliente acessa o link e vê o cardápio com fotos e preços</li>
              <li>Adiciona itens ao carrinho e informa nome e telefone</li>
              <li>Envia o pedido — você recebe na tela de Pedidos</li>
              <li>Você aceita, muda o status e o cliente acompanha em tempo real</li>
              <li>Há um chat direto entre cliente e loja na mesma tela</li>
            </ul>
          </div>
        </CardContent>
      </Card>


      <Card>
        <CardHeader>
          <CardTitle className="text-base text-muted-foreground">
            Mais configurações — em breve
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Configurações de loja, perfil e preferências serão adicionadas em breve.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
