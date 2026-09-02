import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Loader2, Plus, Search, User, FileText, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ClienteFormModal } from "@/components/Clientes/ClienteFormModal";
import { ClienteHistoricoModal } from "@/components/Clientes/ClienteHistoricoModal";
import { toast } from "sonner";

export default function Clientes() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<any>(null);
  const [historyCustomer, setHistoryCustomer] = useState<any>(null);

  // Busca profile para pegar store_id correto
  const { data: profile } = useQuery({
    queryKey: ["profile", session?.user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("store_id")
        .eq("auth_user_id", session!.user!.id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!session?.user?.id,
  });

  const storeId = profile?.store_id ?? session?.user?.id;

  // Busca loja
  const { data: store } = useQuery({
    queryKey: ["user-store", storeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stores")
        .select("*")
        .eq("id", storeId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!storeId,
  });

  // Busca clientes (Online + Offline)
  const { data: customers = [], isLoading } = useQuery({
    queryKey: ["store-customers", storeId],
    queryFn: async () => {
      let onlineList: any[] = [];
      try {
        const { data, error } = await supabase
          .from("customers")
          .select("*")
          .eq("store_id", storeId!)
          .order("name");
        if (!error && data) {
          onlineList = data;
        }
      } catch (e) {
        console.warn("Erro ao buscar clientes online:", e);
      }

      // Busca também clientes salvos localmente
      const localKey = `customers_local_${storeId}`;
      const localList: any[] = JSON.parse(localStorage.getItem(localKey) || "[]");
      const onlinePhones = new Set(onlineList.map(c => c.phone?.replace(/\D/g, "")).filter(Boolean));
      const onlyLocal = localList.filter(c => !onlinePhones.has(c.phone?.replace(/\D/g, "")));

      return [...onlineList, ...onlyLocal];
    },
    enabled: !!storeId,
  });

  const filteredCustomers = customers?.filter((c: any) =>
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (c.phone && c.phone.includes(searchTerm))
  ) || [];

  const handleEdit = (customer: any) => {
    setEditingCustomer(customer);
    setIsFormOpen(true);
  };

  const handleOpenHistory = (customer: any) => {
    setHistoryCustomer(customer);
  };

  const handleAddNew = () => {
    setEditingCustomer(null);
    setIsFormOpen(true);
  };

  return (
    <>
      <div className="flex-1 flex flex-col h-full">
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-6xl mx-auto space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <h1 className="text-2xl font-bold flex items-center gap-2">
                  <User className="h-6 w-6 text-primary" />
                  Clientes
                </h1>
                <p className="text-muted-foreground text-sm">
                  Gerencie sua base de clientes e histórico de pedidos.
                </p>
              </div>

              <Button onClick={handleAddNew} className="w-full sm:w-auto gap-2">
                <Plus className="h-4 w-4" />
                Novo Cliente
              </Button>
            </div>

            <div className="bg-white p-4 rounded-xl border shadow-sm space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar cliente por nome ou telefone..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 max-w-md"
                />
              </div>

              {isLoading ? (
                <div className="py-12 flex justify-center">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : filteredCustomers.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground">
                  <User className="h-12 w-12 mx-auto mb-3 opacity-20" />
                  <p>Nenhum cliente encontrado.</p>
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {filteredCustomers.map((customer: any) => (
                    <div 
                      key={customer.id} 
                      className="group border rounded-lg p-4 hover:border-primary/50 transition-colors bg-white shadow-sm flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex justify-between items-start mb-2">
                          <h3 className="font-semibold text-lg line-clamp-1">{customer.name}</h3>
                          {customer.accepts_promotions && (
                            <span className="bg-emerald-100 text-emerald-700 text-[10px] px-2 py-0.5 rounded-full font-medium whitespace-nowrap flex items-center gap-1">
                              <CheckCircle2 className="h-3 w-3" />
                              Aceita Promoções
                            </span>
                          )}
                        </div>
                        
                        <p className="text-sm text-muted-foreground mb-1">
                          📞 {customer.phone || "Sem telefone"}
                        </p>
                        
                        {customer.address && (
                          <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
                            📍 {customer.address}
                          </p>
                        )}
                        
                        {customer.notes && (
                          <p className="text-xs bg-amber-50 text-amber-900 border border-amber-100 p-2 rounded-md line-clamp-2">
                            📝 {customer.notes}
                          </p>
                        )}
                      </div>
                      
                      <div className="flex gap-2 mt-4 pt-3 border-t">
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="flex-1"
                          onClick={() => handleOpenHistory(customer)}
                        >
                          <FileText className="h-4 w-4 mr-2" />
                          Histórico
                        </Button>
                        <Button 
                          variant="secondary" 
                          size="sm" 
                          className="flex-1"
                          onClick={() => handleEdit(customer)}
                        >
                          Editar
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </main>
    </div>

      <ClienteFormModal 
        isOpen={isFormOpen} 
        onClose={() => setIsFormOpen(false)} 
        customer={editingCustomer}
        storeId={storeId || store?.id}
      />

      <ClienteHistoricoModal
        isOpen={!!historyCustomer}
        onClose={() => setHistoryCustomer(null)}
        customer={historyCustomer}
        storeId={storeId || store?.id}
      />
    </>
  );
}
