import type { PublicGuideContent, PublicGuideLanguage } from "./public-guide-library";

// Editorial content for system presets. The caller retains administrator-written
// content and never applies these profiles to approved user-created guides.
type Text = readonly [zh: string, en: string];
type SoilGuide = {
  overview: Text;
  parameters: Array<{ label: Text; value: Text }>;
  sections: Array<{ title: Text; items: Text[] }>;
  cautions: Text[];
  sources: Array<keyof typeof references>;
};

// Sources checked on 2026-08-31. Calendar windows from other climates are not
// copied into local planting recommendations.
const references = {
  testing: { title: "UMN Extension · Soil testing", url: "https://extension.umn.edu/garden-and-home/yard-and-garden/gardening-in-minnesota/soil-testing-for-lawns-and-gardens" },
  sampling: { title: "UMN Extension · Soil sampling", url: "https://extension.umn.edu/about/our-stories/news/step-step-lawn-garden-soil-sampling-guide" },
  compost: { title: "EPA · Composting at home", url: "https://www.epa.gov/recycle/composting-home" },
  gardenCompost: { title: "RHS · Composting", url: "https://www.rhs.org.uk/soil-composts-mulches/composting" },
  worms: { title: "NC State Extension · Composting and worm bins", url: "https://content.ces.ncsu.edu/extension-gardener-handbook/2-composting" },
  comfrey: { title: "RHS · Comfrey liquid feed", url: "https://www.rhs.org.uk/advice/grow-your-own/features/making-comfrey-feed" },
  comfreySafety: { title: "Garden Organic · Comfrey use and hygiene", url: "https://www.gardenorganic.org.uk/expert-advice/all-about-comfrey/comfrey" },
  leaves: { title: "RHS · Leafmould", url: "https://www.rhs.org.uk/soil-composts-mulches/leaf-mould" },
  leafUse: { title: "RHS · Making the most of fallen leaves", url: "https://www.rhs.org.uk/advice/grow-your-own/features/making-leafmould" },
  greenManure: { title: "RHS · Green manures", url: "https://www.rhs.org.uk/soil-composts-mulches/green-manures" },
  coverCrops: { title: "UMN Extension · Cover crop selection", url: "https://extension.umn.edu/agriculture/specialty-crops/vegetable-farming/cover-crop-selection-vegetable-growers" },
  mulch: { title: "RHS · Mulches and mulching", url: "https://www.rhs.org.uk/soil-composts-mulches/mulch" },
  organicMatter: { title: "RHS · Using organic matter", url: "https://www.rhs.org.uk/soil-composts-mulches/organic-matter-how-to-use-in-garden" },
  compaction: { title: "UMN Extension · Soil compaction", url: "https://extension.umn.edu/soil-compaction" },
  clay: { title: "RHS · Clay soils", url: "https://www.rhs.org.uk/soil-composts-mulches/clay-soils" },
  drainage: { title: "RHS · Waterlogging and flooding", url: "https://www.rhs.org.uk/soil-composts-mulches/waterlogging-flooding" },
  wetSoil: { title: "RHS · Gardening on wet soils", url: "https://www.rhs.org.uk/soil-composts-mulches/gardening-on-wet-soils" },
  acidity: { title: "RHS · Acidifying soil", url: "https://www.rhs.org.uk/soil-composts-mulches/acidifying-soil" },
  ash: { title: "OSU Extension · Wood ash and soil pH", url: "https://extension.oregonstate.edu/news/sweep-wood-ash-fireplace-garden" },
  smoke: { title: "EPA · Wood smoke and health", url: "https://www.epa.gov/burnwise/wood-smoke-and-your-health" },
  history: { title: "《肥料与健康》· 我国古代农业培肥地力的智慧与启示", url: "https://flyjk.ghs.cn/qk_f/1600419767973/resource/PDF/flyjk-47-2-14.pdf" },
} as const;

const profiles: Record<string, SoilGuide> = {
  土壤改良: {
    overview: ["先诊断，再选择改良方法。堆肥、沤肥、绿肥和排水处理解决的问题不同，不必全部做。", "Diagnose first, then choose a method. Compost, steeped feeds, green manure, and drainage solve different problems."],
    parameters: [
      { label: ["先看", "First checks"], value: ["积水、板结、酸碱度、养分", "Waterlogging, compaction, pH, nutrients"] },
      { label: ["记录单位", "Trial unit"], value: ["一小块处理区＋一块对照区", "A treated patch and an untreated comparison"] },
    ],
    sections: [
      { title: ["先判断问题", "Diagnose"], items: [
        ["雨后标出积水位置和退水时间；土稍干后查看表面结壳、硬层与根系。不同土质或处理历史的区域分开取样，按检测机构要求送检。", "Map pooling and how long it lasts. When soil is workable, inspect crusts, hard layers, and roots. Sample areas with different soil or treatment histories separately, following the lab's instructions."],
        ["板结看“板结改良”，长期积水看“排水改良”，pH异常看“土壤酸碱调整”；不要把黄叶一律当缺肥。", "Use the compaction, drainage, or pH guide for the diagnosed problem. Yellow leaves alone do not establish a nutrient shortage."],
      ] },
      { title: ["选择与复查", "Choose and review"], items: [
        ["有机物补充可选堆肥、腐叶土、蚯蚓堆肥、绿肥种植与还田或覆盖；沤肥浸液不能替代排水和土壤结构改良。", "For organic matter, consider compost, leafmould, worm compost, green manure, or mulch. A liquid feed cannot replace drainage or structural improvement."],
        ["先在试验区只改一个因素，记下材料、用量、面积和日期；下一次大雨及一轮作物生长后与对照区比较。", "Change one factor in the trial patch. Log material, amount, area, and date; compare after the next heavy rain and a crop cycle."],
      ] },
    ],
    cautions: [["疑似污染土、建筑回填土先检测；不要反复叠加肥料或来历不明的土。", "Test suspect or construction-fill soil before use. Avoid repeated additions of fertilizer or unknown soil."]],
    sources: ["testing", "sampling"],
  },
  堆肥: {
    overview: ["以通气、含水和干湿料配比管理好氧堆肥，熟化后再使用。", "Manage an aerobic pile with air, moisture, and a balance of dry and fresh material; cure before use."],
    parameters: [
      { label: ["起步配比", "Starting mix"], value: ["干料∶湿料约2–3∶1（体积）", "Browns:greens about 2–3:1 by volume"] },
      { label: ["含水检查", "Moisture check"], value: ["拧干海绵般湿润，不滴水", "Damp like a wrung-out sponge, not dripping"] },
    ],
    sections: [
      { title: ["配料与建堆", "Build the pile"], items: [
        ["用同一桶量取干叶或碎纸板与果蔬残料，剪碎后混合；底部放较粗干料，位置应能排水并方便翻堆。", "Measure dry leaves or shredded plain cardboard and produce scraps with the same bucket. Chop and mix; use coarse dry material at the base in a drainable, accessible spot."],
        ["新加厨余埋入干料中，不压成湿厚层；翻堆时把外围材料带到内部。太干分次加水，有酸臭先翻松并补干料。", "Bury scraps in dry material without compact wet layers. Turn outer material inward. Add water gradually if dry; loosen and add browns if sour-smelling."],
      ] },
      { title: ["熟化与使用", "Cure and use"], items: [
        ["停止投新料，翻拌后不再明显升温且食物残渣基本分解，再留至少4周熟化；记下停止投料和熟化起始日期。", "Close the batch. Once mixing no longer causes heating and food scraps have decomposed, allow at least four weeks of curing; record both dates."],
        ["成品应松散、气味似土；未分解枝条筛出回堆。先在小块地试用，不把未熟料直接放进育苗盆或贴根埋。", "Look for a crumbly, earthy-smelling product. Return woody remnants to the pile. Trial it in a small bed; keep unfinished material out of seed pots and away from roots."],
      ] },
    ],
    cautions: [["家庭堆肥不能保证杀灭病原和杂草种子；不加宠物粪便、病株、带除草剂残留的材料及肉油乳制品。", "Home piles do not guarantee pathogen or weed-seed destruction. Exclude pet waste, diseased plants, herbicide residues, meat, oils, and dairy."]],
    sources: ["compost", "gardenCompost"],
  },
  沤肥: {
    overview: ["沤制与好氧堆肥不同。这里仅提供聚合草植物浸液的小批量例子，不套用于粪污、饼肥或混合厨余。", "Wet decomposition differs from aerobic composting. This small-batch comfrey-feed example does not apply to manure, oilseed meal, or mixed kitchen waste."],
    parameters: [
      { label: ["本例原料", "This example"], value: ["已确认身份的聚合草叶＋水", "Correctly identified comfrey leaves and water"] },
      { label: ["本例稀释", "Example dilution"], value: ["原液∶水约1∶10，不通用于其他沤肥", "About 1 part liquid to 10 parts water; not a general recipe"] },
    ],
    sections: [
      { title: ["植物浸液示例", "Plant-feed example"], items: [
        ["戴手套剪取聚合草叶，放进专用桶，加水浸没并压住浮叶；标明原料、加水量和日期，放在儿童和宠物碰不到的位置。", "Wear gloves to cut comfrey leaves. Submerge them in a dedicated bucket and weigh them down. Label ingredients, water volume, and date; keep away from children and pets."],
        ["RHS示例约浸3周后使用；稀释后先少量浇试验区土壤并尽快用完。这个时间不是所有原料的腐熟标准。", "The RHS example steeps for about three weeks. Dilute, trial on soil, and use promptly. This timing does not establish maturity for other ingredients."],
      ] },
      { title: ["观察与边界", "Checks and limits"], items: [
        ["浸液会有明显气味；颜色、气味或不再冒泡都不能证明无病原。若异味影响邻居，停止该方法，改用合适的好氧堆肥。", "Expect odor. Color, smell, or a lack of bubbles does not prove pathogen safety. If odor affects neighbors, stop and choose a suitable aerobic method."],
        ["防雨、防虫但不密封加压；不用于生食叶菜，用后洗手；不倒入雨水口或鱼池，剩余液体按当地废弃物要求处理。", "Exclude rain and insects without sealing a pressurized vessel. Keep off salad crops and wash hands after use. Do not discharge into drains or ponds; follow local waste guidance."],
      ] },
    ],
    cautions: [["不制作家庭粪污沤肥，不进入沤肥池；浸液不能饮用，也不能凭固定倍数保证对所有植物安全。", "Do not make manure slurry at home or enter slurry pits. Never drink the liquid; one dilution cannot guarantee safety for every plant."]],
    sources: ["comfrey", "comfreySafety"],
  },
  腐叶土: {
    overview: ["让落叶缓慢分解成保水、改善结构的材料；它通常养分较低，不等同于肥料或普通园土。", "Let leaves decay into a moisture-retaining soil conditioner. Leafmould is generally low in nutrients, not a complete fertilizer or ordinary topsoil."],
    parameters: [
      { label: ["材料", "Material"], value: ["干净落叶，厚硬叶先剪碎", "Clean fallen leaves; shred thick leaves"] },
      { label: ["参考时间", "Time reference"], value: ["约1年可作覆盖，细熟料常需2年或更久", "About a year for mulch; finer material often takes two years or more"] },
    ],
    sections: [
      { title: ["收集与堆放", "Collect and store"], items: [
        ["收集无明显污染的落叶，去掉塑料和杂物；干叶润湿后放入打孔袋或网围，袋口松扎，标注日期。", "Remove litter from clean leaves. Moisten dry leaves and place in perforated bags or a mesh enclosure; loosely close bags and date each batch."],
        ["放在避风处，干燥时补水；厚叶结成板状就轻轻打散。无需追求像热堆肥那样升温。", "Shelter from wind, add moisture when dry, and loosen matted layers. Heating like a hot compost pile is not the goal."],
      ] },
      { title: ["分级使用", "Use by maturity"], items: [
        ["仍看得出叶片的半熟料用于地表覆盖，避开植物茎基；细碎、充分分解的部分再混入适宜基质。", "Use partly decomposed leaves as surface mulch away from stems. Blend only fine, well-decomposed material into suitable growing media."],
        ["记录叶片来源、湿度和使用后排水情况；苗盆先少量试配，不把年份直接当成成熟保证。", "Log leaf source, moisture, and drainage after use. Trial a small potting mix; age alone is not proof of readiness."],
      ] },
    ],
    cautions: [["不使用疑似受除草剂或道路污染的落叶；育苗所需养分和卫生条件仍要单独管理。", "Avoid suspect herbicide or roadside contamination. Manage seedling nutrition and hygiene separately."]],
    sources: ["leaves", "leafUse"],
  },
  蚯蚓堆肥: {
    overview: ["用适合堆肥的蚯蚓处理少量植物残料；保持凉爽、湿润和通气，不把蚯蚓放进发热堆。", "Use composting worms for small amounts of plant scraps. Keep the bin cool, moist, and aerated; never add worms to a heating pile."],
    parameters: [
      { label: ["常用蚯蚓", "Common worm"], value: ["赤子爱胜蚓等堆肥蚯蚓", "Composting worms such as Eisenia fetida"] },
      { label: ["本例温度", "Working temperature"], value: ["约15–25℃，以箱内实测为准", "About 15–25°C; measure inside the bin"] },
    ],
    sections: [
      { title: ["安置与投料", "Set up and feed"], items: [
        ["选遮阴、不会积水的通气箱；铺润湿后挤去余水的碎纸板或落叶垫料，再放入来源明确的堆肥蚯蚓。", "Choose a shaded, ventilated, drainable bin. Add damp, fluffed plain cardboard or leaf bedding and composting worms from a known source."],
        ["少量切碎果蔬残料埋在垫料下，轮换投料位置；上一份基本吃完再加，不按固定日历强行投喂。", "Bury small portions of chopped produce scraps under bedding, changing feeding spots. Wait until the previous portion is mostly consumed before adding more."],
      ] },
      { title: ["异常与收取", "Troubleshoot and harvest"], items: [
        ["蚯蚓集中逃离或箱内发臭时暂停投料，查温度、积水和通气；移到凉处，过湿补干垫料，过干少量喷水。", "Pause feeding if worms flee or the bin smells. Check heat, water, and air; relocate to a cooler spot, add dry bedding if wet, or mist if dry."],
        ["把新料集中一侧，引蚯蚓迁移后分批取另一侧细料；挑出未消化残料，不把底部积液当成已经处理好的肥料。", "Feed one side to encourage migration, then collect finished material from the other in stages. Remove scraps; drainage liquid is not finished vermicompost."],
      ] },
    ],
    cautions: [["不投肉、油、乳制品或宠物粪便；堆肥蚯蚓不放生到野外，也不用野采蚯蚓替代。", "Exclude meat, oil, dairy, and pet waste. Do not release composting worms or substitute wild-collected worms."]],
    sources: ["worms", "compost"],
  },
  绿肥种植与还田: {
    overview: ["绿肥可以先种起来覆盖土壤，再割下还田；还田可翻入表土，也可留在地表分解，不必一律深翻。", "Grow a cover crop, then return its growth to the bed. Incorporation and surface mulching are options; deep digging is not always necessary."],
    parameters: [
      { label: ["选择依据", "Choose by"], value: ["本地季节、下茬作物、空闲时间", "Local season, next crop, available time"] },
      { label: ["翻入后", "After incorporation"], value: ["预留约1个月再播种或定植，并检查分解情况", "Allow about a month before planting and check decomposition"] },
    ],
    sections: [
      { title: ["选种与管理", "Select and grow"], items: [
        ["根据当地播期选适宜绿肥，不照搬国外月份；查下茬作物科属，避免用同科绿肥延续病害。播量按所选品种说明。", "Choose a locally suitable crop and sowing window, not overseas calendar dates. Account for the following crop's family and use the chosen seed's sowing rate."],
        ["记下播种量和覆盖面积，及时管理杂草；准备下茬前割下地上部，尽量避免结籽后变成新的杂草。", "Record seed quantity and area; manage weeds. Terminate before the next crop and avoid viable seed production that creates a weed problem."],
      ] },
      { title: ["割下与还田", "Terminate and return"], items: [
        ["割下后萎蔫、切碎。土壤可操作时可混入表土；少扰动地块可作为地表覆盖，但要确认绿肥不会继续再生。", "Wilt and chop the cut growth. Mix into workable topsoil, or leave as mulch in a low-disturbance bed while checking for regrowth."],
        ["翻入后不要立即播种；到预留时间再查看残体和土壤状态，分解慢则继续等。留覆盖时腾出播种带，并检查蜗牛、蛞蝓。", "Do not sow immediately after incorporation. Recheck residues after the waiting period and allow longer if needed. Clear a sowing strip in mulch and check for slugs."],
      ] },
    ],
    cautions: [["豆科固氮与品种、根瘤菌及条件有关；不能把所有绿肥都当作补氮肥，也不能保证固定天数腐烂完成。", "Legume nitrogen fixation depends on species, rhizobia, and conditions. Not every cover crop adds nitrogen or decomposes on a fixed schedule."]],
    sources: ["greenManure", "coverCrops"],
  },
  覆盖与秸秆还田: {
    overview: ["地表覆盖和翻埋秸秆分开管理。家庭菜地可先用地表覆盖，减少一次翻入大量新鲜秸秆。", "Manage surface mulch separately from incorporated straw. Start with surface cover rather than burying large amounts of fresh straw at once."],
    parameters: [
      { label: ["覆盖参考", "Mulch reference"], value: ["适宜地块约5–7.5厘米，避开茎基", "About 5–7.5 cm where suitable; keep clear of stems"] },
      { label: ["材料检查", "Material check"], value: ["无种籽、污染和疑似除草剂残留", "No viable weed seed or suspect chemical residues"] },
    ],
    sections: [
      { title: ["铺设与还田", "Apply and return"], items: [
        ["先除草，确认土壤湿润但不积水；铺碎秸秆或其他适宜有机覆盖物，给茎基、幼苗和播种行留空。", "Weed first and check soil is moist, not saturated. Spread chopped straw or suitable organic mulch, leaving stems, seedlings, and sowing rows clear."],
        ["若要翻入秸秆，先剪碎、少量试验并留分解期；新鲜高碳材料混入土中可能暂时影响氮供应，不据此盲目追肥。", "For incorporation, chop, trial a small amount, and allow decomposition. Fresh carbon-rich material may temporarily affect nitrogen availability; do not fertilize blindly."],
      ] },
      { title: ["日常检查", "Check the bed"], items: [
        ["浇水后掀开一角，确认水已到土层；久湿、结毡或茎基发软时减少覆盖并改善通气。", "Lift a corner after watering to check the soil received water. Reduce matted or persistently wet cover and improve air around softening stems."],
        ["雨后查看蛞蝓、蜗牛与幼苗缺口；按分解和沉降补料，不把覆盖层越堆越高。", "After rain, inspect for slugs and seedling damage. Top up for decomposition and settling rather than accumulating ever-deeper layers."],
      ] },
    ],
    cautions: [["持续积水、幼苗密集或茎叶怕潮的地块不直接套用厚度；带病或受除草剂污染的秸秆不用。", "Do not apply the reference thickness blindly to waterlogged beds, dense seedlings, or moisture-sensitive crowns. Exclude diseased or herbicide-contaminated straw."]],
    sources: ["mulch", "organicMatter"],
  },
  板结改良: {
    overview: ["先减少踩踏和湿土作业，再处理硬层；反复深翻或随意掺沙并不是通用解法。", "Reduce traffic and wet-soil working before addressing hard layers. Repeated deep digging or adding sand is not a universal remedy."],
    parameters: [
      { label: ["先分清", "Distinguish"], value: ["表面结壳、踩踏压实、天然黏重", "Surface crust, traffic compaction, natural clay"] },
      { label: ["动土条件", "Workability"], value: ["土可松散碎开，不黏工具、不积水", "Soil crumbles rather than sticking or smearing"] },
    ],
    sections: [
      { title: ["定位与处理", "Locate and treat"], items: [
        ["在无主要根系和管线的小处检查阻力深度，比较通道与种植床；先划出固定通道，浇水和采收不再踩进床内。", "In a safe spot clear of major roots and utilities, compare hard-layer depth in paths and beds. Establish permanent paths for watering and harvest."],
        ["等土不黏工具时，小区用园叉轻提松动，不反复粉碎；已有树根处不强行翻动，可改用适宜有机覆盖。", "When soil is workable, gently lift a trial patch with a garden fork rather than pulverizing it. Avoid disturbing established tree roots; consider suitable mulch."],
      ] },
      { title: ["保持与复查", "Maintain and review"], items: [
        ["按土壤状态补充腐熟有机物并保留覆盖；不要凭手感给黏土统一配一个沙土比例。", "Use mature organic matter and cover where appropriate. Do not prescribe a universal sand ratio from soil feel alone."],
        ["记录松动范围与深度，下次雨后比较渗水；若很快恢复积水，转查排水出口或更深土层，不继续加大翻动。", "Log treated area and depth, then compare infiltration after rain. If pooling returns, investigate drainage or deeper layers instead of escalating cultivation."],
      ] },
    ],
    cautions: [["土湿时踩踏、推车或旋耕会加重压实；靠近管线、挡土墙和大树根系时先请专业人员判断。", "Traffic and cultivation on wet soil can worsen compaction. Get professional advice near utilities, retaining structures, or major tree roots."]],
    sources: ["compaction", "clay"],
  },
  排水改良: {
    overview: ["先确认水从哪里来、能流到哪里；堆加肥土或挖一个没有出口的坑，可能让根区更湿。", "Identify incoming water and a viable outlet first. Adding soil or digging an outlet-free pit can leave roots wetter."],
    parameters: [
      { label: ["观察时机", "When to observe"], value: ["降雨中、雨停后、第二天", "During rain, after rain, and the next day"] },
      { label: ["先查", "First checks"], value: ["落水管、堵塞出口、坡向和土层", "Downpipes, blocked outlets, grade, soil layers"] },
    ],
    sections: [
      { title: ["查水路", "Trace the water"], items: [
        ["用照片标出进水、低洼与出水位置，记录多久退水；先清理已有可安全触及的排水口，排除漏水或过量灌溉。", "Photograph incoming water, low spots, and outlets; log drainage time. Clear safely accessible existing outlets and check leaks or excess irrigation."],
        ["土壤仍饱和时避免踩踏与翻挖。若是长期地下水高或无合适出口，考虑适宜高床、抬高种植或耐湿植物。", "Avoid traffic or digging while saturated. For persistently high groundwater or no suitable outlet, consider raised growing areas or wet-tolerant plants."],
      ] },
      { title: ["实施与复查", "Implement and review"], items: [
        ["新沟槽或排水管要先核对地下管线、建筑基础和排水去向；需要工程处理时交给专业人员，不把水转排到邻居地块。", "Before new drains, check utilities, foundations, and a permitted destination. Use professional help for engineering work and do not divert water onto neighboring land."],
        ["下一场雨后按原位置复拍，比较退水时间和根系恢复；土仍湿而叶萎蔫时先查根，不立刻补水施肥。", "Rephotograph the same spots after the next rain and compare drainage and root recovery. Wilting in wet soil calls for a root check, not immediate watering or feeding."],
      ] },
    ],
    cautions: [["污水或来源不明的洪水淹过食用作物时，另做卫生风险处理；本指引不能证明作物可食。", "Assess food-safety risks separately after sewage or unknown floodwater contacts edible crops. This guide does not establish that they are safe to eat."]],
    sources: ["drainage", "wetSoil"],
  },
  土壤酸碱调整: {
    overview: ["先测pH并确认目标植物的需要，再决定是否调整；不按固定日历浇醋水、撒石灰或加硫。", "Measure pH and identify the plant's needs before adjusting. Do not use vinegar, lime, or sulfur on a routine calendar."],
    parameters: [
      { label: ["剂量依据", "Dose depends on"], value: ["检测建议、土质、面积、产品有效含量", "Lab advice, soil, area, product strength"] },
      { label: ["生效速度", "Response time"], value: ["材料与温湿度不同，不追求立刻改变", "Varies with material, moisture, and temperature"] },
    ],
    sections: [
      { title: ["测土与选择", "Test and choose"], items: [
        ["按检测机构要求取样；不同地块分开送检。先确定是偏酸、偏碱还是根系积水等其他问题。", "Sample as directed by the lab, keeping distinct beds separate. Determine whether the issue is pH or another cause such as waterlogged roots."],
        ["需要提高或降低pH时，分别选检测建议的园艺改良材料；按产品标签换算试验区用量，不同时叠加多种调酸调碱材料。", "Use a horticultural amendment recommended for the required direction. Calculate the trial-area dose from its label; avoid stacking different acidifying and liming materials."],
      ] },
      { title: ["施用与复测", "Apply and retest"], items: [
        ["称量并记录材料、含量、面积和日期，均匀施用并避开幼苗；按标签要求等待后在同一取样规则下复测。", "Weigh and log material, strength, area, and date. Apply evenly, protecting seedlings; retest consistently after the label's waiting period."],
        ["硫的作用在低温下较慢，不因短期读数未变就重复加量；不适宜长期改酸的土，可考虑合适基质的容器种植。", "Sulfur works more slowly in cold soil; an unchanged early reading is not a reason to redose. Consider containers with suitable media where lasting acidification is impractical."],
      ] },
    ],
    cautions: [["不使用强酸强碱或来历不明灰渣；草木灰也会改变pH，不能当作所有植物都适用的肥料。", "Avoid strong acids, caustics, or unknown ash. Wood ash changes pH and is not suitable for every plant."]],
    sources: ["acidity", "testing", "ash"],
  },
  焖烧土堆: {
    overview: ["作为传统熏土、火土肥工艺单列记录。它涉及燃烧，不属于微生物堆肥，不建议在家庭庭院制作。", "Record this separately as a traditional burnt-earth practice. It involves combustion, not microbial composting, and is not recommended for home production."],
    parameters: [
      { label: ["指引范围", "Scope"], value: ["传统工艺记录与材料风险判断", "Historical records and material-risk assessment"] },
      { label: ["家庭使用", "Home use"], value: ["不提供点火、焖烧制作流程", "No ignition or smouldering instructions"] },
    ],
    sections: [
      { title: ["先识别材料", "Identify the material"], items: [
        ["保留当地名称、原料来源和工艺记录；熏土、纯草木灰、生物炭并非同一种材料，不能共用一个施用比例。", "Record the local name, feedstock, and process. Burnt earth, wood ash, and biochar are different materials and cannot share one application rate."],
        ["已有成品也要查是否混入煤灰、涂漆木料或垃圾；来源不明时不加入菜地和盆栽。", "Check any existing material for coal ash, painted wood, or waste. Keep unknown material out of food beds and pots."],
      ] },
      { title: ["记录与替代", "Record and consider alternatives"], items: [
        ["不能因经过火烧就认定肥力更高、无病原或适合所有土；有明确成分检测和土检建议后才考虑小区试验。", "Burning does not by itself prove greater fertility, pathogen safety, or universal suitability. Consider a trial only with material analysis and soil-test advice."],
        ["想补有机物可选堆肥、腐叶土或绿肥；需要纠正pH时按土检处理，不用焖烧替代。", "For organic matter, choose compost, leafmould, or green manure. Follow soil-test advice for pH instead of burning."],
      ] },
    ],
    cautions: [["烟尘会影响呼吸健康，余火可引发火灾；不要在室内、棚内、住宅附近或不符合当地用火要求的地方尝试。", "Smoke harms respiratory health and embers can start fires. Do not attempt this indoors, in sheds, near homes, or contrary to local fire requirements."]],
    sources: ["history", "ash", "smoke"],
  },
};

export function getSoilGuideContent(
  name: string,
  language: PublicGuideLanguage,
): PublicGuideContent | null {
  const selected = Object.hasOwn(profiles, name) ? profiles[name] : undefined;
  if (!selected) return null;
  const text = (pair: Text) => pair[language === "en" ? 1 : 0];
  return {
    overview: text(selected.overview),
    parameters: selected.parameters.map(({ label, value }) => ({ label: text(label), value: text(value) })),
    cycle: null,
    sections: selected.sections.map(({ title, items }) => ({ title: text(title), items: items.map(text) })),
    cautions: selected.cautions.map(text),
    sources: selected.sources.map((key) => references[key]),
  };
}
