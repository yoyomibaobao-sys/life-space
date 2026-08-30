-- Expand the three non-plant guide categories into the confirmed two-level
-- public library. Existing project text remains untouched; presets outside the
-- confirmed directory are hidden rather than deleted.

alter table public.guide_entries
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
        'aquarium_animal',
        'crustacean',
        'mollusk_aquatic',
        'mollusk_land',
        'amphibian',
        'reptile',
        'insect',
        'arachnid',
        'bird',
        'backyard_animal',
        'habitat_animal',
        'food_preserve',
        'food_ferment',
        'food_brew'
      )
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
  ('insect_fish', 'aquatic_plants', '水草', 'Aquatic plants', '按光照、水温、种植方式和难度筛选，并记录定植、融叶、新生长和修剪。', 'Filter by light, temperature, growth form, and difficulty; track planting, melt, new growth, and trimming.', 10),
  ('insect_fish', 'fish_crustaceans', '鱼虾蟹', 'Fish, shrimp & crabs', '围绕成熟体型、水体负荷、过滤、兼容、入缸和日常观察建立档案。', 'Build practical profiles around adult size, bioload, filtration, compatibility, introduction, and daily checks.', 20),
  ('insect_fish', 'mollusks', '螺贝', 'Snails & shellfish', '区分陆生与水生对象，记录环境、食物、硬度或钙源、繁殖和清洁。', 'Separate terrestrial and aquatic care while tracking habitat, food, hardness or calcium, breeding, and cleaning.', 30),
  ('insect_fish', 'amphibians', '蛙类', 'Amphibians', '记录水陆环境、温湿度、变态阶段、食物、清洁和个体状态。', 'Track aquatic and terrestrial habitat, temperature, humidity, life stage, feeding, hygiene, and condition.', 40),
  ('insect_fish', 'reptiles', '龟蛇', 'Reptiles', '按准确物种配置温度梯度、光照、躲避、水域或陆域，并记录蜕皮和进食。', 'Use exact species needs for thermal gradients, light, hides, water or land zones, shedding, and feeding.', 50),
  ('insect_fish', 'insects', '虫蝶', 'Insects & butterflies', '围绕寄主、食物、生命周期、羽化或化蛹、温湿度和防逃逸记录。', 'Track host or food, life cycle, emergence or pupation, temperature, humidity, and escape prevention.', 60),
  ('insect_fish', 'arachnids', '蜘蛛', 'Arachnids', '记录物种识别、栖息、湿度、猎食或危害、蜕皮和安全边界。', 'Track identification, habitat, humidity, predation or damage, molting, and safe boundaries.', 70),
  ('insect_fish', 'birds', '鸟类', 'Birds', '区分野外观察与人工照料，记录食物、水源、行为、羽毛、繁殖和环境变化。', 'Separate field observation from captive care; track food, water, behavior, plumage, breeding, and environment.', 80),
  ('insect_fish', 'backyard_animals', '庭院动物', 'Backyard animals', '按物种记录空间、饮水、饲料、粪污、体况、繁殖、防逃和防天敌。', 'Track species-specific space, water, feed, waste, condition, breeding, escape prevention, and predators.', 90)
on conflict (category, slug)
do update set
  name = excluded.name,
  name_en = excluded.name_en,
  summary = excluded.summary,
  summary_en = excluded.summary_en,
  sort_order = excluded.sort_order,
  updated_at = now();

with seed (
  section_slug,
  name,
  name_en,
  content_template,
  sort_order,
  light,
  temperature,
  growth_form,
  difficulty
) as (
  values
    ('aquatic_plants', '莫斯', 'Aquatic moss', 'aquatic_plant', 10, 'low_medium', 'temperate_warm', 'epiphyte', 'easy'),
    ('aquatic_plants', '水榕', 'Anubias', 'aquatic_plant', 20, 'low', 'warm', 'epiphyte', 'easy'),
    ('aquatic_plants', '椒草', 'Cryptocoryne', 'aquatic_plant', 30, 'low_medium', 'warm', 'rooted', 'medium'),
    ('aquatic_plants', '皇冠草', 'Amazon sword', 'aquatic_plant', 40, 'medium', 'temperate_warm', 'rooted', 'easy'),
    ('aquatic_plants', '矮珍珠', 'Dwarf baby tears', 'aquatic_plant', 50, 'medium_high', 'temperate', 'carpet', 'hard'),
    ('aquatic_plants', '牛毛毡', 'Dwarf hairgrass', 'aquatic_plant', 60, 'medium_high', 'temperate_warm', 'carpet', 'medium'),
    ('aquatic_plants', '宫廷草', 'Rotala', 'aquatic_plant', 70, 'medium_high', 'warm', 'stem', 'medium'),
    ('aquatic_plants', '绿菊', 'Green cabomba', 'aquatic_plant', 80, 'medium', 'temperate_warm', 'stem', 'easy'),
    ('aquatic_plants', '红蝴蝶', 'Red butterfly plant', 'aquatic_plant', 90, 'high', 'warm', 'stem', 'hard'),
    ('aquatic_plants', '宝塔草', 'Temple plant', 'aquatic_plant', 100, 'medium_high', 'warm', 'stem', 'medium'),
    ('aquatic_plants', '蜈蚣草', 'Waterweed', 'aquatic_plant', 110, 'low_medium', 'temperate_warm', 'stem_floating', 'easy'),
    ('aquatic_plants', '金鱼藻', 'Hornwort', 'aquatic_plant', 120, 'low_medium', 'cool_warm', 'floating', 'easy'),
    ('aquatic_plants', '狐尾藻', 'Watermilfoil', 'aquatic_plant', 130, 'medium', 'cool_warm', 'stem_floating', 'easy'),
    ('aquatic_plants', '浮萍', 'Duckweed', 'aquatic_plant', 140, 'low_medium', 'cool_warm', 'floating', 'easy'),

    ('fish_crustaceans', '金鱼', 'Goldfish', 'aquarium_animal', 10, null, null, null, null),
    ('fish_crustaceans', '锦鲤', 'Koi', 'aquarium_animal', 20, null, null, null, null),
    ('fish_crustaceans', '孔雀鱼', 'Guppy', 'aquarium_animal', 30, null, null, null, null),
    ('fish_crustaceans', '斗鱼', 'Betta', 'aquarium_animal', 40, null, null, null, null),
    ('fish_crustaceans', '红绿灯鱼', 'Neon tetra', 'aquarium_animal', 50, null, null, null, null),
    ('fish_crustaceans', '原生鱼', 'Native fish', 'aquarium_animal', 60, null, null, null, null),
    ('fish_crustaceans', '海水鱼', 'Marine fish', 'aquarium_animal', 70, null, null, null, null),
    ('fish_crustaceans', '米虾', 'Neocaridina shrimp', 'crustacean', 80, null, null, null, null),
    ('fish_crustaceans', '水晶虾', 'Crystal shrimp', 'crustacean', 90, null, null, null, null),
    ('fish_crustaceans', '螯虾', 'Crayfish', 'crustacean', 100, null, null, null, null),
    ('fish_crustaceans', '螃蟹', 'Crab', 'crustacean', 110, null, null, null, null),

    ('mollusks', '蜗牛', 'Land snail', 'mollusk_land', 10, null, null, null, null),
    ('mollusks', '蛞蝓', 'Slug', 'mollusk_land', 20, null, null, null, null),
    ('mollusks', '田螺', 'Pond snail', 'mollusk_aquatic', 30, null, null, null, null),
    ('mollusks', '苹果螺', 'Apple snail', 'mollusk_aquatic', 40, null, null, null, null),
    ('mollusks', '角螺', 'Horned nerite', 'mollusk_aquatic', 50, null, null, null, null),
    ('mollusks', '洋葱螺', 'Onion snail', 'mollusk_aquatic', 60, null, null, null, null),
    ('mollusks', '河蚌', 'Freshwater mussel', 'mollusk_aquatic', 70, null, null, null, null),
    ('mollusks', '蛤蜊', 'Clam', 'mollusk_aquatic', 80, null, null, null, null),
    ('mollusks', '海螺', 'Marine snail', 'mollusk_aquatic', 90, null, null, null, null),

    ('amphibians', '青蛙', 'Frog', 'amphibian', 10, null, null, null, null),
    ('amphibians', '树蛙', 'Tree frog', 'amphibian', 20, null, null, null, null),
    ('amphibians', '蟾蜍', 'Toad', 'amphibian', 30, null, null, null, null),
    ('amphibians', '蝾螈', 'Salamander', 'amphibian', 40, null, null, null, null),

    ('reptiles', '龟', 'Turtle', 'reptile', 10, null, null, null, null),
    ('reptiles', '蛇', 'Snake', 'reptile', 20, null, null, null, null),
    ('reptiles', '蜥蜴', 'Lizard', 'reptile', 30, null, null, null, null),

    ('insects', '蝴蝶', 'Butterfly', 'insect', 10, null, null, null, null),
    ('insects', '蛾', 'Moth', 'insect', 20, null, null, null, null),
    ('insects', '毛毛虫', 'Caterpillar', 'insect', 30, null, null, null, null),
    ('insects', '蜜蜂', 'Bee', 'insect', 40, null, null, null, null),
    ('insects', '甲虫', 'Beetle', 'insect', 50, null, null, null, null),
    ('insects', '螳螂', 'Mantis', 'insect', 60, null, null, null, null),
    ('insects', '蝗虫', 'Grasshopper', 'insect', 70, null, null, null, null),
    ('insects', '蚂蚁', 'Ant', 'insect', 80, null, null, null, null),
    ('insects', '蝉', 'Cicada', 'insect', 90, null, null, null, null),
    ('insects', '蜻蜓', 'Dragonfly', 'insect', 100, null, null, null, null),
    ('insects', '面包虫', 'Mealworm', 'insect', 110, null, null, null, null),
    ('insects', '黑水虻', 'Black soldier fly', 'insect', 120, null, null, null, null),
    ('insects', '蚯蚓', 'Earthworm', 'insect', 130, null, null, null, null),

    ('arachnids', '蜘蛛', 'Spider', 'arachnid', 10, null, null, null, null),
    ('arachnids', '螨', 'Mite', 'arachnid', 20, null, null, null, null),

    ('birds', '鹦鹉', 'Parrot', 'bird', 10, null, null, null, null),
    ('birds', '鸽子', 'Pigeon', 'bird', 20, null, null, null, null),
    ('birds', '麻雀', 'Sparrow', 'bird', 30, null, null, null, null),
    ('birds', '燕子', 'Swallow', 'bird', 40, null, null, null, null),
    ('birds', '斑鸠', 'Dove', 'bird', 50, null, null, null, null),
    ('birds', '白头鹎', 'Light-vented bulbul', 'bird', 60, null, null, null, null),
    ('birds', '乌鸫', 'Common blackbird', 'bird', 70, null, null, null, null),
    ('birds', '喜鹊', 'Magpie', 'bird', 80, null, null, null, null),
    ('birds', '鹭', 'Heron', 'bird', 90, null, null, null, null),

    ('backyard_animals', '鸡', 'Chicken', 'backyard_animal', 10, null, null, null, null),
    ('backyard_animals', '鸭', 'Duck', 'backyard_animal', 20, null, null, null, null),
    ('backyard_animals', '鹅', 'Goose', 'backyard_animal', 30, null, null, null, null),
    ('backyard_animals', '兔', 'Rabbit', 'backyard_animal', 40, null, null, null, null),
    ('backyard_animals', '鹌鹑', 'Quail', 'backyard_animal', 50, null, null, null, null),
    ('backyard_animals', '羊', 'Sheep', 'backyard_animal', 60, null, null, null, null),
    ('backyard_animals', '猪', 'Pig', 'backyard_animal', 70, null, null, null, null),
    ('backyard_animals', '牛', 'Cattle', 'backyard_animal', 80, null, null, null, null),
    ('backyard_animals', '马', 'Horse', 'backyard_animal', 90, null, null, null, null)
), prepared as (
  select
    seed.*,
    case seed.section_slug
      when 'aquatic_plants' then seed.name || '实操重点：定植方式、光照水温适应、融叶恢复、营养与修剪记录。'
      when 'fish_crustaceans' then seed.name || '实操重点：成体需求、水体承载、过滤成熟、入缸适应和日常状态。'
      when 'mollusks' then seed.name || '实操重点：环境类型、食物与钙源、繁殖控制、清洁和逃逸预防。'
      when 'amphibians' then seed.name || '实操重点：水陆布局、温湿度、食物、清洁、变态或蜕皮阶段。'
      when 'reptiles' then seed.name || '实操重点：准确识别、温度梯度、光照、躲避、饮水和安全管理。'
      when 'insects' then seed.name || '实操重点：寄主或饲料、生命周期、温湿度、羽化与防逃逸。'
      when 'arachnids' then seed.name || '实操重点：识别、栖息、湿度、猎食或危害、蜕皮和接触边界。'
      when 'birds' then seed.name || '实操重点：食物水源、行为、羽毛、繁殖、卫生与环境变化。'
      else seed.name || '实操重点：空间、饮水、饲料、粪污、体况、防逃和防天敌。'
    end as summary,
    case seed.section_slug
      when 'aquatic_plants' then 'Practical focus: planting, light and temperature acclimation, melt recovery, nutrition, and trimming.'
      when 'fish_crustaceans' then 'Practical focus: adult needs, system capacity, mature filtration, introduction, and daily condition.'
      when 'mollusks' then 'Practical focus: habitat type, food and calcium, breeding control, cleaning, and escape prevention.'
      when 'amphibians' then 'Practical focus: land-water layout, temperature, humidity, feeding, hygiene, and life stage.'
      when 'reptiles' then 'Practical focus: exact identification, thermal gradient, light, hides, water, and safe handling.'
      when 'insects' then 'Practical focus: host or feed, life cycle, temperature, humidity, emergence, and escape prevention.'
      when 'arachnids' then 'Practical focus: identification, habitat, humidity, predation or damage, molting, and contact boundaries.'
      when 'birds' then 'Practical focus: food, water, behavior, plumage, breeding, hygiene, and environmental change.'
      else 'Practical focus: space, water, feed, waste, condition, escape prevention, and predators.'
    end as summary_en,
    case
      when seed.section_slug = 'aquatic_plants' then jsonb_build_object(
        'filters', jsonb_strip_nulls(jsonb_build_object(
          'light', seed.light,
          'temperature', seed.temperature,
          'growth_form', seed.growth_form,
          'difficulty', seed.difficulty
        ))
      )
      else '{}'::jsonb
    end as content
  from seed
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
  content,
  sort_order,
  is_active
)
select
  'insect_fish',
  prepared.name,
  public.normalize_guide_name(prepared.name),
  'preset',
  section.id,
  prepared.name_en,
  prepared.summary,
  prepared.summary_en,
  prepared.content_template,
  prepared.content,
  prepared.sort_order,
  true
from prepared
join public.guide_sections section
  on section.category = 'insect_fish'
 and section.slug = prepared.section_slug
on conflict (category, normalized_name)
do update set
  section_id = excluded.section_id,
  name_en = excluded.name_en,
  summary = excluded.summary,
  summary_en = excluded.summary_en,
  content_template = excluded.content_template,
  content = case
    when excluded.content = '{}'::jsonb then public.guide_entries.content
    else excluded.content
  end,
  sort_order = excluded.sort_order,
  is_active = true,
  updated_at = now();

-- Only platform presets are narrowed to the confirmed directory. Reviewed
-- user-created public guides remain available and are never silently removed.
with allowed (category, name) as (
  values
    ('system', '土壤改良'), ('system', '堆肥'),
    ('system', '种植箱'), ('system', '高床'), ('system', '育苗架'),
    ('system', '花架'), ('system', '爬藤架'), ('system', '温室'),
    ('system', '保温棚'), ('system', '遮阳棚'), ('system', '防虫网棚'),
    ('system', '滴灌'), ('system', '雨水收集'), ('system', '蓄水设施'),
    ('system', '排水系统'), ('system', '鱼缸鱼池'), ('system', '水循环过滤'),
    ('system', '鸡舍'), ('system', '鸭舍'), ('system', '兔舍'),
    ('system', '围栏'), ('system', '堆肥箱'),
    ('insect_fish', '莫斯'), ('insect_fish', '水榕'), ('insect_fish', '椒草'),
    ('insect_fish', '皇冠草'), ('insect_fish', '矮珍珠'), ('insect_fish', '牛毛毡'),
    ('insect_fish', '宫廷草'), ('insect_fish', '绿菊'), ('insect_fish', '红蝴蝶'),
    ('insect_fish', '宝塔草'), ('insect_fish', '蜈蚣草'), ('insect_fish', '金鱼藻'),
    ('insect_fish', '狐尾藻'), ('insect_fish', '浮萍'),
    ('insect_fish', '金鱼'), ('insect_fish', '锦鲤'), ('insect_fish', '孔雀鱼'),
    ('insect_fish', '斗鱼'), ('insect_fish', '红绿灯鱼'), ('insect_fish', '原生鱼'),
    ('insect_fish', '海水鱼'), ('insect_fish', '米虾'), ('insect_fish', '水晶虾'),
    ('insect_fish', '螯虾'), ('insect_fish', '螃蟹'),
    ('insect_fish', '蜗牛'), ('insect_fish', '蛞蝓'), ('insect_fish', '田螺'),
    ('insect_fish', '苹果螺'), ('insect_fish', '角螺'), ('insect_fish', '洋葱螺'),
    ('insect_fish', '河蚌'), ('insect_fish', '蛤蜊'), ('insect_fish', '海螺'),
    ('insect_fish', '青蛙'), ('insect_fish', '树蛙'),
    ('insect_fish', '蟾蜍'), ('insect_fish', '蝾螈'),
    ('insect_fish', '龟'), ('insect_fish', '蛇'), ('insect_fish', '蜥蜴'),
    ('insect_fish', '蝴蝶'), ('insect_fish', '蛾'), ('insect_fish', '毛毛虫'),
    ('insect_fish', '蜜蜂'), ('insect_fish', '甲虫'), ('insect_fish', '螳螂'),
    ('insect_fish', '蝗虫'), ('insect_fish', '蚂蚁'), ('insect_fish', '蝉'),
    ('insect_fish', '蜻蜓'), ('insect_fish', '面包虫'),
    ('insect_fish', '黑水虻'), ('insect_fish', '蚯蚓'),
    ('insect_fish', '蜘蛛'), ('insect_fish', '螨'),
    ('insect_fish', '鹦鹉'), ('insect_fish', '鸽子'), ('insect_fish', '麻雀'),
    ('insect_fish', '燕子'), ('insect_fish', '斑鸠'), ('insect_fish', '白头鹎'),
    ('insect_fish', '乌鸫'), ('insect_fish', '喜鹊'), ('insect_fish', '鹭'),
    ('insect_fish', '鸡'), ('insect_fish', '鸭'), ('insect_fish', '鹅'),
    ('insect_fish', '兔'), ('insect_fish', '鹌鹑'), ('insect_fish', '羊'),
    ('insect_fish', '猪'), ('insect_fish', '牛'), ('insect_fish', '马'),
    ('other', '果酱'), ('other', '梅子蜜'), ('other', '果汁'),
    ('other', '腌渍'), ('other', '干制'), ('other', '臭卤菜'),
    ('other', '腐乳'), ('other', '豆豉'), ('other', '豆瓣酱'),
    ('other', '酱油'), ('other', '醋'), ('other', '果酒'),
    ('other', '米酒'), ('other', '其他')
)
update public.guide_entries entry
set is_active = false,
    updated_at = now()
where entry.source = 'preset'
  and entry.category in ('system', 'insect_fish', 'other')
  and not exists (
    select 1
    from allowed
    where allowed.category = entry.category
      and allowed.name = entry.name
  );

comment on constraint guide_entries_content_template_check
  on public.guide_entries is
  'Templates cover practical facilities, aquatic plants, animal groups, and food processes without changing project references.';
