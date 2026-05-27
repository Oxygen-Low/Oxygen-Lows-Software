alter table public.user_profiles
add column if not exists email text,
add column if not exists show_email boolean not null default false;

update public.user_profiles up
set email = au.email
from auth.users au
where au.id = up.user_id
  and (up.email is distinct from au.email or up.email is null);

drop policy if exists "Users can view their own profile" on public.user_profiles;
create policy "Authenticated users can view profiles"
  on public.user_profiles
  for select
  to authenticated
  using (true);

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

  insert into public.user_profiles (user_id, username, display_name, bio, email, show_email)
  values (new.id, requested_username, requested_username, '', new.email, false);

  return new;
end;
$$;
