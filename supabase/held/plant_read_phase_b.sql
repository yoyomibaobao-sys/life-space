-- Phase B: HELD OUTSIDE supabase/migrations. This registered-only legacy RPC
-- leaks member parameters, so revoke only after the new client has shipped.
revoke execute on function public.get_plant_core_parameters(uuid)
  from public, anon, authenticated;
revoke execute on function private.get_plant_core_parameters(uuid)
  from public, anon, authenticated;
