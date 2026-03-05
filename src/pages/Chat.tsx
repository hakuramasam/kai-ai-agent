import { useState, useRef, useEffect } from "react";
import { Navigate, Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useAccount, useSignMessage } from "wagmi";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Send, Loader2, Zap, Wallet, AlertTriangle, Bot, Wrench } from "lucide-react";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";

const KAI_TOKEN = "0x86af9cb35a613992ea552e0ba7419f1dada3084c";
const BASE_CHAIN_ID = 8453;

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  toolsUsed?: boolean;
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
    return btoa(JSON.stringify({ signature, payload: paymentMessage, from: address }));
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

      // Build conversation history for context
      const chatHistory = [...messages, userMsg].map((m) => ({
        role: m.role,
        content: m.content,
      }));

      // Step 1: Send without payment to get 402
      const initialRes = await supabase.functions.invoke("kai-chat", {
        body: { messages: chatHistory },
      });

      const initialData = initialRes.data;

      if (initialData?.x402 || initialData?.error === "Payment Required") {
        const paymentDetails: X402PaymentDetails = initialData.x402;
        setPaymentPending(true);

        const paymentHeader = await signX402Payment(paymentDetails);
        setPaymentPending(false);

        const paidRes = await supabase.functions.invoke("kai-chat", {
          body: { messages: chatHistory, paymentHeader },
        });

        if (paidRes.error) {
          const errBody = paidRes.error as any;
          throw new Error(errBody?.message || errBody?.error || "Payment failed");
        }

        const data = paidRes.data;
        const reply = data?.response || data?.text || data?.message || (typeof data === "string" ? data : JSON.stringify(data));

        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: reply,
            timestamp: new Date(),
            toolsUsed: data?.tool_calls_made,
          },
        ]);

        toast.success(`Paid ${paymentDetails.maxAmountRequired} $KAI`);
      } else if (initialRes.error) {
        throw new Error((initialRes.error as any)?.message || "Request failed");
      } else {
        const reply = initialData?.response || initialData?.text || initialData?.message || (typeof initialData === "string" ? initialData : JSON.stringify(initialData));
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: reply,
            timestamp: new Date(),
            toolsUsed: initialData?.tool_calls_made,
          },
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
      <ChatHeader walletAddress={walletAddress} />

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6 max-w-3xl mx-auto w-full space-y-4">
        {messages.length === 0 && <EmptyState walletAddress={walletAddress} />}

        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
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
          <Button onClick={sendMessage} disabled={sending || !input.trim() || !walletAddress} className="bg-primary text-primary-foreground hover:bg-primary/90 px-4">
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function ChatHeader({ walletAddress }: { walletAddress: string | null }) {
  return (
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
  );
}

function EmptyState({ walletAddress }: { walletAddress: string | null }) {
  return (
    <div className="flex-1 flex items-center justify-center min-h-[50vh]">
      <div className="text-center space-y-4">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-primary/10 border border-primary/30 flex items-center justify-center glow-cyan">
          <span className="text-primary font-black mono text-2xl">K</span>
        </div>
        <h2 className="text-xl font-bold">Chat with Kai</h2>
        <p className="text-sm text-muted-foreground max-w-sm">
          Autonomous AI agent with blockchain tools, web search, and multi-agent delegation. Powered by <span className="text-primary font-semibold">GPT-5</span> + x402 payments.
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <ToolBadge icon={<Wrench className="w-3 h-3" />} label="Blockchain" />
          <ToolBadge icon={<Bot className="w-3 h-3" />} label="A2A Agents" />
          <ToolBadge icon={<Zap className="w-3 h-3" />} label="x402 Pay" />
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
  );
}

function ToolBadge({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted border border-border/50 text-xs mono text-muted-foreground">
      {icon}
      {label}
    </span>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-xl px-4 py-3 text-sm leading-relaxed ${
          isUser
            ? "bg-primary text-primary-foreground"
            : "card-glass border border-border/50"
        }`}
      >
        {isUser ? (
          message.content
        ) : (
          <div className="prose prose-sm prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
            <ReactMarkdown>{message.content}</ReactMarkdown>
            {message.toolsUsed && (
              <div className="flex items-center gap-1 mt-2 pt-2 border-t border-border/30">
                <Wrench className="w-3 h-3 text-primary" />
                <span className="text-xs text-muted-foreground">Tools used</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
