-- Allow new market media rows to persist private Storage paths without URLs.

ALTER TABLE public.market_media
  ALTER COLUMN url DROP NOT NULL;

ALTER TABLE public.market_media
  ADD CONSTRAINT market_media_path_or_url_required
  CHECK (
    NULLIF(btrim(path), '') IS NOT NULL
    OR NULLIF(btrim(url), '') IS NOT NULL
  );
