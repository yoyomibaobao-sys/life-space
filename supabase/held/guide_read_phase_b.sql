-- Phase B: HELD OUTSIDE supabase/migrations so normal migration deployment
-- cannot apply this before the controlled-guide clients are live. Execute only
-- after separate approval, production smoke checks, and the web/app rollout.
-- Preserve only fixed metadata columns for legacy joins/search; member-only
-- fields remain available through the server-checked RPC.
revoke select on public.guide_entries from public, anon, authenticated;
grant select (id, category, name, name_en, source, section_id,
  summary, summary_en, sort_order, is_active)
  on public.guide_entries to anon, authenticated;
