-- Add soil-practice presets without rewriting existing guides, projects, or
-- administrator decisions. Safe to repeat; an approved/hidden name wins.
do $$
begin
  if not exists (
    select 1 from public.guide_sections
    where category = 'system' and slug = 'soil_compost'
  ) then
    raise exception 'Apply the public guide library migrations before soil presets';
  end if;
end;
$$;

with seed (name, name_en, summary, summary_en, content_template, sort_order) as (
  values
    ('沤肥', 'Wet composting', '区别于好氧堆肥；以植物浸液为例说明记录、稀释和卫生边界，不套用于粪污或混合厨余。', 'Distinguish wet decomposition from aerobic composting. A plant-feed example covers logging, dilution, and hygiene, not manure or mixed kitchen waste.', 'compost', 30),
    ('腐叶土', 'Leafmould', '记录落叶来源、湿度与分解程度，分别用于覆盖或基质改良，不把腐叶土当成完整肥料。', 'Record leaf source, moisture, and decay before using leafmould as mulch or a soil conditioner, not a complete fertilizer.', 'compost', 40),
    ('蚯蚓堆肥', 'Worm compost', '用适合的堆肥蚯蚓、湿润垫料和少量投喂管理蚯蚓箱，区分成品与底部渗出液。', 'Manage composting worms with moist bedding and small feeds; distinguish finished compost from bin leachate.', 'compost', 50),
    ('绿肥种植与还田', 'Green manure', '按季节和轮作选择绿肥，在结籽前终止；区分翻入与地表覆盖，并为后茬留出分解时间。', 'Choose green manure for the local season and rotation. Terminate before seed set; distinguish incorporation from surface mulch and allow decomposition before the next crop.', 'soil_improvement', 60),
    ('覆盖与秸秆还田', 'Mulch & straw', '按材料、土壤湿度和作物管理地表覆盖；鲜秸秆翻入与地表覆盖的养分影响不同。', 'Match surface mulch to material, soil moisture, and crop. Fresh straw incorporated into soil affects nutrients differently from surface mulch.', 'soil_improvement', 70),
    ('板结改良', 'Compaction', '先判断结壳、踩踏或硬层，避免湿土作业，再小范围比较覆盖、有机物和适度松土。', 'Identify crusting, traffic damage, or hard layers. Avoid working wet soil and compare mulch, organic matter, and limited loosening in a trial area.', 'soil_improvement', 80),
    ('排水改良', 'Drainage', '记录积水范围与退水时间，先查排水出口和地形；排水问题不能单靠加肥解决。', 'Record pooling and drainage time, then check outlets and ground levels. Adding fertilizer alone cannot solve waterlogging.', 'soil_improvement', 90),
    ('土壤酸碱调整', 'Soil pH', '先检测，再按作物、土质与产品要求小范围调整；不凭黄叶、手感或固定配方改酸碱度。', 'Test first, then trial adjustments for the crop, soil, and product instructions. Yellow leaves, feel, or a universal recipe cannot determine a pH treatment.', 'soil_improvement', 100),
    ('焖烧土堆', 'Burnt earth', '作为传统熏土与火肥方法的辨识和记录条目；不等同于堆肥或生物炭，不提供自行点火操作。', 'Identify and document a traditional burnt-earth practice. It is not compost or controlled biochar; this guide does not give instructions for starting a burn.', 'soil_improvement', 110)
)
insert into public.guide_entries (
  category, name, normalized_name, source, section_id,
  name_en, summary, summary_en, content_template, sort_order, is_active
)
select
  'system', seed.name, public.normalize_guide_name(seed.name), 'preset', section.id,
  seed.name_en, seed.summary, seed.summary_en, seed.content_template, seed.sort_order, true
from seed
join public.guide_sections section
  on section.category = 'system' and section.slug = 'soil_compost'
on conflict (category, normalized_name) do nothing;
