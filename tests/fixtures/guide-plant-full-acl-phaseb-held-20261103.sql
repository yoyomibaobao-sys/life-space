-- HELD PHASE B / NOT INSTALLED
-- Must not execute until both website and online Android use
-- get_plus_plant_guide, and direct plant table callers have been audited.
-- QA currently grants authenticated SELECT on all three legacy full tables.
-- This ACL tightening may otherwise break existing cloud pages.
revoke select on public.plant_parameters from anon, authenticated;
revoke select on public.plant_growth_cycle from anon, authenticated;
revoke select on public.plant_care_guides from anon, authenticated;
-- Public/free plant core fields continue via get_plant_core_parameters RPC.
-- Never revoke permissions needed by unrelated staff or service roles.
