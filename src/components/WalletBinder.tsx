import { useState } from "react";
import { useAccount, useConnect, useDisconnect, useSignMessage } from "wagmi";
import { injected, walletConnect } from "@wagmi/connectors";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Wallet, CheckCircle2, AlertCircle, Loader2, Link2, Unlink } from "lucide-react";
import { toast } from "sonner";

const WC_PROJECT_ID = "2b5a9f1e3c4d5e6f7a8b9c0d1e2f3a4b";

interface WalletBinderProps {
  currentWallet: string | null;
  onSuccess: () => void;
}

export default function WalletBinder({ currentWallet, onSuccess }: WalletBinderProps) {
  const { address, isConnected } = useAccount();
  const { connect } = useConnect();
  const { disconnect } = useDisconnect();
  const { signMessageAsync } = useSignMessage();
  const { user, refreshProfile } = useAuth();
  const [binding, setBinding] = useState(false);

  const handleBind = async () => {
    if (!address || !user) return;
    setBinding(true);
    try {
      const message = `Bind wallet ${address} to Kai Agent account ${user.id}\nTimestamp: ${Date.now()}`;
      const signature = await signMessageAsync({ message, account: address });
      
      if (!signature) throw new Error("Signature failed");

      const { error } = await supabase
        .from("profiles")
        .update({ wallet_address: address })
        .eq("user_id", user.id);

      if (error) throw error;

      await refreshProfile();
      onSuccess();
      toast.success("Wallet bound successfully!");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to bind wallet";
      if (!msg.includes("User rejected")) toast.error(msg);
    } finally {
      setBinding(false);
    }
  };

  const handleUnbind = async () => {
    if (!user) return;
    const { error } = await supabase
      .from("profiles")
      .update({ wallet_address: null })
      .eq("user_id", user.id);
    if (!error) {
      await refreshProfile();
      onSuccess();
      disconnect();
      toast.success("Wallet unbound");
    }
  };

  if (currentWallet) {
    return (
      <div className="space-y-4">
        <div className="border-glow-cyan rounded-lg p-4 flex items-center gap-3">
          <CheckCircle2 className="text-primary w-5 h-5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground mono uppercase tracking-wider mb-1">Bound Wallet</p>
            <p className="mono text-sm text-foreground truncate">{currentWallet}</p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleUnbind}
          className="w-full border-destructive/40 text-destructive hover:bg-destructive/10"
        >
          <Unlink className="w-4 h-4 mr-2" />
          Unbind Wallet
        </Button>
      </div>
    );
  }

  if (isConnected && address) {
    return (
      <div className="space-y-4">
        <div className="border border-border rounded-lg p-4 flex items-center gap-3">
          <AlertCircle className="text-yellow-400 w-5 h-5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground mono uppercase tracking-wider mb-1">Connected (not bound)</p>
            <p className="mono text-sm text-foreground truncate">{address}</p>
          </div>
        </div>
        <Button
          onClick={handleBind}
          disabled={binding}
          className="w-full bg-primary text-primary-foreground hover:bg-primary/90 glow-cyan"
        >
          {binding ? (
            <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Signing...</>
          ) : (
            <><Link2 className="w-4 h-4 mr-2" /> Sign & Bind Wallet</>
          )}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => disconnect()} className="w-full text-muted-foreground">
          Disconnect
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Button
        onClick={() => connect({ connector: injected() })}
        variant="outline"
        className="w-full border-border hover:border-primary/50 hover:bg-primary/5"
      >
        <Wallet className="w-4 h-4 mr-2" />
        MetaMask / Browser Wallet
      </Button>
      <Button
        onClick={() => connect({ connector: walletConnect({ projectId: WC_PROJECT_ID }) as ReturnType<typeof walletConnect> })}
        variant="outline"
        className="w-full border-border hover:border-accent/50 hover:bg-accent/5"
      >
        <svg className="w-4 h-4 mr-2" viewBox="0 0 300 185" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M61.4385 36.2562C113.934 -14.7521 198.066 -14.7521 250.561 36.2562L256.787 42.3469C259.476 44.9467 259.476 49.1455 256.787 51.7453L235.162 72.8238C233.817 74.1237 231.646 74.1237 230.301 72.8238L221.732 64.4703C185.773 29.5179 114.227 29.5179 78.2683 64.4703L69.0937 73.4485C67.749 74.7484 65.578 74.7484 64.2332 73.4485L42.6081 52.37C39.9191 49.7702 39.9191 45.5714 42.6081 42.9716L61.4385 36.2562ZM295.097 79.6528L314.532 98.6072C317.221 101.207 317.221 105.406 314.532 108.006L224.355 195.793C221.666 198.393 217.324 198.393 214.635 195.793L151.031 133.724C150.359 133.074 149.273 133.074 148.601 133.724L84.9968 195.793C82.3078 198.393 77.9663 198.393 75.2773 195.793L-14.8996 108.006C-17.5886 105.406 -17.5886 101.207 -14.8996 98.6072L4.53559 79.6528C7.22458 77.053 11.5661 77.053 14.2551 79.6528L77.8591 141.722C78.5312 142.372 79.617 142.372 80.2891 141.722L143.894 79.6528C146.583 77.053 150.924 77.053 153.613 79.6528L217.217 141.722C217.889 142.372 218.975 142.372 219.647 141.722L283.251 79.6528C285.94 77.053 290.281 77.053 295.097 79.6528Z" fill="hsl(260 80% 65%)"/>
        </svg>
        WalletConnect
      </Button>
    </div>
  );
}
