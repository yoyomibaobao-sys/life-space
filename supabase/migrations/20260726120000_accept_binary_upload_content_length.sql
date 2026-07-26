-- Keep reserved media uploads compatible with Supabase Storage's binary
-- upload metadata while preserving the completed-object size fallback.

create or replace function public.can_upload_reserved_media_object(
  p_object_name text,
  p_metadata jsonb
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.storage_upload_reservation_paths rp
    join public.storage_upload_reservations r on r.id = rp.reservation_id
    where rp.owner_user_id = auth.uid()
      and r.owner_user_id = auth.uid()
      and r.status = 'reserved'
      and rp.active
      and rp.object_path = p_object_name
      and coalesce(
        p_metadata->>'contentLength',
        p_metadata->>'size',
        ''
      ) ~ '^[0-9]+$'
      and coalesce(
        p_metadata->>'contentLength',
        p_metadata->>'size'
      )::bigint <= rp.reserved_bytes
  );
$$;

revoke all
on function public.can_upload_reserved_media_object(text, jsonb)
from public, anon;

grant execute
on function public.can_upload_reserved_media_object(text, jsonb)
to authenticated;
