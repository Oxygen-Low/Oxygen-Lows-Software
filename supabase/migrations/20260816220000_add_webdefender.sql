-- Migration: Add Defender Tables
-- Description: Create tables, RLS policies, triggers, and indexes for the Defender feature

-- 1. defender_apps
CREATE TABLE IF NOT EXISTS public.defender_apps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  api_key_hash text NOT NULL UNIQUE,
  api_key_prefix text NOT NULL,
  block_mode_enabled boolean NOT NULL DEFAULT false,
  block_mode_enabled_at timestamptz,
  first_request_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.defender_apps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own apps" ON public.defender_apps FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users can insert own apps" ON public.defender_apps FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update own apps" ON public.defender_apps FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can delete own apps" ON public.defender_apps FOR DELETE USING (user_id = auth.uid());

-- 2. defender_config
CREATE TABLE IF NOT EXISTS public.defender_config (
  app_id uuid PRIMARY KEY REFERENCES public.defender_apps(id) ON DELETE CASCADE,
  block_sql_injection boolean NOT NULL DEFAULT true,
  block_shell_injection boolean NOT NULL DEFAULT true,
  block_path_traversal boolean NOT NULL DEFAULT true,
  block_ssrf boolean NOT NULL DEFAULT true,
  block_tor boolean NOT NULL DEFAULT true,
  block_countries text[] NOT NULL DEFAULT '{}',
  block_ad_bots boolean NOT NULL DEFAULT false,
  block_ai_assistants boolean NOT NULL DEFAULT false,
  block_ai_scrapers boolean NOT NULL DEFAULT true,
  block_ai_search_crawlers boolean NOT NULL DEFAULT false,
  block_data_harvesters boolean NOT NULL DEFAULT true,
  ddos_protection boolean NOT NULL DEFAULT true,
  ddos_threshold_rpm integer NOT NULL DEFAULT 1000
);

ALTER TABLE public.defender_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own config" ON public.defender_config FOR SELECT USING (EXISTS (SELECT 1 FROM public.defender_apps WHERE id = public.defender_config.app_id AND user_id = auth.uid()));
CREATE POLICY "Users can insert own config" ON public.defender_config FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.defender_apps WHERE id = public.defender_config.app_id AND user_id = auth.uid()));
CREATE POLICY "Users can update own config" ON public.defender_config FOR UPDATE USING (EXISTS (SELECT 1 FROM public.defender_apps WHERE id = public.defender_config.app_id AND user_id = auth.uid()));
CREATE POLICY "Users can delete own config" ON public.defender_config FOR DELETE USING (EXISTS (SELECT 1 FROM public.defender_apps WHERE id = public.defender_config.app_id AND user_id = auth.uid()));

-- Trigger to auto-create config when an app is created
CREATE OR REPLACE FUNCTION public.create_defender_config() 
RETURNS trigger AS $$ 
BEGIN 
  INSERT INTO public.defender_config(app_id) VALUES (NEW.id); 
  RETURN NEW; 
END; 
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_defender_app_created 
  AFTER INSERT ON public.defender_apps 
  FOR EACH ROW 
  EXECUTE FUNCTION public.create_defender_config();

-- 3. defender_routes
CREATE TABLE IF NOT EXISTS public.defender_routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id uuid NOT NULL REFERENCES public.defender_apps(id) ON DELETE CASCADE,
  method text NOT NULL,
  path text NOT NULL,
  rate_limit_enabled boolean NOT NULL DEFAULT false,
  rate_limit_requests integer NOT NULL DEFAULT 100,
  rate_limit_window_seconds integer NOT NULL DEFAULT 60,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(app_id, method, path)
);

ALTER TABLE public.defender_routes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own routes" ON public.defender_routes FOR SELECT USING (EXISTS (SELECT 1 FROM public.defender_apps WHERE id = public.defender_routes.app_id AND user_id = auth.uid()));
CREATE POLICY "Users can insert own routes" ON public.defender_routes FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.defender_apps WHERE id = public.defender_routes.app_id AND user_id = auth.uid()));
CREATE POLICY "Users can update own routes" ON public.defender_routes FOR UPDATE USING (EXISTS (SELECT 1 FROM public.defender_apps WHERE id = public.defender_routes.app_id AND user_id = auth.uid()));
CREATE POLICY "Users can delete own routes" ON public.defender_routes FOR DELETE USING (EXISTS (SELECT 1 FROM public.defender_apps WHERE id = public.defender_routes.app_id AND user_id = auth.uid()));

-- 4. defender_events
CREATE TABLE IF NOT EXISTS public.defender_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id uuid NOT NULL REFERENCES public.defender_apps(id) ON DELETE CASCADE,
  route_id uuid REFERENCES public.defender_routes(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  ip text,
  country_code text,
  user_agent text,
  method text,
  path text,
  blocked boolean NOT NULL DEFAULT false,
  request_body_snippet text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.defender_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own events" ON public.defender_events FOR SELECT USING (EXISTS (SELECT 1 FROM public.defender_apps WHERE id = public.defender_events.app_id AND user_id = auth.uid()));
CREATE POLICY "Users can insert own events" ON public.defender_events FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.defender_apps WHERE id = public.defender_events.app_id AND user_id = auth.uid()));
CREATE POLICY "Users can update own events" ON public.defender_events FOR UPDATE USING (EXISTS (SELECT 1 FROM public.defender_apps WHERE id = public.defender_events.app_id AND user_id = auth.uid()));
CREATE POLICY "Users can delete own events" ON public.defender_events FOR DELETE USING (EXISTS (SELECT 1 FROM public.defender_apps WHERE id = public.defender_events.app_id AND user_id = auth.uid()));

-- 5. defender_outbound
CREATE TABLE IF NOT EXISTS public.defender_outbound (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id uuid NOT NULL REFERENCES public.defender_apps(id) ON DELETE CASCADE,
  host text NOT NULL,
  ip text,
  port integer,
  protocol text NOT NULL DEFAULT 'https',
  allowed boolean NOT NULL DEFAULT true,
  first_seen timestamptz NOT NULL DEFAULT now(),
  last_seen timestamptz NOT NULL DEFAULT now(),
  request_count integer NOT NULL DEFAULT 1,
  UNIQUE(app_id, host, port, protocol)
);

ALTER TABLE public.defender_outbound ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own outbound" ON public.defender_outbound FOR SELECT USING (EXISTS (SELECT 1 FROM public.defender_apps WHERE id = public.defender_outbound.app_id AND user_id = auth.uid()));
CREATE POLICY "Users can insert own outbound" ON public.defender_outbound FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.defender_apps WHERE id = public.defender_outbound.app_id AND user_id = auth.uid()));
CREATE POLICY "Users can update own outbound" ON public.defender_outbound FOR UPDATE USING (EXISTS (SELECT 1 FROM public.defender_apps WHERE id = public.defender_outbound.app_id AND user_id = auth.uid()));
CREATE POLICY "Users can delete own outbound" ON public.defender_outbound FOR DELETE USING (EXISTS (SELECT 1 FROM public.defender_apps WHERE id = public.defender_outbound.app_id AND user_id = auth.uid()));

-- Indexes
CREATE INDEX IF NOT EXISTS idx_defender_events_app_id_created_at ON public.defender_events(app_id, created_at);
CREATE INDEX IF NOT EXISTS idx_defender_events_app_id_event_type ON public.defender_events(app_id, event_type);
CREATE INDEX IF NOT EXISTS idx_defender_outbound_app_id ON public.defender_outbound(app_id);
