-- Fix: Make storage_path nullable to support the "insert then update" pattern used in the application.
ALTER TABLE public.repositories ALTER COLUMN storage_path DROP NOT NULL;
