
-- Add balance and role columns to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS balance integer NOT NULL DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'user';

-- Create usage_logs table
CREATE TABLE public.usage_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  cost integer NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS on usage_logs
ALTER TABLE public.usage_logs ENABLE ROW LEVEL SECURITY;

-- Users can view their own usage logs
CREATE POLICY "Users can view own usage logs" ON public.usage_logs
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Only service role / edge functions can insert (via service role key)
-- No insert policy for regular users - edge function uses service role
