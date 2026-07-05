import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Loader2, Copy, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

interface ClienteHistoricoModalProps {
  isOpen: boolean;
  onClose: () => void;
  customer: any | null;
  storeId: string | undefined;
}

export function ClienteHistoricoModal({ isOpen, onClose, customer, storeId }: ClienteHistoricoModalProps) {
  const navigate = useNavigate();

  const { data: orders, isLoading } = useQuery({
    queryKey: ["customer-orders", customer?.id],
    queryFn: async () => {
      // First try by customer_id, if not available try by exact phone/name
      let query = supabase
        .from("orders")
        .select(`
          *,
          order_items (
            quantity,
            unit_price,
            total_price,
            product:products (id, name, type)
          )
        `)
        .eq("store_id", storeId)
        .order("created_at", { ascending: false })
        .limit(10);

      if (customer?.id) {
        // If we strictly link by customer_id
        query = query.eq("customer_id", customer.id);
      } else {
        // Fallback or legacy records
        query = query.eq("customer_phone", customer?.phone);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: isOpen && !!customer && !!storeId,
  });

  const handleRepeatOrder = (order: any) => {
    // Navigate to PDV with a special state to load these items
    // Since state passing via React Router can be tricky if the PDV doesn't expect it,
    // we can use localStorage to temporarily hold the duplicate order data
    
    try {
      const itemsToDuplicate = order.order_items.map((item: any) => ({
        product: item.product,
        quantity: item.quantity,
        unit_price: item.unit_price,
      }));
      
      localStorage.setItem("pdv_duplicate_cart", JSON.stringify({
        items: itemsToDuplicate,
        customerName: customer.name,
        customerPhone: customer.phone,
        customerId: customer.id
      }));

      toast.success("Itens carregados no PDV!");
      navigate("/pdv");
    } catch (e) {
      toast.error("Erro ao duplicar pedido.");
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Histórico: {customer?.name}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto py-4">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : !orders || orders.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <ShoppingBag className="h-12 w-12 mx-auto mb-3 opacity-20" />
              <p>Nenhum pedido encontrado para este cliente.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {orders.map((order) => (
                <div key={order.id} className="border rounded-lg p-4 bg-gray-50/50 flex flex-col gap-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-semibold">
                        Pedido #{order.id.slice(0, 6).toUpperCase()}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(order.created_at), "dd/MM/yyyy 'às' HH:mm")}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-primary">
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(order.total)}
                      </p>
                      <p className="text-xs text-muted-foreground uppercase">
                        {order.status}
                      </p>
                    </div>
                  </div>

                  <div className="bg-white border rounded p-2 text-xs">
                    <ul className="space-y-1">
                      {order.order_items?.map((item: any, i: number) => (
                        <li key={i} className="flex justify-between">
                          <span>{item.quantity}x {item.product?.name || "Produto Excluído"}</span>
                          <span className="text-muted-foreground">
                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.total_price)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="flex justify-end">
                    <Button 
                      size="sm" 
                      onClick={() => handleRepeatOrder(order)}
                      className="gap-2"
                    >
                      <Copy className="h-4 w-4" />
                      Repetir Pedido no PDV
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
