import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { action, payload } = await req.json();
    
    // Obtém a chave da API do Asaas configurada no Supabase (Secrets)
    const ASAAS_API_KEY = Deno.env.get('ASAAS_API_KEY');
    
    // Como a API fornecida inicia com $aact_prod_, usaremos a URL de produção
    const ASAAS_URL = 'https://api.asaas.com/v3';

    if (!ASAAS_API_KEY) {
      throw new Error('ASAAS_API_KEY não configurada no servidor.');
    }

    if (action === 'test_connection') {
      const checkRes = await fetch(`${ASAAS_URL}/customers?limit=1`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'access_token': ASAAS_API_KEY
        }
      });
      const checkData = await checkRes.json();
      
      if (!checkRes.ok) {
        return new Response(JSON.stringify({ error: 'Erro de conexão com Asaas', details: checkData }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        });
      }
      
      return new Response(JSON.stringify({ success: true, message: 'Conexão com Asaas realizada com sucesso!', env: ASAAS_URL }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    if (action === 'create_invoice') {
      const { customerName, customerCpfCnpj, value, serviceDescription } = payload;
      
      // 1. Verificar se o cliente já existe ou criá-lo
      // Para simplificar, vamos criar um cliente avulso no Asaas
      const createCustomerRes = await fetch(`${ASAAS_URL}/customers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'access_token': ASAAS_API_KEY
        },
        body: JSON.stringify({
          name: customerName || 'Cliente Consumidor',
          cpfCnpj: customerCpfCnpj || undefined
        })
      });
      
      const customerData = await createCustomerRes.json();
      if (!customerData.id) {
        throw new Error('Erro ao criar cliente no Asaas: ' + JSON.stringify(customerData));
      }
      
      const customerId = customerData.id;

      // 2. Emitir a Nota Fiscal de Serviço (NFS-e)
      const invoicePayload = {
        customer: customerId,
        serviceDescription: serviceDescription || 'Venda de produtos/serviços diversos',
        value: Number(value),
        effectiveDate: new Date().toISOString().split('T')[0],
        updatePayment: false, // se houver cobrança atrelada
      };

      const createInvoiceRes = await fetch(`${ASAAS_URL}/invoices`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'access_token': ASAAS_API_KEY
        },
        body: JSON.stringify(invoicePayload)
      });
      
      const invoiceData = await createInvoiceRes.json();
      
      if (!createInvoiceRes.ok) {
        return new Response(JSON.stringify({ error: 'Erro ao emitir nota no Asaas', details: invoiceData }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        });
      }

      return new Response(JSON.stringify(invoiceData), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    return new Response(JSON.stringify({ error: 'Ação não reconhecida' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  }
});
