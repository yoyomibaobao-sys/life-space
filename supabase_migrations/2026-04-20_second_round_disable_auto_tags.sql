-- Second round DB patch: disable automatic behavior tag parsing from record text.
-- This keeps status_tag = 'help' synchronized to record_tags, but stops parsing note
-- into behavior tags such as 播种、发芽、施肥、修剪 etc.

BEGIN;

-- 1) Remove any residual system-generated behavior tags.
-- User-created behavior tags are kept.
DELETE FROM public.record_tags
WHERE tag_type = 'behavior'
  AND source = 'system';

-- 2) Clear parsed action cache, because behavior tags are no longer generated from note text.
UPDATE public.records
SET parsed_actions = ARRAY[]::text[]
WHERE parsed_actions IS DISTINCT FROM ARRAY[]::text[];

-- 3) Replace the old BEFORE trigger that parsed note text.
DROP TRIGGER IF EXISTS trg_sync_record_tags_from_record ON public.records;

CREATE OR REPLACE FUNCTION public.sync_record_tags_from_record()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Do not parse NEW.note anymore.
  -- Behavior tags are now user-controlled only.
  NEW.parsed_actions := ARRAY[]::text[];
  RETURN NEW;
END;
$$;

-- This trigger only keeps parsed_actions empty on insert or note edit.
CREATE TRIGGER trg_sync_record_tags_from_record
BEFORE INSERT OR UPDATE OF note ON public.records
FOR EACH ROW
EXECUTE FUNCTION public.sync_record_tags_from_record();

-- 4) Use a separate AFTER trigger to sync help status safely.
-- This avoids inserting into record_tags before the record row exists.
DROP TRIGGER IF EXISTS trg_sync_record_status_tag_to_record_tags ON public.records;

CREATE OR REPLACE FUNCTION public.sync_record_status_tag_to_record_tags()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM public.record_tags
  WHERE record_id = NEW.id
    AND tag_type = 'status'
    AND source = 'user';

  IF NEW.status_tag = 'help' THEN
    INSERT INTO public.record_tags (
      record_id,
      tag,
      tag_type,
      source,
      is_active
    )
    VALUES (
      NEW.id,
      '求助',
      'status',
      'user',
      true
    )
    ON CONFLICT (record_id, tag, tag_type)
    DO UPDATE SET
      source = EXCLUDED.source,
      is_active = true;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sync_record_status_tag_to_record_tags
AFTER INSERT OR UPDATE OF status_tag ON public.records
FOR EACH ROW
EXECUTE FUNCTION public.sync_record_status_tag_to_record_tags();

-- 5) Backfill current help status records into record_tags.
DELETE FROM public.record_tags
WHERE tag_type = 'status'
  AND source = 'user';

INSERT INTO public.record_tags (
  record_id,
  tag,
  tag_type,
  source,
  is_active
)
SELECT
  id,
  '求助',
  'status',
  'user',
  true
FROM public.records
WHERE status_tag = 'help'
ON CONFLICT (record_id, tag, tag_type)
DO UPDATE SET
  source = EXCLUDED.source,
  is_active = true;

GRANT ALL ON FUNCTION public.sync_record_tags_from_record() TO anon;
GRANT ALL ON FUNCTION public.sync_record_tags_from_record() TO authenticated;
GRANT ALL ON FUNCTION public.sync_record_tags_from_record() TO service_role;

GRANT ALL ON FUNCTION public.sync_record_status_tag_to_record_tags() TO anon;
GRANT ALL ON FUNCTION public.sync_record_status_tag_to_record_tags() TO authenticated;
GRANT ALL ON FUNCTION public.sync_record_status_tag_to_record_tags() TO service_role;

COMMIT;
