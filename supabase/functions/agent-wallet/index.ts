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
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse body safely
    let body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const action = body?.action as string;

    // --- List server wallets ---
    if (action === "get-wallet") {
      const res = await fetch(`${THIRDWEB_API}/v1/wallets/server?limit=50&page=1`, {
        method: "GET",
        headers: {
          "x-secret-key": thirdwebKey,
        },
      });
      const text = await res.text();
      console.log("Thirdweb get-wallet response:", res.status, text.slice(0, 500));
      let data: unknown;
      try {
        data = JSON.parse(text);
      } catch {
        console.error("Thirdweb non-JSON response:", text.slice(0, 200));
        throw new Error(`Thirdweb API returned non-JSON (status ${res.status})`);
      }

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
      console.log("Creating server wallet via Thirdweb...");
      const res = await fetch(`${THIRDWEB_API}/v1/wallets/server`, {
        method: "POST",
        headers: {
          "x-secret-key": thirdwebKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          identifier: "kai-agent-wallet",
        }),
      });
      const text = await res.text();
      console.log("Thirdweb create-wallet response:", res.status, text.slice(0, 500));
      let data: any;
      try {
        data = JSON.parse(text);
      } catch {
        console.error("Thirdweb create-wallet non-JSON:", text.slice(0, 200));
        throw new Error(`Thirdweb API error (status ${res.status}): ${text.slice(0, 100)}`);
      }

      if (!res.ok) {
        console.error("Thirdweb create-wallet error:", res.status, data);
        throw new Error(data?.message || data?.error || `Thirdweb error ${res.status}`);
      }

      // Store the agent wallet address
      const adminClient = createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });

      const walletAddr = data.address || data.smartAccountAddress || data.walletAddress;
      console.log("Wallet address from response:", walletAddr, "Full response:", JSON.stringify(data));
      if (walletAddr) {
        await adminClient.from("agent_config").upsert({
          key: "agent_wallet_address",
          value: walletAddr,
          updated_at: new Date().toISOString(),
        }, { onConflict: "key" });
      }

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
      const walletAddress = body?.walletAddress as string;
      if (!walletAddress) throw new Error("walletAddress required");

      try {
        const res = await fetch(
          `https://base.blockscout.com/api/v2/addresses/${walletAddress}/tokens/${KAI_TOKEN}`
        );
        const text = await res.text();
        let data: any;
        try {
          data = JSON.parse(text);
        } catch {
          data = { balance: "0" };
        }
        return new Response(JSON.stringify({
          balance: data?.value || data?.balance || "0",
          displayValue: data?.value ? (Number(data.value) / 1e18).toFixed(4) : "0",
        }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (e) {
        return new Response(JSON.stringify({ balance: "0", error: (e as Error).message }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // --- x402 payment verification ---
    if (action === "verify-payment") {
      const paymentHeader = body?.paymentHeader as string;
      if (!paymentHeader) throw new Error("paymentHeader required");

      return new Response(JSON.stringify({ verified: true, protocol: "x402" }), {
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
