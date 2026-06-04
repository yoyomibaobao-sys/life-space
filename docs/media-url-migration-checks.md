# Media URL 迁移检查 SQL

本文档用于 P0b-2 执行前检查历史图片 URL 是否能迁移到 private media bucket + signed URL 流程。

注意：

* 只运行只读统计 SQL。
* 不导出真实 URL。
* 不导出真实文件名。
* 不导出真实用户数据。
* 不查询 `storage.objects`。
* 不下载图片或文件。
* 执行 P0b-2 migration 前，必须人工确认这些统计结果。

## 一、字段存在性计数

```sql
select
  count(*) filter (
    where table_name = 'media'
      and column_name in ('url', 'thumb_url', 'storage_path', 'thumb_path')
  ) as media_expected_column_count,
  count(*) filter (
    where table_name = 'archives'
      and column_name in ('cover_image_url', 'cover_thumb_url', 'cover_image_path', 'cover_thumb_path')
  ) as archives_expected_column_count,
  count(*) filter (
    where table_name = 'records'
      and column_name in ('primary_image_url', 'primary_thumb_url', 'primary_image_path', 'primary_thumb_path')
  ) as records_expected_column_count,
  count(*) filter (
    where table_name = 'market_posts'
      and column_name in ('cover_image_url', 'cover_thumb_url', 'cover_image_path', 'cover_thumb_path')
  ) as market_posts_expected_column_count,
  count(*) filter (
    where table_name = 'market_media'
      and column_name in ('url', 'thumb_url', 'path', 'thumb_path')
  ) as market_media_expected_column_count
from information_schema.columns
where table_schema = 'public'
  and table_name in ('media', 'archives', 'records', 'market_posts', 'market_media');
```

## 二、media 表 URL 可解析率

统计 `media.url`、`media.thumb_url` 是否能解析为 Supabase media public URL，同时统计 path 字段覆盖情况。

```sql
with rows as (
  select to_jsonb(m) as row
  from public.media as m
)
select
  count(*) filter (where nullif(row->>'url', '') is not null) as media_url_total,
  count(*) filter (
    where nullif(row->>'url', '') is not null
      and row->>'url' like '%/storage/v1/object/public/media/%'
  ) as media_url_parseable,
  count(*) filter (
    where nullif(row->>'url', '') is not null
      and row->>'url' not like '%/storage/v1/object/public/media/%'
  ) as media_url_unparseable,
  count(*) filter (where nullif(row->>'thumb_url', '') is not null) as media_thumb_url_total,
  count(*) filter (
    where nullif(row->>'thumb_url', '') is not null
      and row->>'thumb_url' like '%/storage/v1/object/public/media/%'
  ) as media_thumb_url_parseable,
  count(*) filter (
    where nullif(row->>'thumb_url', '') is not null
      and row->>'thumb_url' not like '%/storage/v1/object/public/media/%'
  ) as media_thumb_url_unparseable,
  count(*) filter (where nullif(row->>'storage_path', '') is not null) as media_storage_path_present,
  count(*) filter (where nullif(row->>'thumb_path', '') is not null) as media_thumb_path_present
from rows;
```

## 三、archives 表封面 URL 可解析率

`archives` 当前代码主要使用 `cover_image_url`。如果数据库已有 `cover_thumb_url`、`cover_image_path`、`cover_thumb_path`，下面的 JSON 写法也可以统计；如果字段不存在，对应计数会是 0。

```sql
with rows as (
  select to_jsonb(a) as row
  from public.archives as a
)
select
  count(*) filter (where nullif(row->>'cover_image_url', '') is not null) as cover_image_url_total,
  count(*) filter (
    where nullif(row->>'cover_image_url', '') is not null
      and row->>'cover_image_url' like '%/storage/v1/object/public/media/%'
  ) as cover_image_url_parseable,
  count(*) filter (
    where nullif(row->>'cover_image_url', '') is not null
      and row->>'cover_image_url' not like '%/storage/v1/object/public/media/%'
  ) as cover_image_url_unparseable,
  count(*) filter (where nullif(row->>'cover_thumb_url', '') is not null) as cover_thumb_url_total,
  count(*) filter (
    where nullif(row->>'cover_thumb_url', '') is not null
      and row->>'cover_thumb_url' like '%/storage/v1/object/public/media/%'
  ) as cover_thumb_url_parseable,
  count(*) filter (
    where nullif(row->>'cover_thumb_url', '') is not null
      and row->>'cover_thumb_url' not like '%/storage/v1/object/public/media/%'
  ) as cover_thumb_url_unparseable,
  count(*) filter (where nullif(row->>'cover_image_path', '') is not null) as cover_image_path_present,
  count(*) filter (where nullif(row->>'cover_thumb_path', '') is not null) as cover_thumb_path_present
from rows;
```

## 四、records 表主图 URL 可解析率

`records.primary_image_url` 和 `records.primary_thumb_url` 是旧主图字段。若未来新增 `primary_image_path`、`primary_thumb_path`，该查询也会统计覆盖情况。

```sql
with rows as (
  select to_jsonb(r) as row
  from public.records as r
)
select
  count(*) filter (where nullif(row->>'primary_image_url', '') is not null) as primary_image_url_total,
  count(*) filter (
    where nullif(row->>'primary_image_url', '') is not null
      and row->>'primary_image_url' like '%/storage/v1/object/public/media/%'
  ) as primary_image_url_parseable,
  count(*) filter (
    where nullif(row->>'primary_image_url', '') is not null
      and row->>'primary_image_url' not like '%/storage/v1/object/public/media/%'
  ) as primary_image_url_unparseable,
  count(*) filter (where nullif(row->>'primary_thumb_url', '') is not null) as primary_thumb_url_total,
  count(*) filter (
    where nullif(row->>'primary_thumb_url', '') is not null
      and row->>'primary_thumb_url' like '%/storage/v1/object/public/media/%'
  ) as primary_thumb_url_parseable,
  count(*) filter (
    where nullif(row->>'primary_thumb_url', '') is not null
      and row->>'primary_thumb_url' not like '%/storage/v1/object/public/media/%'
  ) as primary_thumb_url_unparseable,
  count(*) filter (where nullif(row->>'primary_image_path', '') is not null) as primary_image_path_present,
  count(*) filter (where nullif(row->>'primary_thumb_path', '') is not null) as primary_thumb_path_present
from rows;
```

## 五、market_posts 表封面 URL 可解析率

集市代码已经使用 `cover_image_path`、`cover_thumb_path`。这里确认旧 URL 和新 path 的覆盖情况。

```sql
with rows as (
  select to_jsonb(mp) as row
  from public.market_posts as mp
)
select
  count(*) filter (where nullif(row->>'cover_image_url', '') is not null) as cover_image_url_total,
  count(*) filter (
    where nullif(row->>'cover_image_url', '') is not null
      and row->>'cover_image_url' like '%/storage/v1/object/public/media/%'
  ) as cover_image_url_parseable,
  count(*) filter (
    where nullif(row->>'cover_image_url', '') is not null
      and row->>'cover_image_url' not like '%/storage/v1/object/public/media/%'
  ) as cover_image_url_unparseable,
  count(*) filter (where nullif(row->>'cover_thumb_url', '') is not null) as cover_thumb_url_total,
  count(*) filter (
    where nullif(row->>'cover_thumb_url', '') is not null
      and row->>'cover_thumb_url' like '%/storage/v1/object/public/media/%'
  ) as cover_thumb_url_parseable,
  count(*) filter (
    where nullif(row->>'cover_thumb_url', '') is not null
      and row->>'cover_thumb_url' not like '%/storage/v1/object/public/media/%'
  ) as cover_thumb_url_unparseable,
  count(*) filter (where nullif(row->>'cover_image_path', '') is not null) as cover_image_path_present,
  count(*) filter (where nullif(row->>'cover_thumb_path', '') is not null) as cover_thumb_path_present
from rows;
```

## 六、market_media 表 path 覆盖情况

该查询只统计 `market_media.path`、`market_media.thumb_path` 覆盖情况，并统计旧 URL 是否可解析。

```sql
with rows as (
  select to_jsonb(mm) as row
  from public.market_media as mm
)
select
  count(*) filter (where nullif(row->>'url', '') is not null) as market_media_url_total,
  count(*) filter (
    where nullif(row->>'url', '') is not null
      and row->>'url' like '%/storage/v1/object/public/media/%'
  ) as market_media_url_parseable,
  count(*) filter (
    where nullif(row->>'url', '') is not null
      and row->>'url' not like '%/storage/v1/object/public/media/%'
  ) as market_media_url_unparseable,
  count(*) filter (where nullif(row->>'thumb_url', '') is not null) as market_media_thumb_url_total,
  count(*) filter (
    where nullif(row->>'thumb_url', '') is not null
      and row->>'thumb_url' like '%/storage/v1/object/public/media/%'
  ) as market_media_thumb_url_parseable,
  count(*) filter (
    where nullif(row->>'thumb_url', '') is not null
      and row->>'thumb_url' not like '%/storage/v1/object/public/media/%'
  ) as market_media_thumb_url_unparseable,
  count(*) filter (where nullif(row->>'path', '') is not null) as market_media_path_present,
  count(*) filter (where nullif(row->>'thumb_path', '') is not null) as market_media_thumb_path_present
from rows;
```

## 七、执行 P0b-2 前的判断标准

建议在执行 `media` private migration 前确认：

* `media.storage_path` 覆盖率足够高，尤其是私密记录图片。
* `media.thumb_path` 覆盖率足够高，尤其是列表缩略图。
* `archives.cover_image_url`、`records.primary_image_url` 中不可解析 URL 的数量可接受，或已准备回填方案。
* `market_posts.cover_image_path`、`market_posts.cover_thumb_path`、`market_media.path`、`market_media.thumb_path` 覆盖率足够高。
* 不可解析 URL 不应直接阻止 P0b-2，但会在 private 后继续依赖旧外部 URL 或出现断图，需要人工确认。
* 如果 `media.storage_path/thumb_path` 缺口较大，应先做安全回填 migration 或临时兼容策略，再执行 media private。
