import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-payment, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const KAI_TOKEN = "0x86af9cb35a613992ea552e0ba7419f1dada3084c";
const BASE_CHAIN_ID = 8453;
const CHAT_PRICE_KAI = "402"; // 402 $KAI per message (in token units)
const THIRDWEB_API = "https://api.thirdweb.com";

// Simple in-memory rate limiter (per-isolate, resets on cold start)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
function checkRateLimit(key: string, maxRequests = 10, windowMs = 10_000): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(key);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= maxRequests) return false;
  entry.count++;
  return true;
}

// Autonomous planner: wraps user input with multi-path strategy metadata
function autonomousPlanner(input: { message: string }) {
  return {
    strategy: "multi-path execution",
    parallel: true,
    confidence: "high",
    original: input,
  };
}

// Get agent wallet address from config
async function getAgentWallet(adminClient: ReturnType<typeof createClient>): Promise<string | null> {
  const { data } = await adminClient
    .from("agent_config")
    .select("value")
    .eq("key", "agent_wallet_address")
    .single();
  return data?.value || null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const elizaKey = Deno.env.get("ELIZACLOUD_API_KEY")!;
    const thirdwebKey = Deno.env.get("THIRDWEB_SECRET_KEY")!;

    // --- Auth: validate JWT ---
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

    const userId = claimsData.claims.sub as string;

    // --- Rate limit ---
    if (!checkRateLimit(userId)) {
      return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- Parse body ---
    const body = await req.json();
    const message = body?.message;
    if (!message || typeof message !== "string" || message.trim().length === 0) {
      return new Response(JSON.stringify({ error: "Invalid input" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // --- x402 Payment Flow ---
    const paymentHeader = req.headers.get("x-payment") || body?.paymentHeader;
    const agentWallet = await getAgentWallet(adminClient);

    if (!paymentHeader) {
      // Return 402 Payment Required with x402 payment details
      return new Response(
        JSON.stringify({
          error: "Payment Required",
          x402: {
            version: "2",
            maxAmountRequired: CHAT_PRICE_KAI,
            asset: KAI_TOKEN,
            network: `eip155:${BASE_CHAIN_ID}`,
            chainId: BASE_CHAIN_ID,
            payTo: agentWallet || "0x0000000000000000000000000000000000000000",
            description: `Chat with Kai Agent - ${CHAT_PRICE_KAI} $KAI per message`,
            resource: "/kai-chat",
            mimeType: "application/json",
          },
        }),
        {
          status: 402,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
            "X-Payment-Required": "true",
          },
        }
      );
    }

    // --- Verify x402 payment via thirdweb ---
    let paymentVerified = false;
    try {
      const verifyRes = await fetch(`${THIRDWEB_API}/v1/payments/x402/verify`, {
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
      const verifyData = await verifyRes.json();
      paymentVerified = verifyData?.valid === true || verifyRes.ok;
    } catch (verifyErr) {
      console.error("Payment verification failed:", verifyErr);
    }

    if (!paymentVerified) {
      return new Response(
        JSON.stringify({ error: "Payment verification failed", details: "x402 payment could not be verified on-chain" }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // --- Log usage (on-chain payment verified) ---
    await adminClient.from("usage_logs").insert({
      user_id: userId,
      endpoint: "chat",
      cost: parseInt(CHAT_PRICE_KAI),
    });

    // --- Autonomous planner ---
    const plan = autonomousPlanner({ message: message.trim() });

    // --- Proxy to ElizaCloud ---
    const elizaRes = await fetch("https://elizacloud.ai/chat/@kai85", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${elizaKey}`,
      },
      body: JSON.stringify(plan),
    });

    const elizaData = await elizaRes.json();

    return new Response(JSON.stringify(elizaData), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("kai-chat error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
