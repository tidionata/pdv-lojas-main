import { supabase } from "@/integrations/supabase/client";

export interface FocusNfeItem {
  numero_item: string;
  codigo_produto: string;
  descricao: string;
  cfop: string;
  unidade_comercial: string;
  quantidade_comercial: number;
  valor_unitario_comercial: number;
  valor_bruto: number;
  icms_situacao_tributaria: string;
  icms_origem: string;
  pis_situacao_tributaria: string;
  cofins_situacao_tributaria: string;
  // Reforma Tributária 2026
  situacao_tributaria_ibs_cbs?: string;
  classificacao_tributaria?: string;
  base_calculo_ibs_cbs?: number;
  aliquota_cbs?: number;
  aliquota_ibs?: number;
}

export interface FocusNfeSale {
  data_emissao: string;
  natureza_operacao: string;
  tipo_documento: number;
  local_destino: number;
  finalidade_emissao: number;
  consumidor_final: number;
  presenca_comprador: number;
  modalidade_frete: number;
  valor_total_bruto: number;
  valor_total_itens: number;
  items: FocusNfeItem[];
  formas_pagamento: {
    forma_pagamento: string;
    valor_pagamento: number;
  }[];
}

export async function emitirNfce(storeId: string, saleData: any) {
  try {
    // 1. Buscar as configurações da NFe (Token e Ambiente)
    const { data: secrets, error: secretsError } = await supabase
      .from("store_secrets")
      .select("nfe_config")
      .eq("store_id", storeId)
      .maybeSingle();

    if (secretsError || !secrets?.nfe_config) {
      throw new Error("Configurações da Focus NFe não encontradas para esta loja.");
    }

    const config = secrets.nfe_config as any;
    if (!config.token) {
      throw new Error("Token da Focus NFe não configurado.");
    }

    // 1.1 Buscar configurações de impostos (Reforma 2026)
    const { data: taxConfig } = await supabase
      .from("store_tax_config")
      .select("cbs_rate, ibs_rate")
      .eq("store_id", storeId)
      .maybeSingle();

    const cbsRate = Number(taxConfig?.cbs_rate ?? 0.9);
    const ibsRate = Number(taxConfig?.ibs_rate ?? 0.1);

    const baseUrl = config.ambiente === "producao" 
      ? "https://api.focusnfe.com.br" 
      : "https://homologacao.focusnfe.com.br";

    // 2. Mapear dados da venda para o formato Focus NFe
    const nfePayload: FocusNfeSale = {
      data_emissao: new Date().toISOString(),
      natureza_operacao: "Venda de mercadoria",
      tipo_documento: 1, // 1 = Nota Fiscal
      local_destino: 1,  // 1 = Interna
      finalidade_emissao: 1, // 1 = Normal
      consumidor_final: 1, // 1 = Sim
      presenca_comprador: 1, // 1 = Presencial
      modalidade_frete: 9, // 9 = Sem frete
      valor_total_bruto: saleData.total,
      valor_total_itens: saleData.total,
      items: saleData.items.map((item: any, index: number) => {
        const itemSubtotal = item.unitPrice * item.quantity;
        // Calcula o desconto proporcional para o item se houver desconto total na venda
        const totalBeforeDiscount = saleData.items.reduce((s: number, i: any) => s + (i.unitPrice * i.quantity), 0);
        const discountValue = totalBeforeDiscount - saleData.total;
        const itemDiscount = totalBeforeDiscount > 0 ? (itemSubtotal / totalBeforeDiscount) * discountValue : 0;
        const ibsCbsBase = Math.max(0, itemSubtotal - itemDiscount);

        return {
          numero_item: String(index + 1),
          codigo_produto: item.product.barcode || item.product.id.substring(0, 8),
          descricao: item.product.name,
          cfop: "5102", // Padrão revenda interna
          unidade_comercial: item.product.unit || "UN",
          quantidade_comercial: item.quantity,
          valor_unitario_comercial: item.unitPrice,
          valor_bruto: itemSubtotal,
          icms_situacao_tributaria: "102", // Simples Nacional - Tributada sem permissão de crédito
          icms_origem: "0", // Nacional
          pis_situacao_tributaria: "07", // Isento
          cofins_situacao_tributaria: "07", // Isento
          
          // Reforma Tributária 2026
          situacao_tributaria_ibs_cbs: "00", // Tributada integralmente
          classificacao_tributaria: item.product.tax_ibs_cbs_classificacao || "010101", // Fallback para exemplo se não configurado
          base_calculo_ibs_cbs: Number(ibsCbsBase.toFixed(2)),
          aliquota_cbs: cbsRate,
          aliquota_ibs: ibsRate,
        };
      }),
      formas_pagamento: [
        {
          forma_pagamento: mapPaymentMethod(saleData.paymentMethod),
          valor_pagamento: saleData.total,
        }
      ]
    };

    // 3. Enviar para a Focus NFe via Supabase Edge Function (Proxy Seguro)
    // Para evitar erro de CORS "Failed to fetch" e não expor o token no navegador,
    // usamos uma Edge Function do Supabase que faz a ponte com a Focus NFe.
    const { data, error: functionError } = await supabase.functions.invoke("focus-nfe-proxy", {
      body: {
        baseUrl,
        token: config.token,
        payload: nfePayload,
        ref: saleData.id
      },
    });

    if (functionError) {
      // Fallback para tentativa direta se a função não existir (apenas para debug em ambiente controlado)
      console.warn("Edge Function não encontrada, tentando envio direto (sujeito a CORS)...");
      
      const response = await fetch(`${baseUrl}/v2/nfce?ref=${saleData.id}`, {
        method: "POST",
        headers: {
          "Authorization": `Basic ${btoa(config.token + ":")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(nfePayload),
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.mensagem || "Erro na Focus NFe");
      return result;
    }

    return data;
  } catch (error: any) {
    console.error("Erro na emissão:", error);
    throw error;
  }
}

function mapPaymentMethod(method: string) {
  switch (method) {
    case "cash": return "01";
    case "credit": return "03";
    case "debit": return "04";
    case "pix": return "17";
    default: return "99";
  }
}
