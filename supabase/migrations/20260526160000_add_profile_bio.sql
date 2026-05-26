alter table public.user_profiles
add column if not exists bio text not null default '';

alter table public.user_profiles
add constraint user_profiles_bio_length check (char_length(bio) <= 1500);

create or replace function public.update_user_profile_names(
  p_username text default null,
  p_display_name text default null,
  p_bio text default null
)
returns public.user_profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_profile public.user_profiles;
  next_username text;
  next_display_name text;
  next_bio text;
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
  next_bio := coalesce(p_bio, current_profile.bio);

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

  if char_length(next_bio) > 1500 then
    raise exception 'Bio cannot exceed 1500 characters';
  end if;

  update public.user_profiles
  set
    username = next_username,
    display_name = next_display_name,
    bio = next_bio,
    username_updated_at = case when next_username <> current_profile.username then now() else username_updated_at end,
    display_name_updated_at = case when next_display_name <> current_profile.display_name then now() else display_name_updated_at end
  where user_id = auth.uid()
  returning * into current_profile;

  return current_profile;
end;
$$;

grant execute on function public.update_user_profile_names(text, text, text) to authenticated;
