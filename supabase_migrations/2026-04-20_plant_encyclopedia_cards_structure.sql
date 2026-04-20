BEGIN;

-- 1. 补齐 plant_parameters：量化参数、温度节点、光周期、栽培属性
ALTER TABLE public.plant_parameters
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now(),

  ADD COLUMN IF NOT EXISTS edible_part text[],
  ADD COLUMN IF NOT EXISTS lifecycle text,
  ADD COLUMN IF NOT EXISTS growth_form text,
  ADD COLUMN IF NOT EXISTS season_type text[],
  ADD COLUMN IF NOT EXISTS nitrogen_fixing boolean,
  ADD COLUMN IF NOT EXISTS need_trellis boolean,

  ADD COLUMN IF NOT EXISTS ph_min numeric,
  ADD COLUMN IF NOT EXISTS ph_max numeric,

  ADD COLUMN IF NOT EXISTS best_germ_temp_min numeric,
  ADD COLUMN IF NOT EXISTS best_germ_temp_max numeric,
  ADD COLUMN IF NOT EXISTS optimal_growth_temp_min numeric,
  ADD COLUMN IF NOT EXISTS optimal_growth_temp_max numeric,
  ADD COLUMN IF NOT EXISTS vigorous_growth_temp numeric,
  ADD COLUMN IF NOT EXISTS growth_slow_temp numeric,
  ADD COLUMN IF NOT EXISTS frost_damage_temp numeric,
  ADD COLUMN IF NOT EXISTS lethal_low_temp numeric,
  ADD COLUMN IF NOT EXISTS stop_low_temp numeric,
  ADD COLUMN IF NOT EXISTS stop_high_temp numeric,
  ADD COLUMN IF NOT EXISTS heat_scorch_temp numeric,
  ADD COLUMN IF NOT EXISTS lethal_high_temp numeric,
  ADD COLUMN IF NOT EXISTS special_temperature_points jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS temperature_note text,

  ADD COLUMN IF NOT EXISTS photoperiod_type text,
  ADD COLUMN IF NOT EXISTS photoperiod_trigger_stage text[],
  ADD COLUMN IF NOT EXISTS critical_day_length_hours numeric,
  ADD COLUMN IF NOT EXISTS photoperiod_sensitivity_score smallint,
  ADD COLUMN IF NOT EXISTS photoperiod_note text,

  ADD COLUMN IF NOT EXISTS shade_tolerance text,
  ADD COLUMN IF NOT EXISTS drought_tolerance text,
  ADD COLUMN IF NOT EXISTS container_friendly_score smallint,
  ADD COLUMN IF NOT EXISTS indoor_friendly_score smallint,
  ADD COLUMN IF NOT EXISTS balcony_friendly_score smallint,

  ADD COLUMN IF NOT EXISTS record_focus text[],
  ADD COLUMN IF NOT EXISTS good_companions text[],
  ADD COLUMN IF NOT EXISTS avoid_rotation_with text[],
  ADD COLUMN IF NOT EXISTS care_note text;

-- 确保每个系统植物至少有一条参数记录，后续逐步补全
INSERT INTO public.plant_parameters (species_id)
SELECT id
FROM public.plant_species
WHERE is_active IS DISTINCT FROM false
ON CONFLICT (species_id) DO NOTHING;

-- 兼容旧温度表，把已有单值迁移到新字段中
UPDATE public.plant_parameters p
SET
  best_germ_temp_min = COALESCE(p.best_germ_temp_min, tr.best_germ_temp),
  best_germ_temp_max = COALESCE(p.best_germ_temp_max, tr.best_germ_temp),
  optimal_growth_temp_min = COALESCE(p.optimal_growth_temp_min, tr.optimal_growth_temp),
  optimal_growth_temp_max = COALESCE(p.optimal_growth_temp_max, tr.optimal_growth_temp),
  lethal_low_temp = COALESCE(p.lethal_low_temp, tr.lethal_low_temp),
  stop_low_temp = COALESCE(p.stop_low_temp, tr.stop_low_temp),
  stop_high_temp = COALESCE(p.stop_high_temp, tr.stop_high_temp),
  lethal_high_temp = COALESCE(p.lethal_high_temp, tr.lethal_high_temp),
  updated_at = now()
FROM public.plant_temperature_ranges tr
WHERE p.species_id = tr.species_id;

-- 兼容旧光周期表
UPDATE public.plant_parameters p
SET
  photoperiod_type = COALESCE(p.photoperiod_type, lc.photoperiod_type),
  critical_day_length_hours = COALESCE(p.critical_day_length_hours, lc.optimal_daylight_hours),
  updated_at = now()
FROM public.plant_light_cycle lc
WHERE p.species_id = lc.species_id;

-- 2. 评分说明表：前端可直接读取，避免说明写死在代码里
CREATE TABLE IF NOT EXISTS public.plant_parameter_score_guides (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  parameter_key text NOT NULL,
  score_min smallint NOT NULL,
  score_max smallint NOT NULL,
  label text NOT NULL,
  description text,
  sort_order integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  UNIQUE (parameter_key, score_min, score_max)
);

ALTER TABLE public.plant_parameter_score_guides ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'plant_parameter_score_guides'
      AND policyname = 'plant_parameter_score_guides_select_all'
  ) THEN
    CREATE POLICY plant_parameter_score_guides_select_all
      ON public.plant_parameter_score_guides
      FOR SELECT
      USING (true);
  END IF;
END $$;

-- 评分说明：10 分制
INSERT INTO public.plant_parameter_score_guides
  (parameter_key, score_min, score_max, label, description, sort_order)
VALUES
  -- 日照强度评分
  ('sun_score', 10, 10, '全日照 ≥8小时', '需要强光和长时间直射光。', 10),
  ('sun_score', 9, 9, '7–8小时', '接近全日照，光照不足会影响开花结果。', 9),
  ('sun_score', 8, 8, '6–7小时', '需要较充足日照。', 8),
  ('sun_score', 7, 7, '5–6小时', '中高日照需求。', 7),
  ('sun_score', 6, 6, '4–5小时', '普通日照可生长。', 6),
  ('sun_score', 5, 5, '3–4小时', '半日照可生长。', 5),
  ('sun_score', 4, 4, '2–3小时', '较耐阴。', 4),
  ('sun_score', 3, 3, '1–2小时', '弱光可维持。', 3),
  ('sun_score', 2, 2, '<1小时', '很低日照也可存活。', 2),
  ('sun_score', 0, 1, '阴生', '适合阴生或散射光环境。', 1),

  -- 空气湿度评分
  ('air_humidity_score', 10, 10, '高湿环境（热带）', '需要长期高空气湿度。', 10),
  ('air_humidity_score', 9, 9, '持续湿润', '偏好持续湿润空气。', 9),
  ('air_humidity_score', 8, 8, '偏湿', '空气偏湿生长更好。', 8),
  ('air_humidity_score', 7, 7, '中等湿润', '中等偏湿。', 7),
  ('air_humidity_score', 6, 6, '正常环境', '普通室外或室内湿度可适应。', 6),
  ('air_humidity_score', 5, 5, '稍干', '空气稍干也可适应。', 5),
  ('air_humidity_score', 4, 4, '干燥', '能适应干燥空气。', 4),
  ('air_humidity_score', 3, 3, '较干', '偏干环境可生长。', 3),
  ('air_humidity_score', 2, 2, '极干', '耐低湿度。', 2),
  ('air_humidity_score', 0, 1, '极端干燥', '可适应极端干燥空气。', 1),

  -- 空气通风评分
  ('air_flow_score', 10, 10, '必须强通风', '通风差时容易病害或闷根。', 10),
  ('air_flow_score', 8, 9, '通风良好', '需要较好的空气流动。', 8),
  ('air_flow_score', 6, 7, '普通通风', '普通通风即可。', 6),
  ('air_flow_score', 4, 5, '半封闭可生长', '半封闭环境可生长。', 4),
  ('air_flow_score', 2, 3, '通风要求低', '对通风要求较低。', 2),
  ('air_flow_score', 0, 1, '可密闭', '可短期适应较密闭环境。', 1),

  -- 土壤湿度评分
  ('soil_moisture_score', 10, 10, '水生', '需要水生或长期水湿环境。', 10),
  ('soil_moisture_score', 9, 9, '常湿', '土壤需要长期湿润。', 9),
  ('soil_moisture_score', 8, 8, '偏湿', '偏湿土壤生长更好。', 8),
  ('soil_moisture_score', 7, 7, '微湿', '保持微湿更适合。', 7),
  ('soil_moisture_score', 6, 6, '中等', '中等湿度即可。', 6),
  ('soil_moisture_score', 5, 5, '稍干', '可稍干后再浇水。', 5),
  ('soil_moisture_score', 4, 4, '干', '可适应偏干土壤。', 4),
  ('soil_moisture_score', 3, 3, '较干', '较耐干。', 3),
  ('soil_moisture_score', 2, 2, '耐旱', '耐旱，忌长期湿。', 2),
  ('soil_moisture_score', 0, 1, '极耐旱', '极耐旱，湿度过高反而风险大。', 1),

  -- 土壤通气评分
  ('soil_aeration_score', 10, 10, '极疏松', '要求极高透气性。', 10),
  ('soil_aeration_score', 8, 9, '疏松', '需要疏松透气土壤。', 8),
  ('soil_aeration_score', 6, 7, '普通', '普通园土或通用基质可生长。', 6),
  ('soil_aeration_score', 4, 5, '稍板结可生长', '轻微板结仍可生长。', 4),
  ('soil_aeration_score', 2, 3, '可耐板结', '较耐土壤板结。', 2),
  ('soil_aeration_score', 0, 1, '重黏土也能长', '对土壤通气要求很低。', 1),

  -- 土壤肥沃度评分
  ('soil_fertility_score', 10, 10, '高肥', '需肥量高。', 10),
  ('soil_fertility_score', 8, 9, '较肥', '偏好肥沃土壤。', 8),
  ('soil_fertility_score', 6, 7, '中等', '中等肥力即可。', 6),
  ('soil_fertility_score', 4, 5, '偏低', '肥力偏低也能生长。', 4),
  ('soil_fertility_score', 2, 3, '贫瘠适应', '能适应贫瘠土壤。', 2),
  ('soil_fertility_score', 0, 1, '极贫瘠', '极贫瘠也可生长。', 1),

  -- pH 敏感评分
  ('ph_sensitivity_score', 10, 10, '极敏感', 'pH 偏离时明显影响生长。', 10),
  ('ph_sensitivity_score', 8, 9, '较敏感', '对 pH 较敏感。', 8),
  ('ph_sensitivity_score', 6, 7, '一般', '有一定 pH 适应范围。', 6),
  ('ph_sensitivity_score', 4, 5, '较宽', 'pH 适应范围较宽。', 4),
  ('ph_sensitivity_score', 2, 3, '宽适应', '对 pH 要求不高。', 2),
  ('ph_sensitivity_score', 0, 1, '极宽', 'pH 适应范围很宽。', 1),

  -- 管理难度评分
  ('management_difficulty_score', 10, 10, '专业种植', '需要较强经验和精细管理。', 10),
  ('management_difficulty_score', 8, 9, '较难', '对环境和管理要求较高。', 8),
  ('management_difficulty_score', 6, 7, '中等', '需要正常管理和观察。', 6),
  ('management_difficulty_score', 4, 5, '容易', '管理难度较低。', 4),
  ('management_difficulty_score', 2, 3, '非常容易', '适合新手。', 2),
  ('management_difficulty_score', 0, 1, '野生级', '几乎不需要精细管理。', 1),

  -- 补充评分：耐旱能力、生长速度、病虫害风险
  ('drought_score', 10, 10, '极耐旱', '长期偏干也能生长。', 10),
  ('drought_score', 8, 9, '耐旱', '较长时间缺水可适应。', 8),
  ('drought_score', 6, 7, '中等耐旱', '短期偏干可恢复。', 6),
  ('drought_score', 4, 5, '不太耐旱', '需要规律补水。', 4),
  ('drought_score', 2, 3, '怕旱', '缺水容易萎蔫或影响产量。', 2),
  ('drought_score', 0, 1, '极怕旱', '短时间缺水也容易受损。', 1),

  ('growth_speed_score', 10, 10, '极快', '生长很快，变化明显。', 10),
  ('growth_speed_score', 8, 9, '较快', '生长速度较快。', 8),
  ('growth_speed_score', 6, 7, '中等', '正常生长速度。', 6),
  ('growth_speed_score', 4, 5, '偏慢', '生长偏慢。', 4),
  ('growth_speed_score', 2, 3, '很慢', '生长很慢，需要耐心。', 2),
  ('growth_speed_score', 0, 1, '极慢', '变化不明显或长期缓慢。', 1),

  ('disease_risk_score', 10, 10, '风险很高', '容易发生病虫害，需要频繁观察。', 10),
  ('disease_risk_score', 8, 9, '风险较高', '在不适条件下较容易出问题。', 8),
  ('disease_risk_score', 6, 7, '中等风险', '普通管理下偶有问题。', 6),
  ('disease_risk_score', 4, 5, '风险较低', '病虫害压力较小。', 4),
  ('disease_risk_score', 2, 3, '风险很低', '较少病虫害。', 2),
  ('disease_risk_score', 0, 1, '几乎无风险', '非常少见病虫害。', 1)
ON CONFLICT (parameter_key, score_min, score_max)
DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  sort_order = EXCLUDED.sort_order;

-- 3. 种植卡内容表：大块文字，不拆碎
CREATE TABLE IF NOT EXISTS public.plant_care_guides (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  plant_id uuid NOT NULL REFERENCES public.plant_species(id) ON DELETE CASCADE,
  language_code text NOT NULL DEFAULT 'zh',

  summary text,
  climate_timing_note text,
  planting_guide text,
  care_guide text,
  harvest_guide text,
  common_problem_guide text,
  rotation_intercrop_guide text,

  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),

  UNIQUE (plant_id, language_code)
);

ALTER TABLE public.plant_care_guides ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'plant_care_guides'
      AND policyname = 'plant_care_guides_select_all'
  ) THEN
    CREATE POLICY plant_care_guides_select_all
      ON public.plant_care_guides
      FOR SELECT
      USING (true);
  END IF;
END $$;

-- 4. 确保山茶花、梅花存在，便于后续内容承接
INSERT INTO public.plant_species (
  slug,
  common_name,
  scientific_name,
  family,
  category,
  sub_category,
  growth_type,
  entry_type,
  is_active,
  sort_order,
  description
)
VALUES
  (
    'camellia',
    '山茶花',
    'Camellia japonica',
    '山茶科',
    'flower',
    'flowering_shrub',
    'perennial',
    'system',
    true,
    10050,
    '常绿花木，适合庭院和盆栽观赏。'
  ),
  (
    'prunus-mume',
    '梅花',
    'Prunus mume',
    '蔷薇科',
    'flower',
    'flowering_tree',
    'perennial',
    'system',
    true,
    10060,
    '耐寒早春花木，常用于庭院、盆景和园林观赏。'
  )
ON CONFLICT (slug)
DO UPDATE SET
  common_name = EXCLUDED.common_name,
  scientific_name = EXCLUDED.scientific_name,
  family = EXCLUDED.family,
  category = EXCLUDED.category,
  sub_category = EXCLUDED.sub_category,
  growth_type = EXCLUDED.growth_type,
  entry_type = EXCLUDED.entry_type,
  is_active = true,
  description = EXCLUDED.description;

-- 5. 别名补充：山茶花、梅花
WITH alias_rows AS (
  SELECT ps.id AS species_id, 'zh'::text AS language_code, alias_name, lower(alias_name) AS normalized_name, alias_type
  FROM public.plant_species ps
  CROSS JOIN (
    VALUES
      ('山茶花', 'common'),
      ('茶花', 'alias'),
      ('山茶', 'alias'),
      ('Camellia', 'alias')
  ) AS a(alias_name, alias_type)
  WHERE ps.slug = 'camellia'

  UNION ALL

  SELECT ps.id AS species_id, 'zh'::text AS language_code, alias_name, lower(alias_name) AS normalized_name, alias_type
  FROM public.plant_species ps
  CROSS JOIN (
    VALUES
      ('梅花', 'common'),
      ('梅', 'alias'),
      ('梅树', 'alias'),
      ('梅花树', 'alias'),
      ('宫粉梅', 'cultivar_group'),
      ('朱砂梅', 'cultivar_group'),
      ('绿萼梅', 'cultivar_group'),
      ('玉蝶梅', 'cultivar_group'),
      ('洒金梅', 'cultivar_group')
  ) AS a(alias_name, alias_type)
  WHERE ps.slug = 'prunus-mume'
)
INSERT INTO public.plant_species_aliases (
  species_id,
  language_code,
  alias_name,
  normalized_name,
  alias_type
)
SELECT species_id, language_code, alias_name, normalized_name, alias_type
FROM alias_rows
ON CONFLICT (language_code, normalized_name)
DO UPDATE SET
  species_id = EXCLUDED.species_id,
  alias_name = EXCLUDED.alias_name,
  alias_type = EXCLUDED.alias_type;

-- 6. 种植卡样板内容：先放 6 个，后续可继续补全
WITH target AS (
  SELECT id, slug, common_name
  FROM public.plant_species
  WHERE slug IN ('spinacia-oleracea', 'solanum-lycopersicum', 'strawberry', 'camellia', 'prunus-mume')
     OR common_name = '玉米'
)
INSERT INTO public.plant_care_guides (
  plant_id,
  language_code,
  summary,
  climate_timing_note,
  planting_guide,
  care_guide,
  harvest_guide,
  common_problem_guide,
  rotation_intercrop_guide
)
SELECT
  id,
  'zh',
  CASE
    WHEN slug = 'spinacia-oleracea' THEN '菠菜是耐寒喜凉型叶菜，适合在气温转凉后播种，冷凉环境下叶片更厚、口感更甜，最怕高温和长日照诱发抽薹。'
    WHEN slug = 'solanum-lycopersicum' THEN '番茄是喜光喜温的结果类蔬菜，适合在无霜期种植，结果期最怕忽干忽湿，水肥稳定和通风决定产量与裂果风险。'
    WHEN slug = 'strawberry' THEN '草莓是喜凉怕热的多年生果类植物，适合在冷凉季节定植，开花结果期最怕水分波动、高温闷湿和授粉不良。'
    WHEN common_name = '玉米' THEN '玉米是喜温喜光、需肥量大的高秆作物，苗期怕涝，抽雄吐丝期最怕干旱和高温。'
    WHEN slug = 'camellia' THEN '山茶花是喜半阴湿润、怕暴晒和积水的常绿花木，花苞期温湿度波动过大容易掉苞。'
    WHEN slug = 'prunus-mume' THEN '梅花是耐寒喜光的早春花木，冬季低温有利于花芽完成休眠，最怕长期积水和闷根。'
  END,
  CASE
    WHEN slug = 'spinacia-oleracea' THEN '不同地区季节不同，菠菜应按当地温度判断播种时间。白天气温稳定低于 25℃、夜间开始转凉时更适合播种；发芽适温约 10–20℃，生长适温约 8–22℃。高温和长日照会明显增加抽薹风险。'
    WHEN slug = 'solanum-lycopersicum' THEN '番茄适合在霜冻结束后、夜温稳定上升时定植。幼苗定植前应避免低温伤苗；生长适温约 20–30℃，结果期遇到持续高温或低温都会影响坐果。'
    WHEN slug = 'strawberry' THEN '草莓适合在冷凉季节定植，让根系先建立起来再进入开花结果期。生长适温约 15–25℃，高温闷湿时容易烂果、病害和缓苗困难。'
    WHEN common_name = '玉米' THEN '玉米适合在土壤回暖、霜冻风险结束后播种。发芽和苗期需要温暖环境，低温湿土会降低出苗率；抽雄吐丝期如果遇到干旱和高温，授粉和结实会明显受影响。'
    WHEN slug = 'camellia' THEN '山茶花适合冷凉到温和环境，夏季强光暴晒和高温闷湿会增加叶片灼伤、根系受损和掉苞风险。花苞期要避免温度和湿度剧烈波动。'
    WHEN slug = 'prunus-mume' THEN '梅花需要经历一段冷凉阶段完成休眠和花芽发育，适合冷凉冬季和光照充足的环境。盆栽梅花最怕冬季室内过暖、长期缺光和盆土积水。'
  END,
  CASE
    WHEN slug = 'spinacia-oleracea' THEN '可条播或撒播，条播更方便间苗。覆土约 1 厘米，播后用喷壶喷透水，保持土壤微湿。气温偏高时可先浸种 8–12 小时再催芽；天气凉时可直接播。出苗后太密要间苗，采嫩叶可留 5–8 厘米，大株采收可留 8–10 厘米。'
    WHEN slug = 'solanum-lycopersicum' THEN '番茄适合先育苗再定植。播种覆土约 0.5–1 厘米，保持基质微湿。幼苗长出 4–6 片真叶、根系能包住土坨时可移栽。盆栽建议单株 10–20 升以上容器，高秆品种定植时同步插杆或搭架。'
    WHEN slug = 'strawberry' THEN '家庭种植更建议用健康苗定植，不建议从种子开始。定植时让根颈与土面基本平齐，不要把生长点埋住。盆栽要用排水孔好的容器，根系展开后填土压实，定植后浇透水并放在明亮散射光处缓苗。'
    WHEN common_name = '玉米' THEN '玉米适合直播。播种深度约 3–5 厘米，土壤太干时先浇水再播。家庭少量种植不要只种一两株，至少成小片种植，授粉成功率更高。株距可按 25–35 厘米安排，行距留出通风和管理空间。'
    WHEN slug = 'camellia' THEN '山茶花盆栽要用疏松、微酸、排水好的基质，避免重黏土和长期积水。换盆时不要埋深，根颈保持接近原土面。新买苗先放在明亮散射光处适应，再逐步增加光照。'
    WHEN slug = 'prunus-mume' THEN '梅花可地栽或盆栽，盆栽需要排水好、土层透气。上盆时不要使用过大的盆，避免盆土长期湿冷。移栽或换盆更适合在休眠期进行，尽量保留根团，栽后浇透定根水。'
  END,
  CASE
    WHEN slug = 'spinacia-oleracea' THEN '秋冬可给足光照，温度偏高时下午适当遮阴。表土 1–2 厘米变干再浇透，不要长期积水。长出 4–5 片真叶后可薄肥勤施，7–10 天一次即可。盆栽不要太密，过密容易黄叶、倒苗和虫害。'
    WHEN slug = 'solanum-lycopersicum' THEN '定植后前几天保持土壤微湿，缓苗后给足直射光。结果期浇水要均匀，避免忽干忽湿导致裂果或脐腐。开花后可 7–10 天少量追肥一次，以结果型肥为主。无限生长型番茄要及时打杈、绑蔓，去掉贴近土面的老叶以增加通风。'
    WHEN slug = 'strawberry' THEN '草莓根浅，土壤保持微湿但不能积水。开花结果期水分要稳定，忽干忽湿容易畸形果和裂果。结果期尽量让果实离开湿土，可垫草或使用干净覆盖物。高温季节减少暴晒和闷湿，及时剪掉老叶、病叶和过多匍匐茎。'
    WHEN common_name = '玉米' THEN '苗期怕涝，土壤长期湿冷会黄苗。拔节后需水肥增加，可追肥并保持土壤有稳定水分。抽雄吐丝期是关键期，干旱会导致花粉活力下降和缺粒。风大地区要注意倒伏，盆栽玉米需要更大容器和固定支撑。'
    WHEN slug = 'camellia' THEN '山茶花喜欢明亮散射光或半日照，夏季避免烈日暴晒。浇水看盆土，表层变干后再浇透，不要让托盘长期存水。花苞期不要频繁搬动位置，也不要忽干忽湿。新梢生长期可薄肥，花苞显色后减少施肥。'
    WHEN slug = 'prunus-mume' THEN '梅花需要充足光照，长期阴暗会影响花芽。生长期浇水见干见湿，盆土不能长期积水。花后可修剪过密枝、弱枝和交叉枝，促进新枝。夏季注意通风和控水，避免闷根。冬季不要放在过暖室内，以免提前萌动。'
  END,
  CASE
    WHEN slug = 'spinacia-oleracea' THEN '植株长到 12–15 厘米时可从外侧摘大叶，保留中心继续生长。整株采收一般在播后 35–60 天，根据温度和长势决定。看到中心拔高、叶片变尖时要尽快采收，抽薹后口感会变粗变涩。'
    WHEN slug = 'solanum-lycopersicum' THEN '果实开始转色后即可采收，完全成熟时风味更浓。雨季或裂果风险高时可在转色期提前采下后熟。采收时用剪刀剪下果柄，避免拉伤枝条。持续结果的品种应及时采收成熟果，减少植株负担。'
    WHEN slug = 'strawberry' THEN '果面大部分转红后可采收，完全转红风味更好。采收时带一小段果柄，用剪刀剪下，避免拉伤花序。雨后或果面潮湿时不宜久放，容易烂果。结果后可保留健壮匍匐茎繁殖，也可剪掉匍匐茎集中养母株。'
    WHEN common_name = '玉米' THEN '鲜食玉米通常在吐丝后约 18–25 天采收，具体看品种和温度。籽粒饱满、掐开有乳汁时口感较好。若等籽粒变硬，则更适合留种或成熟采收。采收后尽快食用，甜味会随时间下降。'
    WHEN slug = 'camellia' THEN '山茶花以观花为主。花开后及时摘除残花，减少病害和养分消耗。花后可轻剪过密枝、病弱枝，不建议重剪。花苞期如果掉苞，先检查浇水波动、通风、温度变化和是否频繁搬动。'
    WHEN slug = 'prunus-mume' THEN '梅花以观花为主。花后修剪比花前重剪更合适，可剪去徒长枝、交叉枝和过密枝。盆栽梅花花后应恢复光照和薄肥，促进新枝成熟，为下一次花芽形成打基础。'
  END,
  CASE
    WHEN slug = 'spinacia-oleracea' THEN '出苗慢通常与温度高、种子旧、覆土太厚或播后干湿不稳有关。小苗倒伏多半是太湿、太密、通风差。叶片发黄先看土是否长期湿，再判断是否缺肥。提前抽薹通常由升温和日照变长引起，应尽早采收。'
    WHEN slug = 'solanum-lycopersicum' THEN '裂果多与水分忽干忽湿有关。脐腐常和水分波动、钙吸收受阻有关，不只是缺钙。白粉虱、蚜虫常在叶背和嫩梢出现。叶斑和白粉多与通风差、湿度高有关，先摘除严重病叶并改善通风。'
    WHEN slug = 'strawberry' THEN '烂果常与果实贴土、湿度高和通风差有关。畸形果可能与授粉不良、低温或昆虫活动少有关。叶片焦边可能是高温、肥害或缺水。根颈埋太深容易烂心，定植时要特别注意。'
    WHEN common_name = '玉米' THEN '缺粒常与授粉期干旱、高温、种植株数太少或花粉不足有关。黄苗可能是低温湿土、缺肥或根系弱。倒伏多发生在风大、根系浅或氮肥过多时。玉米螟等蛀食害虫要早发现。'
    WHEN slug = 'camellia' THEN '掉苞常见于忽干忽湿、温差剧烈、通风差或频繁移动。叶尖焦枯可能是暴晒、肥害或根系受损。黄叶要先检查是否积水闷根。花苞期不要浓肥猛追，也不要让盆土长期过湿。'
    WHEN slug = 'prunus-mume' THEN '不开花常见原因是光照不足、冬季过暖、修剪时机不当或枝条未成熟。盆土长期湿会烂根、黄叶。徒长枝太多会消耗养分，花后要适当修剪。蚜虫常在嫩梢出现，应尽早处理。'
  END,
  CASE
    WHEN slug = 'spinacia-oleracea' THEN '菠菜不适合长期和其他叶菜反复连作。可与葱蒜类、豆类、茄果类轮换。间种时不要放在长期背阴处，否则叶柄拉长、叶片变薄。'
    WHEN slug = 'solanum-lycopersicum' THEN '番茄不建议与辣椒、茄子、土豆等茄科作物连续种在同一位置。可与罗勒、葱蒜类、生菜等尝试间种，但不要让低矮作物长期被番茄遮光。'
    WHEN slug = 'strawberry' THEN '草莓不建议与病害压力大的老土长期连作。盆栽旧土再次使用前应更新或消毒。可与葱蒜类等低矮作物尝试搭配，但要保证草莓通风和采光。'
    WHEN common_name = '玉米' THEN '玉米需肥量较大，不建议长期在同一位置连续种植。可与豆类轮作，豆类有助于改善土壤氮素循环。小空间种植时不要过密，否则授粉、通风和抗倒伏都会变差。'
    WHEN slug = 'camellia' THEN '山茶花不强调蔬菜式轮作。盆栽重点是定期换盆、更新部分旧土并保持根系透气。不要和需强碱土或长期干燥环境的植物混在同一管理区。'
    WHEN slug = 'prunus-mume' THEN '梅花不按蔬菜轮作管理。地栽要避免长期积水地块，盆栽要定期换盆修根。周围不要长期被高大植物遮阴，光照不足会影响开花。'
  END
FROM target
WHERE
  (slug IN ('spinacia-oleracea', 'solanum-lycopersicum', 'strawberry', 'camellia', 'prunus-mume')
   OR common_name = '玉米')
ON CONFLICT (plant_id, language_code)
DO UPDATE SET
  summary = EXCLUDED.summary,
  climate_timing_note = EXCLUDED.climate_timing_note,
  planting_guide = EXCLUDED.planting_guide,
  care_guide = EXCLUDED.care_guide,
  harvest_guide = EXCLUDED.harvest_guide,
  common_problem_guide = EXCLUDED.common_problem_guide,
  rotation_intercrop_guide = EXCLUDED.rotation_intercrop_guide,
  updated_at = now();

-- 7. 给样板植物补量化参数，后续再逐步扩充全库
WITH target AS (
  SELECT id, slug, common_name
  FROM public.plant_species
  WHERE slug IN ('spinacia-oleracea', 'solanum-lycopersicum', 'strawberry', 'camellia', 'prunus-mume')
     OR common_name = '玉米'
)
INSERT INTO public.plant_parameters (
  species_id,
  sun_score,
  air_humidity_score,
  air_flow_score,
  soil_moisture_score,
  soil_aeration_score,
  soil_fertility_score,
  ph_min,
  ph_max,
  ph_sensitivity_score,
  drought_score,
  growth_speed_score,
  disease_risk_score,
  management_difficulty_score,

  best_germ_temp_min,
  best_germ_temp_max,
  optimal_growth_temp_min,
  optimal_growth_temp_max,
  vigorous_growth_temp,
  growth_slow_temp,
  frost_damage_temp,
  lethal_low_temp,
  stop_low_temp,
  stop_high_temp,
  heat_scorch_temp,
  lethal_high_temp,
  temperature_note,

  photoperiod_type,
  photoperiod_trigger_stage,
  critical_day_length_hours,
  photoperiod_sensitivity_score,
  photoperiod_note,

  lifecycle,
  growth_form,
  season_type,
  nitrogen_fixing,
  need_trellis,
  container_friendly_score,
  indoor_friendly_score,
  balcony_friendly_score,
  updated_at
)
SELECT
  id,
  CASE
    WHEN slug = 'spinacia-oleracea' THEN 6
    WHEN slug = 'solanum-lycopersicum' THEN 9
    WHEN slug = 'strawberry' THEN 8
    WHEN common_name = '玉米' THEN 9
    WHEN slug = 'camellia' THEN 5
    WHEN slug = 'prunus-mume' THEN 8
  END,
  CASE
    WHEN slug = 'spinacia-oleracea' THEN 6
    WHEN slug = 'solanum-lycopersicum' THEN 6
    WHEN slug = 'strawberry' THEN 7
    WHEN common_name = '玉米' THEN 6
    WHEN slug = 'camellia' THEN 7
    WHEN slug = 'prunus-mume' THEN 5
  END,
  CASE
    WHEN slug = 'spinacia-oleracea' THEN 6
    WHEN slug = 'solanum-lycopersicum' THEN 8
    WHEN slug = 'strawberry' THEN 8
    WHEN common_name = '玉米' THEN 8
    WHEN slug = 'camellia' THEN 6
    WHEN slug = 'prunus-mume' THEN 7
  END,
  CASE
    WHEN slug = 'spinacia-oleracea' THEN 7
    WHEN slug = 'solanum-lycopersicum' THEN 6
    WHEN slug = 'strawberry' THEN 7
    WHEN common_name = '玉米' THEN 6
    WHEN slug = 'camellia' THEN 7
    WHEN slug = 'prunus-mume' THEN 5
  END,
  CASE
    WHEN slug = 'spinacia-oleracea' THEN 6
    WHEN slug = 'solanum-lycopersicum' THEN 7
    WHEN slug = 'strawberry' THEN 8
    WHEN common_name = '玉米' THEN 6
    WHEN slug = 'camellia' THEN 8
    WHEN slug = 'prunus-mume' THEN 7
  END,
  CASE
    WHEN slug = 'spinacia-oleracea' THEN 6
    WHEN slug = 'solanum-lycopersicum' THEN 8
    WHEN slug = 'strawberry' THEN 7
    WHEN common_name = '玉米' THEN 8
    WHEN slug = 'camellia' THEN 6
    WHEN slug = 'prunus-mume' THEN 5
  END,
  CASE
    WHEN slug = 'spinacia-oleracea' THEN 6.5
    WHEN slug = 'solanum-lycopersicum' THEN 6.0
    WHEN slug = 'strawberry' THEN 5.5
    WHEN common_name = '玉米' THEN 6.0
    WHEN slug = 'camellia' THEN 5.0
    WHEN slug = 'prunus-mume' THEN 6.0
  END,
  CASE
    WHEN slug = 'spinacia-oleracea' THEN 7.5
    WHEN slug = 'solanum-lycopersicum' THEN 7.0
    WHEN slug = 'strawberry' THEN 6.8
    WHEN common_name = '玉米' THEN 7.5
    WHEN slug = 'camellia' THEN 6.5
    WHEN slug = 'prunus-mume' THEN 7.5
  END,
  CASE
    WHEN slug = 'spinacia-oleracea' THEN 6
    WHEN slug = 'solanum-lycopersicum' THEN 5
    WHEN slug = 'strawberry' THEN 7
    WHEN common_name = '玉米' THEN 5
    WHEN slug = 'camellia' THEN 8
    WHEN slug = 'prunus-mume' THEN 5
  END,
  CASE
    WHEN slug = 'spinacia-oleracea' THEN 3
    WHEN slug = 'solanum-lycopersicum' THEN 4
    WHEN slug = 'strawberry' THEN 3
    WHEN common_name = '玉米' THEN 5
    WHEN slug = 'camellia' THEN 4
    WHEN slug = 'prunus-mume' THEN 6
  END,
  CASE
    WHEN slug = 'spinacia-oleracea' THEN 7
    WHEN slug = 'solanum-lycopersicum' THEN 7
    WHEN slug = 'strawberry' THEN 6
    WHEN common_name = '玉米' THEN 8
    WHEN slug = 'camellia' THEN 4
    WHEN slug = 'prunus-mume' THEN 4
  END,
  CASE
    WHEN slug = 'spinacia-oleracea' THEN 5
    WHEN slug = 'solanum-lycopersicum' THEN 7
    WHEN slug = 'strawberry' THEN 7
    WHEN common_name = '玉米' THEN 6
    WHEN slug = 'camellia' THEN 6
    WHEN slug = 'prunus-mume' THEN 5
  END,
  CASE
    WHEN slug = 'spinacia-oleracea' THEN 3
    WHEN slug = 'solanum-lycopersicum' THEN 6
    WHEN slug = 'strawberry' THEN 6
    WHEN common_name = '玉米' THEN 5
    WHEN slug = 'camellia' THEN 6
    WHEN slug = 'prunus-mume' THEN 5
  END,

  CASE WHEN slug = 'spinacia-oleracea' THEN 10 WHEN slug = 'solanum-lycopersicum' THEN 20 WHEN slug = 'strawberry' THEN 18 WHEN common_name = '玉米' THEN 18 WHEN slug = 'camellia' THEN NULL WHEN slug = 'prunus-mume' THEN NULL END,
  CASE WHEN slug = 'spinacia-oleracea' THEN 20 WHEN slug = 'solanum-lycopersicum' THEN 28 WHEN slug = 'strawberry' THEN 22 WHEN common_name = '玉米' THEN 30 WHEN slug = 'camellia' THEN NULL WHEN slug = 'prunus-mume' THEN NULL END,
  CASE WHEN slug = 'spinacia-oleracea' THEN 8 WHEN slug = 'solanum-lycopersicum' THEN 20 WHEN slug = 'strawberry' THEN 15 WHEN common_name = '玉米' THEN 20 WHEN slug = 'camellia' THEN 10 WHEN slug = 'prunus-mume' THEN 5 END,
  CASE WHEN slug = 'spinacia-oleracea' THEN 22 WHEN slug = 'solanum-lycopersicum' THEN 30 WHEN slug = 'strawberry' THEN 25 WHEN common_name = '玉米' THEN 32 WHEN slug = 'camellia' THEN 25 WHEN slug = 'prunus-mume' THEN 25 END,
  CASE WHEN slug = 'spinacia-oleracea' THEN 16 WHEN slug = 'solanum-lycopersicum' THEN 25 WHEN slug = 'strawberry' THEN 20 WHEN common_name = '玉米' THEN 30 WHEN slug = 'camellia' THEN 18 WHEN slug = 'prunus-mume' THEN 15 END,
  CASE WHEN slug = 'spinacia-oleracea' THEN 5 WHEN slug = 'solanum-lycopersicum' THEN 12 WHEN slug = 'strawberry' THEN 5 WHEN common_name = '玉米' THEN 10 WHEN slug = 'camellia' THEN 5 WHEN slug = 'prunus-mume' THEN -5 END,
  CASE WHEN slug = 'spinacia-oleracea' THEN -5 WHEN slug = 'solanum-lycopersicum' THEN 5 WHEN slug = 'strawberry' THEN -2 WHEN common_name = '玉米' THEN 5 WHEN slug = 'camellia' THEN -3 WHEN slug = 'prunus-mume' THEN -10 END,
  CASE WHEN slug = 'spinacia-oleracea' THEN -10 WHEN slug = 'solanum-lycopersicum' THEN 0 WHEN slug = 'strawberry' THEN -8 WHEN common_name = '玉米' THEN 0 WHEN slug = 'camellia' THEN -8 WHEN slug = 'prunus-mume' THEN -15 END,
  CASE WHEN slug = 'spinacia-oleracea' THEN 2 WHEN slug = 'solanum-lycopersicum' THEN 10 WHEN slug = 'strawberry' THEN 5 WHEN common_name = '玉米' THEN 10 WHEN slug = 'camellia' THEN 5 WHEN slug = 'prunus-mume' THEN -5 END,
  CASE WHEN slug = 'spinacia-oleracea' THEN 25 WHEN slug = 'solanum-lycopersicum' THEN 35 WHEN slug = 'strawberry' THEN 30 WHEN common_name = '玉米' THEN 38 WHEN slug = 'camellia' THEN 30 WHEN slug = 'prunus-mume' THEN 35 END,
  CASE WHEN slug = 'spinacia-oleracea' THEN 30 WHEN slug = 'solanum-lycopersicum' THEN 42 WHEN slug = 'strawberry' THEN 35 WHEN common_name = '玉米' THEN 42 WHEN slug = 'camellia' THEN 35 WHEN slug = 'prunus-mume' THEN 38 END,
  CASE WHEN slug = 'spinacia-oleracea' THEN 35 WHEN slug = 'solanum-lycopersicum' THEN 45 WHEN slug = 'strawberry' THEN 40 WHEN common_name = '玉米' THEN 45 WHEN slug = 'camellia' THEN 40 WHEN slug = 'prunus-mume' THEN 42 END,
  CASE
    WHEN slug = 'spinacia-oleracea' THEN '高温和长日照会明显增加抽薹风险。'
    WHEN slug = 'solanum-lycopersicum' THEN '持续高温或低温都会影响授粉坐果。'
    WHEN slug = 'strawberry' THEN '高温闷湿会增加烂果和病害风险。'
    WHEN common_name = '玉米' THEN '抽雄吐丝期遇到干旱和高温会影响授粉。'
    WHEN slug = 'camellia' THEN '花苞期温湿度波动过大容易掉苞。'
    WHEN slug = 'prunus-mume' THEN '冬季过暖会影响休眠和花芽表现。'
  END,

  CASE
    WHEN slug = 'spinacia-oleracea' THEN 'long_day'
    WHEN slug = 'solanum-lycopersicum' THEN 'day_neutral'
    WHEN slug = 'strawberry' THEN 'cultivar_dependent'
    WHEN common_name = '玉米' THEN 'day_neutral'
    WHEN slug = 'camellia' THEN 'unknown'
    WHEN slug = 'prunus-mume' THEN 'unknown'
  END,
  CASE
    WHEN slug = 'spinacia-oleracea' THEN ARRAY['bolting','flowering']
    WHEN slug = 'solanum-lycopersicum' THEN ARRAY['flowering','fruiting']
    WHEN slug = 'strawberry' THEN ARRAY['flower_bud_init','fruiting']
    WHEN common_name = '玉米' THEN ARRAY['flowering','fruiting']
    WHEN slug = 'camellia' THEN ARRAY['flower_bud_init','flowering']
    WHEN slug = 'prunus-mume' THEN ARRAY['flower_bud_init','flowering']
  END,
  CASE
    WHEN slug = 'spinacia-oleracea' THEN 14
    WHEN slug = 'strawberry' THEN NULL
    ELSE NULL
  END,
  CASE
    WHEN slug = 'spinacia-oleracea' THEN 8
    WHEN slug = 'solanum-lycopersicum' THEN 1
    WHEN slug = 'strawberry' THEN 7
    WHEN common_name = '玉米' THEN 1
    WHEN slug = 'camellia' THEN 4
    WHEN slug = 'prunus-mume' THEN 5
  END,
  CASE
    WHEN slug = 'spinacia-oleracea' THEN '菠菜在气温升高、日照变长时容易抽薹。'
    WHEN slug = 'solanum-lycopersicum' THEN '番茄通常按温度和光照强度管理，光周期影响较弱。'
    WHEN slug = 'strawberry' THEN '草莓光周期反应与品种有关，短日照型和日中性型都常见。'
    WHEN common_name = '玉米' THEN '玉米通常按温度、水分和授粉条件管理，光周期不是家庭种植的主要判断点。'
    WHEN slug = 'camellia' THEN '山茶花花芽形成受温度、水分和植株状态影响，光周期信息可后续细化。'
    WHEN slug = 'prunus-mume' THEN '梅花花芽表现与冷凉休眠和后续回温关系更大，光周期信息可后续细化。'
  END,

  CASE WHEN slug IN ('spinacia-oleracea','solanum-lycopersicum') THEN 'annual'
       WHEN slug IN ('strawberry','camellia','prunus-mume') THEN 'perennial'
       WHEN common_name = '玉米' THEN 'annual'
       ELSE NULL END,
  CASE WHEN slug = 'solanum-lycopersicum' THEN 'vine'
       WHEN slug = 'strawberry' THEN 'herb'
       WHEN slug = 'camellia' THEN 'shrub'
       WHEN slug = 'prunus-mume' THEN 'tree'
       WHEN common_name = '玉米' THEN 'herb'
       ELSE 'herb' END,
  CASE WHEN slug = 'spinacia-oleracea' THEN ARRAY['cool_season']
       WHEN slug = 'solanum-lycopersicum' THEN ARRAY['warm_season']
       WHEN slug = 'strawberry' THEN ARRAY['cool_season']
       WHEN common_name = '玉米' THEN ARRAY['warm_season']
       WHEN slug IN ('camellia','prunus-mume') THEN ARRAY['cool_season','year_round']
       ELSE NULL END,
  CASE WHEN common_name = '玉米' THEN false ELSE false END,
  CASE WHEN slug = 'solanum-lycopersicum' THEN true ELSE false END,
  CASE WHEN slug = 'spinacia-oleracea' THEN 7
       WHEN slug = 'solanum-lycopersicum' THEN 7
       WHEN slug = 'strawberry' THEN 8
       WHEN common_name = '玉米' THEN 3
       WHEN slug = 'camellia' THEN 8
       WHEN slug = 'prunus-mume' THEN 7
       ELSE NULL END,
  CASE WHEN slug = 'spinacia-oleracea' THEN 2
       WHEN slug = 'solanum-lycopersicum' THEN 2
       WHEN slug = 'strawberry' THEN 3
       WHEN common_name = '玉米' THEN 1
       WHEN slug = 'camellia' THEN 4
       WHEN slug = 'prunus-mume' THEN 1
       ELSE NULL END,
  CASE WHEN slug = 'spinacia-oleracea' THEN 8
       WHEN slug = 'solanum-lycopersicum' THEN 8
       WHEN slug = 'strawberry' THEN 8
       WHEN common_name = '玉米' THEN 3
       WHEN slug = 'camellia' THEN 7
       WHEN slug = 'prunus-mume' THEN 6
       ELSE NULL END,
  now()
FROM target
ON CONFLICT (species_id)
DO UPDATE SET
  sun_score = EXCLUDED.sun_score,
  air_humidity_score = EXCLUDED.air_humidity_score,
  air_flow_score = EXCLUDED.air_flow_score,
  soil_moisture_score = EXCLUDED.soil_moisture_score,
  soil_aeration_score = EXCLUDED.soil_aeration_score,
  soil_fertility_score = EXCLUDED.soil_fertility_score,
  ph_min = EXCLUDED.ph_min,
  ph_max = EXCLUDED.ph_max,
  ph_sensitivity_score = EXCLUDED.ph_sensitivity_score,
  drought_score = EXCLUDED.drought_score,
  growth_speed_score = EXCLUDED.growth_speed_score,
  disease_risk_score = EXCLUDED.disease_risk_score,
  management_difficulty_score = EXCLUDED.management_difficulty_score,

  best_germ_temp_min = EXCLUDED.best_germ_temp_min,
  best_germ_temp_max = EXCLUDED.best_germ_temp_max,
  optimal_growth_temp_min = EXCLUDED.optimal_growth_temp_min,
  optimal_growth_temp_max = EXCLUDED.optimal_growth_temp_max,
  vigorous_growth_temp = EXCLUDED.vigorous_growth_temp,
  growth_slow_temp = EXCLUDED.growth_slow_temp,
  frost_damage_temp = EXCLUDED.frost_damage_temp,
  lethal_low_temp = EXCLUDED.lethal_low_temp,
  stop_low_temp = EXCLUDED.stop_low_temp,
  stop_high_temp = EXCLUDED.stop_high_temp,
  heat_scorch_temp = EXCLUDED.heat_scorch_temp,
  lethal_high_temp = EXCLUDED.lethal_high_temp,
  temperature_note = EXCLUDED.temperature_note,

  photoperiod_type = EXCLUDED.photoperiod_type,
  photoperiod_trigger_stage = EXCLUDED.photoperiod_trigger_stage,
  critical_day_length_hours = EXCLUDED.critical_day_length_hours,
  photoperiod_sensitivity_score = EXCLUDED.photoperiod_sensitivity_score,
  photoperiod_note = EXCLUDED.photoperiod_note,

  lifecycle = EXCLUDED.lifecycle,
  growth_form = EXCLUDED.growth_form,
  season_type = EXCLUDED.season_type,
  nitrogen_fixing = EXCLUDED.nitrogen_fixing,
  need_trellis = EXCLUDED.need_trellis,
  container_friendly_score = EXCLUDED.container_friendly_score,
  indoor_friendly_score = EXCLUDED.indoor_friendly_score,
  balcony_friendly_score = EXCLUDED.balcony_friendly_score,
  updated_at = now();

COMMIT;
