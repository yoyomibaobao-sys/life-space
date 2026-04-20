-- 第一轮修复：档案/记录公开规则 + 缩略图同步
-- 适用目标：
-- 1. 档案默认公开
-- 2. 公开档案下记录默认公开，可单条私密
-- 3. 私密档案下记录全部视为私密
-- 4. 发现与公共搜索只展示：公开档案 + 公开记录
-- 5. 回填 records.primary_image_url 与 archives.cover_image_url

BEGIN;

-- 1) 补齐档案统计/封面字段
ALTER TABLE public.archives
ADD COLUMN IF NOT EXISTS cover_image_url text;

ALTER TABLE public.archives
ADD COLUMN IF NOT EXISTS record_count integer DEFAULT 0 NOT NULL;

ALTER TABLE public.archives
ADD COLUMN IF NOT EXISTS last_record_time timestamp with time zone;

-- 2) 统一默认值
ALTER TABLE public.archives
ALTER COLUMN is_public SET DEFAULT true;

ALTER TABLE public.records
ALTER COLUMN visibility SET DEFAULT 'public';

-- 3) 规范已有数据
UPDATE public.archives
SET is_public = true
WHERE is_public IS NULL;

UPDATE public.records
SET visibility = 'public'
WHERE visibility IS NULL OR visibility NOT IN ('public', 'private');

-- 私密档案下，记录不存在公开状态
UPDATE public.records r
SET visibility = 'private'
FROM public.archives a
WHERE r.archive_id = a.id
  AND a.is_public = false
  AND r.visibility <> 'private';

-- 4) 给 visibility 增加轻量约束，避免后续写入异常值
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'records_visibility_check'
      AND conrelid = 'public.records'::regclass
  ) THEN
    ALTER TABLE public.records
    ADD CONSTRAINT records_visibility_check
    CHECK (visibility IN ('public', 'private'));
  END IF;
END $$;

-- 5) 重建媒体同步函数：每次媒体变化后，更新记录首图、媒体数、档案封面
CREATE OR REPLACE FUNCTION public.sync_record_media_stats(p_record_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  first_image text;
  media_cnt int;
  target_archive_id uuid;
BEGIN
  SELECT url
  INTO first_image
  FROM public.media
  WHERE record_id = p_record_id
  ORDER BY sort_order ASC, created_at ASC
  LIMIT 1;

  SELECT count(*)
  INTO media_cnt
  FROM public.media
  WHERE record_id = p_record_id;

  UPDATE public.records
  SET
    primary_image_url = first_image,
    media_count = media_cnt
  WHERE id = p_record_id;

  SELECT archive_id
  INTO target_archive_id
  FROM public.records
  WHERE id = p_record_id
  LIMIT 1;

  IF target_archive_id IS NOT NULL THEN
    UPDATE public.archives a
    SET
      cover_image_url = (
        SELECT r.primary_image_url
        FROM public.records r
        WHERE r.archive_id = a.id
          AND r.primary_image_url IS NOT NULL
        ORDER BY r.record_time DESC, r.created_at DESC
        LIMIT 1
      ),
      record_count = (
        SELECT count(*)
        FROM public.records r
        WHERE r.archive_id = a.id
      ),
      last_record_time = (
        SELECT max(r.record_time)
        FROM public.records r
        WHERE r.archive_id = a.id
      )
    WHERE a.id = target_archive_id;
  END IF;
END;
$$;

-- 6) 重建记录插入函数：插入记录时同步档案统计
CREATE OR REPLACE FUNCTION public.handle_record_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.archives a
  SET
    record_count = (
      SELECT count(*)
      FROM public.records r
      WHERE r.archive_id = a.id
    ),
    last_record_time = (
      SELECT max(r.record_time)
      FROM public.records r
      WHERE r.archive_id = a.id
    ),
    cover_image_url = (
      SELECT r.primary_image_url
      FROM public.records r
      WHERE r.archive_id = a.id
        AND r.primary_image_url IS NOT NULL
      ORDER BY r.record_time DESC, r.created_at DESC
      LIMIT 1
    )
  WHERE a.id = NEW.archive_id;

  RETURN NEW;
END;
$$;

-- 7) 回填每条记录首图与媒体数量
WITH media_stats AS (
  SELECT
    r.id AS record_id,
    (
      SELECT m.url
      FROM public.media m
      WHERE m.record_id = r.id
      ORDER BY m.sort_order ASC, m.created_at ASC
      LIMIT 1
    ) AS first_url,
    (
      SELECT count(*)
      FROM public.media m
      WHERE m.record_id = r.id
    ) AS media_count
  FROM public.records r
)
UPDATE public.records r
SET
  primary_image_url = media_stats.first_url,
  media_count = media_stats.media_count
FROM media_stats
WHERE r.id = media_stats.record_id;

-- 8) 回填档案封面与统计
WITH archive_stats AS (
  SELECT
    a.id AS archive_id,
    (
      SELECT r.primary_image_url
      FROM public.records r
      WHERE r.archive_id = a.id
        AND r.primary_image_url IS NOT NULL
      ORDER BY r.record_time DESC, r.created_at DESC
      LIMIT 1
    ) AS cover_url,
    (
      SELECT count(*)
      FROM public.records r
      WHERE r.archive_id = a.id
    ) AS record_count,
    (
      SELECT max(r.record_time)
      FROM public.records r
      WHERE r.archive_id = a.id
    ) AS last_record_time
  FROM public.archives a
)
UPDATE public.archives a
SET
  cover_image_url = archive_stats.cover_url,
  record_count = archive_stats.record_count,
  last_record_time = archive_stats.last_record_time
FROM archive_stats
WHERE a.id = archive_stats.archive_id;

-- 9) 发现流视图：只展示公开档案 + 公开记录
CREATE OR REPLACE VIEW public.discovery_feed_view AS
SELECT
  r.id AS record_id,
  r.archive_id,
  r.user_id,
  r.note,
  r.record_time,
  r.status_tag,
  r.primary_image_url,
  r.comment_count,
  r.media_count,
  a.title AS archive_title,
  a.category AS archive_category,
  a.species_id,
  a.species_name_snapshot,
  p.username,
  p.avatar_url
FROM public.records r
JOIN public.archives a ON a.id = r.archive_id
LEFT JOIN public.profiles p ON p.id = r.user_id
WHERE r.visibility = 'public'
  AND a.is_public = true
ORDER BY r.record_time DESC;

-- 10) 旧发现视图也补上公开过滤，避免后续误用泄露私密内容
CREATE OR REPLACE VIEW public.discovery_view AS
SELECT
  id,
  archive_id,
  note,
  record_time,
  user_id,
  archive_title,
  username,
  image_url,
  rn_archive,
  rn_user
FROM (
  SELECT
    r.id,
    r.archive_id,
    r.note,
    r.record_time,
    r.user_id,
    a.title AS archive_title,
    p.username,
    r.primary_image_url AS image_url,
    row_number() OVER (PARTITION BY r.archive_id ORDER BY r.record_time DESC) AS rn_archive,
    row_number() OVER (PARTITION BY r.user_id ORDER BY r.record_time DESC) AS rn_user
  FROM public.records r
  JOIN public.archives a ON r.archive_id = a.id
  LEFT JOIN public.profiles p ON r.user_id = p.id
  WHERE r.visibility = 'public'
    AND a.is_public = true
) t
WHERE rn_archive = 1
  AND rn_user <= 4;

COMMIT;
