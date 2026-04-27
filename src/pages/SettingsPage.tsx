import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Link2, Store, Copy, ExternalLink, ShoppingCart, UtensilsCrossed } from "lucide-react";


export default function SettingsPage() {
  const { user } = useAuth();

  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    enabled: !!user,
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

  const { data: store } = useQuery({
    queryKey: ["store", profile?.store_id],
    enabled: !!profile?.store_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stores")
        .select("*")
        .eq("id", profile!.store_id!)
        .single();
      if (error) throw error;
      return data;
    },
  });

  // store_id vem do perfil — NUNCA use user.id como fallback (é o ID do Auth, não da loja)
  const storeId = profile?.store_id ?? null;
  const pdvUrl = storeId ? `${window.location.origin}/pdv/${storeId}` : null;
  const cardapioUrl = storeId ? `${window.location.origin}/cardapio/${storeId}` : null;


  const copyLink = (url: string | null) => {
    if (!url) return;
    navigator.clipboard.writeText(url);
    toast.success("Link copiado!");
  };


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

          {pdvUrl ? (
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="flex-1 flex items-center gap-2 bg-muted rounded-lg px-3 py-2 border">
                <Link2 className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-sm font-mono truncate text-muted-foreground">{pdvUrl}</span>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => copyLink(pdvUrl)} className="gap-2 shrink-0">
                  <Copy className="h-4 w-4" /> Copiar
                </Button>
                <Button asChild className="gap-2 shrink-0">
                  <a href={pdvUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4" /> Abrir
                  </a>
                </Button>
              </div>
            </div>
          ) : (
            <div className="py-4 text-center text-muted-foreground text-sm">Carregando...</div>
          )}


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

          {cardapioUrl ? (
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="flex-1 flex items-center gap-2 bg-muted rounded-lg px-3 py-2 border">
                <Link2 className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-sm font-mono truncate text-muted-foreground">{cardapioUrl}</span>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => copyLink(cardapioUrl)} className="gap-2 shrink-0">
                  <Copy className="h-4 w-4" /> Copiar
                </Button>
                <Button asChild className="gap-2 shrink-0">
                  <a href={cardapioUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4" /> Abrir
                  </a>
                </Button>
              </div>
            </div>
          ) : (
            <div className="py-4 text-center text-muted-foreground text-sm">Carregando...</div>
          )}

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
