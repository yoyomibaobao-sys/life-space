-- Expand public related guides from a flat name list into category sections
-- with localized summaries and reusable detail templates. Existing names and
-- approved user guides remain valid project references.

create table if not exists public.guide_sections (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  slug text not null,
  name text not null,
  name_en text,
  summary text,
  summary_en text,
  sort_order integer not null default 1000,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint guide_sections_category_check
    check (category in ('system', 'insect_fish', 'other')),
  constraint guide_sections_slug_check
    check (slug ~ '^[a-z0-9]+(?:_[a-z0-9]+)*$'),
  constraint guide_sections_name_check
    check (char_length(btrim(name)) between 1 and 120),
  unique (category, slug)
);

alter table public.guide_entries
  add column if not exists section_id uuid
    references public.guide_sections(id) on delete set null,
  add column if not exists name_en text,
  add column if not exists summary text,
  add column if not exists summary_en text,
  add column if not exists content_template text not null default 'generic',
  add column if not exists content jsonb not null default '{}'::jsonb,
  add column if not exists content_en jsonb not null default '{}'::jsonb,
  add column if not exists sort_order integer not null default 1000,
  add column if not exists is_active boolean not null default true;

alter table public.guide_entries
  drop constraint if exists guide_entries_content_object_check,
  add constraint guide_entries_content_object_check
    check (jsonb_typeof(content) = 'object' and jsonb_typeof(content_en) = 'object'),
  drop constraint if exists guide_entries_content_template_check,
  add constraint guide_entries_content_template_check
    check (
      content_template in (
        'generic',
        'soil_improvement',
        'compost',
        'facility_structure',
        'facility_climate',
        'facility_water',
        'facility_animal',
        'method_skill',
        'aquatic_plant',
        'aquatic_animal',
        'habitat_animal',
        'food_preserve',
        'food_ferment',
        'food_brew'
      )
    );

create index if not exists guide_sections_category_sort_idx
  on public.guide_sections (category, sort_order, name);
create index if not exists guide_entries_section_sort_idx
  on public.guide_entries (section_id, sort_order, name)
  where is_active = true;
create index if not exists guide_entries_category_active_sort_idx
  on public.guide_entries (category, sort_order, name)
  where is_active = true;

alter table public.guide_sections enable row level security;

revoke all on table public.guide_sections from anon, authenticated;
grant select on table public.guide_sections to anon, authenticated;
grant insert, update, delete on table public.guide_sections to authenticated;
grant all on table public.guide_sections to service_role;

drop policy if exists "guide sections public read" on public.guide_sections;
create policy "guide sections public read"
  on public.guide_sections for select
  to anon, authenticated
  using (true);

drop policy if exists "guide sections admin insert" on public.guide_sections;
create policy "guide sections admin insert"
  on public.guide_sections for insert
  to authenticated
  with check (public.is_app_admin((select auth.uid())));

drop policy if exists "guide sections admin update" on public.guide_sections;
create policy "guide sections admin update"
  on public.guide_sections for update
  to authenticated
  using (public.is_app_admin((select auth.uid())))
  with check (public.is_app_admin((select auth.uid())));

drop policy if exists "guide sections admin delete" on public.guide_sections;
create policy "guide sections admin delete"
  on public.guide_sections for delete
  to authenticated
  using (public.is_app_admin((select auth.uid())));

drop trigger if exists guide_sections_set_updated_at on public.guide_sections;
create trigger guide_sections_set_updated_at
before update on public.guide_sections
for each row execute function public.set_updated_at();

drop trigger if exists guide_entries_set_updated_at on public.guide_entries;
create trigger guide_entries_set_updated_at
before update on public.guide_entries
for each row execute function public.set_updated_at();

-- Anonymous readers only see active library entries. Authenticated readers
-- share one policy so administrators can also inspect inactive entries without
-- creating overlapping permissive SELECT policies for the same role.
drop policy if exists "guide entries public read" on public.guide_entries;
create policy "guide entries public read"
  on public.guide_entries for select
  to anon
  using (is_active = true);

drop policy if exists "guide entries admin read inactive" on public.guide_entries;
drop policy if exists "guide entries authenticated read" on public.guide_entries;
create policy "guide entries authenticated read"
  on public.guide_entries for select
  to authenticated
  using (
    is_active = true
    or public.is_app_admin((select auth.uid()))
  );

insert into public.guide_sections (
  category,
  slug,
  name,
  name_en,
  summary,
  summary_en,
  sort_order
)
values
  (
    'system',
    'soil_compost',
    '土壤与堆肥',
    'Soil & compost',
    '从土壤判断、改良到堆肥制作与成熟使用。',
    'Soil diagnosis and improvement, plus composting from setup to mature use.',
    10
  ),
  (
    'system',
    'facilities',
    '设施',
    'Facilities',
    '覆盖种植结构、环境调节、水循环及庭院动物设施。',
    'Growing structures, climate control, water systems, and backyard-animal facilities.',
    20
  ),
  (
    'system',
    'methods_skills',
    '农法与技能',
    'Methods & skills',
    '覆盖繁殖、保土、节水、轮作和自然农法等可复用方法。',
    'Reusable methods for propagation, soil care, water saving, rotation, and natural growing.',
    30
  ),
  (
    'other',
    'food',
    '美食',
    'Food making',
    '家庭保存、发酵和酿造的批次化记录框架。',
    'Batch-based frameworks for home preservation, fermentation, and brewing.',
    10
  )
on conflict (category, slug)
do update set
  name = excluded.name,
  name_en = excluded.name_en,
  summary = excluded.summary,
  summary_en = excluded.summary_en,
  sort_order = excluded.sort_order,
  updated_at = now();

with seed (
  category,
  section_slug,
  name,
  name_en,
  summary,
  summary_en,
  content_template,
  sort_order
) as (
  values
    ('system', 'soil_compost', '土壤改良', 'Soil improvement', '先判断结构、排水、肥力和酸碱度，再分步改良并跨季节复查。', 'Diagnose structure, drainage, fertility, and pH before improving in stages and reviewing across seasons.', 'soil_improvement', 10),
    ('system', 'soil_compost', '堆肥', 'Composting', '把材料配比、含水、通气、升温和熟化过程变成可复用的批次记录。', 'Turn material balance, moisture, aeration, heating, and curing into a reusable batch record.', 'compost', 20),

    ('system', 'facilities', '种植箱', 'Planter box', '从场地承重、尺寸、排水和材料开始规划可长期维护的种植容器。', 'Plan a maintainable growing container around site load, dimensions, drainage, and materials.', 'facility_structure', 10),
    ('system', 'facilities', '高床', 'Raised bed', '整理高床的尺寸、土层、边框、通道、排水和逐季补充方式。', 'Organize raised-bed dimensions, soil profile, edging, access, drainage, and seasonal renewal.', 'facility_structure', 20),
    ('system', 'facilities', '育苗架', 'Seedling rack', '围绕承重、层距、光照、通风和浇水动线建立育苗空间。', 'Build a seedling area around load, shelf spacing, light, airflow, and watering access.', 'facility_structure', 30),
    ('system', 'facilities', '花架', 'Plant stand', '兼顾展示、承重、防倾倒、接水和日常移动维护。', 'Balance display, load, tip prevention, drainage capture, and routine movement.', 'facility_structure', 40),
    ('system', 'facilities', '爬藤架', 'Trellis', '按作物重量、攀援方式、风载和采收动线选择结构。', 'Choose structure by crop weight, climbing habit, wind load, and harvest access.', 'facility_structure', 50),
    ('system', 'facilities', '温室', 'Greenhouse', '以温度、湿度、光照、通风和极端天气安全为核心运行温室。', 'Run a greenhouse around temperature, humidity, light, ventilation, and severe-weather safety.', 'facility_climate', 60),
    ('system', 'facilities', '保温棚', 'Insulated growing shelter', '记录覆盖层、夜间保温、白天通风和不同位置的温差。', 'Track coverings, nighttime insulation, daytime ventilation, and temperature differences.', 'facility_climate', 70),
    ('system', 'facilities', '遮阳棚', 'Shade structure', '按季节和作物调整遮光率，同时避免长期弱光和闷热。', 'Adjust shade by season and crop while avoiding persistent low light and trapped heat.', 'facility_climate', 80),
    ('system', 'facilities', '防虫网棚', 'Insect-screen structure', '在网目、防虫目标、通风、进出管理和授粉之间取得平衡。', 'Balance mesh size, target pests, ventilation, access management, and pollination.', 'facility_climate', 90),
    ('system', 'facilities', '滴灌', 'Drip irrigation', '从分区、压力、过滤和滴头流量建立可检查的节水灌溉系统。', 'Build an inspectable water-saving system around zones, pressure, filtration, and emitter flow.', 'facility_water', 100),
    ('system', 'facilities', '雨水收集', 'Rainwater harvesting', '记录集水面、首段弃流、过滤、储量、溢流和实际用途。', 'Track catchment, first flush, filtration, storage, overflow, and intended use.', 'facility_water', 110),
    ('system', 'facilities', '蓄水设施', 'Water storage', '按峰值需求、结构承重、水质、遮光、溢流和清洗方式设计储水。', 'Design storage for peak demand, structural load, water quality, light exclusion, overflow, and cleaning.', 'facility_water', 120),
    ('system', 'facilities', '排水系统', 'Drainage system', '先找水的来源和去向，再规划坡度、汇水、过滤、溢流和检修点。', 'Identify water sources and destinations before planning grade, collection, filtration, overflow, and access.', 'facility_water', 130),
    ('system', 'facilities', '鱼缸鱼池', 'Aquarium or pond', '把有效水体、承重、防跌落、循环、溢流和生物需求放在一起设计。', 'Design effective volume, load, fall protection, circulation, overflow, and biological needs together.', 'facility_water', 140),
    ('system', 'facilities', '水循环过滤', 'Water circulation & filtration', '按污染负荷配置机械、生物和必要的化学过滤，并预留维护路径。', 'Size mechanical, biological, and optional chemical filtration for the load and maintenance path.', 'facility_water', 150),
    ('system', 'facilities', '鸡舍', 'Chicken coop', '围绕通风、干燥、栖架、产蛋、防天敌和清粪设计鸡舍。', 'Design around ventilation, dryness, roosting, nesting, predator protection, and manure removal.', 'facility_animal', 160),
    ('system', 'facilities', '鸭舍', 'Duck shelter', '重点处理饮水、潮湿、排水、夜间安全和可清洁地面。', 'Focus on water access, moisture, drainage, nighttime safety, and cleanable flooring.', 'facility_animal', 170),
    ('system', 'facilities', '兔舍', 'Rabbit housing', '结合通风、遮暑、干燥、啃咬、防逃逸和足部保护。', 'Combine ventilation, heat protection, dryness, chewing resistance, escape prevention, and foot care.', 'facility_animal', 180),
    ('system', 'facilities', '围栏', 'Fence', '根据对象的钻缝、攀爬、跳跃、啃咬和天敌风险选择围栏。', 'Choose a barrier for squeezing, climbing, jumping, chewing, and predator risks.', 'facility_animal', 190),
    ('system', 'facilities', '堆肥箱', 'Compost bin', '让堆肥箱兼顾投料、通风、保湿、排液、防动物和取用熟料。', 'Balance loading, aeration, moisture, drainage, animal exclusion, and finished-compost access.', 'compost', 200),

    ('system', 'methods_skills', '嫁接', 'Grafting', '记录砧木、接穗、季节、接口处理、成活和后续管理。', 'Track rootstock, scion, season, union care, survival, and follow-up management.', 'method_skill', 10),
    ('system', 'methods_skills', '高压繁殖', 'Air layering', '围绕枝条选择、环剥、保湿、生根和移栽建立繁殖记录。', 'Track branch selection, girdling, moisture, rooting, and transplanting.', 'method_skill', 20),
    ('system', 'methods_skills', '扦插', 'Cuttings', '记录插穗状态、基质、湿度、温度、发根和移栽缓苗。', 'Track cutting condition, medium, humidity, temperature, rooting, and transplant acclimation.', 'method_skill', 30),
    ('system', 'methods_skills', '免耕', 'No-till', '以覆盖、保土、少扰动和长期土壤观察为核心。', 'Center soil cover, protection, low disturbance, and long-term observation.', 'method_skill', 40),
    ('system', 'methods_skills', '覆盖', 'Mulching', '记录覆盖材料、厚度、保湿、杂草、温度和分解变化。', 'Track mulch material, thickness, moisture, weeds, temperature, and decomposition.', 'method_skill', 50),
    ('system', 'methods_skills', '轮作与混种', 'Rotation & intercropping', '记录作物顺序、伴生关系、病虫变化、空间和养分利用。', 'Track crop sequence, companion relationships, pest change, space, and nutrient use.', 'method_skill', 60),
    ('system', 'methods_skills', '自然农法', 'Natural growing', '以减少扰动、观察生态关系和顺应季节为长期实践框架。', 'Use lower disturbance, ecological observation, and seasonal timing as a long-term practice.', 'method_skill', 70),

    ('insect_fish', null, '水草', 'Aquatic plants', '参照植物种植逻辑，记录物种、光照、水温、水质、底床、定植和修剪。', 'Use a plant-growing framework to track species, light, temperature, water chemistry, substrate, planting, and pruning.', 'aquatic_plant', 10),
    ('insect_fish', null, '鱼虾蟹', 'Fish, shrimp & crabs', '从物种成体需求、水体承载、过滤、兼容性和入缸过程建立档案。', 'Build a profile around adult needs, system capacity, filtration, compatibility, and introduction.', 'aquatic_animal', 20),
    ('insect_fish', null, '螺贝', 'Snails & shellfish', '记录水质、钙与硬度、食物来源、繁殖速度和可能的生态影响。', 'Track chemistry, calcium and hardness, food, reproduction rate, and ecological impact.', 'aquatic_animal', 30),
    ('insect_fish', null, '蛙类', 'Frogs & toads', '兼顾水陆环境、变态阶段、温湿度、食物和野生动物边界。', 'Cover aquatic and terrestrial habitat, metamorphosis, temperature, humidity, diet, and wildlife boundaries.', 'habitat_animal', 40),
    ('insect_fish', null, '龟蛇', 'Turtles & snakes', '先做可靠物种识别，再记录温度梯度、光照、躲避、饮水和安全边界。', 'Identify reliably before tracking thermal gradient, light, shelter, water, and safe boundaries.', 'habitat_animal', 50),
    ('insect_fish', null, '虫蝶', 'Insects & butterflies', '把寄主植物、蜜源、生命周期、出现季节和农药影响一起记录。', 'Track host plants, nectar, life cycle, seasonality, and pesticide effects together.', 'habitat_animal', 60),
    ('insect_fish', null, '蜘蛛', 'Spiders', '通过结网、猎食、栖息位置和季节变化观察庭院捕食者。', 'Observe garden predators through webs, prey, habitat position, and seasonal change.', 'habitat_animal', 70),
    ('insect_fish', null, '鸟类', 'Birds', '记录出现时间、数量、食物、水源、筑巢和干扰因素。', 'Track timing, numbers, food, water, nesting, and disturbance.', 'habitat_animal', 80),
    ('insect_fish', null, '庭院动物', 'Backyard animals', '为庭院常见或饲养动物建立物种、栖息、福利、清洁和互动记录。', 'Build species, habitat, welfare, cleaning, and interaction records for backyard animals.', 'habitat_animal', 90),

    ('other', 'food', '果酱', 'Jam', '记录果实成熟度、糖酸配比、加热、灌装和开封后保存。', 'Track fruit ripeness, sugar-acid balance, heating, filling, and storage after opening.', 'food_preserve', 10),
    ('other', 'food', '梅子蜜', 'Ume honey syrup', '记录梅子状态、糖或蜂蜜比例、析出过程、容器和冷藏管理。', 'Track fruit condition, sugar or honey ratio, extraction, vessel, and refrigerated storage.', 'food_preserve', 20),
    ('other', 'food', '果汁', 'Fruit juice', '围绕原料清洁、榨取、温度、装瓶和短期保存建立批次。', 'Build a batch around cleaning, extraction, temperature, bottling, and short-term storage.', 'food_preserve', 30),
    ('other', 'food', '腌渍', 'Pickling', '固定原料、盐糖酸比例、温度、时间和液面状态。', 'Fix ingredient, salt-sugar-acid ratio, temperature, time, and brine coverage.', 'food_preserve', 40),
    ('other', 'food', '干制', 'Drying', '记录切分厚度、预处理、温湿度、终点含水和防潮保存。', 'Track thickness, pretreatment, temperature and humidity, endpoint dryness, and moisture-proof storage.', 'food_preserve', 50),
    ('other', 'food', '臭卤菜', 'Fermented brine vegetables', '把卤液来源、盐度、温度、投料、气味和表面状态按批记录。', 'Track brine source, salinity, temperature, additions, aroma, and surface condition by batch.', 'food_ferment', 60),
    ('other', 'food', '腐乳', 'Fermented bean curd', '记录豆腐处理、菌种、盐卤、发酵温度、熟成和异常。', 'Track tofu preparation, culture, brine, temperature, maturation, and exceptions.', 'food_ferment', 70),
    ('other', 'food', '豆豉', 'Fermented black beans', '记录豆类、蒸煮、制曲、盐度、发酵和干湿状态。', 'Track beans, cooking, culture development, salinity, fermentation, and moisture.', 'food_ferment', 80),
    ('other', 'food', '豆瓣酱', 'Fermented broad-bean paste', '按原料、曲种、盐水、翻晒、发酵和熟成建立长期批次。', 'Build a long batch around ingredients, culture, brine, sunning and turning, fermentation, and maturation.', 'food_ferment', 90),
    ('other', 'food', '酱油', 'Soy sauce', '记录原料制曲、盐水、发酵熟成、压榨和保存。', 'Track koji preparation, brine, fermentation and maturation, pressing, and storage.', 'food_ferment', 100),
    ('other', 'food', '醋', 'Vinegar', '区分酒精发酵与醋酸发酵阶段，记录温度、通气、酸度和熟成。', 'Separate alcoholic and acetic stages while tracking temperature, aeration, acidity, and maturation.', 'food_ferment', 110),
    ('other', 'food', '果酒', 'Fruit wine', '记录水果、糖度、酵母、主发酵、转桶、熟成和装瓶。', 'Track fruit, sugar, yeast, primary fermentation, racking, maturation, and bottling.', 'food_brew', 120),
    ('other', 'food', '米酒', 'Rice wine', '记录米、蒸煮、曲种、糖化、发酵温度、时间和过滤。', 'Track rice, cooking, starter, saccharification, fermentation temperature and time, and filtering.', 'food_brew', 130),
    ('other', 'food', '其他', 'Other food making', '用原料、配方、过程、批次、保存和安全检查框架整理其他家庭制作。', 'Organize other home food work through ingredients, recipe, process, batch, storage, and safety checks.', 'food_preserve', 140)
)
insert into public.guide_entries (
  category,
  name,
  normalized_name,
  source,
  section_id,
  name_en,
  summary,
  summary_en,
  content_template,
  sort_order,
  is_active
)
select
  seed.category,
  seed.name,
  public.normalize_guide_name(seed.name),
  'preset',
  gs.id,
  seed.name_en,
  seed.summary,
  seed.summary_en,
  seed.content_template,
  seed.sort_order,
  true
from seed
left join public.guide_sections gs
  on gs.category = seed.category
 and gs.slug = seed.section_slug
on conflict (category, normalized_name)
do update set
  section_id = excluded.section_id,
  name_en = excluded.name_en,
  summary = excluded.summary,
  summary_en = excluded.summary_en,
  content_template = excluded.content_template,
  sort_order = excluded.sort_order,
  is_active = true,
  updated_at = now();

-- Keep earlier presets visible and place the ones that clearly belong to the
-- new framework into the nearest section. Names already used by projects are
-- intentionally not renamed or deleted.
update public.guide_entries entry
set section_id = gs.id,
    content_template = case
      when entry.name in ('温室/小棚', '补光灯') then 'facility_climate'
      when entry.name in ('育苗盒') then 'facility_structure'
      when entry.name in ('鱼菜共生', '水培', '半水培', '无土栽培') then 'facility_water'
      else entry.content_template
    end,
    updated_at = now()
from public.guide_sections gs
where entry.category = 'system'
  and gs.category = 'system'
  and gs.slug = 'facilities'
  and entry.name in ('温室/小棚', '补光灯', '育苗盒', '鱼菜共生', '水培', '半水培', '无土栽培');

update public.guide_entries entry
set section_id = gs.id,
    content_template = 'food_preserve',
    updated_at = now()
from public.guide_sections gs
where entry.category = 'other'
  and gs.category = 'other'
  and gs.slug = 'food'
  and entry.name = '食物保存';

update public.guide_entries
set content_template = case
      when name in ('孔雀鱼', '斗鱼', '红绿灯鱼', '米虾', '蜗牛') then 'aquatic_animal'
      when name in ('瓢虫', '蚜虫', '白粉虱') then 'habitat_animal'
      else content_template
    end,
    updated_at = now()
where category = 'insect_fish';

comment on table public.guide_sections is
  'Public guide-library sections nested below the top-level archive categories.';
comment on column public.guide_entries.content_template is
  'Reusable detail-page template. Per-entry JSON content can override the template.';
comment on column public.guide_entries.content is
  'Optional Chinese structured content overrides for the public guide detail page.';
comment on column public.guide_entries.content_en is
  'Optional English structured content overrides for the public guide detail page.';
