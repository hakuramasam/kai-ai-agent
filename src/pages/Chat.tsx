import { useState, useRef, useEffect } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useAccount, useSignMessage } from "wagmi";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Send, Loader2, Zap, Wallet, AlertTriangle } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

const KAI_TOKEN = "0x86af9cb35a613992ea552e0ba7419f1dada3084c";
const BASE_CHAIN_ID = 8453;

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface X402PaymentDetails {
  maxAmountRequired: string;
  asset: string;
  network: string;
  chainId: number;
  payTo: string;
  description: string;
}

export default function Chat() {
  const { user, session, profile, loading } = useAuth();
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paymentPending, setPaymentPending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  if (loading) return null;
  if (!user) return <Navigate to="/" replace />;

  const walletAddress = (profile as any)?.wallet_address;

  const signX402Payment = async (paymentDetails: X402PaymentDetails): Promise<string> => {
    if (!address) throw new Error("No wallet connected");
    
    // Sign a payment authorization message (ERC-3009 style)
    const paymentMessage = JSON.stringify({
      protocol: "x402",
      version: "2",
      amount: paymentDetails.maxAmountRequired,
      token: paymentDetails.asset,
      chain: paymentDetails.chainId,
      to: paymentDetails.payTo,
      nonce: Date.now().toString(),
      from: address,
    });

    const signature = await signMessageAsync({ message: paymentMessage, account: address });
    
    // Encode as base64 payment header
    const paymentHeader = btoa(JSON.stringify({
      signature,
      payload: paymentMessage,
      from: address,
    }));

    return paymentHeader;
  };

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setError(null);
    setInput("");

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setSending(true);

    try {
      if (!walletAddress && !isConnected) {
        throw new Error("Connect & bind your wallet to pay with $KAI");
      }

      // Step 1: Send message without payment to get 402 + payment details
      const initialRes = await supabase.functions.invoke("kai-chat", {
        body: { message: text },
      });

      const initialData = initialRes.data;

      // Check if we got x402 payment required
      if (initialData?.x402 || initialData?.error === "Payment Required") {
        const paymentDetails: X402PaymentDetails = initialData.x402;
        setPaymentPending(true);

        // Step 2: Sign x402 payment with user's wallet
        const paymentHeader = await signX402Payment(paymentDetails);
        setPaymentPending(false);

        // Step 3: Retry with payment header
        const paidRes = await supabase.functions.invoke("kai-chat", {
          body: { message: text, paymentHeader },
        });

        if (paidRes.error) {
          const errBody = paidRes.error as any;
          throw new Error(errBody?.message || errBody?.error || "Payment failed");
        }

        const data = paidRes.data;
        const reply = typeof data === "string" ? data : data?.response || data?.text || data?.message || JSON.stringify(data);

        setMessages((prev) => [
          ...prev,
          { id: crypto.randomUUID(), role: "assistant", content: reply, timestamp: new Date() },
        ]);

        toast.success(`Paid ${paymentDetails.maxAmountRequired} $KAI`);
      } else if (initialRes.error) {
        throw new Error((initialRes.error as any)?.message || "Request failed");
      } else {
        // Direct response (no payment needed)
        const reply = typeof initialData === "string" ? initialData : initialData?.response || initialData?.text || initialData?.message || JSON.stringify(initialData);
        setMessages((prev) => [
          ...prev,
          { id: crypto.randomUUID(), role: "assistant", content: reply, timestamp: new Date() },
        ]);
      }
    } catch (err: any) {
      setPaymentPending(false);
      const msg = err.message || "Failed to send message";
      if (!msg.includes("User rejected")) {
        setError(msg);
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/dashboard" className="text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-md bg-primary/10 border border-primary/30 flex items-center justify-center">
                <span className="text-primary font-bold text-xs mono">K</span>
              </div>
              <span className="font-semibold text-sm">Kai Agent</span>
              <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* x402 payment indicator */}
            <div className="flex items-center gap-1.5 text-xs mono text-muted-foreground bg-muted px-2.5 py-1 rounded-md border border-border/50">
              <Zap className="w-3 h-3 text-primary" />
              <span>402 $KAI/msg</span>
            </div>
            {walletAddress ? (
              <div className="flex items-center gap-1.5 text-xs mono text-muted-foreground">
                <Wallet className="w-3.5 h-3.5 text-green-400" />
                <span>{walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}</span>
              </div>
            ) : (
              <Link to="/dashboard" className="flex items-center gap-1.5 text-xs text-destructive hover:underline">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>Bind wallet</span>
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6 max-w-3xl mx-auto w-full space-y-4">
        {messages.length === 0 && (
          <div className="flex-1 flex items-center justify-center min-h-[50vh]">
            <div className="text-center space-y-4">
              <div className="w-16 h-16 mx-auto rounded-2xl bg-primary/10 border border-primary/30 flex items-center justify-center glow-cyan">
                <span className="text-primary font-black mono text-2xl">K</span>
              </div>
              <h2 className="text-xl font-bold">Chat with Kai</h2>
              <p className="text-sm text-muted-foreground max-w-sm">
                Your autonomous AI agent. Pay per message with <span className="text-primary font-semibold">$KAI</span> token on Base via x402 protocol.
              </p>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted border border-border/50 text-xs mono text-muted-foreground">
                <Zap className="w-3 h-3 text-primary" />
                402 $KAI per message
              </div>
              {!walletAddress && (
                <div className="mt-4">
                  <Link
                    to="/dashboard"
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-destructive/10 text-destructive text-sm border border-destructive/20 hover:bg-destructive/20 transition-colors"
                  >
                    <Wallet className="w-4 h-4" />
                    Bind your wallet first
                  </Link>
                </div>
              )}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[80%] rounded-xl px-4 py-3 text-sm leading-relaxed ${
                msg.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "card-glass border border-border/50"
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}

        {sending && (
          <div className="flex justify-start">
            <div className="card-glass border border-border/50 rounded-xl px-4 py-3 flex items-center gap-2">
              {paymentPending ? (
                <>
                  <Wallet className="w-4 h-4 animate-pulse text-primary" />
                  <span className="text-sm text-muted-foreground">Sign $KAI payment in wallet...</span>
                </>
              ) : (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-primary" />
                  <span className="text-sm text-muted-foreground">Kai is thinking...</span>
                </>
              )}
            </div>
          </div>
        )}

        {error && (
          <div className="text-center">
            <span className="text-sm text-destructive mono">{error}</span>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="sticky bottom-0 border-t border-border/50 bg-background/80 backdrop-blur-xl p-4">
        <div className="max-w-3xl mx-auto flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
            placeholder={walletAddress ? "Message Kai..." : "Bind wallet to chat..."}
            disabled={sending || !walletAddress}
            className="flex-1 bg-muted border border-border/50 rounded-lg px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50"
          />
          <Button
            onClick={sendMessage}
            disabled={sending || !input.trim() || !walletAddress}
            className="bg-primary text-primary-foreground hover:bg-primary/90 px-4"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
