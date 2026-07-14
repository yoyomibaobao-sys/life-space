do $$
begin
  if not exists (
    select 1
    from storage.buckets
    where id = 'media'
  ) then
    raise exception 'media bucket does not exist';
  end if;

  update storage.buckets
  set public = false
  where id = 'media';

  if exists (
    select 1
    from storage.buckets
    where id = 'media'
      and public is distinct from false
  ) then
    raise exception 'failed to make media bucket private';
  end if;
end
$$;
