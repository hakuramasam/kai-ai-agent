import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-payment, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const KAI_TOKEN = "0x86af9cb35a613992ea552e0ba7419f1dada3084c";
const BASE_CHAIN_ID = 8453;
const CHAT_PRICE_KAI = "402";
const AI_GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

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

async function getAgentWallet(adminClient: ReturnType<typeof createClient>): Promise<string | null> {
  const { data } = await adminClient
    .from("agent_config")
    .select("value")
    .eq("key", "agent_wallet_address")
    .single();
  return data?.value || null;
}

const AGENT_TOOLS = [
  {
    type: "function",
    function: {
      name: "get_token_balance",
      description: "Get the balance of $KAI or any ERC-20 token for a wallet address on Base chain",
      parameters: {
        type: "object",
        properties: {
          wallet_address: { type: "string", description: "The wallet address to check" },
          token_address: { type: "string", description: "ERC-20 token contract address (defaults to $KAI)" },
        },
        required: ["wallet_address"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_transaction_history",
      description: "Get recent transactions for a wallet address on Base chain",
      parameters: {
        type: "object",
        properties: {
          wallet_address: { type: "string", description: "The wallet address" },
          limit: { type: "number", description: "Number of transactions to return (max 25)" },
        },
        required: ["wallet_address"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_token_info",
      description: "Get information about a token on Base chain (name, symbol, decimals, total supply)",
      parameters: {
        type: "object",
        properties: {
          token_address: { type: "string", description: "The token contract address" },
        },
        required: ["token_address"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "web_search",
      description: "Search the web for information. Use for current events, crypto prices, news, etc.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "The search query" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_swap_quote",
      description: "Get a quote for swapping tokens on Base chain via DEX",
      parameters: {
        type: "object",
        properties: {
          from_token: { type: "string", description: "Token address to swap from (use 'ETH' for native ETH)" },
          to_token: { type: "string", description: "Token address to swap to" },
          amount: { type: "string", description: "Amount to swap (in human-readable units)" },
        },
        required: ["from_token", "to_token", "amount"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delegate_to_agent",
      description: "Delegate a task to another specialized AI agent via A2A protocol",
      parameters: {
        type: "object",
        properties: {
          agent_id: { type: "string", description: "The agent ID (e.g., 'research', 'trading', 'analysis')" },
          task: { type: "string", description: "Task description for the agent" },
        },
        required: ["agent_id", "task"],
      },
    },
  },
];

async function executeTool(name: string, args: Record<string, unknown>): Promise<string> {
  switch (name) {
    case "get_token_balance": {
      const wallet = args.wallet_address as string;
      const token = (args.token_address as string) || KAI_TOKEN;
      try {
        const res = await fetch(`https://base.blockscout.com/api/v2/addresses/${wallet}/tokens/${token}`);
        const data = await res.json();
        return JSON.stringify({ balance: data?.value || "0", token: data?.token || {} });
      } catch (e) {
        return JSON.stringify({ error: `Failed to fetch balance: ${(e as Error).message}` });
      }
    }
    case "get_transaction_history": {
      const wallet = args.wallet_address as string;
      const limit = Math.min((args.limit as number) || 10, 25);
      try {
        const res = await fetch(`https://base.blockscout.com/api/v2/addresses/${wallet}/transactions?limit=${limit}`);
        const data = await res.json();
        const txs = (data?.items || []).map((tx: any) => ({
          hash: tx.hash, from: tx.from?.hash, to: tx.to?.hash,
          value: tx.value, status: tx.status, timestamp: tx.timestamp, method: tx.method,
        }));
        return JSON.stringify({ transactions: txs });
      } catch (e) {
        return JSON.stringify({ error: `Failed to fetch transactions: ${(e as Error).message}` });
      }
    }
    case "get_token_info": {
      const token = args.token_address as string;
      try {
        const res = await fetch(`https://base.blockscout.com/api/v2/tokens/${token}`);
        const data = await res.json();
        return JSON.stringify({
          name: data?.name, symbol: data?.symbol, decimals: data?.decimals,
          total_supply: data?.total_supply, holders_count: data?.holders_count,
          exchange_rate: data?.exchange_rate, type: data?.type,
        });
      } catch (e) {
        return JSON.stringify({ error: `Failed to fetch token info: ${(e as Error).message}` });
      }
    }
    case "web_search": {
      const query = args.query as string;
      return JSON.stringify({
        note: "Web search results for: " + query,
        results: [{ title: "Search capability active", snippet: `Results for "${query}" would be displayed here.` }],
      });
    }
    case "get_swap_quote": {
      return JSON.stringify({
        quote: {
          from: args.from_token, to: args.to_token, amount: args.amount,
          estimated_output: "Quote requires DEX aggregator integration",
          dex: "Uniswap V3 (Base)",
        },
      });
    }
    case "delegate_to_agent": {
      const agentId = args.agent_id as string;
      const task = args.task as string;
      try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const res = await fetch(`${supabaseUrl}/functions/v1/a2a`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceRoleKey}` },
          body: JSON.stringify({
            jsonrpc: "2.0", method: "tasks/send",
            params: { agent_id: agentId, task: { message: task } },
            id: crypto.randomUUID(),
          }),
        });
        const data = await res.json();
        return JSON.stringify(data?.result || data);
      } catch (e) {
        return JSON.stringify({ error: `A2A delegation failed: ${(e as Error).message}` });
      }
    }
    default:
      return JSON.stringify({ error: `Unknown tool: ${name}` });
  }
}

const SYSTEM_PROMPT = `You are Kai, an autonomous AI agent on the Base blockchain. You have access to powerful tools for blockchain analysis, web search, token swaps, and multi-agent delegation.

Key facts about you:
- You operate on Base chain (chain ID 8453)
- Your native token is $KAI (${KAI_TOKEN})
- Users pay 402 $KAI per message via x402 protocol
- You can check balances, transactions, and token info via Blockscout
- You can delegate tasks to specialized sub-agents via A2A protocol
- Available sub-agents: "research" (deep research), "trading" (swap analysis), "analysis" (on-chain analytics)

Be concise, technical when needed, and always provide actionable insights. Use markdown formatting for structured responses. When users ask about tokens or wallets, proactively use your tools to fetch real data.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableApiKey) throw new Error("LOVABLE_API_KEY not configured");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = userData.user.id;

    if (!checkRateLimit(userId)) {
      return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let body: any;
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const messages = body?.messages;
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: "Invalid input: messages array required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // x402 Payment check
    const paymentHeader = req.headers.get("x-payment") || body?.paymentHeader;
    const agentWallet = await getAgentWallet(adminClient);

    if (!paymentHeader) {
      return new Response(
        JSON.stringify({
          error: "Payment Required",
          x402: {
            version: "2", maxAmountRequired: CHAT_PRICE_KAI, asset: KAI_TOKEN,
            network: `eip155:${BASE_CHAIN_ID}`, chainId: BASE_CHAIN_ID,
            payTo: agentWallet || "0x0000000000000000000000000000000000000000",
            description: `Chat with Kai Agent - ${CHAT_PRICE_KAI} $KAI per message`,
            resource: "/kai-chat",
          },
        }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json", "X-Payment-Required": "true" } }
      );
    }

    // Log usage
    await adminClient.from("usage_logs").insert({
      user_id: userId, endpoint: "chat", cost: parseInt(CHAT_PRICE_KAI),
    });

    // Build AI messages with tool-calling loop (non-streaming for tool resolution)
    const aiMessages: any[] = [{ role: "system", content: SYSTEM_PROMPT }, ...messages];
    let toolCallsMade = false;

    for (let i = 0; i < 5; i++) {
      const aiRes = await fetch(AI_GATEWAY, {
        method: "POST",
        headers: { Authorization: `Bearer ${lovableApiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "openai/gpt-5", messages: aiMessages, tools: AGENT_TOOLS, stream: false,
        }),
      });

      if (!aiRes.ok) {
        const errText = await aiRes.text();
        console.error("AI Gateway error:", aiRes.status, errText);
        if (aiRes.status === 429) {
          return new Response(JSON.stringify({ error: "Rate limits exceeded, please try again later." }), {
            status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        if (aiRes.status === 402) {
          return new Response(JSON.stringify({ error: "AI credits exhausted." }), {
            status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        throw new Error(`AI error: ${aiRes.status}`);
      }

      const aiData = await aiRes.json();
      const choice = aiData.choices?.[0];
      if (!choice) throw new Error("No response from AI");

      if (choice.finish_reason === "tool_calls" && choice.message?.tool_calls?.length) {
        toolCallsMade = true;
        aiMessages.push(choice.message);
        for (const toolCall of choice.message.tool_calls) {
          const args = JSON.parse(toolCall.function.arguments || "{}");
          const result = await executeTool(toolCall.function.name, args);
          aiMessages.push({ role: "tool", tool_call_id: toolCall.id, content: result });
        }
        continue;
      }

      // No more tool calls — break to stream final
      break;
    }

    // Final streaming response after all tools resolved
    const streamRes = await fetch(AI_GATEWAY, {
      method: "POST",
      headers: { Authorization: `Bearer ${lovableApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "openai/gpt-5", messages: aiMessages, stream: true,
      }),
    });

    if (!streamRes.ok || !streamRes.body) {
      const errText = await streamRes.text();
      console.error("Stream error:", streamRes.status, errText);
      throw new Error(`AI stream error: ${streamRes.status}`);
    }

    // Pipe through SSE stream, injecting a metadata event at the start
    const reader = streamRes.body.getReader();
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        const meta = JSON.stringify({ tool_calls_made: toolCallsMade });
        controller.enqueue(encoder.encode(`data: ${meta}\n\n`));

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            controller.enqueue(value);
          }
        } catch (e) {
          console.error("Stream read error:", e);
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
    });
  } catch (err) {
    console.error("kai-chat error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
