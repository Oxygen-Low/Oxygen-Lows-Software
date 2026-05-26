
  create table "public"."image_links" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "url" text not null,
    "created_at" timestamp with time zone default now()
      );


alter table "public"."image_links" enable row level security;

CREATE UNIQUE INDEX image_links_pkey ON public.image_links USING btree (id);

alter table "public"."image_links" add constraint "image_links_pkey" PRIMARY KEY using index "image_links_pkey";

alter table "public"."image_links" add constraint "image_links_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."image_links" validate constraint "image_links_user_id_fkey";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.check_image_links_limit()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    IF (SELECT count(*) FROM public.image_links WHERE user_id = NEW.user_id) >= 100 THEN
        RAISE EXCEPTION 'Maximum limit of 100 image links reached';
    END IF;
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.check_user_total_storage_limit(p_bucketid text, p_name text, p_owner uuid, p_metadata jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_total_size BIGINT;
  v_new_size BIGINT;
BEGIN
  -- Get the size of the new object
  v_new_size := (p_metadata->>'size')::BIGINT;

  -- Calculate existing size for the user in the bucket
  SELECT COALESCE(SUM((metadata->>'size')::BIGINT), 0)
  INTO v_total_size
  FROM storage.objects
  WHERE bucket_id = p_bucketid
    AND owner_id = p_owner::text;

  -- Check if total size exceeds 10MB (10 * 1024 * 1024)
  IF (v_total_size + v_new_size) > 10485760 THEN
    RETURN false;
  END IF;

  RETURN true;
END;
$function$
;

grant delete on table "public"."image_links" to "anon";

grant insert on table "public"."image_links" to "anon";

grant references on table "public"."image_links" to "anon";

grant select on table "public"."image_links" to "anon";

grant trigger on table "public"."image_links" to "anon";

grant truncate on table "public"."image_links" to "anon";

grant update on table "public"."image_links" to "anon";

grant delete on table "public"."image_links" to "authenticated";

grant insert on table "public"."image_links" to "authenticated";

grant references on table "public"."image_links" to "authenticated";

grant select on table "public"."image_links" to "authenticated";

grant trigger on table "public"."image_links" to "authenticated";

grant truncate on table "public"."image_links" to "authenticated";

grant update on table "public"."image_links" to "authenticated";

grant delete on table "public"."image_links" to "service_role";

grant insert on table "public"."image_links" to "service_role";

grant references on table "public"."image_links" to "service_role";

grant select on table "public"."image_links" to "service_role";

grant trigger on table "public"."image_links" to "service_role";

grant truncate on table "public"."image_links" to "service_role";

grant update on table "public"."image_links" to "service_role";


  create policy "Users can manage their own image links"
  on "public"."image_links"
  as permissive
  for all
  to public
using ((auth.uid() = user_id));


CREATE TRIGGER enforce_image_links_limit BEFORE INSERT ON public.image_links FOR EACH ROW EXECUTE FUNCTION public.check_image_links_limit();


  create policy "User Storage Delete Policy"
  on "storage"."objects"
  as permissive
  for delete
  to public
using (((bucket_id = 'Storage'::text) AND ((auth.uid())::text = owner_id)));



  create policy "User Storage Select Policy"
  on "storage"."objects"
  as permissive
  for select
  to public
using (((bucket_id = 'Storage'::text) AND ((auth.uid())::text = owner_id)));



