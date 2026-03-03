import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { ExternalLink, Zap, Shield, Brain, ChevronRight, Cpu } from "lucide-react";
import heroImg from "@/assets/kai-hero-bg.jpg";

const features = [
  { icon: Brain, title: "AI-Powered", desc: "Advanced language model trained for autonomous tasks and real-time reasoning." },
  { icon: Shield, title: "Secure Auth", desc: "OAuth 2.0 via X with encrypted token storage and JWT session management." },
  { icon: Zap, title: "Web3 Native", desc: "Connect any EVM wallet. Sign to verify ownership. Your keys, your agent." },
  { icon: Cpu, title: "Eliza Runtime", desc: "Powered by ElizaCloud — the most capable AI agent runtime in production." },
];

export default function Landing() {
  const { user, loading, signInWithTwitter } = useAuth();
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Particle animation
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;

    const particles: { x: number; y: number; vx: number; vy: number; r: number; o: number }[] = [];
    for (let i = 0; i < 60; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        r: Math.random() * 1.5 + 0.5,
        o: Math.random() * 0.5 + 0.1,
      });
    }

    let raf: number;
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
        if (p.y < 0 || p.y > canvas.height) p.vy *= -1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(195, 100%, 60%, ${p.o})`;
        ctx.fill();
      });
      // Draw connections
      particles.forEach((a, i) => {
        particles.slice(i + 1).forEach(b => {
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          if (d < 100) {
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.strokeStyle = `hsla(195, 100%, 60%, ${0.08 * (1 - d / 100)})`;
            ctx.stroke();
          }
        });
      });
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, []);

  // Redirect if already logged in
  useEffect(() => {
    if (!loading && user) navigate("/dashboard");
  }, [user, loading, navigate]);

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      {/* Particle canvas */}
      <canvas
        ref={canvasRef}
        className="fixed inset-0 w-full h-full pointer-events-none z-0"
        style={{ opacity: 0.6 }}
      />

      {/* Ambient glows */}
      <div className="fixed top-20 left-1/2 -translate-x-1/2 w-[600px] h-[300px] rounded-full bg-primary/8 blur-[100px] pointer-events-none z-0" />
      <div className="fixed bottom-40 right-10 w-80 h-80 rounded-full bg-accent/6 blur-[80px] pointer-events-none z-0" />

      {/* Nav */}
      <nav className="relative z-10 flex items-center justify-between px-6 py-5 max-w-6xl mx-auto">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary/10 border border-primary/40 flex items-center justify-center glow-cyan">
            <span className="text-primary font-bold mono text-sm">K</span>
          </div>
          <span className="font-bold text-lg tracking-tight">Kai Agent</span>
          <span className="mono text-xs text-primary/50 hidden sm:inline">// AI Gateway</span>
        </div>
        <div className="flex items-center gap-4">
          <a
            href="https://elizacloud.ai/chat/@kai85"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden sm:flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            elizacloud.ai <ExternalLink className="w-3 h-3" />
          </a>
          <Button
            onClick={signInWithTwitter}
            size="sm"
            className="bg-foreground text-background hover:bg-foreground/90 font-semibold"
          >
            <svg className="w-3.5 h-3.5 mr-1.5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.737-8.857L1.254 2.25H8.08l4.259 5.63 5.905-5.63zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
            </svg>
            Sign in
          </Button>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative z-10 pt-16 pb-24 px-6 max-w-6xl mx-auto">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          <div className="space-y-8">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-primary/30 bg-primary/5 text-primary text-xs mono">
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse-slow" />
              AGENT ONLINE — ELIZA RUNTIME v2
            </div>

            <div className="space-y-4">
              <h1 className="text-5xl lg:text-7xl font-black leading-none tracking-tight">
                <span className="gradient-text-cyan">KAI</span>
                <br />
                <span className="text-foreground/90">AGENT</span>
              </h1>
              <p className="text-lg text-muted-foreground leading-relaxed max-w-md">
                Your autonomous AI agent, secured by X identity and Web3 wallet verification. Authenticate once, chat forever.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                onClick={signInWithTwitter}
                size="lg"
                className="bg-foreground text-background hover:bg-foreground/90 font-bold text-base px-8 h-12 hover:scale-[1.02] transition-transform"
              >
                <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.737-8.857L1.254 2.25H8.08l4.259 5.63 5.905-5.63zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                </svg>
                Login with X
              </Button>
              <a
                href="https://elizacloud.ai/chat/@kai85"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 h-12 px-6 rounded-lg border border-border hover:border-primary/50 text-sm font-medium transition-colors hover:bg-primary/5"
              >
                View Kai's Chat <ChevronRight className="w-4 h-4" />
              </a>
            </div>

            {/* Stats */}
            <div className="flex gap-8 pt-4 border-t border-border/50">
              {[
                { val: "24/7", label: "Online" },
                { val: "< 1s", label: "Response" },
                { val: "EVM", label: "Web3 Ready" },
              ].map(s => (
                <div key={s.label}>
                  <div className="text-xl font-bold gradient-text-cyan mono">{s.val}</div>
                  <div className="text-xs text-muted-foreground uppercase tracking-wider">{s.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Hero image */}
          <div className="relative hidden lg:block">
            <div className="relative rounded-2xl overflow-hidden border border-primary/20 glow-cyan animate-float">
              <img src={heroImg} alt="Kai Agent AI" className="w-full h-auto object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-transparent to-transparent" />
              {/* HUD overlay */}
              <div className="absolute bottom-4 left-4 right-4">
                <div className="card-glass rounded-lg p-3 flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                  <span className="mono text-xs text-foreground/80">kai85@elizacloud.ai — ACTIVE</span>
                </div>
              </div>
            </div>
            {/* Corner accents */}
            <div className="absolute -top-3 -left-3 w-6 h-6 border-t-2 border-l-2 border-primary/60" />
            <div className="absolute -bottom-3 -right-3 w-6 h-6 border-b-2 border-r-2 border-primary/60" />
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="relative z-10 py-24 px-6 max-w-6xl mx-auto">
        <div className="text-center mb-14">
          <p className="mono text-xs text-primary/60 uppercase tracking-[0.3em] mb-3">System Architecture</p>
          <h2 className="text-3xl font-bold">Built for Production</h2>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {features.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="card-glass rounded-xl p-6 space-y-3 hover:border-primary/30 transition-all hover:-translate-y-1 group border border-border/50">
              <div className="w-10 h-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center group-hover:glow-cyan transition-all">
                <Icon className="w-5 h-5 text-primary" />
              </div>
              <h3 className="font-semibold">{title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="relative z-10 py-20 px-6">
        <div className="max-w-2xl mx-auto text-center space-y-6">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-primary/10 border border-primary/30 flex items-center justify-center glow-cyan">
            <span className="text-primary font-black mono text-2xl">K</span>
          </div>
          <h2 className="text-4xl font-black">
            Start your session with <span className="gradient-text-cyan">Kai</span>
          </h2>
          <p className="text-muted-foreground">Login with your X account. We'll take care of the rest.</p>
          <Button
            onClick={signInWithTwitter}
            size="lg"
            className="bg-primary text-primary-foreground hover:bg-primary/90 font-bold text-base px-10 h-12 glow-cyan hover:scale-[1.03] transition-transform"
          >
            <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.737-8.857L1.254 2.25H8.08l4.259 5.63 5.905-5.63zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
            </svg>
            Login with X
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-border/30 py-8 px-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          <span className="mono text-xs text-muted-foreground">© 2025 Kai Agent. Powered by ElizaCloud.</span>
          <a
            href="https://elizacloud.ai/chat/@kai85"
            target="_blank"
            rel="noopener noreferrer"
            className="mono text-xs text-primary/60 hover:text-primary flex items-center gap-1"
          >
            elizacloud.ai/chat/@kai85 <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </footer>
    </div>
  );
}
