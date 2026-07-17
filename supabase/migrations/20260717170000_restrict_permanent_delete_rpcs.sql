revoke execute on function public.request_delete_archive(uuid) from public;
revoke execute on function public.request_delete_archive(uuid) from anon;
revoke execute on function public.request_delete_archive(uuid) from authenticated;
grant execute on function public.request_delete_archive(uuid) to service_role;

revoke execute on function public.request_delete_record(uuid) from public;
revoke execute on function public.request_delete_record(uuid) from anon;
revoke execute on function public.request_delete_record(uuid) from authenticated;
grant execute on function public.request_delete_record(uuid) to service_role;

revoke execute on function public.request_delete_media(uuid) from public;
revoke execute on function public.request_delete_media(uuid) from anon;
revoke execute on function public.request_delete_media(uuid) from authenticated;
grant execute on function public.request_delete_media(uuid) to service_role;
