/**
 * MCP Server for Kai Agent
 * Exposes blockchain tools (ERC-8004 registry pattern) via Model Context Protocol
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, accept, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BASE_BLOCKSCOUT = "https://base.blockscout.com/api/v2";
const KAI_TOKEN = "0x86af9cb35a613992ea552e0ba7419f1dada3084c";

// MCP Tool registry (ERC-8004 inspired on-chain tool registry pattern)
const MCP_TOOLS = [
  {
    name: "base_get_address_info",
    description: "Get address information including balance and transaction count on Base chain",
    inputSchema: {
      type: "object",
      properties: {
        address: { type: "string", description: "EVM wallet/contract address" },
      },
      required: ["address"],
    },
  },
  {
    name: "base_get_token_transfers",
    description: "Get ERC-20 token transfers for an address on Base chain",
    inputSchema: {
      type: "object",
      properties: {
        address: { type: "string", description: "Wallet address" },
        token: { type: "string", description: "Token contract address (defaults to $KAI)" },
        limit: { type: "number", description: "Max results (default 10)" },
      },
      required: ["address"],
    },
  },
  {
    name: "base_get_contract_info",
    description: "Get smart contract info (ABI, source code, verification status) on Base",
    inputSchema: {
      type: "object",
      properties: {
        address: { type: "string", description: "Contract address" },
      },
      required: ["address"],
    },
  },
  {
    name: "base_get_block",
    description: "Get block information by number on Base chain",
    inputSchema: {
      type: "object",
      properties: {
        block_number: { type: "string", description: "Block number or 'latest'" },
      },
      required: ["block_number"],
    },
  },
  {
    name: "base_search",
    description: "Search for addresses, tokens, transactions, or blocks on Base chain",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query (address, tx hash, token name, etc.)" },
      },
      required: ["query"],
    },
  },
  {
    name: "kai_agent_registry",
    description: "List registered agents and their capabilities (ERC-8004 registry pattern)",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
];

// Execute MCP tool
async function executeToolCall(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case "base_get_address_info": {
      const addr = args.address as string;
      const res = await fetch(`${BASE_BLOCKSCOUT}/addresses/${addr}`);
      if (!res.ok) throw new Error(`Blockscout error: ${res.status}`);
      const data = await res.json();
      return {
        address: data.hash,
        is_contract: data.is_contract,
        balance: data.coin_balance,
        tx_count: data.transactions_count,
        token_transfers_count: data.token_transfers_count,
        name: data.name,
        ens: data.ens_domain_name,
      };
    }

    case "base_get_token_transfers": {
      const addr = args.address as string;
      const token = (args.token as string) || KAI_TOKEN;
      const limit = Math.min((args.limit as number) || 10, 50);
      const res = await fetch(`${BASE_BLOCKSCOUT}/addresses/${addr}/token-transfers?type=ERC-20&token=${token}&limit=${limit}`);
      if (!res.ok) throw new Error(`Blockscout error: ${res.status}`);
      const data = await res.json();
      return {
        transfers: (data.items || []).map((t: any) => ({
          hash: t.tx_hash,
          from: t.from?.hash,
          to: t.to?.hash,
          value: t.total?.value,
          token: t.token?.symbol,
          timestamp: t.timestamp,
        })),
      };
    }

    case "base_get_contract_info": {
      const addr = args.address as string;
      const res = await fetch(`${BASE_BLOCKSCOUT}/smart-contracts/${addr}`);
      if (!res.ok) throw new Error(`Blockscout error: ${res.status}`);
      const data = await res.json();
      return {
        name: data.name,
        compiler: data.compiler_version,
        verified: data.is_verified,
        optimization: data.optimization_enabled,
        evm_version: data.evm_version,
        abi: data.abi ? "Available" : "Not available",
      };
    }

    case "base_get_block": {
      const blockNum = args.block_number as string;
      const res = await fetch(`${BASE_BLOCKSCOUT}/blocks/${blockNum}`);
      if (!res.ok) throw new Error(`Blockscout error: ${res.status}`);
      const data = await res.json();
      return {
        number: data.height,
        hash: data.hash,
        timestamp: data.timestamp,
        tx_count: data.tx_count,
        gas_used: data.gas_used,
        gas_limit: data.gas_limit,
        miner: data.miner?.hash,
      };
    }

    case "base_search": {
      const query = args.query as string;
      const res = await fetch(`${BASE_BLOCKSCOUT}/search?q=${encodeURIComponent(query)}`);
      if (!res.ok) throw new Error(`Blockscout error: ${res.status}`);
      const data = await res.json();
      return {
        results: (data.items || []).slice(0, 10).map((r: any) => ({
          type: r.type,
          address: r.address,
          name: r.name,
          symbol: r.symbol,
          url: r.url,
        })),
      };
    }

    case "kai_agent_registry": {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      return {
        registry: "ERC-8004 Agent Registry (Kai)",
        agents: [
          {
            id: "kai-main",
            name: "Kai Agent",
            endpoint: `${supabaseUrl}/functions/v1/kai-chat`,
            payment: { token: KAI_TOKEN, amount: "402", chain: 8453, protocol: "x402" },
            capabilities: ["chat", "blockchain-analysis", "web-search", "trading"],
          },
          {
            id: "kai-research",
            name: "Kai Research Agent",
            endpoint: `${supabaseUrl}/functions/v1/a2a`,
            capabilities: ["deep-research", "analysis"],
          },
          {
            id: "kai-trading",
            name: "Kai Trading Agent",
            endpoint: `${supabaseUrl}/functions/v1/a2a`,
            capabilities: ["swap-quotes", "dex-routing"],
          },
        ],
      };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { method, params, id, jsonrpc } = body;

    // MCP initialize
    if (method === "initialize") {
      return new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          result: {
            protocolVersion: "2025-03-26",
            capabilities: { tools: {} },
            serverInfo: {
              name: "kai-mcp-server",
              version: "1.0.0",
              description: "Kai Agent MCP Server - Base blockchain tools with ERC-8004 registry",
            },
          },
          id,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // List tools
    if (method === "tools/list") {
      return new Response(
        JSON.stringify({ jsonrpc: "2.0", result: { tools: MCP_TOOLS }, id }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Call tool
    if (method === "tools/call") {
      const toolName = params?.name;
      const toolArgs = params?.arguments || {};

      try {
        const result = await executeToolCall(toolName, toolArgs);
        return new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            result: { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] },
            id,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (e) {
        return new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            result: { content: [{ type: "text", text: `Error: ${(e as Error).message}` }], isError: true },
            id,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // notifications/initialized - acknowledge
    if (method === "notifications/initialized") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    return new Response(
      JSON.stringify({ jsonrpc: "2.0", error: { code: -32601, message: "Method not found" }, id }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("mcp-server error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
