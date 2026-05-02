import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { baseUrl, token, payload, ref } = await req.json()

    if (!token) {
      throw new Error("Token não fornecido ao proxy")
    }

    console.log(`[Proxy] Emitindo NFC-e para ref: ${ref} no ambiente: ${baseUrl}`)

    const response = await fetch(`${baseUrl}/v2/nfce?ref=${ref}`, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${btoa(token + ":")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json()
    
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: response.status,
    })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
