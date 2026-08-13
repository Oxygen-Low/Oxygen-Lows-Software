-- Fix foreign keys to point to profiles(user_id) for better PostgREST join resolution
ALTER TABLE public.repository_issues DROP CONSTRAINT IF EXISTS repository_issues_author_id_fkey;
ALTER TABLE public.repository_issues ADD CONSTRAINT repository_issues_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE;

ALTER TABLE public.repository_pull_requests DROP CONSTRAINT IF EXISTS repository_pull_requests_author_id_fkey;
ALTER TABLE public.repository_pull_requests ADD CONSTRAINT repository_pull_requests_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE;

ALTER TABLE public.repository_pull_request_comments DROP CONSTRAINT IF EXISTS repository_pull_request_comments_user_id_fkey;
ALTER TABLE public.repository_pull_request_comments ADD CONSTRAINT repository_pull_request_comments_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE;

ALTER TABLE public.repository_collaborators DROP CONSTRAINT IF EXISTS repository_collaborators_user_id_fkey;
ALTER TABLE public.repository_collaborators ADD CONSTRAINT repository_collaborators_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE;
