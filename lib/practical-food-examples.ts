import type { PublicGuideContent, PublicGuideLanguage } from "./public-guide-library";

type Pair = readonly [zh: string, en: string];
type Example = {
  overview: Pair;
  parameters: Array<readonly [Pair, Pair]>;
  sections: Array<{ title: Pair; items: Pair[] }>;
  cautions: Pair[];
  sources: NonNullable<PublicGuideContent["sources"]>;
};

// Small, named worked examples. Time/texture are observations, not validated
// shelf-life or pathogen controls. Stored administrator content still wins.
const examples: Record<string, Example> = {
  果酱: {
    overview: ["先做一小瓶冷藏草莓酱，掌握溶糖、煮制和冷盘检查；这里不把热装瓶等同于常温罐藏。", "Start with a small refrigerated strawberry jam and learn dissolving, boiling and cold-plate checks. Hot filling alone is not a canning process."],
    parameters: [
      [["草莓：糖（重量）", "Strawberries : sugar by weight"], ["1：1；去蒂草莓230g＋白砂糖230g", "1:1; 230 g hulled strawberries + 230 g granulated sugar"]],
      [["柠檬汁", "Lemon juice"], ["5mL（1量茶匙）", "5 mL (1 measuring teaspoon)"]],
      [["首次检查", "First setting check"], ["糖溶解后沸煮约5分钟，再用冷盘检查", "Check on a cold plate after about 5 minutes of boiling"]],
    ],
    sections: [
      { title: ["称量与准备", "Weigh and prepare"], items: [
        ["草莓洗净沥干、去蒂后称重，压碎但保留少量果粒；另备干净耐热小瓶、厚底锅和预冷小碟。", "Wash, drain and hull before weighing; crush with some texture. Prepare a clean heat-safe jar, heavy pan and chilled saucer."],
        ["按上方用量加入糖和柠檬汁；这是草莓示例，不把同一比例直接当作所有水果的通用配方。", "Add the measured sugar and lemon juice. These quantities are for strawberries, not a universal fruit formula."],
      ] },
      { title: ["溶糖与煮制", "Dissolve and boil"], items: [
        ["小火搅拌至看不见糖粒，再转大火煮开；用长柄勺沿锅底搅动，防粘锅和热糖浆飞溅。", "Stir over low heat until sugar dissolves, then bring to a rolling boil. Use a long spoon to prevent sticking and splashes."],
        ["沸煮约5分钟后离火取样，尚未凝结则再煮1分钟复测，不靠固定总时长硬熬。", "After about five minutes, take the pan off heat and test; if unset, boil another minute and repeat."],
      ] },
      { title: ["怎样判断合适", "Check the set"], items: [
        ["滴少量酱在冷碟上，冷藏约30秒，再用勺边推开；能起轻微皱纹、划开的沟不立即合拢即可。", "Chill a drop on the saucer for about 30 seconds; push with a spoon. A slight wrinkle and a groove that stays open indicate set."],
        ["只检查冷却的少量样品，不用手接触锅内热酱；软凝固并不要求像硬糖一样立住勺子。", "Test only the cooled sample, never hot jam in the pan. A soft set need not hold a spoon upright."],
      ] },
      { title: ["装瓶与取用", "Pack and use"], items: [
        ["装入洁净耐热容器，标日期并按冷藏食品管理；每次用干净勺取，少量制作尽快用完。", "Use a clean heat-safe container, date it and refrigerate. Serve with clean utensils and use small batches promptly."],
        ["要常温保存，另按经验证的完整罐藏配方及海拔处理时间执行；出现霉点、鼓盖，不撇掉后继续吃。", "Shelf storage requires a complete tested canning recipe with altitude adjustments. Discard moldy or swollen jars, not just the surface."],
      ] },
    ],
    cautions: [["本例借用小批量煮酱方法，保存按冷藏管理；不采用“瓶盖吸住就能放几年”的判断。", "This worked example uses the small-batch cooking method with refrigerated storage, not a multi-year shelf-life claim based on lid suction."]],
    sources: [
      { title: "Camilla Hawkins · Small-batch strawberry jam（配料与凝固检查）", url: "https://www.fabfood4all.co.uk/quick-one-punnet-strawberry-jam/" },
      { title: "NCHFP · Tested jam processing（常温保存须另按完整工艺）", url: "https://nchfp.uga.edu/how/make-jam-jelly/jams/berry-jams-without-pectin/" },
    ],
  },
  果汁: {
    overview: ["以现榨橙汁为例，先处理果皮和器具，再切开榨汁。现榨、加柠檬或冷藏都不等于杀菌。", "For fresh orange juice, clean the fruit exterior and equipment before cutting and pressing. Freshness, lemon or refrigeration is not pasteurization."],
    parameters: [
      [["一次用量", "Batch size"], ["只榨当次需要量；不必加糖或额外兑水", "Press only the amount needed; sugar and water are unnecessary"]],
      [["冷藏温度", "Refrigeration"], ["4℃或以下；用冰箱温度计核对", "4°C or below, checked with an appliance thermometer"]],
      [["室温放置上限", "Time out of refrigeration"], ["不超过2小时；环境高于32℃时不超过1小时", "No more than 2 hours, or 1 hour above 32°C"]],
    ],
    sections: [
      { title: ["洗果与清洁", "Clean first"], items: [
        ["丢弃腐烂果，用流动饮用水清洗橙子表面；即使不吃果皮也要洗，避免切刀把污物带入果肉。", "Discard rotten fruit and rinse the outside under running drinking water, even when discarding the peel."],
        ["洗手，清洁刀、砧板、榨汁头和接汁杯；不要用处理过生肉但尚未清洗的工具。", "Wash hands and clean the knife, board, press and cup; avoid unwashed raw-meat utensils."],
      ] },
      { title: ["榨取与分装", "Press and portion"], items: [
        ["把橙子对半切开后榨汁，滤掉果核，按口感保留果肉；不把掉在台面上的果肉放回杯中。", "Halve and press oranges, strain seeds and retain pulp as desired; keep countertop scraps out."],
        ["用洁净杯直接饮用或立即小份冷藏；旧果汁不倒入新榨的一批。", "Serve in a clean cup or refrigerate portions immediately; never mix old juice into a fresh batch."],
      ] },
      { title: ["保存与清洗", "Store and clean up"], items: [
        ["容器写上榨汁时间，不为囤放而一次榨很多；常温超时的果汁不要靠闻起来正常继续喝。", "Label pressing time and avoid oversized batches; a normal smell does not rescue juice left out too long."],
        ["使用后拆开榨汁器，清除滤网和缝隙中的果肉，按设备说明清洗并晾干。", "Disassemble after use, remove pulp from filters and seams, and wash and dry as directed."],
      ] },
      { title: ["哪些情况要换做法", "When to use treated juice"], items: [
        ["儿童、孕妇、老人及免疫力较弱者优先选择经巴氏杀菌或其他有效处理的果汁。", "Children, pregnant people, older adults and immunocompromised people should choose effectively treated juice."],
        ["需要瓶装长期存放时改用该果汁的验证加工工艺；不能把简单煮热或加糖当作常温保质方案。", "Bottled long-term storage needs a validated juice-specific process, not casual warming or added sugar."],
      ] },
    ],
    cautions: [["以上清洁与冷藏措施降低风险，但不能保证鲜榨果汁无致病菌。", "Cleaning and chilling reduce risk but cannot guarantee pathogen-free fresh juice."]],
    sources: [
      { title: "FDA · Juice safety", url: "https://www.fda.gov/food/buy-store-serve-safe-food/what-you-need-know-about-juice-safety" },
      { title: "FoodSafety.gov · Refrigeration and time limits", url: "https://www.foodsafety.gov/keep-food-safe/4-steps-to-food-safety" },
    ],
  },
  腌渍: {
    overview: ["先用卷心菜乳酸发酵作完整示例；它不同于加醋速腌，不能把蔬菜、盐和水的比例任意互换。", "Use cabbage fermentation as a worked example. It differs from quick vinegar pickling; vegetable, salt and water proportions are not interchangeable."],
    parameters: [
      [["卷心菜与盐", "Cabbage and salt"], ["净菜约2.27kg＋腌渍盐3平量汤匙（每匙15mL）", "About 2.27 kg cabbage + 3 level 15 mL measuring tablespoons of pickling salt"]],
      [["发酵环境", "Fermentation environment"], ["约21–24℃，避直晒", "Approximately 21–24°C, away from direct sun"]],
      [["参考时长", "Reference duration"], ["约3–4周；较凉的16–18℃可能需5–6周", "About 3–4 weeks; around 16–18°C may take 5–6 weeks"]],
    ],
    sections: [
      { title: ["称量、切丝、拌盐", "Weigh, shred and salt"], items: [
        ["去掉坏叶，洗净沥水、去芯切细丝，再称净重；用标准量匙，不用家里的大小饭勺估盐。", "Trim, wash, drain, core and finely shred before weighing. Use measuring spoons rather than assorted cutlery."],
        ["按上方用量拌盐，用干净双手揉拌，压实入食品用发酵容器，使菜汁析出。", "Mix the specified salt through with clean hands, then pack firmly into a food-safe fermenter to draw out juice."],
      ] },
      { title: ["压料与补液", "Submerge and cover"], items: [
        ["用适合食品接触的压重保持菜丝在液面下，容器留出约10–13cm上部空间；盖洁净布或配套排气盖。", "Keep shreds submerged with a food-safe weight; leave roughly 10–13 cm headspace and use a clean cloth or appropriate vented cover."],
        ["汁液不足时，另用约946mL水加1.5平量汤匙腌渍盐，煮沸放凉后补到覆盖；不直接加无盐水稀释。", "If needed, boil and cool 946 mL water with 1.5 level measuring tablespoons of pickling salt before topping up; do not dilute with plain water."],
      ] },
      { title: ["每周检查什么", "Check during fermentation"], items: [
        ["每周检查2–3次温度、液面和异常表面生长，记录日期；不要每天翻拌把空气带进去。", "Check temperature, submersion and abnormal surface growth two or three times weekly and log dates; avoid daily stirring."],
        ["参考时长到了也要核对发酵已完成、持续产气停止及工艺记录，不能只凭尝着酸就结束。", "Verify completion, cessation of continuing fermentation bubbles and process records, not just elapsed time or sour taste."],
      ] },
      { title: ["结束与保存", "Finish and store"], items: [
        ["正常完成后分装冷藏、用洁净工具取食；需常温罐藏时另遵循完整的容器规格与海拔处理流程。", "Refrigerate after normal completion and use clean serving utensils; shelf storage needs the complete jar-size and altitude-specific canning process."],
        ["出现霉毛、黏滑、腐败气味或盐量无法确认时停止食用；不要撇掉或再加盐来补救。", "Stop food use for fuzzy mold, slime, putrid odor or uncertain salt quantities; skimming or adding salt cannot validate the batch."],
      ] },
    ],
    cautions: [["本例只适用于卷心菜；腌渍盐的量匙体积不能直接当成克数，也不适用于肉、鱼、豆腐或所有泡菜。", "This example is for cabbage. Salt spoon-volume is not its weight in grams and the method does not cover meat, fish, tofu or every pickle."]],
    sources: [{ title: "NCHFP / USDA · Sauerkraut quantities and fermentation method", url: "https://nchfp.uga.edu/how/ferment/recipes/sauerkraut/" }],
  },
  米酒: {
    overview: ["这里做甜酒酿：先蒸熟糯米、降温拌曲，再受控保温。酒曲浓度不同，先核对包装，不套用同一个克数。", "This example makes sweet fermented rice: steam, cool, inoculate and incubate under control. Starter strengths differ, so check the package first."],
    parameters: [
      [["糯米与酒曲示例", "Rice and starter example"], ["干糯米500g；若酒曲标注8g配2kg米，则用2g", "500 g dry glutinous rice; use 2 g only when the starter specifies 8 g per 2 kg rice"]],
      [["拌曲／保温", "Inoculation / incubation"], ["米饭降至约35℃拌曲；约30℃保温", "Cool rice to about 35°C to inoculate; incubate around 30°C"]],
      [["观察时间", "Check time"], ["约24–36小时开始检查，按该酒曲说明结束", "Begin checks around 24–36 hours; finish according to that starter's directions"]],
    ],
    sections: [
      { title: ["泡米与蒸饭", "Soak and steam"], items: [
        ["洗净糯米，按酒曲配套做法浸泡至米粒能碾碎，再沥水蒸熟；抽查中间米粒，不能留硬白芯。", "Wash and soak rice as the starter directs until crushable, drain and steam; check central grains for uncooked hard cores."],
        ["备电子秤、探针温度计和洁净发酵盒；容器与工具不沾生水、油污或其他生食物。", "Prepare scales, a probe thermometer and a clean fermenter; avoid untreated water, grease and raw-food contamination."],
      ] },
      { title: ["降温与拌曲", "Cool and inoculate"], items: [
        ["把熟米摊开，实测降至酒曲要求的温度再拌入，不只摸表面觉得不烫就判断内部也降温了。", "Spread cooked rice and measure its temperature before adding starter; a cool surface does not establish a cool center."],
        ["按包装配套用水要求，用放凉的已煮沸饮用水帮助拌匀；不要另加一大瓶水把甜酒酿变成果酒配方。", "Use cooled boiled drinking water in the amount specified by the starter to mix evenly; do not improvise a large extra-water addition."],
      ] },
      { title: ["保温与观察", "Incubate and observe"], items: [
        ["装盒后留排气条件，在约30℃的稳定环境保温，记录入盒时间和米层温度；不用密封玻璃瓶承压。", "Allow venting, incubate steadily around 30°C, and record start time and rice temperature; do not pressurize sealed glass."],
        ["按时查看正常出汁和气味变化，不反复用吃过的勺试味；长异常毛、黑点或发红发黄时整批停止食用。", "Monitor expected liquid and aroma without reused tasting spoons; stop food use for unexpected growth, dark spots or red/yellow discoloration."],
      ] },
      { title: ["及时结束与冷藏", "Finish and refrigerate"], items: [
        ["达到酒曲规定的完成状态后及时结束保温；按生产商建议煮熟，分小份快速降温后冷藏，不一直放在温暖处继续养。", "End incubation at the starter's specified completion point; cook as the manufacturer directs, cool small portions promptly and refrigerate."],
        ["记录制作和冷藏日期，短期用不完就分装冷冻；变质批次不能靠煮熟补救，甜酒酿也可能含酒精。", "Date preparation and refrigeration; freeze portions not needed soon. Cooking does not rescue spoiled batches, and sweet rice wine may contain alcohol."],
      ] },
    ],
    cautions: [["2g酒曲只适用于上述标注浓度，不是所有散曲、酒药或不同品牌的通用剂量；缺少可靠说明时不猜测配比。", "The 2 g dose applies only to the specified labeled strength, not every loose or branded starter. Do not guess without reliable directions."]],
    sources: [
      { title: "安琪 · 甜酒曲8g（接种温度与24–36小时示例）", url: "https://dimsum.angelyeast.com/contents/4297/73341.html" },
      { title: "安琪 · 自制米酒六个关键（用量与异常处理）", url: "https://dimsum.angelyeast.com/contents/4135/82079.html" },
      { title: "FoodSafety.gov · Cooling and refrigeration", url: "https://www.foodsafety.gov/keep-food-safe/4-steps-to-food-safety" },
    ],
  },
  梅子蜜: {
    overview: ["用冷冻青梅做冷藏糖浆：先按重量配好梅和糖，再观察糖液析出。这里的“蜜”指糖浆，不是蜂蜜，也不是要发酵成酒。", "Make a refrigerated syrup from frozen ume: weigh fruit and sugar, then monitor extraction. This is sugar syrup, not honey or an alcoholic fermentation."],
    parameters: [
      [["梅：糖（重量）", "Ume : sugar by weight"], ["1：1；小批量青梅300g＋冰糖300g", "1:1; a small batch uses 300 g ume + 300 g rock sugar"]],
      [["处理与环境", "Preparation and storage"], ["洗净擦干后冷冻一夜；加糖后冷藏", "Wash, dry and freeze overnight; refrigerate after adding sugar"]],
      [["观察起点", "When to check"], ["约6天起检查，按溶糖和出汁判断", "Begin checking around day 6; judge sugar dissolution and extraction"]],
    ],
    sections: [
      { title: ["准备与配比", "Prepare and weigh"], items: [
        ["称青梅300g、冰糖300g；不额外加水，不把冰糖直接换成同重量蜂蜜或大幅减糖。准备食品用冷冻袋或干净容器。", "Weigh 300 g ume and 300 g rock sugar. Add no water; do not swap in honey or substantially reduce sugar. Use a food-safe freezer bag or clean container."],
        ["剔除霉烂、破损果，洗净、去果柄并彻底擦干；整果冷冻一夜，不砸碎梅核。", "Discard moldy or damaged fruit, wash, remove stalks and dry thoroughly. Freeze whole overnight without cracking the stones."],
      ] },
      { title: ["加糖与每日操作", "Add sugar and check daily"], items: [
        ["将冷冻梅与糖装入容器，封好放冰箱冷藏室；用托盘承接可能渗出的汁液。高温天气不搬到阳台晒着催汁。", "Combine frozen fruit and sugar, close and refrigerate on a tray that can catch leaks. Do not accelerate extraction in sun or summer heat."],
        ["每天轻轻翻动，使析出的糖液接触所有梅子；手和取用工具保持清洁，不伸手反复抓取。", "Gently turn the container daily so extracted syrup wets the fruit. Keep hands and utensils clean rather than repeatedly handling the fruit."],
      ] },
      { title: ["完成判断与饮用", "Finish and serve"], items: [
        ["冷冻梅的小批量配方约6天起可检查：糖基本溶解、梅子皱缩、糖液析出后取出果实；梅的大小和冰箱温度会改变所需天数。", "For this small frozen-fruit batch, inspect from about day 6: remove fruit after sugar mostly dissolves and the fruit shrivels. Fruit size and refrigerator temperature affect timing."],
        ["过滤到洁净容器，继续冷藏；饮用时只取当天需要的量再兑饮用水或苏打水，不把稀释液倒回原瓶。", "Strain into a clean container and keep refrigerated. Dilute only the day's serving with drinking or soda water; never return diluted syrup to the original batch."],
      ] },
      { title: ["保存与异常提醒", "Storage and warning signs"], items: [
        ["标记制作和过滤日期，做小批量尽快用；短期用不完就分装冷冻。冷藏不是无限保质，不自行标注常温一年可放。", "Label preparation and straining dates, make small batches and use promptly; freeze portions that will not be used soon. Refrigeration does not establish an indefinite shelf life."],
        ["出现霉点、黏滑、异常酒味或容器持续鼓气时停止食用，不试喝，不靠撇霉或煮沸把异常批次救回来。", "Stop using a batch with mold, slime, unexpected alcoholic odor or persistent gas pressure. Do not taste it or try to rescue it by skimming mold or boiling."],
      ] },
    ],
    cautions: [["梅糖1：1是这个冷藏糖浆示例的配比，不是所有水果、蜂蜜浸渍或常温罐藏的通用安全比例。", "The 1:1 ratio belongs to this refrigerated syrup example, not every fruit, honey infusion or shelf-stable canning method."]],
    sources: [{ title: "Nichirei Foods · 冷冻梅冷藏糖浆（300g梅＋300g冰糖）", url: "https://www.nichireifoods.co.jp/media/8769/" }],
  },
  醋: {
    overview: ["苹果醋分两步：先把果汁发酵成苹果酒，再让醋酸菌在有氧条件下转成醋。两阶段容器、通气和观察方式不同。", "Apple-cider vinegar has two stages: yeast turns juice into cider, then acetic-acid bacteria work with oxygen. Venting and monitoring differ between stages."],
    parameters: [
      [["示例用量", "Example quantities"], ["苹果汁3L；第二阶段加约625mL活性醋种", "3 L apple juice; about 625 mL active vinegar starter in stage two"]],
      [["果酒阶段", "Cider stage"], ["约16–27℃；至少约2周并核对发酵状态", "About 16–27°C; roughly two weeks or more, with fermentation checks"]],
      [["成醋阶段", "Vinegar stage"], ["约27–29℃有利于转化；通常需数周至数月", "About 27–29°C favors conversion; allow weeks to months"]],
    ],
    sections: [
      { title: ["备料与容器", "Ingredients and equipment"], items: [
        ["用不含抑菌防腐剂的苹果汁3L；食品用酿造酵母按该菌种包装剂量，另备来源可靠的活性醋种约625mL。不要用腐烂苹果或自来路不明的菌膜。", "Use 3 L apple juice without fermentation-inhibiting preservatives, food-grade brewing yeast at its labeled dose, and about 625 mL traceable active vinegar starter. Exclude rotten fruit or unidentified cultures."],
        ["清洗消毒食品用玻璃或不锈钢容器，留出起泡空间；准备温度计、气锁和比重计，不使用会被酸腐蚀的金属。", "Clean and sanitize food-safe glass or stainless equipment, leaving foaming space. Prepare a thermometer, airlock and hydrometer; avoid acid-reactive metals."],
      ] },
      { title: ["第一步：先做苹果酒", "Stage one: make cider"], items: [
        ["按酵母要求接种，装气锁排气，在约16–27℃且适合该酵母的稳定环境发酵。记录起始比重，每隔几天复测。", "Pitch as directed, fit an airlock and keep within the yeast's specified range, approximately 16–27°C. Record starting gravity and recheck during fermentation."],
        ["约两周后开始核对是否结束：依所选方法确认比重稳定，不仅凭不冒泡判断；仍产气时不能密闭装瓶。", "Begin checking completion after roughly two weeks. Confirm stable gravity under the chosen method rather than relying only on bubbles; never bottle under pressure during active fermentation."],
      ] },
      { title: ["第二步：接醋种、通气", "Stage two: inoculate and aerate"], items: [
        ["把完成发酵的酒液转离沉淀，再加入醋种。换成宽口容器，液体约占容器2/3，口部用洁净透气布固定并防果蝇；不能继续用密闭方式缺氧养醋。", "Transfer finished cider off sediment and add starter. Use a wide-mouth vessel roughly two-thirds full, secured with clean breathable cloth against fruit flies; acetic fermentation needs air."],
        ["以约27–29℃作为这一阶段的温度参考，避直晒；每周用洁净工具取少量检查并记录。需数周至数月，菌种、酒精度和通气会改变速度。", "Use approximately 27–29°C as a stage-two reference and avoid direct sun. Sample cleanly and log progress weekly; culture, alcohol and aeration can make this take weeks or months."],
      ] },
      { title: ["结束、保存与用途", "Finish, store and use"], items: [
        ["按所选醋种工艺确认转化结束后过滤、装洁净容器并冷藏；有霉毛、异常颜色或腐败气味时整批停止食用，不把它混入下一批。", "Confirm completion using the starter's process, then strain into clean containers and refrigerate. Discard food use of fuzzy mold, abnormal colors or putrid batches; do not seed the next batch with them."],
        ["酸味与家用pH试纸不能得出醋酸百分比。自酿醋酸度未验证时，只按短期冷藏调味用途管理，不能替代安全腌渍或罐藏配方要求的5%标准商品醋。", "Taste and home pH strips do not measure percent acetic acid. Without verified acidity, treat this as a refrigerated condiment, not a substitute for the standardized 5% vinegar in a tested preservation recipe."],
      ] },
    ],
    cautions: [["这里给出的是苹果汁发酵示例，不是“苹果碎＋糖水”任意配比的保质承诺。时间到、变酸或长出菌膜都不能单独证明食品安全。", "This is a juice-based worked example, not a shelf-life promise for arbitrary apple-scrap and sugar-water mixtures. Elapsed time, sourness or a surface culture alone cannot establish safety."]],
    sources: [
      { title: "Revolution Fermentation · Apple-cider vinegar（原料与分阶段操作示例）", url: "https://revolutionfermentation.com/en/blogs/fermented-beverages/apple-cider-vinegar-recipe/" },
      { title: "NC State Extension · Vinegar making（通气与温度）", url: "https://content.ces.ncsu.edu/vinegar-making" },
      { title: "Penn State Extension · Making cider vinegar at home", url: "https://extension.psu.edu/making-cider-vinegar-at-home/" },
      { title: "NCHFP · Pickling acidity requirements", url: "https://nchfp.uga.edu/how/pickle/general-information-pickling/general-information-on-pickling/" },
    ],
  },
  干制: {
    overview: ["以下分开做果干、肉干、熟鱼干和熟虾干。烘干机空气温度不等于食物中心温度，气候潮湿时优先用可控温、持续排湿的设备。", "Use separate methods for fruit, jerky, cooked fish and cooked shrimp. Dryer-air temperature is not food-core temperature; humid climates call for controlled heat and continuous moisture removal."],
    parameters: [
      [["果片烘干空气温度", "Fruit dryer-air temperature"], ["约57–60℃；苹果片通常6–12小时", "About 57–60°C; apple slices often need 6–12 hours"]],
      [["肉干烘干空气温度", "Jerky dryer-air temperature"], ["约63–68℃；先完成肉类加热步骤", "About 63–68°C, after the meat-heating step"]],
      [["熟鱼／熟虾示例", "Cooked fish / shrimp examples"], ["约63℃；鱼碎4–6小时、虾粒约6小时起检查", "About 63°C; inspect fish flakes at 4–6 hours, shrimp pieces around 6 hours"]],
    ],
    sections: [
      { title: ["果干：以苹果片为例", "Fruit: apple-slice example"], items: [
        ["洗净、去核并切成均匀薄片，单层铺开不叠压。有表面水分时可先约63℃烘1小时，再调至57–60℃；总时长通常6–12小时，厚片和潮湿天气更久。", "Wash, core and slice evenly; lay out a single non-overlapping layer. With surface moisture, start around 63°C for one hour, then 57–60°C. Total drying often takes 6–12 hours, longer for thicker or wetter loads."],
        ["抽取最厚片冷却后对折：内部无可见湿点、无汁液挤出。冷却再包装；先少量装透明容器观察回潮，出现冷凝水应重新干燥，长霉则丢弃。", "Cool and bend the thickest test pieces: there should be no visible wet centers or expressed juice. Pack after cooling and monitor for moisture; re-dry condensation-affected fruit, but discard moldy fruit."],
      ] },
      { title: ["肉干：先加热，再干燥", "Jerky: heat before drying"], items: [
        ["以瘦牛肉条为例，去明显脂肪、切不超过约6mm厚；调味腌制放冷藏，不在室温过夜。按可靠肉干工艺先把中心加热至至少71.1℃，禽肉至少74℃，用温度计确认。", "For lean beef strips, trim fat and cut no thicker than about 6 mm; marinate refrigerated. Under a tested jerky process, first heat the center to at least 71.1°C for beef or 74°C for poultry, checked with a thermometer."],
        ["随后立即转入已预热的烘干设备，空气温度约63–68℃，单层排开持续通风；按工艺检查到内部干透。柔软或变硬都不能替代前面的安全加热步骤。", "Immediately transfer to the preheated dryer at about 63–68°C, with strips spaced for airflow. Check dryness using the chosen method; softness or hardness cannot replace the prior heating step."],
      ] },
      { title: ["鱼干：熟鱼碎示例", "Fish: cooked flakes"], items: [
        ["选新鲜、较低脂的鱼，冷藏解冻、去骨；先煮熟或烤熟并确认中心至少63℃。把熟鱼分成小碎片单层摊开，约63℃烘4–6小时起检查，干后应易掰碎。", "Choose fresh lower-fat fish, thaw refrigerated and remove bones. Cook first to at least 63°C internally, then flake and spread in one layer. Dry around 63°C and check from 4–6 hours for a brittle texture."],
        ["这是熟鱼碎的烘干示例，不适用于整条生鱼、低温风干或熏鱼。盐腌不能代替杀菌或杀寄生虫；冷却分装后冷冻保存更稳妥。", "This cooked-flake example does not cover whole raw fish, low-temperature air drying or smoking. Brining is not a pathogen or parasite treatment; portion and freeze after cooling."],
      ] },
      { title: ["虾干：熟虾粒示例", "Shrimp: precooked pieces"], items: [
        ["使用正规熟制、去壳冻虾，冷藏解冻并沥水；每只中等虾切4–5小段，单层铺开，约63℃烘干，约6小时起检查。最大一块切开后内部不应有潮湿中心。", "Use commercially precooked peeled shrimp, thaw refrigerated and drain. Cut medium shrimp into 4–5 pieces, spread in one layer and dry around 63°C; check around six hours, including the largest cut piece for a wet center."],
        ["本示例不把生虾直接低温烘干。成品冷却、分装冷冻；取用只解冻当次需要的量，记录开包日期并避免反复回潮。", "Do not apply this example to raw shrimp placed directly in a low-temperature dryer. Cool, portion and freeze; thaw only what is needed and prevent repeated moisture exposure."],
      ] },
    ],
    cautions: [
      ["果品室外晾晒只适合连续晴朗、干燥且有风的天气，通常需约30℃以上、相对湿度低于60%；防虫网、夜间露水和空气污染也要考虑。阴雨、潮湿、闷热不等于适合晒干，肉鱼虾不要按果干方式露天晒。", "Outdoor fruit drying needs reliably hot, dry, breezy conditions, typically around 30°C or warmer with relative humidity below 60%, plus protection from insects, dew and pollution. Do not sun-dry meat or seafood using fruit methods."],
      ["时长只是开始检查的参考，不保证杀菌或常温保质。家庭没有验证水分活度、包装与工艺时，肉鱼虾干按冷藏短期食物管理、长期冷冻，不用真空包装推定可常温存放。", "Times indicate when to inspect, not sterilization or shelf stability. Without validated water activity, packaging and processing, keep dried meat/seafood refrigerated briefly or frozen; vacuum packing does not establish room-temperature safety."],
    ],
    sources: [
      { title: "Penn State Extension · Dried apples", url: "https://extension.psu.edu/dried-apples/" },
      { title: "MSU Extension · Drying fruits（气候与回潮检查）", url: "https://extension-store.montana.edu/montguides/drying-fruits" },
      { title: "PNW Extension · Making jerky at home safely", url: "https://extension.oregonstate.edu/catalog/pnw-632-making-jerky-home-safely" },
      { title: "FDA · Safe seafood cooking and handling", url: "https://www.fda.gov/food/buy-store-serve-safe-food/selecting-and-serving-fresh-and-frozen-seafood-safely" },
      { title: "Backpacking Chef · Cooked-fish drying example", url: "https://www.backpackingchef.com/dehydrating-fish.html" },
      { title: "Backpacking Chef · Precooked-shrimp drying example", url: "https://www.backpackingchef.com/dehydrating-meat.html" },
    ],
  },
};

export function getPracticalFoodExample(name: string, language: PublicGuideLanguage): PublicGuideContent | null {
  const example = examples[name];
  if (!example) return null;
  const localize = (pair: Pair) => pair[language === "en" ? 1 : 0];
  return {
    overview: localize(example.overview),
    parameters: example.parameters.map(([label, value]) => ({ label: localize(label), value: localize(value) })),
    cycle: null,
    sections: example.sections.map((section) => ({ title: localize(section.title), items: section.items.map(localize) })),
    cautions: example.cautions.map(localize),
    sources: example.sources,
  };
}
