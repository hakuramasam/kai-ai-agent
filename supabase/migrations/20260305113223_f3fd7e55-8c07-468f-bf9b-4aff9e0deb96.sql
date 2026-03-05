
-- Agent config table for storing agent wallet address and other settings
CREATE TABLE public.agent_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.agent_config ENABLE ROW LEVEL SECURITY;

-- Only allow read access for authenticated users
CREATE POLICY "Authenticated users can read agent config"
ON public.agent_config
FOR SELECT
TO authenticated
USING (true);
