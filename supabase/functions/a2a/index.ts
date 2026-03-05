/**
 * A2A (Agent-to-Agent) Communication Protocol
 * Implements Google's A2A spec for inter-agent task delegation
 * Also serves as internal sub-agent router for Kai
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const AI_GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

// Sub-agent definitions
const SUB_AGENTS: Record<string, { name: string; description: string; systemPrompt: string }> = {
  research: {
    name: "Kai Research Agent",
    description: "Deep research and analysis on crypto, DeFi, and blockchain topics",
    systemPrompt:
      "You are a specialized research agent. Provide thorough, well-structured analysis on crypto, DeFi, blockchain topics. Use markdown. Be data-driven and cite specifics when possible.",
  },
  trading: {
    name: "Kai Trading Agent",
    description: "Token swap analysis, DEX routing, and trading strategies on Base",
    systemPrompt:
      "You are a specialized trading analysis agent. Analyze swap opportunities, liquidity, slippage, and provide trading insights for Base chain. Always warn about risks.",
  },
  analysis: {
    name: "Kai Analytics Agent",
    description: "On-chain analytics, wallet profiling, and transaction pattern analysis",
    systemPrompt:
      "You are an on-chain analytics agent. Analyze wallet behaviors, transaction patterns, token flows, and provide actionable intelligence. Use tables and structured data.",
  },
};

// Agent Card (A2A discovery)
const AGENT_CARD = {
  name: "Kai Agent",
  description: "Autonomous AI agent on Base blockchain with $KAI token payments via x402",
  url: Deno.env.get("SUPABASE_URL") + "/functions/v1/a2a",
  version: "1.0.0",
  capabilities: {
    streaming: false,
    pushNotifications: false,
  },
  skills: [
    { id: "blockchain-analysis", name: "Blockchain Analysis", description: "Analyze wallets, tokens, and transactions on Base chain" },
    { id: "research", name: "Research", description: "Deep research on crypto and DeFi topics" },
    { id: "trading", name: "Trading Analysis", description: "Token swap and trading analysis" },
  ],
  authentication: {
    schemes: ["bearer"],
  },
  defaultInputModes: ["text"],
  defaultOutputModes: ["text"],
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // A2A Discovery endpoint
  if (req.method === "GET") {
    const url = new URL(req.url);
    if (url.pathname.endsWith("/.well-known/agent.json") || url.searchParams.get("discover") === "true") {
      return new Response(JSON.stringify(AGENT_CARD), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ status: "ok", agents: Object.keys(SUB_AGENTS) }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableApiKey) throw new Error("LOVABLE_API_KEY not configured");

    const body = await req.json();

    // JSON-RPC style A2A protocol
    const method = body.method || body.action;
    const params = body.params || body;

    if (method === "tasks/send" || method === "delegate") {
      const agentId = params.agent_id || params.agentId;
      const task = params.task?.message || params.message || params.task;

      const agent = SUB_AGENTS[agentId];
      if (!agent) {
        return new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            error: { code: -32602, message: `Unknown agent: ${agentId}. Available: ${Object.keys(SUB_AGENTS).join(", ")}` },
            id: body.id,
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Execute sub-agent task via AI Gateway
      const aiRes = await fetch(AI_GATEWAY, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${lovableApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "openai/gpt-5-mini",
          messages: [
            { role: "system", content: agent.systemPrompt },
            { role: "user", content: typeof task === "string" ? task : JSON.stringify(task) },
          ],
        }),
      });

      if (!aiRes.ok) {
        const errText = await aiRes.text();
        throw new Error(`Sub-agent AI error: ${aiRes.status} ${errText}`);
      }

      const aiData = await aiRes.json();
      const response = aiData.choices?.[0]?.message?.content || "No response from sub-agent";

      return new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          result: {
            id: crypto.randomUUID(),
            status: { state: "completed" },
            artifacts: [
              {
                parts: [{ type: "text", text: response }],
                metadata: { agent: agent.name, agentId },
              },
            ],
          },
          id: body.id,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // List available agents
    if (method === "agents/list") {
      return new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          result: Object.entries(SUB_AGENTS).map(([id, a]) => ({
            id,
            name: a.name,
            description: a.description,
          })),
          id: body.id,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ jsonrpc: "2.0", error: { code: -32601, message: "Method not found" }, id: body.id }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("a2a error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
