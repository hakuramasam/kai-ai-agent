import { Navigate, Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useState } from "react";
import { useAccount } from "wagmi";
import WalletBinder from "@/components/WalletBinder";
import { Button } from "@/components/ui/button";
import { LogOut, ExternalLink, User, Wallet, Copy, CheckCheck, Shield, MessageCircle, Zap } from "lucide-react";
import { toast } from "sonner";

export default function Dashboard() {
  const { user, profile, loading, signOut } = useAuth();
  const { isConnected } = useAccount();
  const [copied, setCopied] = useState(false);
  const [, setRefresh] = useState(0);

  if (loading) return null;
  if (!user) return <Navigate to="/" replace />;

  const xUsername = profile?.x_username || user.user_metadata?.user_name || "Unknown";
  const xAvatar = profile?.x_avatar || user.user_metadata?.avatar_url;
  const xName = profile?.x_name || user.user_metadata?.full_name || xUsername;
  const xId = profile?.x_user_id || user.user_metadata?.provider_id;
  const walletAddress = profile?.wallet_address;
  const balance = (profile as any)?.balance ?? 0;

  const copyAddress = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success("Copied!");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRefresh = () => setRefresh(n => n + 1);

  return (
    <div className="min-h-screen bg-background grid-bg relative">
      {/* Ambient glow */}
      <div className="fixed top-0 left-1/4 w-96 h-96 rounded-full bg-primary/5 blur-3xl pointer-events-none" />
      <div className="fixed bottom-0 right-1/4 w-96 h-96 rounded-full bg-accent/5 blur-3xl pointer-events-none" />

      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-primary/10 border border-primary/30 flex items-center justify-center">
              <span className="text-primary font-bold text-xs mono">K</span>
            </div>
            <span className="font-semibold tracking-wide text-sm">Kai Agent</span>
            <span className="mono text-xs text-primary/60 ml-1">v1.0</span>
          </div>
          <div className="flex items-center gap-3">
            <a
              href="https://elizacloud.ai/chat/@kai85"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors mono"
            >
              Open Chat <ExternalLink className="w-3 h-3" />
            </a>
            <Button variant="ghost" size="sm" onClick={signOut} className="text-muted-foreground hover:text-foreground">
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-10 space-y-6">
        {/* Welcome banner */}
        <div className="border-glow-cyan rounded-xl p-6 bg-card/50 flex items-center gap-5">
          <div className="relative flex-shrink-0">
            {xAvatar ? (
              <img src={xAvatar} alt={xName} className="w-16 h-16 rounded-full border-2 border-primary/50" />
            ) : (
              <div className="w-16 h-16 rounded-full bg-primary/10 border-2 border-primary/30 flex items-center justify-center">
                <User className="w-7 h-7 text-primary" />
              </div>
            )}
            <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-green-500 border-2 border-background" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground mono uppercase tracking-widest mb-1">Authenticated</p>
            <h1 className="text-xl font-bold">{xName}</h1>
            <p className="text-muted-foreground text-sm">@{xUsername}</p>
          </div>
          <a
            href="https://elizacloud.ai/chat/@kai85"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden sm:flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors glow-cyan"
          >
            Chat with Kai <ExternalLink className="w-4 h-4" />
          </a>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* X Profile Card */}
          <div className="card-glass rounded-xl p-6 space-y-4">
            <div className="flex items-center gap-2 mb-4">
              <svg className="w-5 h-5 text-foreground" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.737-8.857L1.254 2.25H8.08l4.259 5.63 5.905-5.63zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
              </svg>
              <h2 className="font-semibold text-sm uppercase tracking-wider">X Profile</h2>
              <div className="ml-auto">
                <Shield className="w-4 h-4 text-primary" />
              </div>
            </div>

            <div className="space-y-3">
              <InfoRow label="Username" value={`@${xUsername}`} />
              <InfoRow
                label="X User ID"
                value={xId || "—"}
                onCopy={xId ? () => copyAddress(xId) : undefined}
                copied={copied}
              />
              <InfoRow label="Email" value={user.email || "—"} />
            </div>
          </div>

          {/* Wallet Card */}
          <div className="card-glass rounded-xl p-6 space-y-4">
            <div className="flex items-center gap-2 mb-4">
              <Wallet className="w-5 h-5 text-accent" />
              <h2 className="font-semibold text-sm uppercase tracking-wider">Web3 Wallet</h2>
              {walletAddress && (
                <div className="ml-auto">
                  <span className="text-xs mono bg-green-500/10 text-green-400 border border-green-500/20 px-2 py-0.5 rounded-full">Bound</span>
                </div>
              )}
            </div>

            {walletAddress && (
              <div className="flex items-center gap-2 p-3 bg-muted rounded-lg mb-4">
                <span className="mono text-xs text-muted-foreground flex-1 truncate">{walletAddress}</span>
                <button onClick={() => copyAddress(walletAddress)} className="text-muted-foreground hover:text-foreground flex-shrink-0">
                  {copied ? <CheckCheck className="w-3.5 h-3.5 text-primary" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            )}

            <WalletBinder
              currentWallet={walletAddress || null}
              onSuccess={handleRefresh}
            />

            {!isConnected && !walletAddress && (
              <p className="text-xs text-muted-foreground text-center mt-2">
                Connect your EVM wallet (MetaMask, Rainbow, Trust Wallet...)
              </p>
            )}
          </div>
        </div>

        {/* Chat CTA */}
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-6 flex flex-col sm:flex-row items-center gap-4 justify-between">
          <div>
            <h3 className="font-semibold mb-1">Ready to chat with Kai?</h3>
            <p className="text-sm text-muted-foreground">Your AI agent is live. Each message costs 402 credits.</p>
            <div className="flex items-center gap-2 mt-2 text-xs mono text-muted-foreground">
              <Zap className="w-3.5 h-3.5 text-primary" />
              <span>Balance: {balance.toLocaleString()} credits</span>
            </div>
          </div>
          <Link
            to="/chat"
            className="flex-shrink-0 flex items-center gap-2 px-6 py-3 rounded-lg bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-all hover:scale-[1.02] glow-cyan"
          >
            <MessageCircle className="w-4 h-4" /> Chat with Kai
          </Link>
        </div>
      </main>
    </div>
  );
}

function InfoRow({ label, value, onCopy, copied }: {
  label: string;
  value: string;
  onCopy?: () => void;
  copied?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-muted-foreground mono uppercase tracking-wider flex-shrink-0">{label}</span>
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-sm text-foreground truncate mono">{value}</span>
        {onCopy && (
          <button onClick={onCopy} className="text-muted-foreground hover:text-foreground flex-shrink-0">
            {copied ? <CheckCheck className="w-3.5 h-3.5 text-primary" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        )}
      </div>
    </div>
  );
}
