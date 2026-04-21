--
-- PostgreSQL database dump
--

\restrict 8y04fgTiBxEqZdtsG6ElnDCxpZHBDaKhzW6uj9KXdcc9ltKYcBsKjNbuRIlaO5z

-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.3

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: pg_database_owner
--

CREATE SCHEMA public;


ALTER SCHEMA public OWNER TO pg_database_owner;

--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: pg_database_owner
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: handle_comment_change(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.handle_comment_change() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
declare
  target_record_id uuid;
begin
  target_record_id := coalesce(new.record_id, old.record_id);

  if target_record_id is not null then
    perform public.sync_record_comment_count(target_record_id);
  end if;

  return coalesce(new, old);
end;
$$;


ALTER FUNCTION public.handle_comment_change() OWNER TO postgres;

--
-- Name: handle_media_change(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.handle_media_change() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_record_id uuid;
BEGIN
  v_record_id := coalesce(NEW.record_id, OLD.record_id);

  IF v_record_id IS NOT NULL THEN
    PERFORM public.sync_record_media_stats(v_record_id);
  END IF;

  RETURN coalesce(NEW, OLD);
END;
$$;


ALTER FUNCTION public.handle_media_change() OWNER TO postgres;

--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
begin
  insert into public.profiles (id, email, username)
  values (
    new.id,
    new.email,
    split_part(new.email, '@', 1) -- 默认用户名
  );
  return new;
end;
$$;


ALTER FUNCTION public.handle_new_user() OWNER TO postgres;

--
-- Name: handle_record_insert(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.handle_record_insert() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  UPDATE public.archives AS a
  SET
    record_count = (
      SELECT count(*)::integer
      FROM public.records AS r
      WHERE r.archive_id = a.id
    ),
    last_record_time = (
      SELECT max(r.record_time)
      FROM public.records AS r
      WHERE r.archive_id = a.id
    ),
    cover_image_url = (
      SELECT r.primary_image_url
      FROM public.records AS r
      WHERE r.archive_id = a.id
        AND r.primary_image_url IS NOT NULL
      ORDER BY r.record_time DESC, r.created_at DESC
      LIMIT 1
    )
  WHERE a.id = NEW.archive_id;

  RETURN NEW;
END;
$$;


ALTER FUNCTION public.handle_record_insert() OWNER TO postgres;

--
-- Name: sync_record_comment_count(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.sync_record_comment_count(p_record_id uuid) RETURNS void
    LANGUAGE plpgsql
    AS $$
declare
  comment_cnt int;
begin
  select count(*)
  into comment_cnt
  from public.comments
  where record_id = p_record_id;

  update public.records
  set comment_count = comment_cnt
  where id = p_record_id;
end;
$$;


ALTER FUNCTION public.sync_record_comment_count(p_record_id uuid) OWNER TO postgres;

--
-- Name: sync_record_media_stats(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.sync_record_media_stats(p_record_id uuid) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_primary_image_url text;
  v_media_count integer;
  v_archive_id uuid;
BEGIN
  SELECT m.url
  INTO v_primary_image_url
  FROM public.media AS m
  WHERE m.record_id = p_record_id
  ORDER BY m.sort_order ASC, m.created_at ASC
  LIMIT 1;

  SELECT count(*)::integer
  INTO v_media_count
  FROM public.media AS m
  WHERE m.record_id = p_record_id;

  UPDATE public.records AS r
  SET
    primary_image_url = v_primary_image_url,
    media_count = v_media_count
  WHERE r.id = p_record_id;

  SELECT r.archive_id
  INTO v_archive_id
  FROM public.records AS r
  WHERE r.id = p_record_id
  LIMIT 1;

  IF v_archive_id IS NOT NULL THEN
    UPDATE public.archives AS a
    SET
      cover_image_url = (
        SELECT r2.primary_image_url
        FROM public.records AS r2
        WHERE r2.archive_id = a.id
          AND r2.primary_image_url IS NOT NULL
        ORDER BY r2.record_time DESC, r2.created_at DESC
        LIMIT 1
      ),
      record_count = (
        SELECT count(*)::integer
        FROM public.records AS r3
        WHERE r3.archive_id = a.id
      ),
      last_record_time = (
        SELECT max(r4.record_time)
        FROM public.records AS r4
        WHERE r4.archive_id = a.id
      )
    WHERE a.id = v_archive_id;
  END IF;
END;
$$;


ALTER FUNCTION public.sync_record_media_stats(p_record_id uuid) OWNER TO postgres;

--
-- Name: sync_record_status_tag_to_record_tags(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.sync_record_status_tag_to_record_tags() RETURNS trigger
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


ALTER FUNCTION public.sync_record_status_tag_to_record_tags() OWNER TO postgres;

--
-- Name: sync_record_tags_from_record(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.sync_record_tags_from_record() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- Do not parse NEW.note anymore.
  -- Behavior tags are now user-controlled only.
  NEW.parsed_actions := ARRAY[]::text[];
  RETURN NEW;
END;
$$;


ALTER FUNCTION public.sync_record_tags_from_record() OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: archives; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.archives (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    title text NOT NULL,
    category text,
    species_id uuid,
    location_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    status text DEFAULT 'active'::text,
    slug text,
    group_tag_id uuid,
    is_public boolean DEFAULT true,
    sub_tag_id uuid,
    note text,
    system_name text,
    source text,
    species_name_snapshot text,
    cover_image_url text,
    record_count integer DEFAULT 0 NOT NULL,
    last_record_time timestamp with time zone,
    CONSTRAINT archives_category_check CHECK ((category = ANY (ARRAY['plant'::text, 'system'::text])))
);


ALTER TABLE public.archives OWNER TO postgres;

--
-- Name: comments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.comments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    record_id uuid,
    user_id uuid,
    content text,
    accepted boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.comments OWNER TO postgres;

--
-- Name: profiles; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    email text,
    username text,
    updated_at timestamp without time zone DEFAULT now(),
    location text,
    level integer DEFAULT 1,
    flower_count integer DEFAULT 0,
    view_count integer DEFAULT 0,
    created_at timestamp without time zone DEFAULT now(),
    avatar_url text,
    storage_used bigint DEFAULT 0,
    storage_limit bigint DEFAULT 500000000
);


ALTER TABLE public.profiles OWNER TO postgres;

--
-- Name: records; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.records (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    archive_id uuid,
    user_id uuid,
    note text,
    photo_time timestamp with time zone,
    upload_time timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now(),
    visibility text DEFAULT 'public'::text,
    record_time timestamp with time zone DEFAULT now(),
    status text DEFAULT 'ok'::text,
    status_tag text,
    parsed_actions text[] DEFAULT '{}'::text[] NOT NULL,
    primary_image_url text,
    comment_count integer DEFAULT 0 NOT NULL,
    media_count integer DEFAULT 0 NOT NULL,
    CONSTRAINT records_status_tag_check CHECK (((status_tag IS NULL) OR (status_tag = 'help'::text))),
    CONSTRAINT records_visibility_check CHECK ((visibility = ANY (ARRAY['public'::text, 'private'::text])))
);


ALTER TABLE public.records OWNER TO postgres;

--
-- Name: discovery_feed_view; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.discovery_feed_view AS
 SELECT r.id AS record_id,
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
   FROM ((public.records r
     JOIN public.archives a ON ((a.id = r.archive_id)))
     LEFT JOIN public.profiles p ON ((p.id = r.user_id)))
  WHERE ((r.visibility = 'public'::text) AND (a.is_public = true))
  ORDER BY r.record_time DESC;


ALTER VIEW public.discovery_feed_view OWNER TO postgres;

--
-- Name: discovery_view; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.discovery_view AS
 SELECT id,
    archive_id,
    note,
    record_time,
    user_id,
    archive_title,
    username,
    image_url,
    rn_archive,
    rn_user
   FROM ( SELECT r.id,
            r.archive_id,
            r.note,
            r.record_time,
            r.user_id,
            a.title AS archive_title,
            p.username,
            r.primary_image_url AS image_url,
            row_number() OVER (PARTITION BY r.archive_id ORDER BY r.record_time DESC) AS rn_archive,
            row_number() OVER (PARTITION BY r.user_id ORDER BY r.record_time DESC) AS rn_user
           FROM ((public.records r
             JOIN public.archives a ON ((r.archive_id = a.id)))
             LEFT JOIN public.profiles p ON ((r.user_id = p.id)))
          WHERE ((r.visibility = 'public'::text) AND (a.is_public = true))) t
  WHERE ((rn_archive = 1) AND (rn_user <= 4));


ALTER VIEW public.discovery_view OWNER TO postgres;

--
-- Name: follows; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.follows (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    follower_id uuid,
    following_id uuid,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.follows OWNER TO postgres;

--
-- Name: group_tags; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.group_tags (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    name text,
    created_at timestamp without time zone DEFAULT now(),
    sub_tag_id uuid
);


ALTER TABLE public.group_tags OWNER TO postgres;

--
-- Name: locations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.locations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    latitude numeric,
    longitude numeric,
    place_name text,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.locations OWNER TO postgres;

--
-- Name: media; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.media (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    record_id uuid,
    user_id uuid,
    type text,
    url text,
    size_mb numeric,
    duration_sec numeric,
    storage_class text DEFAULT 'hot'::text,
    created_at timestamp with time zone DEFAULT now(),
    sort_order integer DEFAULT 0
);


ALTER TABLE public.media OWNER TO postgres;

--
-- Name: plant_care_guides; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.plant_care_guides (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    plant_id uuid NOT NULL,
    language_code text DEFAULT 'zh'::text NOT NULL,
    summary text,
    climate_timing_note text,
    planting_guide text,
    care_guide text,
    harvest_guide text,
    common_problem_guide text,
    rotation_intercrop_guide text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.plant_care_guides OWNER TO postgres;

--
-- Name: plant_growth_cycle; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.plant_growth_cycle (
    species_id uuid NOT NULL,
    germination_days integer,
    seedling_days integer,
    vegetative_days integer,
    flowering_days integer,
    harvest_days integer
);


ALTER TABLE public.plant_growth_cycle OWNER TO postgres;

--
-- Name: plant_light_cycle; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.plant_light_cycle (
    species_id uuid NOT NULL,
    min_daylight_hours numeric,
    optimal_daylight_hours numeric,
    photoperiod_type text
);


ALTER TABLE public.plant_light_cycle OWNER TO postgres;

--
-- Name: plant_parameter_score_guides; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.plant_parameter_score_guides (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    parameter_key text NOT NULL,
    score_min smallint NOT NULL,
    score_max smallint NOT NULL,
    label text NOT NULL,
    description text,
    sort_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.plant_parameter_score_guides OWNER TO postgres;

--
-- Name: plant_parameters; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.plant_parameters (
    species_id uuid NOT NULL,
    sun_score smallint,
    air_humidity_score smallint,
    air_flow_score smallint,
    soil_moisture_score smallint,
    soil_aeration_score smallint,
    soil_fertility_score smallint,
    ph_sensitivity_score smallint,
    drought_score smallint,
    growth_speed_score smallint,
    disease_risk_score smallint,
    management_difficulty_score smallint,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    edible_part text[],
    lifecycle text,
    growth_form text,
    season_type text[],
    nitrogen_fixing boolean,
    need_trellis boolean,
    ph_min numeric,
    ph_max numeric,
    best_germ_temp_min numeric,
    best_germ_temp_max numeric,
    optimal_growth_temp_min numeric,
    optimal_growth_temp_max numeric,
    vigorous_growth_temp numeric,
    growth_slow_temp numeric,
    frost_damage_temp numeric,
    lethal_low_temp numeric,
    stop_low_temp numeric,
    stop_high_temp numeric,
    heat_scorch_temp numeric,
    lethal_high_temp numeric,
    special_temperature_points jsonb DEFAULT '[]'::jsonb,
    temperature_note text,
    photoperiod_type text,
    photoperiod_trigger_stage text[],
    critical_day_length_hours numeric,
    photoperiod_sensitivity_score smallint,
    photoperiod_note text,
    shade_tolerance text,
    drought_tolerance text,
    container_friendly_score smallint,
    indoor_friendly_score smallint,
    balcony_friendly_score smallint,
    record_focus text[],
    good_companions text[],
    avoid_rotation_with text[],
    care_note text
);


ALTER TABLE public.plant_parameters OWNER TO postgres;

--
-- Name: plant_species; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.plant_species (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    scientific_name text,
    common_name text,
    family text,
    description text,
    created_at timestamp with time zone DEFAULT now(),
    slug text,
    category text,
    sub_category text,
    growth_type text,
    entry_type text DEFAULT 'species'::text,
    is_active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL
);


ALTER TABLE public.plant_species OWNER TO postgres;

--
-- Name: plant_species_aliases; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.plant_species_aliases (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    species_id uuid NOT NULL,
    language_code text DEFAULT 'zh'::text NOT NULL,
    alias_name text NOT NULL,
    normalized_name text NOT NULL,
    alias_type text DEFAULT 'alias'::text,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.plant_species_aliases OWNER TO postgres;

--
-- Name: plant_species_i18n; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.plant_species_i18n (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    plant_id uuid NOT NULL,
    language_code text NOT NULL,
    common_name text,
    family text,
    description text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT plant_species_i18n_language_code_check CHECK ((language_code = ANY (ARRAY['zh'::text, 'en'::text, 'ja'::text])))
);


ALTER TABLE public.plant_species_i18n OWNER TO postgres;

--
-- Name: plant_species_pending; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.plant_species_pending (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    submitted_name text NOT NULL,
    language_code text DEFAULT 'zh'::text,
    status text DEFAULT 'pending'::text,
    created_at timestamp with time zone DEFAULT now(),
    note text
);


ALTER TABLE public.plant_species_pending OWNER TO postgres;

--
-- Name: plant_temperature_ranges; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.plant_temperature_ranges (
    species_id uuid NOT NULL,
    best_germ_temp numeric,
    optimal_growth_temp numeric,
    lethal_low_temp numeric,
    stop_low_temp numeric,
    stop_high_temp numeric,
    lethal_high_temp numeric
);


ALTER TABLE public.plant_temperature_ranges OWNER TO postgres;

--
-- Name: record_tags; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.record_tags (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    record_id uuid,
    tag text,
    created_at timestamp with time zone DEFAULT now(),
    tag_type text NOT NULL,
    source text DEFAULT 'system'::text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    CONSTRAINT record_tags_source_check CHECK ((source = ANY (ARRAY['system'::text, 'user'::text]))),
    CONSTRAINT record_tags_tag_type_check CHECK ((tag_type = ANY (ARRAY['behavior'::text, 'status'::text])))
);


ALTER TABLE public.record_tags OWNER TO postgres;

--
-- Name: sub_tags; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.sub_tags (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    name text,
    category text,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.sub_tags OWNER TO postgres;

--
-- Name: timeline_view; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.timeline_view AS
 SELECT records.id AS record_id,
    archives.title,
    records.note,
    records.photo_time,
    media.url
   FROM ((public.records
     LEFT JOIN public.archives ON ((records.archive_id = archives.id)))
     LEFT JOIN public.media ON ((media.record_id = records.id)))
  ORDER BY records.photo_time DESC;


ALTER VIEW public.timeline_view OWNER TO postgres;

--
-- Name: users; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.users (
    id uuid NOT NULL,
    username text,
    created_at timestamp with time zone DEFAULT now(),
    last_login_at timestamp with time zone,
    cloud_enabled boolean DEFAULT false,
    role text DEFAULT 'user'::text,
    status text DEFAULT 'active'::text
);


ALTER TABLE public.users OWNER TO postgres;

--
-- Name: archives archives_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.archives
    ADD CONSTRAINT archives_pkey PRIMARY KEY (id);


--
-- Name: comments comments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT comments_pkey PRIMARY KEY (id);


--
-- Name: follows follows_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.follows
    ADD CONSTRAINT follows_pkey PRIMARY KEY (id);


--
-- Name: group_tags group_tags_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.group_tags
    ADD CONSTRAINT group_tags_pkey PRIMARY KEY (id);


--
-- Name: locations locations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.locations
    ADD CONSTRAINT locations_pkey PRIMARY KEY (id);


--
-- Name: media media_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.media
    ADD CONSTRAINT media_pkey PRIMARY KEY (id);


--
-- Name: plant_care_guides plant_care_guides_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.plant_care_guides
    ADD CONSTRAINT plant_care_guides_pkey PRIMARY KEY (id);


--
-- Name: plant_care_guides plant_care_guides_plant_id_language_code_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.plant_care_guides
    ADD CONSTRAINT plant_care_guides_plant_id_language_code_key UNIQUE (plant_id, language_code);


--
-- Name: plant_growth_cycle plant_growth_cycle_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.plant_growth_cycle
    ADD CONSTRAINT plant_growth_cycle_pkey PRIMARY KEY (species_id);


--
-- Name: plant_light_cycle plant_light_cycle_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.plant_light_cycle
    ADD CONSTRAINT plant_light_cycle_pkey PRIMARY KEY (species_id);


--
-- Name: plant_parameter_score_guides plant_parameter_score_guides_parameter_key_score_min_score__key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.plant_parameter_score_guides
    ADD CONSTRAINT plant_parameter_score_guides_parameter_key_score_min_score__key UNIQUE (parameter_key, score_min, score_max);


--
-- Name: plant_parameter_score_guides plant_parameter_score_guides_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.plant_parameter_score_guides
    ADD CONSTRAINT plant_parameter_score_guides_pkey PRIMARY KEY (id);


--
-- Name: plant_parameters plant_parameters_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.plant_parameters
    ADD CONSTRAINT plant_parameters_pkey PRIMARY KEY (species_id);


--
-- Name: plant_species_aliases plant_species_aliases_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.plant_species_aliases
    ADD CONSTRAINT plant_species_aliases_pkey PRIMARY KEY (id);


--
-- Name: plant_species_i18n plant_species_i18n_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.plant_species_i18n
    ADD CONSTRAINT plant_species_i18n_pkey PRIMARY KEY (id);


--
-- Name: plant_species_i18n plant_species_i18n_plant_id_language_code_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.plant_species_i18n
    ADD CONSTRAINT plant_species_i18n_plant_id_language_code_key UNIQUE (plant_id, language_code);


--
-- Name: plant_species_pending plant_species_pending_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.plant_species_pending
    ADD CONSTRAINT plant_species_pending_pkey PRIMARY KEY (id);


--
-- Name: plant_species plant_species_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.plant_species
    ADD CONSTRAINT plant_species_pkey PRIMARY KEY (id);


--
-- Name: plant_temperature_ranges plant_temperature_ranges_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.plant_temperature_ranges
    ADD CONSTRAINT plant_temperature_ranges_pkey PRIMARY KEY (species_id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: record_tags record_tags_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.record_tags
    ADD CONSTRAINT record_tags_pkey PRIMARY KEY (id);


--
-- Name: records records_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.records
    ADD CONSTRAINT records_pkey PRIMARY KEY (id);


--
-- Name: sub_tags sub_tags_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sub_tags
    ADD CONSTRAINT sub_tags_pkey PRIMARY KEY (id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: idx_archives_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_archives_id ON public.archives USING btree (id);


--
-- Name: idx_profiles_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_profiles_id ON public.profiles USING btree (id);


--
-- Name: idx_records_feed_time; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_records_feed_time ON public.records USING btree (record_time DESC);


--
-- Name: idx_records_visibility; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_records_visibility ON public.records USING btree (visibility);


--
-- Name: plant_species_active_sort_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX plant_species_active_sort_idx ON public.plant_species USING btree (is_active, sort_order);


--
-- Name: plant_species_aliases_language_normalized_uidx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX plant_species_aliases_language_normalized_uidx ON public.plant_species_aliases USING btree (language_code, normalized_name);


--
-- Name: plant_species_aliases_species_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX plant_species_aliases_species_id_idx ON public.plant_species_aliases USING btree (species_id);


--
-- Name: plant_species_category_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX plant_species_category_idx ON public.plant_species USING btree (category, sub_category);


--
-- Name: plant_species_slug_uidx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX plant_species_slug_uidx ON public.plant_species USING btree (slug);


--
-- Name: record_tags_one_status_per_record; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX record_tags_one_status_per_record ON public.record_tags USING btree (record_id, tag_type) WHERE ((tag_type = 'status'::text) AND (is_active = true));


--
-- Name: record_tags_unique_v2; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX record_tags_unique_v2 ON public.record_tags USING btree (record_id, tag, tag_type);


--
-- Name: comments trg_comment_delete; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_comment_delete AFTER DELETE ON public.comments FOR EACH ROW EXECUTE FUNCTION public.handle_comment_change();


--
-- Name: comments trg_comment_insert; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_comment_insert AFTER INSERT ON public.comments FOR EACH ROW EXECUTE FUNCTION public.handle_comment_change();


--
-- Name: comments trg_comment_update; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_comment_update AFTER UPDATE ON public.comments FOR EACH ROW EXECUTE FUNCTION public.handle_comment_change();


--
-- Name: media trg_media_delete; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_media_delete AFTER DELETE ON public.media FOR EACH ROW EXECUTE FUNCTION public.handle_media_change();


--
-- Name: media trg_media_insert; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_media_insert AFTER INSERT ON public.media FOR EACH ROW EXECUTE FUNCTION public.handle_media_change();


--
-- Name: media trg_media_update; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_media_update AFTER UPDATE ON public.media FOR EACH ROW EXECUTE FUNCTION public.handle_media_change();


--
-- Name: records trg_record_insert; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_record_insert AFTER INSERT ON public.records FOR EACH ROW EXECUTE FUNCTION public.handle_record_insert();


--
-- Name: records trg_sync_record_status_tag_to_record_tags; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_sync_record_status_tag_to_record_tags AFTER INSERT OR UPDATE OF status_tag ON public.records FOR EACH ROW EXECUTE FUNCTION public.sync_record_status_tag_to_record_tags();


--
-- Name: records trg_sync_record_tags_from_record; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_sync_record_tags_from_record BEFORE INSERT OR UPDATE OF note ON public.records FOR EACH ROW EXECUTE FUNCTION public.sync_record_tags_from_record();


--
-- Name: comments comments_record_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT comments_record_id_fkey FOREIGN KEY (record_id) REFERENCES public.records(id);


--
-- Name: comments comments_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT comments_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: locations locations_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.locations
    ADD CONSTRAINT locations_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: media media_record_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.media
    ADD CONSTRAINT media_record_id_fkey FOREIGN KEY (record_id) REFERENCES public.records(id);


--
-- Name: plant_care_guides plant_care_guides_plant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.plant_care_guides
    ADD CONSTRAINT plant_care_guides_plant_id_fkey FOREIGN KEY (plant_id) REFERENCES public.plant_species(id) ON DELETE CASCADE;


--
-- Name: plant_growth_cycle plant_growth_cycle_species_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.plant_growth_cycle
    ADD CONSTRAINT plant_growth_cycle_species_id_fkey FOREIGN KEY (species_id) REFERENCES public.plant_species(id);


--
-- Name: plant_light_cycle plant_light_cycle_species_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.plant_light_cycle
    ADD CONSTRAINT plant_light_cycle_species_id_fkey FOREIGN KEY (species_id) REFERENCES public.plant_species(id);


--
-- Name: plant_parameters plant_parameters_species_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.plant_parameters
    ADD CONSTRAINT plant_parameters_species_id_fkey FOREIGN KEY (species_id) REFERENCES public.plant_species(id);


--
-- Name: plant_species_aliases plant_species_aliases_species_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.plant_species_aliases
    ADD CONSTRAINT plant_species_aliases_species_id_fkey FOREIGN KEY (species_id) REFERENCES public.plant_species(id) ON DELETE CASCADE;


--
-- Name: plant_species_i18n plant_species_i18n_plant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.plant_species_i18n
    ADD CONSTRAINT plant_species_i18n_plant_id_fkey FOREIGN KEY (plant_id) REFERENCES public.plant_species(id) ON DELETE CASCADE;


--
-- Name: plant_species_pending plant_species_pending_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.plant_species_pending
    ADD CONSTRAINT plant_species_pending_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: plant_temperature_ranges plant_temperature_ranges_species_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.plant_temperature_ranges
    ADD CONSTRAINT plant_temperature_ranges_species_id_fkey FOREIGN KEY (species_id) REFERENCES public.plant_species(id);


--
-- Name: record_tags record_tags_record_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.record_tags
    ADD CONSTRAINT record_tags_record_id_fkey FOREIGN KEY (record_id) REFERENCES public.records(id) ON DELETE CASCADE;


--
-- Name: records records_archive_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.records
    ADD CONSTRAINT records_archive_id_fkey FOREIGN KEY (archive_id) REFERENCES public.archives(id);


--
-- Name: follows allow delete own follow; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "allow delete own follow" ON public.follows FOR DELETE USING ((auth.uid() = follower_id));


--
-- Name: follows allow insert own follow; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "allow insert own follow" ON public.follows FOR INSERT WITH CHECK ((auth.uid() = follower_id));


--
-- Name: follows allow read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "allow read" ON public.follows FOR SELECT USING (true);


--
-- Name: records allow_delete_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY allow_delete_own ON public.records FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: records allow_insert_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY allow_insert_own ON public.records FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: records allow_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY allow_read ON public.records FOR SELECT USING (true);


--
-- Name: records allow_update_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY allow_update_own ON public.records FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: archives; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.archives ENABLE ROW LEVEL SECURITY;

--
-- Name: archives archives allow_insert_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "archives allow_insert_own" ON public.archives FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: archives archives allow_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "archives allow_read" ON public.archives FOR SELECT USING (true);


--
-- Name: follows; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles insert own profile; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "insert own profile" ON public.profiles FOR INSERT WITH CHECK ((auth.uid() = id));


--
-- Name: media; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.media ENABLE ROW LEVEL SECURITY;

--
-- Name: media media allow_delete_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "media allow_delete_own" ON public.media FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: media media allow_insert_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "media allow_insert_own" ON public.media FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: media media allow_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "media allow_read" ON public.media FOR SELECT USING (true);


--
-- Name: media media allow_update_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "media allow_update_own" ON public.media FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: plant_care_guides; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.plant_care_guides ENABLE ROW LEVEL SECURITY;

--
-- Name: plant_care_guides plant_care_guides_select_all; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY plant_care_guides_select_all ON public.plant_care_guides FOR SELECT USING (true);


--
-- Name: plant_parameter_score_guides; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.plant_parameter_score_guides ENABLE ROW LEVEL SECURITY;

--
-- Name: plant_parameter_score_guides plant_parameter_score_guides_select_all; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY plant_parameter_score_guides_select_all ON public.plant_parameter_score_guides FOR SELECT USING (true);


--
-- Name: plant_species_aliases; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.plant_species_aliases ENABLE ROW LEVEL SECURITY;

--
-- Name: plant_species_aliases plant_species_aliases_public_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY plant_species_aliases_public_read ON public.plant_species_aliases FOR SELECT USING (true);


--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: archives public read archives; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "public read archives" ON public.archives FOR SELECT USING (true);


--
-- Name: profiles public read profiles; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "public read profiles" ON public.profiles FOR SELECT USING (true);


--
-- Name: profiles read own profile; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "read own profile" ON public.profiles FOR SELECT USING ((auth.uid() = id));


--
-- Name: records; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.records ENABLE ROW LEVEL SECURITY;

--
-- Name: archives records allow_delete_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "records allow_delete_own" ON public.archives FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: archives records allow_update_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "records allow_update_own" ON public.archives FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: profiles update own profile; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "update own profile" ON public.profiles FOR UPDATE USING ((auth.uid() = id));


--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: pg_database_owner
--

GRANT USAGE ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;


--
-- Name: FUNCTION handle_comment_change(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.handle_comment_change() TO anon;
GRANT ALL ON FUNCTION public.handle_comment_change() TO authenticated;
GRANT ALL ON FUNCTION public.handle_comment_change() TO service_role;


--
-- Name: FUNCTION handle_media_change(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.handle_media_change() TO anon;
GRANT ALL ON FUNCTION public.handle_media_change() TO authenticated;
GRANT ALL ON FUNCTION public.handle_media_change() TO service_role;


--
-- Name: FUNCTION handle_new_user(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.handle_new_user() TO anon;
GRANT ALL ON FUNCTION public.handle_new_user() TO authenticated;
GRANT ALL ON FUNCTION public.handle_new_user() TO service_role;


--
-- Name: FUNCTION handle_record_insert(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.handle_record_insert() TO anon;
GRANT ALL ON FUNCTION public.handle_record_insert() TO authenticated;
GRANT ALL ON FUNCTION public.handle_record_insert() TO service_role;


--
-- Name: FUNCTION sync_record_comment_count(p_record_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.sync_record_comment_count(p_record_id uuid) TO anon;
GRANT ALL ON FUNCTION public.sync_record_comment_count(p_record_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.sync_record_comment_count(p_record_id uuid) TO service_role;


--
-- Name: FUNCTION sync_record_media_stats(p_record_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.sync_record_media_stats(p_record_id uuid) TO anon;
GRANT ALL ON FUNCTION public.sync_record_media_stats(p_record_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.sync_record_media_stats(p_record_id uuid) TO service_role;


--
-- Name: FUNCTION sync_record_status_tag_to_record_tags(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.sync_record_status_tag_to_record_tags() TO anon;
GRANT ALL ON FUNCTION public.sync_record_status_tag_to_record_tags() TO authenticated;
GRANT ALL ON FUNCTION public.sync_record_status_tag_to_record_tags() TO service_role;


--
-- Name: FUNCTION sync_record_tags_from_record(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.sync_record_tags_from_record() TO anon;
GRANT ALL ON FUNCTION public.sync_record_tags_from_record() TO authenticated;
GRANT ALL ON FUNCTION public.sync_record_tags_from_record() TO service_role;


--
-- Name: TABLE archives; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.archives TO anon;
GRANT ALL ON TABLE public.archives TO authenticated;
GRANT ALL ON TABLE public.archives TO service_role;


--
-- Name: TABLE comments; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.comments TO anon;
GRANT ALL ON TABLE public.comments TO authenticated;
GRANT ALL ON TABLE public.comments TO service_role;


--
-- Name: TABLE profiles; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.profiles TO anon;
GRANT ALL ON TABLE public.profiles TO authenticated;
GRANT ALL ON TABLE public.profiles TO service_role;


--
-- Name: TABLE records; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.records TO anon;
GRANT ALL ON TABLE public.records TO authenticated;
GRANT ALL ON TABLE public.records TO service_role;


--
-- Name: TABLE discovery_feed_view; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.discovery_feed_view TO anon;
GRANT ALL ON TABLE public.discovery_feed_view TO authenticated;
GRANT ALL ON TABLE public.discovery_feed_view TO service_role;


--
-- Name: TABLE discovery_view; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.discovery_view TO anon;
GRANT ALL ON TABLE public.discovery_view TO authenticated;
GRANT ALL ON TABLE public.discovery_view TO service_role;


--
-- Name: TABLE follows; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.follows TO anon;
GRANT ALL ON TABLE public.follows TO authenticated;
GRANT ALL ON TABLE public.follows TO service_role;


--
-- Name: TABLE group_tags; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.group_tags TO anon;
GRANT ALL ON TABLE public.group_tags TO authenticated;
GRANT ALL ON TABLE public.group_tags TO service_role;


--
-- Name: TABLE locations; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.locations TO anon;
GRANT ALL ON TABLE public.locations TO authenticated;
GRANT ALL ON TABLE public.locations TO service_role;


--
-- Name: TABLE media; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.media TO anon;
GRANT ALL ON TABLE public.media TO authenticated;
GRANT ALL ON TABLE public.media TO service_role;


--
-- Name: TABLE plant_care_guides; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.plant_care_guides TO anon;
GRANT ALL ON TABLE public.plant_care_guides TO authenticated;
GRANT ALL ON TABLE public.plant_care_guides TO service_role;


--
-- Name: TABLE plant_growth_cycle; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.plant_growth_cycle TO anon;
GRANT ALL ON TABLE public.plant_growth_cycle TO authenticated;
GRANT ALL ON TABLE public.plant_growth_cycle TO service_role;


--
-- Name: TABLE plant_light_cycle; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.plant_light_cycle TO anon;
GRANT ALL ON TABLE public.plant_light_cycle TO authenticated;
GRANT ALL ON TABLE public.plant_light_cycle TO service_role;


--
-- Name: TABLE plant_parameter_score_guides; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.plant_parameter_score_guides TO anon;
GRANT ALL ON TABLE public.plant_parameter_score_guides TO authenticated;
GRANT ALL ON TABLE public.plant_parameter_score_guides TO service_role;


--
-- Name: TABLE plant_parameters; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.plant_parameters TO anon;
GRANT ALL ON TABLE public.plant_parameters TO authenticated;
GRANT ALL ON TABLE public.plant_parameters TO service_role;


--
-- Name: TABLE plant_species; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.plant_species TO anon;
GRANT ALL ON TABLE public.plant_species TO authenticated;
GRANT ALL ON TABLE public.plant_species TO service_role;


--
-- Name: TABLE plant_species_aliases; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.plant_species_aliases TO anon;
GRANT ALL ON TABLE public.plant_species_aliases TO authenticated;
GRANT ALL ON TABLE public.plant_species_aliases TO service_role;


--
-- Name: TABLE plant_species_i18n; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.plant_species_i18n TO anon;
GRANT ALL ON TABLE public.plant_species_i18n TO authenticated;
GRANT ALL ON TABLE public.plant_species_i18n TO service_role;


--
-- Name: TABLE plant_species_pending; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.plant_species_pending TO anon;
GRANT ALL ON TABLE public.plant_species_pending TO authenticated;
GRANT ALL ON TABLE public.plant_species_pending TO service_role;


--
-- Name: TABLE plant_temperature_ranges; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.plant_temperature_ranges TO anon;
GRANT ALL ON TABLE public.plant_temperature_ranges TO authenticated;
GRANT ALL ON TABLE public.plant_temperature_ranges TO service_role;


--
-- Name: TABLE record_tags; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.record_tags TO anon;
GRANT ALL ON TABLE public.record_tags TO authenticated;
GRANT ALL ON TABLE public.record_tags TO service_role;


--
-- Name: TABLE sub_tags; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.sub_tags TO anon;
GRANT ALL ON TABLE public.sub_tags TO authenticated;
GRANT ALL ON TABLE public.sub_tags TO service_role;


--
-- Name: TABLE timeline_view; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.timeline_view TO anon;
GRANT ALL ON TABLE public.timeline_view TO authenticated;
GRANT ALL ON TABLE public.timeline_view TO service_role;


--
-- Name: TABLE users; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.users TO anon;
GRANT ALL ON TABLE public.users TO authenticated;
GRANT ALL ON TABLE public.users TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- PostgreSQL database dump complete
--

\unrestrict 8y04fgTiBxEqZdtsG6ElnDCxpZHBDaKhzW6uj9KXdcc9ltKYcBsKjNbuRIlaO5z

