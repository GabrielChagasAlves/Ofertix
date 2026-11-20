alter table public.marketplace_oauth_states
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

create index if not exists marketplace_oauth_states_user_id_idx
  on public.marketplace_oauth_states(user_id);

-- No pending OAuth states existed when this migration was applied.
alter table public.marketplace_oauth_states
  alter column user_id set not null;
