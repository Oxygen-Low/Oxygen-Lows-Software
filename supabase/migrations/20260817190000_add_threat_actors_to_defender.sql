-- Migration: Add Threat Actor Categories to defender_config
-- Description: Add columns for Bruteforce attackers, HTTP DoS attackers, HTTP Exploit attackers, and Botnet Actors

ALTER TABLE public.defender_config
  ADD COLUMN IF NOT EXISTS block_bruteforce boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS block_http_dos boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS block_http_exploit boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS block_botnets boolean NOT NULL DEFAULT true;
