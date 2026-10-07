alter table public.archives
  add column local_transfer_token uuid null;

create unique index archives_user_local_transfer_token_unique
  on public.archives (user_id, local_transfer_token)
  where local_transfer_token is not null;
