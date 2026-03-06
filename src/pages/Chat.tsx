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
const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/kai-chat`;

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
  const [streaming, setStreaming] = useState(false);
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
      protocol: "x402", version: "2",
      amount: paymentDetails.maxAmountRequired,
      token: paymentDetails.asset, chain: paymentDetails.chainId,
      to: paymentDetails.payTo, nonce: Date.now().toString(), from: address,
    });
    const signature = await signMessageAsync({ message: paymentMessage, account: address });
    return btoa(JSON.stringify({ signature, payload: paymentMessage, from: address }));
  };

  const streamResponse = async (paymentHeader: string, chatHistory: { role: string; content: string }[]) => {
    const token = session?.access_token;
    if (!token) throw new Error("No session");

    const resp = await fetch(CHAT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "x-payment": paymentHeader,
      },
      body: JSON.stringify({ messages: chatHistory, paymentHeader }),
    });

    if (!resp.ok) {
      const errData = await resp.json().catch(() => ({ error: "Request failed" }));
      throw new Error(errData?.error || `Error ${resp.status}`);
    }

    if (!resp.body) throw new Error("No response body");

    setStreaming(true);
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let assistantContent = "";
    let toolsUsed = false;
    let isFirstDataEvent = true;
    const assistantId = crypto.randomUUID();

    // Add empty assistant message
    setMessages((prev) => [...prev, {
      id: assistantId, role: "assistant", content: "", timestamp: new Date(),
    }]);

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
          let line = buffer.slice(0, newlineIndex);
          buffer = buffer.slice(newlineIndex + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;

          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") break;

          try {
            const parsed = JSON.parse(jsonStr);

            // First event is our metadata
            if (isFirstDataEvent && parsed.tool_calls_made !== undefined) {
              toolsUsed = parsed.tool_calls_made;
              isFirstDataEvent = false;
              continue;
            }
            isFirstDataEvent = false;

            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) {
              assistantContent += content;
              setMessages((prev) =>
                prev.map((m) => m.id === assistantId ? { ...m, content: assistantContent, toolsUsed } : m)
              );
            }
          } catch {
            // Incomplete JSON, put back
            buffer = line + "\n" + buffer;
            break;
          }
        }
      }
    } finally {
      setStreaming(false);
      // Final update with toolsUsed
      setMessages((prev) =>
        prev.map((m) => m.id === assistantId ? { ...m, content: assistantContent || "No response received.", toolsUsed } : m)
      );
    }
  };

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setError(null);
    setInput("");

    const userMsg: Message = {
      id: crypto.randomUUID(), role: "user", content: text, timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setSending(true);

    try {
      if (!walletAddress && !isConnected) {
        throw new Error("Connect & bind your wallet to pay with $KAI");
      }

      const chatHistory = [...messages, userMsg].map((m) => ({ role: m.role, content: m.content }));

      // Step 1: Get 402 payment details (non-streaming request without payment)
      const initialRes = await supabase.functions.invoke("kai-chat", {
        body: { messages: chatHistory },
      });

      const initialData = initialRes.data;

      if (initialData?.x402 || initialData?.error === "Payment Required") {
        const paymentDetails: X402PaymentDetails = initialData.x402;
        setPaymentPending(true);
        const paymentHeader = await signX402Payment(paymentDetails);
        setPaymentPending(false);

        // Step 2: Stream the paid response
        await streamResponse(paymentHeader, chatHistory);
        toast.success(`Paid ${paymentDetails.maxAmountRequired} $KAI`);
      } else if (initialRes.error) {
        throw new Error((initialRes.error as any)?.message || "Request failed");
      } else {
        // Unexpected non-402 response
        const reply = initialData?.response || initialData?.text || JSON.stringify(initialData);
        setMessages((prev) => [...prev, {
          id: crypto.randomUUID(), role: "assistant", content: reply, timestamp: new Date(),
        }]);
      }
    } catch (err: any) {
      setPaymentPending(false);
      const msg = err.message || "Failed to send message";
      if (!msg.includes("User rejected")) setError(msg);
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

        {sending && !streaming && (
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
          isUser ? "bg-primary text-primary-foreground" : "card-glass border border-border/50"
        }`}
      >
        {isUser ? (
          message.content
        ) : (
          <div className="prose prose-sm prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
            {message.content ? (
              <ReactMarkdown>{message.content}</ReactMarkdown>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                <Loader2 className="w-3 h-3 animate-spin" /> Generating...
              </span>
            )}
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
