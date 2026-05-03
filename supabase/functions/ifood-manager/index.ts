import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const IFOOD_BASE_URL = "https://merchant-api.ifood.com.br"

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { action, storeId, orderId, status } = await req.json()

    if (!storeId) throw new Error("storeId é obrigatório")

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 1. Busca Configurações do iFood
    const { data: secrets, error: secretsError } = await supabaseAdmin
      .from("store_secrets")
      .select("ifood_config")
      .eq("store_id", storeId)
      .single()

    if (secretsError || !secrets?.ifood_config) {
      throw new Error("Configurações do iFood não encontradas para esta loja.")
    }

    const config = secrets.ifood_config as any
    const { client_id, client_secret, merchant_id } = config

    // 2. Função Interna para pegar Token
    const getAccessToken = async () => {
      // Tenta usar o token atual se ele existir e for recente (lógica simplificada: busca novo sempre ou guarda no DB)
      // Para produção, o ideal é salvar o token e o expires_at no banco para evitar excesso de requisições de login.
      const params = new URLSearchParams()
      params.append('grantType', 'client_credentials')
      params.append('clientId', client_id)
      params.append('clientSecret', client_secret)

      const response = await fetch(`${IFOOD_BASE_URL}/authentication/v1.0/oauth/token`, {
        method: "POST",
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params
      })

      const data = await response.json()
      if (!response.ok) throw new Error(`Erro iFood Auth: ${data.error?.message || response.statusText}`)
      return data.accessToken
    }

    const token = await getAccessToken()

    // 3. Roteamento de Ações
    let result = {}

    if (action === "confirm_order") {
      // iFood: /order/v1.0/orders/{id}/confirm
      const res = await fetch(`${IFOOD_BASE_URL}/order/v1.0/orders/${orderId}/confirm`, {
        method: "POST",
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (!res.ok) throw new Error(`Erro ao confirmar pedido no iFood: ${res.statusText}`)
      result = { success: true }
    } 
    
    else if (action === "dispatch_order") {
      // iFood: /order/v1.0/orders/${orderId}/dispatch
      const res = await fetch(`${IFOOD_BASE_URL}/order/v1.0/orders/${orderId}/dispatch`, {
        method: "POST",
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (!res.ok) throw new Error(`Erro ao despachar pedido no iFood: ${res.statusText}`)
      result = { success: true }
    }

    else if (action === "ready_order") {
      // iFood: /order/v1.0/orders/${orderId}/readyForPickup
      const res = await fetch(`${IFOOD_BASE_URL}/order/v1.0/orders/${orderId}/readyForPickup`, {
        method: "POST",
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (!res.ok) throw new Error(`Erro ao marcar como pronto no iFood: ${res.statusText}`)
      result = { success: true }
    }

    else if (action === "poll_events") {
      // iFood Polling: /order/v1.0/events:polling
      const res = await fetch(`${IFOOD_BASE_URL}/order/v1.0/events:polling`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      
      if (res.status === 204) {
        result = { events: [] }
      } else {
        const events = await res.json()
        const processedEvents = []

        for (const event of events) {
          // Processa apenas novos pedidos (PLACED)
          if (event.code === "PLC") {
            try {
              // 1. Busca detalhes do pedido no iFood
              const orderRes = await fetch(`${IFOOD_BASE_URL}/order/v1.0/orders/${event.orderId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
              })
              const ifoodOrder = await orderRes.json()

              // 2. Verifica se o pedido já existe para evitar duplicidade
              const { data: existing } = await supabaseAdmin
                .from("orders")
                .select("id")
                .eq("external_id", ifoodOrder.id)
                .maybeSingle()

              if (!existing) {
                // 3. Insere o pedido principal
                const { data: newOrder, error: orderErr } = await supabaseAdmin
                  .from("orders")
                  .insert({
                    store_id: storeId,
                    customer_name: ifoodOrder.customer.name,
                    customer_phone: ifoodOrder.customer.phone?.number || '',
                    status: 'pending',
                    total: ifoodOrder.payments.total.value,
                    notes: ifoodOrder.notes || '',
                    payment_method: ifoodOrder.payments.methods[0]?.method?.toLowerCase() || 'online',
                    origin: 'ifood',
                    external_id: ifoodOrder.id,
                    external_code: ifoodOrder.displayId
                  })
                  .select()
                  .single()

                if (orderErr) throw orderErr

                // 4. Insere os itens do pedido
                const items = ifoodOrder.items.map((item: any) => ({
                  order_id: newOrder.id,
                  product_name: item.name,
                  unit_price: item.unitPrice,
                  quantity: item.quantity,
                  subtotal: item.totalPrice,
                  additionals: item.options || []
                }))

                const { error: itemsErr } = await supabaseAdmin
                  .from("order_items")
                  .insert(items)

                if (itemsErr) throw itemsErr
              }
              processedEvents.push(event.id)
            } catch (err) {
              console.error(`Erro ao processar pedido iFood ${event.orderId}:`, err.message)
            }
          } else {
            // Outros eventos (confirmado, cancelado, etc) apenas marcamos como lido por enquanto
            processedEvents.push(event.id)
          }
        }

        // 5. Envia Acknowledgment para o iFood limpar a fila
        if (processedEvents.length > 0) {
          await fetch(`${IFOOD_BASE_URL}/order/v1.0/events/acknowledgment`, {
            method: "POST",
            headers: { 
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(processedEvents.map(id => ({ id })))
          })
        }
        
        result = { events_count: events.length, processed: processedEvents.length }
      }
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
