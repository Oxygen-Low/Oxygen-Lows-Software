-- Create profile_pictures table
create table "public"."profile_pictures" (
  "id" uuid not null default gen_random_uuid(),
  "user_id" uuid not null,
  "image_url" text not null,
  "crop_data" jsonb,
  "created_at" timestamp with time zone default now(),
  "updated_at" timestamp with time zone default now()
);

alter table "public"."profile_pictures" enable row level security;

CREATE UNIQUE INDEX profile_pictures_pkey ON public.profile_pictures USING btree (id);
CREATE UNIQUE INDEX profile_pictures_user_id_unique ON public.profile_pictures USING btree (user_id);

alter table "public"."profile_pictures" add constraint "profile_pictures_pkey" PRIMARY KEY using index "profile_pictures_pkey";

alter table "public"."profile_pictures" add constraint "profile_pictures_user_id_unique" UNIQUE using index "profile_pictures_user_id_unique";

alter table "public"."profile_pictures" add constraint "profile_pictures_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."profile_pictures" validate constraint "profile_pictures_user_id_fkey";

grant select on table "public"."profile_pictures" to "authenticated";
grant insert on table "public"."profile_pictures" to "authenticated";
grant update on table "public"."profile_pictures" to "authenticated";
grant delete on table "public"."profile_pictures" to "authenticated";

create policy "Users can manage their own profile picture"
  on "public"."profile_pictures"
  as permissive
  for all
  to authenticated
  using ((auth.uid() = user_id));
