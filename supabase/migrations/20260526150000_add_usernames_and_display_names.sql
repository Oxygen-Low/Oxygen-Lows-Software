set check_function_bodies = off;

create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  display_name text not null,
  username_updated_at timestamptz not null default now(),
  display_name_updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_profiles_username_format check (username ~ '^[a-z0-9_-]+$')
);

alter table public.user_profiles enable row level security;

grant select, update on public.user_profiles to authenticated;

create policy "Users can view their own profile"
  on public.user_profiles
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can update their own profile"
  on public.user_profiles
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create or replace function public.set_user_profiles_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_user_profiles_updated_at_trigger
before update on public.user_profiles
for each row execute function public.set_user_profiles_updated_at();

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_username text;
begin
  requested_username := lower(coalesce(new.raw_user_meta_data->>'username', ''));

  if requested_username = '' then
    raise exception 'Username is required';
  end if;

  if requested_username !~ '^[a-z0-9_-]+$' then
    raise exception 'Username must be lowercase and use only letters, numbers, hyphens, or underscores';
  end if;

  insert into public.user_profiles (user_id, username, display_name)
  values (new.id, requested_username, requested_username);

  return new;
end;
$$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'on_auth_user_created_profile') THEN
        create trigger on_auth_user_created_profile
        after insert on auth.users
        for each row execute function public.handle_new_user_profile();
    END IF;
END
$$;

create or replace function public.update_user_profile_names(p_username text default null, p_display_name text default null)
returns public.user_profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_profile public.user_profiles;
  next_username text;
  next_display_name text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into current_profile
  from public.user_profiles
  where user_id = auth.uid();

  if current_profile.user_id is null then
    raise exception 'Profile not found';
  end if;

  next_username := coalesce(p_username, current_profile.username);
  next_display_name := coalesce(p_display_name, current_profile.display_name);

  if next_username <> current_profile.username then
    if now() - current_profile.username_updated_at < interval '15 minutes' then
      raise exception 'Username can only be changed once every 15 minutes';
    end if;

    if next_username !~ '^[a-z0-9_-]+$' then
      raise exception 'Username must be lowercase and use only letters, numbers, hyphens, or underscores';
    end if;
  end if;

  if next_display_name <> current_profile.display_name then
    if now() - current_profile.display_name_updated_at < interval '15 minutes' then
      raise exception 'Display name can only be changed once every 15 minutes';
    end if;
  end if;

  update public.user_profiles
  set
    username = next_username,
    display_name = next_display_name,
    username_updated_at = case when next_username <> current_profile.username then now() else username_updated_at end,
    display_name_updated_at = case when next_display_name <> current_profile.display_name then now() else display_name_updated_at end
  where user_id = auth.uid()
  returning * into current_profile;

  return current_profile;
end;
$$;

revoke execute on function public.set_user_profiles_updated_at() from public, anon, authenticated;
revoke execute on function public.handle_new_user_profile() from public, anon, authenticated;
grant execute on function public.update_user_profile_names(text, text) to authenticated;
