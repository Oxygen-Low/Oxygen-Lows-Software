-- Migration: Add events_limit to defender_config and pruning trigger for defender_events
-- Description: Allow configuring maximum retained events (1-1000, default 50) and auto-prune oldest events.

ALTER TABLE public.defender_config
  ADD COLUMN IF NOT EXISTS events_limit integer NOT NULL DEFAULT 50 CHECK (events_limit >= 1 AND events_limit <= 1000);

-- Function to prune old events beyond the app's configured events_limit
CREATE OR REPLACE FUNCTION public.prune_defender_events()
RETURNS trigger AS $$
DECLARE
  max_count integer;
BEGIN
  SELECT COALESCE(events_limit, 50) INTO max_count
  FROM public.defender_config
  WHERE app_id = NEW.app_id;

  IF max_count IS NULL THEN
    max_count := 50;
  END IF;

  DELETE FROM public.defender_events
  WHERE id IN (
    SELECT id FROM public.defender_events
    WHERE app_id = NEW.app_id
    ORDER BY created_at DESC
    OFFSET max_count
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_prune_defender_events ON public.defender_events;
CREATE TRIGGER trg_prune_defender_events
  AFTER INSERT ON public.defender_events
  FOR EACH ROW
  EXECUTE FUNCTION public.prune_defender_events();
