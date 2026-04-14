--
-- PostgreSQL database dump
--

\restrict i2txhR6VBTCdhH1aIZgcayBPL1mHRAgXrOXYrsoxbJss6YcPILwtPBGLaIuNdZi

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
    sub_tag_id uuid
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
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.media OWNER TO postgres;

--
-- Name: profiles; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    email text,
    username text,
    updated_at timestamp without time zone DEFAULT now()
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
    visibility text DEFAULT 'private'::text,
    record_time timestamp with time zone DEFAULT now()
);


ALTER TABLE public.records OWNER TO postgres;

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
            ( SELECT m.url
                   FROM public.media m
                  WHERE (m.record_id = r.id)
                 LIMIT 1) AS image_url,
            row_number() OVER (PARTITION BY r.archive_id ORDER BY r.record_time DESC) AS rn_archive,
            row_number() OVER (PARTITION BY r.user_id ORDER BY r.record_time DESC) AS rn_user
           FROM ((public.records r
             JOIN public.archives a ON ((r.archive_id = a.id)))
             LEFT JOIN public.profiles p ON ((r.user_id = p.id)))) t
  WHERE ((rn_archive = 1) AND (rn_user <= 4));


ALTER VIEW public.discovery_view OWNER TO postgres;

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
    management_difficulty_score smallint
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
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.plant_species OWNER TO postgres;

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
-- Name: plant_parameters plant_parameters_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.plant_parameters
    ADD CONSTRAINT plant_parameters_pkey PRIMARY KEY (species_id);


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
-- Name: plant_temperature_ranges plant_temperature_ranges_species_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.plant_temperature_ranges
    ADD CONSTRAINT plant_temperature_ranges_species_id_fkey FOREIGN KEY (species_id) REFERENCES public.plant_species(id);


--
-- Name: records records_archive_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.records
    ADD CONSTRAINT records_archive_id_fkey FOREIGN KEY (archive_id) REFERENCES public.archives(id);


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
-- Name: TABLE media; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.media TO anon;
GRANT ALL ON TABLE public.media TO authenticated;
GRANT ALL ON TABLE public.media TO service_role;


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
-- Name: TABLE discovery_view; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.discovery_view TO anon;
GRANT ALL ON TABLE public.discovery_view TO authenticated;
GRANT ALL ON TABLE public.discovery_view TO service_role;


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
-- Name: TABLE plant_temperature_ranges; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.plant_temperature_ranges TO anon;
GRANT ALL ON TABLE public.plant_temperature_ranges TO authenticated;
GRANT ALL ON TABLE public.plant_temperature_ranges TO service_role;


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

\unrestrict i2txhR6VBTCdhH1aIZgcayBPL1mHRAgXrOXYrsoxbJss6YcPILwtPBGLaIuNdZi

