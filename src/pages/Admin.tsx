import { useState, useEffect } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Wallet, RefreshCw, Loader2, Server, Bot, Plug } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

export default function Admin() {
  const { user, profile, loading } = useAuth();
  const [agentWallet, setAgentWallet] = useState<string | null>(null);
  const [kaiBalance, setKaiBalance] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [loadingWallet, setLoadingWallet] = useState(true);
  const [agents, setAgents] = useState<any[]>([]);

  useEffect(() => {
    if (user) {
      loadAgentWallet();
      loadAgents();
    }
  }, [user]);

  const loadAgentWallet = async () => {
    setLoadingWallet(true);
    try {
      const { data } = await supabase
        .from("agent_config")
        .select("value")
        .eq("key", "agent_wallet_address")
        .single();
      if (data?.value) {
        setAgentWallet(data.value);
        await loadBalance(data.value);
      }
    } catch {
      // No wallet yet
    } finally {
      setLoadingWallet(false);
    }
  };

  const loadBalance = async (wallet: string) => {
    try {
      const { data } = await supabase.functions.invoke("agent-wallet", {
        body: { action: "balance", walletAddress: wallet },
      });
      setKaiBalance(data?.balance || data?.displayValue || "0");
    } catch {
      setKaiBalance("Error");
    }
  };

  const loadAgents = async () => {
    try {
      const { data } = await supabase.functions.invoke("a2a", {
        body: { method: "agents/list", id: "1" },
      });
      setAgents(data?.result || []);
    } catch {
      // ignore
    }
  };

  const createWallet = async () => {
    setCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke("agent-wallet", {
        body: { action: "create-wallet" },
      });
      if (error) throw error;
      const addr = data?.wallet?.address || data?.wallet?.smartAccountAddress || data?.wallet?.walletAddress;
      if (addr) {
        setAgentWallet(addr);
        toast.success("Agent wallet created!");
        await loadBalance(addr);
      } else {
        console.error("Wallet response:", JSON.stringify(data));
        toast.error("Wallet created but no address returned");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to create wallet");
    } finally {
      setCreating(false);
    }
  };

  if (loading) return null;
  if (!user) return <Navigate to="/" replace />;

  return (
    <div className="min-h-screen bg-background grid-bg relative">
      <div className="fixed top-0 left-1/4 w-96 h-96 rounded-full bg-primary/5 blur-3xl pointer-events-none" />

      <header className="sticky top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/dashboard" className="text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <span className="font-semibold text-sm">Admin Panel</span>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-10 space-y-6">
        {/* Agent Wallet Card */}
        <div className="card-glass rounded-xl p-6 space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <Wallet className="w-5 h-5 text-primary" />
            <h2 className="font-semibold text-sm uppercase tracking-wider">Agent Wallet</h2>
          </div>

          {loadingWallet ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">Loading...</span>
            </div>
          ) : agentWallet ? (
            <div className="space-y-3">
              <div className="p-3 bg-muted rounded-lg">
                <p className="text-xs text-muted-foreground mono uppercase tracking-wider mb-1">Address</p>
                <p className="mono text-sm text-foreground break-all">{agentWallet}</p>
              </div>
              <div className="p-3 bg-muted rounded-lg">
                <p className="text-xs text-muted-foreground mono uppercase tracking-wider mb-1">$KAI Balance</p>
                <p className="mono text-lg text-primary font-bold">{kaiBalance ?? "—"}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => loadBalance(agentWallet)}
                className="gap-2"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Refresh Balance
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                No agent wallet found. Create one via Thirdweb to receive $KAI payments.
              </p>
              <Button onClick={createWallet} disabled={creating} className="gap-2">
                {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wallet className="w-4 h-4" />}
                {creating ? "Creating..." : "Create Agent Wallet"}
              </Button>
            </div>
          )}
        </div>

        {/* A2A Agents */}
        <div className="card-glass rounded-xl p-6 space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <Bot className="w-5 h-5 text-accent" />
            <h2 className="font-semibold text-sm uppercase tracking-wider">A2A Sub-Agents</h2>
          </div>
          <div className="grid gap-3">
            {agents.length > 0 ? (
              agents.map((agent: any) => (
                <div key={agent.id} className="p-3 bg-muted rounded-lg flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold">{agent.name}</p>
                    <p className="text-xs text-muted-foreground">{agent.description}</p>
                  </div>
                  <div className="w-2 h-2 rounded-full bg-green-400" />
                </div>
              ))
            ) : (
              <div className="text-sm text-muted-foreground">
                3 sub-agents available: Research, Trading, Analytics
              </div>
            )}
          </div>
        </div>

        {/* MCP Server */}
        <div className="card-glass rounded-xl p-6 space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <Plug className="w-5 h-5 text-primary" />
            <h2 className="font-semibold text-sm uppercase tracking-wider">MCP Server</h2>
          </div>
          <div className="p-3 bg-muted rounded-lg">
            <p className="text-xs text-muted-foreground mono uppercase tracking-wider mb-1">Endpoint</p>
            <p className="mono text-xs text-foreground break-all">
              {import.meta.env.VITE_SUPABASE_URL}/functions/v1/mcp-server
            </p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {["base_get_address_info", "base_get_token_transfers", "base_get_contract_info", "base_get_block", "base_search", "kai_agent_registry"].map((tool) => (
              <div key={tool} className="px-2.5 py-1.5 bg-secondary rounded-md text-xs mono text-muted-foreground border border-border/50">
                {tool}
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Connect this MCP server to any AI client (Claude, Cursor, etc.) to access Base blockchain tools.
          </p>
        </div>

        {/* System Info */}
        <div className="card-glass rounded-xl p-6 space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <Server className="w-5 h-5 text-muted-foreground" />
            <h2 className="font-semibold text-sm uppercase tracking-wider">System</h2>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-muted-foreground text-xs">AI Model</span>
              <p className="mono text-foreground">openai/gpt-5</p>
            </div>
            <div>
              <span className="text-muted-foreground text-xs">Chain</span>
              <p className="mono text-foreground">Base (8453)</p>
            </div>
            <div>
              <span className="text-muted-foreground text-xs">Payment</span>
              <p className="mono text-foreground">402 $KAI / msg</p>
            </div>
            <div>
              <span className="text-muted-foreground text-xs">Protocol</span>
              <p className="mono text-foreground">x402 v2</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
