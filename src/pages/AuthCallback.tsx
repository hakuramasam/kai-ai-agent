import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

export default function AuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        // Redirect to external Kai chat after successful login
        window.location.href = "https://elizacloud.ai/chat/@kai85";
      } else {
        navigate("/");
      }
    });
  }, [navigate]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center space-y-4">
        <div className="relative mx-auto w-16 h-16">
          <div className="absolute inset-0 rounded-full border-2 border-primary/30 animate-ping" />
          <div className="absolute inset-2 rounded-full border-2 border-primary animate-spin" style={{ borderTopColor: "transparent" }} />
        </div>
        <p className="text-muted-foreground mono text-sm tracking-wider">AUTHENTICATING...</p>
      </div>
    </div>
  );
}
