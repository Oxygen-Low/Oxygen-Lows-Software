-- Migration: Add block_ips to defender_config
-- Description: Add column for blocking individual IP addresses

ALTER TABLE public.defender_config
  ADD COLUMN IF NOT EXISTS block_ips text[] NOT NULL DEFAULT '{}';
