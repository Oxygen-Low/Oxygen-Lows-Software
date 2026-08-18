-- Migration: Add Realtime Publication to Web Defender Tables
-- Description: Enables real-time updates for defender_apps, defender_config, defender_routes, defender_events, and defender_outbound

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.defender_apps;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;

    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.defender_config;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;

    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.defender_routes;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;

    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.defender_events;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;

    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.defender_outbound;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;

ALTER TABLE public.defender_apps REPLICA IDENTITY FULL;
ALTER TABLE public.defender_config REPLICA IDENTITY FULL;
ALTER TABLE public.defender_routes REPLICA IDENTITY FULL;
ALTER TABLE public.defender_events REPLICA IDENTITY FULL;
ALTER TABLE public.defender_outbound REPLICA IDENTITY FULL;
