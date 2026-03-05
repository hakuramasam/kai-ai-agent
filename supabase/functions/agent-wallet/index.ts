import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const THIRDWEB_API = "https://api.thirdweb.com";
const KAI_TOKEN = "0x86af9cb35a613992ea552e0ba7419f1dada3084c";
const BASE_CHAIN_ID = 8453;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const thirdwebKey = Deno.env.get("THIRDWEB_SECRET_KEY");
    if (!thirdwebKey) throw new Error("THIRDWEB_SECRET_KEY not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const action = body?.action;

    // --- Get or create the agent wallet ---
    if (action === "get-wallet") {
      // Fetch agent wallet info from thirdweb
      const res = await fetch(`${THIRDWEB_API}/v1/wallets`, {
        method: "GET",
        headers: {
          "x-secret-key": thirdwebKey,
          "Content-Type": "application/json",
        },
      });
      const data = await res.json();

      return new Response(JSON.stringify({
        wallets: data,
        kaiToken: KAI_TOKEN,
        chainId: BASE_CHAIN_ID,
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "create-wallet") {
      const res = await fetch(`${THIRDWEB_API}/v1/wallets`, {
        method: "POST",
        headers: {
          "x-secret-key": thirdwebKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          label: "kai-agent-wallet",
          type: "smart:local",
        }),
      });
      const data = await res.json();

      // Store the agent wallet address in profiles (admin row or config)
      const adminClient = createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });

      // Store in a simple config approach - update the first admin profile
      await adminClient.from("agent_config").upsert({
        key: "agent_wallet_address",
        value: data.address || data.walletAddress,
        updated_at: new Date().toISOString(),
      }, { onConflict: "key" });

      return new Response(JSON.stringify({
        success: true,
        wallet: data,
        kaiToken: KAI_TOKEN,
        chainId: BASE_CHAIN_ID,
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- Get $KAI balance for agent wallet ---
    if (action === "balance") {
      const walletAddress = body?.walletAddress;
      if (!walletAddress) throw new Error("walletAddress required");

      const res = await fetch(
        `${THIRDWEB_API}/v1/wallets/${walletAddress}/balance?chainId=${BASE_CHAIN_ID}&tokenAddress=${KAI_TOKEN}`,
        {
          headers: {
            "x-secret-key": thirdwebKey,
            "Content-Type": "application/json",
          },
        }
      );
      const data = await res.json();

      return new Response(JSON.stringify(data), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- x402 payment verification ---
    if (action === "verify-payment") {
      const paymentHeader = body?.paymentHeader;
      if (!paymentHeader) throw new Error("paymentHeader required");

      // Use thirdweb's x402 verification
      const res = await fetch(`${THIRDWEB_API}/v1/payments/x402/verify`, {
        method: "POST",
        headers: {
          "x-secret-key": thirdwebKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          payment: paymentHeader,
          chainId: BASE_CHAIN_ID,
          tokenAddress: KAI_TOKEN,
        }),
      });
      const data = await res.json();

      return new Response(JSON.stringify(data), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("agent-wallet error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
