import type { ArchiveCategory } from "@/lib/archive-categories";

export type PublicGuideLanguage = "zh" | "en";

export type PublicGuideSection = {
  id: string;
  category: ArchiveCategory;
  slug: string;
  name: string;
  name_en?: string | null;
  summary?: string | null;
  summary_en?: string | null;
  sort_order?: number | null;
};

export type PublicGuideEntry = {
  id: string;
  category: ArchiveCategory;
  name: string;
  name_en?: string | null;
  source: "preset" | "approved";
  section_id?: string | null;
  summary?: string | null;
  summary_en?: string | null;
  content_template?: string | null;
  content?: unknown;
  content_en?: unknown;
  sort_order?: number | null;
  is_active?: boolean | null;
};

export type PublicGuideParameter = {
  label: string;
  value: string;
};

export type PublicGuideStage = {
  label: string;
  duration: string;
  note?: string;
};

export type PublicGuideCycle = {
  title: string;
  total: string;
  note?: string;
  stages: PublicGuideStage[];
};

export type PublicGuideContentSection = {
  title: string;
  intro?: string;
  items: string[];
};

export type PublicGuideContent = {
  parameters: PublicGuideParameter[];
  cycle?: PublicGuideCycle | null;
  sections: PublicGuideContentSection[];
  cautions: string[];
};

type RawGuideContent = Partial<PublicGuideContent>;

export const publicGuideCopy = {
  zh: {
    publicLibrary: "公共对应指引",
    newProject: "新建项目",
    searchPlaceholder: "搜索对应指引",
    notice:
      "平台预设指引直接公开。你新增的对应指引可立即用于自己的项目；达到使用量后进入管理员审核，通过后加入公共指引库。",
    loading: "加载中…",
    noMatch: "没有匹配的公共指引。",
    empty: "这个板块暂时还没有公共指引。",
    otherGuides: "其他公开指引",
    preset: "平台预设",
    approved: "已审核公开",
    open: "打开指引",
    overview: "概要",
    keyParameters: "关键参考",
    referenceCycle: "参考周期",
    cautions: "注意事项",
    back: "返回指引",
    notFound: "没有找到这条指引，或它暂时未公开。",
    contentPending: "这条公共指引已建立，详细内容仍在持续补充。",
    frameworkNote: "以下为通用起步框架，具体参数应结合物种、材料、环境和当地规范调整。",
  },
  en: {
    publicLibrary: "Public related guides",
    newProject: "New project",
    searchPlaceholder: "Search related guides",
    notice:
      "Platform presets are public. A guide name you add can be used in your own project immediately; commonly used names enter administrator review before becoming public.",
    loading: "Loading…",
    noMatch: "No matching public guides.",
    empty: "There are no public guides in this section yet.",
    otherGuides: "Other public guides",
    preset: "Platform preset",
    approved: "Approved public guide",
    open: "Open guide",
    overview: "Overview",
    keyParameters: "Key references",
    referenceCycle: "Reference cycle",
    cautions: "Important notes",
    back: "Back to Guides",
    notFound: "This guide could not be found or is not currently public.",
    contentPending: "This public guide exists, and detailed content is still being developed.",
    frameworkNote: "This is a general starting framework. Adjust it for the species, materials, environment, and local requirements.",
  },
} as const;

function localizedText(
  language: PublicGuideLanguage,
  zh?: string | null,
  en?: string | null,
) {
  if (language === "en") return en?.trim() || zh?.trim() || "";
  return zh?.trim() || en?.trim() || "";
}

export function getPublicGuideName(
  entry: Pick<PublicGuideEntry, "name" | "name_en">,
  language: PublicGuideLanguage,
) {
  return localizedText(language, entry.name, entry.name_en);
}

export function getPublicGuideSummary(
  entry: Pick<PublicGuideEntry, "summary" | "summary_en">,
  language: PublicGuideLanguage,
) {
  return localizedText(language, entry.summary, entry.summary_en);
}

export function getPublicGuideSectionName(
  section: Pick<PublicGuideSection, "name" | "name_en">,
  language: PublicGuideLanguage,
) {
  return localizedText(language, section.name, section.name_en);
}

export function getPublicGuideSectionSummary(
  section: Pick<PublicGuideSection, "summary" | "summary_en">,
  language: PublicGuideLanguage,
) {
  return localizedText(language, section.summary, section.summary_en);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function parseParameters(value: unknown): PublicGuideParameter[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item): PublicGuideParameter | null => {
      if (!isRecord(item)) return null;
      const label = text(item.label);
      const itemValue = text(item.value);
      return label && itemValue ? { label, value: itemValue } : null;
    })
    .filter((item): item is PublicGuideParameter => item !== null);
}

function parseSections(value: unknown): PublicGuideContentSection[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!isRecord(item)) return null;
      const title = text(item.title);
      const intro = text(item.intro);
      const items = Array.isArray(item.items)
        ? item.items.map(text).filter(Boolean)
        : [];
      if (!title || items.length === 0) return null;
      return intro ? { title, intro, items } : { title, items };
    })
    .filter((item): item is PublicGuideContentSection => item !== null);
}

function parseCycle(value: unknown): PublicGuideCycle | null {
  if (!isRecord(value)) return null;
  const title = text(value.title);
  const total = text(value.total);
  const note = text(value.note);
  const stages = Array.isArray(value.stages)
    ? value.stages
        .map((item): PublicGuideStage | null => {
          if (!isRecord(item)) return null;
          const label = text(item.label);
          const duration = text(item.duration);
          const stageNote = text(item.note);
          if (!label || !duration) return null;
          return stageNote ? { label, duration, note: stageNote } : { label, duration };
        })
        .filter((item): item is PublicGuideStage => item !== null)
    : [];
  if (!title || !total || stages.length === 0) return null;
  return { title, total, note: note || undefined, stages };
}

function parseGuideContent(value: unknown): RawGuideContent {
  if (!isRecord(value)) return {};
  const cautions = Array.isArray(value.cautions)
    ? value.cautions.map(text).filter(Boolean)
    : [];
  return {
    parameters: parseParameters(value.parameters),
    cycle: parseCycle(value.cycle),
    sections: parseSections(value.sections),
    cautions,
  };
}

function zhTemplates(name: string): Record<string, PublicGuideContent> {
  const recurringCycle = (title: string, total: string, stages: PublicGuideStage[]): PublicGuideCycle => ({
    title,
    total,
    stages,
    note: "周期受材料、温度、物种和管理方式影响，以实际观察记录为准。",
  });

  return {
    generic: {
      parameters: [
        { label: "适用对象", value: "按具体项目确认" },
        { label: "起步原则", value: "先小规模验证，再逐步调整" },
        { label: "记录重点", value: "设置、变化、结果与异常" },
      ],
      sections: [
        { title: "开始前", items: ["明确使用场景、目标与可维护的规模。", "记录现有条件，保留可比较的起点。"] },
        { title: "实施与观察", items: ["一次只改变少量关键变量。", "连续记录结果，再决定是否扩大或调整。"] },
      ],
      cautions: ["本页是通用框架；涉及食品、动物、结构安全或当地法规时，应采用更严格的专业要求。"],
    },
    soil_improvement: {
      parameters: [
        { label: "先做判断", value: "质地、排水、板结、酸碱度与有机质" },
        { label: "改良方式", value: "有机质、覆盖、排水或结构调整" },
        { label: "观察周期", value: "按季节持续复查" },
      ],
      sections: [
        { title: "土壤诊断", items: ["观察雨后积水、干后开裂、根系伸展和土壤气味。", "先确认问题是结构、肥力、酸碱度还是盐分，避免只靠加肥解决。"] },
        { title: "分步改良", items: ["先小区试验，再逐步加入腐熟有机质或调整排水。", "保持地表覆盖，减少裸土冲刷、暴晒和水分剧烈波动。"] },
        { title: "持续记录", items: ["记录投入材料、用量、日期、作物表现和土壤变化。", "以一季到数季的结果判断，不追求一次完成。"] },
      ],
      cautions: ["不要把未腐熟材料大量埋入根区。", "石灰、硫磺和高盐肥料应依据检测和作物需求谨慎使用。"],
    },
    compost: {
      parameters: [
        { label: "材料", value: "含碳干料与含氮湿料搭配" },
        { label: "状态", value: "湿润但不滴水，并保持通气" },
        { label: "成熟判断", value: "温度回落、气味土香、原料难辨认" },
      ],
      cycle: recurringCycle("一次堆肥参考", "通常数周至数月", [
        { label: "建堆", duration: "第 1 天" },
        { label: "升温分解", duration: "约 1–3 周" },
        { label: "熟化", duration: "约 1–3 个月" },
      ]),
      sections: [
        { title: "建堆", items: ["把大块材料切小，干湿材料分层混合。", "堆体要能保湿，也要留有空气通道。"] },
        { title: "过程管理", items: ["过干时少量补水，发臭或过湿时加入干料并翻动。", "记录温度、气味、含水状态和翻堆时间。"] },
        { title: "使用", items: ["完全熟化后再用于育苗、盆栽或贴近根系的位置。", "新配方先少量试用，观察植物反应。"] },
      ],
      cautions: ["病株、来源不明的化学处理材料和含有害物的废料不要进入家庭堆肥。", "厨余堆肥要防渗漏、异味和动物翻找。"],
    },
    facility_structure: {
      parameters: [
        { label: "场地", value: "日照、承重、通道与排水" },
        { label: "尺寸", value: "以够得到、能维护为准" },
        { label: "材料", value: "耐候、无明显污染、便于更换" },
      ],
      sections: [
        { title: "规划", items: [`先确定${name}服务的作物、位置和使用频率。`, "预留浇水、排水、清洁、修剪和搬运空间。"] },
        { title: "安装", items: ["检查地面或墙体承重，设置稳定连接和防倾倒措施。", "让接触水土的部位可排水、可检查、可替换。"] },
        { title: "维护", items: ["按季节检查松动、锈蚀、开裂、积水和遮挡。", "记录尺寸、材料、成本和每次调整，便于下次复用。"] },
      ],
      cautions: ["阳台、屋顶、墙体和高处设施应先确认承重与坠落风险。", "儿童和动物可接触区域避免尖角、夹缝和不稳固结构。"],
    },
    facility_climate: {
      parameters: [
        { label: "核心监测", value: "温度、湿度、光照与通风" },
        { label: "安全", value: "抗风、排水、固定与应急开启" },
        { label: "管理", value: "白天夜间分别观察" },
      ],
      sections: [
        { title: "选型与布局", items: [`根据${name}的季节目标决定覆盖材料、开口和高度。`, "避免只保温不通风，也避免遮挡后长期光照不足。"] },
        { title: "运行", items: ["设置温湿度计，在不同位置和时段比较。", "用通风、遮阳、保温和浇水分步调整，记录每次变化。"] },
        { title: "季节检查", items: ["大风、暴雨、降雪或高温前检查固定、排水和开启机构。", "闲置期清洁覆盖材料并修补破损。"] },
      ],
      cautions: ["封闭空间可能迅速升温，不能只依据室外温度判断。", "大型或承重设施应符合当地建筑、消防和物业要求。"],
    },
    facility_water: {
      parameters: [
        { label: "先算需求", value: "来源、峰值用量与储存量" },
        { label: "关键节点", value: "过滤、溢流、排空与防回流" },
        { label: "维护", value: "定期查漏、清淤和冲洗" },
      ],
      sections: [
        { title: "水路规划", items: [`画出${name}的进水、储存、使用、溢流和排空路径。`, "让阀门、过滤器和易堵位置能够直接检查。"] },
        { title: "安装与试运行", items: ["先低压、短时测试，再逐段检查渗漏和流量。", "设置溢流去向，避免水进入地基、邻居区域或电气设备。"] },
        { title: "记录与维护", items: ["记录用水量、水位、压力、过滤状态和异常。", "季节变化、停用或低温前完成排空、防冻和清洁。"] },
      ],
      cautions: ["蓄水和开放水体应防儿童、动物跌落及蚊虫孳生。", "食用、饮用或动物用水须按相应卫生标准处理，不能只凭外观判断。"],
    },
    facility_animal: {
      parameters: [
        { label: "基本条件", value: "空间、通风、干燥、遮蔽与饮水" },
        { label: "防护", value: "防逃逸、防天敌、便于隔离" },
        { label: "清洁", value: "粪污、垫料、食具和排水可管理" },
      ],
      sections: [
        { title: "布局", items: [`先按动物种类、数量和行为设计${name}，不以最低尺寸作为长期目标。`, "把休息、饮水、采食、活动、产蛋或躲藏区域分开考虑。"] },
        { title: "日常检查", items: ["每天看饮水、采食、排泄、精神和设施破损。", "准备隔离空间，新增或患病动物不要直接混群。"] },
        { title: "环境管理", items: ["保持通风但避免直接穿堂风，及时更换潮湿垫料。", "记录清洁、消毒、维修、异常和动物变化。"] },
      ],
      cautions: ["饲养密度、动物福利、疫病防控和粪污处理应遵守当地规定。", "围栏和舍体要同时考虑钻缝、攀爬、啃咬和天敌进入。"],
    },
    method_skill: {
      parameters: [
        { label: "目标", value: "先明确繁殖、保土、节水或降低扰动" },
        { label: "适用条件", value: "物种、季节、材料和场地" },
        { label: "验证", value: "小范围试做，记录成活与后续管理" },
      ],
      sections: [
        { title: "选方法", items: [`先确认${name}解决的具体问题，以及失败时可接受的成本。`, "把时间、材料、工具和后续维护一起纳入方案。"] },
        { title: "分步实施", items: ["先在少量对象上试做，保留对照并记录日期、天气和操作细节。", "一次只调整一个关键步骤，避免结果无法比较。"] },
        { title: "复盘推广", items: ["记录成活、产量、土壤或生态变化，以及额外维护时间。", "只有在多个批次表现稳定后，再扩大到更多项目。"] },
      ],
      cautions: ["嫁接、压条、扦插等操作要使用清洁工具并保护切口；免耕和自然农法也需要持续观察，而不是完全不管理。", "涉及大型机械、药剂或公共绿地时，应遵守安全和当地规定。"],
    },
    aquatic_plant: {
      parameters: [
        { label: "光照", value: "按物种由弱到强逐步适应" },
        { label: "水温", value: "先确认物种适温范围" },
        { label: "水质", value: "稳定优先，关注酸碱度、硬度和营养盐" },
        { label: "底床与营养", value: "根系型与附生型分别设置" },
      ],
      cycle: recurringCycle("定植与稳定参考", "约 1–3 个月进入稳定观察", [
        { label: "缓苗适应", duration: "约 7–21 天" },
        { label: "新根新叶", duration: "约 2–6 周" },
        { label: "稳定生长", duration: "约 1–3 个月" },
      ]),
      sections: [
        { title: "定植", items: ["先确认是沉水、浮叶、挺水还是附生水草，再决定水深和固定方式。", "去除腐烂部位，少量分株，避免一次塞得过密。"] },
        { title: "光、水与营养", items: ["光照从较低强度开始，观察新叶和藻类后再调整。", "保持水温和水质稳定，施肥、二氧化碳和换水一次只改一个变量。"] },
        { title: "修剪与记录", items: ["记录融叶、新芽、根系、藻类和修剪后的恢复。", "过密时分批修剪，及时移走腐败叶片。"] },
      ],
      cautions: ["不同水草差异很大，不能用一套光照、温度和施肥参数覆盖全部物种。", "不要随意把外来水草或修剪物排入自然水体。"],
    },
    aquatic_animal: {
      parameters: [
        { label: "先确认", value: "物种、成体体型、群居性与兼容性" },
        { label: "水环境", value: "温度、溶氧、氨氮/亚硝酸盐与酸碱度" },
        { label: "系统能力", value: "有效水体、过滤、循环与停电预案" },
      ],
      cycle: recurringCycle("入缸与稳定参考", "先完成系统稳定，再逐步增加生物量", [
        { label: "空系统测试", duration: "至少数日" },
        { label: "隔离观察", duration: "按物种与来源决定" },
        { label: "逐步合缸", duration: "分批进行" },
      ]),
      sections: [
        { title: "物种与环境", items: [`为${name}查明成体大小、温度、水质、食性和群居要求。`, "按成体和系统承载力规划，不以幼体大小估算长期密度。"] },
        { title: "建立系统", items: ["过滤和水循环先稳定运行，确认溶氧与含氮废物处理能力。", "新增个体先隔离观察，合缸时逐步适应温度和水质。"] },
        { title: "日常记录", items: ["记录水温、水质、进食、排泄、行为、蜕壳或繁殖。", "异常时先查水质、设备和近期变化，不盲目叠加药物。"] },
      ],
      cautions: ["不要把饲养个体、卵、幼体或水体排入自然环境。", "用药、盐度和温度处理必须核对具体物种耐受性。"],
    },
    habitat_animal: {
      parameters: [
        { label: "对象", value: "先做物种识别，再决定观察或照护" },
        { label: "栖息条件", value: "温湿度、光照、躲避、食物与水" },
        { label: "记录方式", value: "时间、地点、数量、行为与环境变化" },
      ],
      sections: [
        { title: "识别与边界", items: [`记录${name}的外形、行为和出现环境，避免只凭单张照片下结论。`, "优先观察自然状态，不随意捕捉、转移、投喂或干预。"] },
        { title: "营造栖息地", items: ["保留水源、落叶、原生植物、躲避处和连续通道。", "减少广谱农药、强光和频繁扰动，观察变化后再调整。"] },
        { title: "长期观察", items: ["固定时间和路线记录数量、活动、繁殖或迁徙。", "把天气、植物物候和管理动作一起记录，便于发现关联。"] },
      ],
      cautions: ["野生动物、受保护物种和可能有毒或攻击性的动物应保持距离，并遵守当地规定。", "无法可靠识别时不要触摸、食用或自行处置。"],
    },
    food_preserve: {
      parameters: [
        { label: "原料", value: "新鲜、完整、可追溯" },
        { label: "关键控制", value: "清洁、配比、酸度/盐糖、温度与时间" },
        { label: "批次记录", value: "日期、重量、配方、容器和储存条件" },
      ],
      cycle: recurringCycle("一批制作参考", "按配方与保存方式决定", [
        { label: "准备", duration: "当天" },
        { label: "加工", duration: "按工艺" },
        { label: "冷却或静置", duration: "按配方" },
        { label: "储存复查", duration: "持续" },
      ]),
      sections: [
        { title: "配方与准备", items: [`制作${name}前固定原料重量、容器容量和配方来源。`, "清洗双手、工具和容器，剔除霉变、腐败和来源不明的原料。"] },
        { title: "过程控制", items: ["温度、时间、盐糖比例或酸度按可靠配方执行，不凭口感随意降低关键用量。", "分装、冷却和密封过程避免二次污染。"] },
        { title: "保存记录", items: ["标注制作日期、批次、开封日期和保存方式。", "出现胀气、漏液、霉变、异常气味或质地时停止食用。"] },
      ],
      cautions: ["低酸罐藏、真空密封和常温长期保存存在严重食品安全风险，应采用经验证的工艺。", "不能仅靠闻味、尝味判断食品是否安全。"],
    },
    food_ferment: {
      parameters: [
        { label: "原料与菌种", value: "来源清楚、配方明确" },
        { label: "过程", value: "盐度/酸度、温度、时间与排气" },
        { label: "记录", value: "批次、重量、环境、气味与表面状态" },
      ],
      cycle: recurringCycle("发酵批次参考", "从数天到数月，按具体工艺", [
        { label: "备料接种", duration: "第 1 天" },
        { label: "活跃发酵", duration: "数天至数周" },
        { label: "熟成", duration: "数周至数月" },
      ]),
      sections: [
        { title: "建立批次", items: [`制作${name}时固定原料、盐或曲种比例和容器。`, "使用可靠配方，记录原料来源、重量、温度和开始时间。"] },
        { title: "发酵观察", items: ["按工艺维持覆盖、排气、搅拌或压实，减少杂菌污染。", "记录气味、颜色、气泡、表面状态和温度变化。"] },
        { title: "熟成与保存", items: ["达到工艺要求后再分装或转入低温保存。", "保留小样和批次标签，异常批次不与正常批次混合。"] },
      ],
      cautions: ["出现不符合该工艺的霉色、腐败气味、黏滑或不明污染时不要试吃。", "家庭发酵不能用经验替代食品安全控制，尤其是低盐、低酸和含蛋白原料。"],
    },
    food_brew: {
      parameters: [
        { label: "糖源/淀粉", value: "记录原料、糖度或投料比例" },
        { label: "发酵", value: "菌种、温度、时间与排气" },
        { label: "成品", value: "澄清、密封、储存与批次标注" },
      ],
      cycle: recurringCycle("酿造批次参考", "通常数周至数月", [
        { label: "备料", duration: "第 1 天" },
        { label: "主发酵", duration: "约数日至数周" },
        { label: "后发酵/熟成", duration: "约数周至数月" },
      ]),
      sections: [
        { title: "准备", items: [`制作${name}前固定原料、菌种、容器和批次编号。`, "所有接触发酵液的工具都要彻底清洁，并按工艺消毒。"] },
        { title: "发酵管理", items: ["记录投料、温度、比重或糖度、气泡和气味变化。", "有产气阶段使用合适的排气装置，避免密闭容器压力累积。"] },
        { title: "熟成与保存", items: ["发酵稳定后再转移或装瓶，减少沉淀和氧化。", "标注酒精饮品、日期和批次，避光并按工艺温度保存。"] },
      ],
      cautions: ["酿造与酒精生产、持有和分享应遵守当地法律。", "不明污染、异常压力或无法确认安全性的批次不要饮用。"],
    },
  };
}

function enTemplates(name: string): Record<string, PublicGuideContent> {
  const recurringCycle = (title: string, total: string, stages: PublicGuideStage[]): PublicGuideCycle => ({
    title,
    total,
    stages,
    note: "Timing varies with materials, temperature, species, and management. Use your observations as the final reference.",
  });

  return {
    generic: {
      parameters: [
        { label: "Scope", value: "Confirm for the specific project" },
        { label: "Starting principle", value: "Test at small scale, then adjust" },
        { label: "Track", value: "Setup, changes, results, and exceptions" },
      ],
      sections: [
        { title: "Before starting", items: ["Define the setting, goal, and maintainable scale.", "Record baseline conditions so later changes can be compared."] },
        { title: "Implement and observe", items: ["Change only a few important variables at a time.", "Record results consistently before expanding or revising the setup."] },
      ],
      cautions: ["This is a general framework. Food, animals, structural safety, and local regulations may require stricter professional guidance."],
    },
    soil_improvement: {
      parameters: [
        { label: "Diagnose first", value: "Texture, drainage, compaction, pH, and organic matter" },
        { label: "Approach", value: "Organic matter, mulch, drainage, or structural change" },
        { label: "Review", value: "Recheck across seasons" },
      ],
      sections: [
        { title: "Diagnose the soil", items: ["Observe ponding after rain, cracking after drying, root growth, and odor.", "Separate structure, fertility, pH, and salinity problems before choosing an amendment."] },
        { title: "Improve in stages", items: ["Test a small area before adding mature organic matter or changing drainage.", "Keep soil covered to reduce erosion, overheating, and moisture swings."] },
        { title: "Keep records", items: ["Track material, amount, date, plant response, and soil changes.", "Judge results over one or more seasons rather than expecting a one-time fix."] },
      ],
      cautions: ["Do not bury large amounts of unfinished material in the root zone.", "Use lime, sulfur, and high-salt fertilizers only with test results and crop needs in mind."],
    },
    compost: {
      parameters: [
        { label: "Materials", value: "Balance carbon-rich dry and nitrogen-rich moist inputs" },
        { label: "Condition", value: "Moist but not dripping, with airflow" },
        { label: "Maturity", value: "Cool, earthy smelling, original inputs hard to identify" },
      ],
      cycle: recurringCycle("One compost batch", "Usually several weeks to several months", [
        { label: "Build", duration: "Day 1" },
        { label: "Active breakdown", duration: "About 1–3 weeks" },
        { label: "Curing", duration: "About 1–3 months" },
      ]),
      sections: [
        { title: "Build the pile", items: ["Cut large materials and mix dry and moist inputs.", "Retain moisture while leaving channels for air."] },
        { title: "Manage the process", items: ["Add a little water when dry; add dry material and turn when wet or odorous.", "Track temperature, odor, moisture, and turning dates."] },
        { title: "Use", items: ["Let compost mature fully before using it near seedlings or roots.", "Test a new recipe at small scale and watch plant response."] },
      ],
      cautions: ["Keep diseased plants, unknown chemical residues, and hazardous waste out of home compost.", "Manage food-scrap compost to prevent leachate, odor, and animal access."],
    },
    facility_structure: {
      parameters: [
        { label: "Site", value: "Light, load, access, and drainage" },
        { label: "Dimensions", value: "Reachable and maintainable" },
        { label: "Materials", value: "Weather-resistant, low-contamination, replaceable" },
      ],
      sections: [
        { title: "Plan", items: [`Define which crops, location, and frequency the ${name} must support.`, "Leave room for watering, drainage, cleaning, pruning, and transport."] },
        { title: "Install", items: ["Confirm floor or wall capacity and prevent tipping.", "Make wet and soil-contact areas drainable, inspectable, and replaceable."] },
        { title: "Maintain", items: ["Seasonally check looseness, rust, cracks, ponding, and unwanted shade.", "Record dimensions, materials, cost, and revisions for reuse."] },
      ],
      cautions: ["Confirm load and fall risks for balconies, roofs, walls, and raised structures.", "Avoid sharp edges, trapping gaps, and unstable elements where children or animals can reach."],
    },
    facility_climate: {
      parameters: [
        { label: "Monitor", value: "Temperature, humidity, light, and ventilation" },
        { label: "Safety", value: "Wind resistance, drainage, anchoring, emergency opening" },
        { label: "Management", value: "Check daytime and nighttime separately" },
      ],
      sections: [
        { title: "Choose and position", items: [`Match the ${name} covering, openings, and height to the seasonal goal.`, "Do not trade all ventilation for heat retention or create long-term low light."] },
        { title: "Operate", items: ["Compare temperature and humidity at several positions and times.", "Adjust ventilation, shade, insulation, and watering one step at a time."] },
        { title: "Seasonal checks", items: ["Before wind, rain, snow, or heat, inspect anchors, drainage, and opening mechanisms.", "Clean coverings and repair damage during idle periods."] },
      ],
      cautions: ["Enclosures can heat rapidly; outdoor temperature alone is not enough.", "Large or load-bearing structures must meet local building, fire, and property rules."],
    },
    facility_water: {
      parameters: [
        { label: "Demand", value: "Source, peak use, and storage volume" },
        { label: "Critical points", value: "Filtration, overflow, drain-down, backflow protection" },
        { label: "Maintenance", value: "Leak checks, sediment removal, flushing" },
      ],
      sections: [
        { title: "Map the water path", items: [`Draw the ${name} intake, storage, use, overflow, and drain-down path.`, "Keep valves, filters, and clog-prone points directly accessible."] },
        { title: "Install and test", items: ["Start with low pressure and short runs, checking each section for leaks and flow.", "Direct overflow away from foundations, neighbors, and electrical equipment."] },
        { title: "Record and maintain", items: ["Track water use, level, pressure, filter condition, and faults.", "Drain, freeze-protect, and clean before seasonal shutdown."] },
      ],
      cautions: ["Protect storage and open water from falls and mosquito breeding.", "Water for drinking, food, or animals must meet the relevant hygiene standard; appearance is not enough."],
    },
    facility_animal: {
      parameters: [
        { label: "Basics", value: "Space, ventilation, dryness, shelter, and water" },
        { label: "Protection", value: "Escape, predators, and isolation" },
        { label: "Cleaning", value: "Manage manure, bedding, feeders, and drainage" },
      ],
      sections: [
        { title: "Layout", items: [`Design the ${name} for species, number, and behavior, not only a legal minimum.`, "Consider separate resting, drinking, feeding, activity, nesting, and hiding areas."] },
        { title: "Daily checks", items: ["Check water, feed, waste, behavior, and damage every day.", "Prepare isolation space; do not mix new or sick animals immediately."] },
        { title: "Environment", items: ["Ventilate without direct drafts and replace wet bedding promptly.", "Track cleaning, disinfection, repairs, symptoms, and animal changes."] },
      ],
      cautions: ["Follow local rules for stocking, welfare, disease control, and manure disposal.", "Barriers must account for squeezing, climbing, chewing, and predator entry."],
    },
    method_skill: {
      parameters: [
        { label: "Goal", value: "Propagation, soil protection, water saving, or lower disturbance" },
        { label: "Conditions", value: "Species, season, materials, and site" },
        { label: "Validation", value: "Test a small batch and track survival and maintenance" },
      ],
      sections: [
        { title: "Choose the method", items: [`Define the problem that ${name} should solve and the acceptable cost of failure.`, "Include time, tools, materials, and follow-up care in the plan."] },
        { title: "Implement in stages", items: ["Test on a small group, keep a comparison, and record date, weather, and exact steps.", "Change one important step at a time so results remain comparable."] },
        { title: "Review and scale", items: ["Track survival, yield, soil or ecological change, and extra maintenance time.", "Scale only after several batches show stable results."] },
      ],
      cautions: ["Use clean tools and protect cuts for grafting, layering, and cuttings. No-till and natural methods still need active observation.", "Follow safety and local requirements when machinery, chemicals, or public land is involved."],
    },
    aquatic_plant: {
      parameters: [
        { label: "Light", value: "Acclimate gradually for the species" },
        { label: "Water temperature", value: "Confirm the species range first" },
        { label: "Water chemistry", value: "Prioritize stability; monitor pH, hardness, and nutrients" },
        { label: "Substrate & nutrition", value: "Treat rooted and epiphytic plants differently" },
      ],
      cycle: recurringCycle("Establishment reference", "About 1–3 months to stable observation", [
        { label: "Acclimation", duration: "About 7–21 days" },
        { label: "New roots and leaves", duration: "About 2–6 weeks" },
        { label: "Stable growth", duration: "About 1–3 months" },
      ]),
      sections: [
        { title: "Plant", items: ["Identify submerged, floating-leaved, emergent, or epiphytic growth before choosing depth and anchoring.", "Remove decayed tissue and begin with moderate spacing."] },
        { title: "Light, water, nutrition", items: ["Start at lower light and adjust after observing new growth and algae.", "Keep temperature and chemistry stable; change fertilizer, carbon dioxide, or water schedule one variable at a time."] },
        { title: "Prune and record", items: ["Track melt, new shoots, roots, algae, and recovery after pruning.", "Thin in stages and remove decaying leaves promptly."] },
      ],
      cautions: ["Aquatic-plant needs vary widely; one light, temperature, and fertilizer recipe cannot fit every species.", "Never release non-native plants or trimmings into natural water."],
    },
    aquatic_animal: {
      parameters: [
        { label: "Confirm first", value: "Species, adult size, social behavior, compatibility" },
        { label: "Water", value: "Temperature, oxygen, ammonia/nitrite, and pH" },
        { label: "System", value: "Effective volume, filtration, circulation, outage plan" },
      ],
      cycle: recurringCycle("Introduction reference", "Stabilize the system before adding biomass gradually", [
        { label: "Empty-system test", duration: "At least several days" },
        { label: "Quarantine", duration: "Based on species and source" },
        { label: "Gradual introduction", duration: "In stages" },
      ]),
      sections: [
        { title: "Species and environment", items: [`Confirm adult size, temperature, chemistry, diet, and social needs for ${name}.`, "Plan for adults and system capacity, not juvenile size."] },
        { title: "Establish the system", items: ["Run filtration and circulation until oxygen and nitrogen-waste handling are stable.", "Quarantine new animals and acclimate them gradually to temperature and chemistry."] },
        { title: "Track", items: ["Record water tests, feeding, waste, behavior, molts, and breeding.", "When problems appear, check water, equipment, and recent changes before stacking treatments."] },
      ],
      cautions: ["Never release animals, eggs, larvae, or aquarium water into nature.", "Medication, salinity, and temperature treatments must be checked for the exact species."],
    },
    habitat_animal: {
      parameters: [
        { label: "Subject", value: "Identify before deciding whether to observe or care" },
        { label: "Habitat", value: "Temperature, moisture, light, shelter, food, and water" },
        { label: "Record", value: "Time, place, number, behavior, and environment" },
      ],
      sections: [
        { title: "Identify and set boundaries", items: [`Record the appearance, behavior, and setting of ${name}; avoid conclusions from one photo.`, "Prefer observation in place rather than capture, relocation, feeding, or intervention."] },
        { title: "Support habitat", items: ["Retain water, leaf litter, native plants, shelter, and connected corridors.", "Reduce broad-spectrum pesticides, harsh lighting, and repeated disturbance."] },
        { title: "Observe over time", items: ["Record counts, activity, breeding, or migration on a fixed route and schedule.", "Track weather, plant phenology, and management actions alongside wildlife observations."] },
      ],
      cautions: ["Keep distance from wildlife, protected species, and potentially venomous or aggressive animals, and follow local rules.", "Do not touch, eat, or relocate an organism you cannot identify reliably."],
    },
    food_preserve: {
      parameters: [
        { label: "Ingredients", value: "Fresh, sound, and traceable" },
        { label: "Controls", value: "Hygiene, ratio, acidity/salt/sugar, temperature, time" },
        { label: "Batch record", value: "Date, weight, recipe, container, storage" },
      ],
      cycle: recurringCycle("One batch", "Depends on the recipe and preservation method", [
        { label: "Prepare", duration: "Same day" },
        { label: "Process", duration: "Per method" },
        { label: "Cool or rest", duration: "Per recipe" },
        { label: "Storage checks", duration: "Ongoing" },
      ]),
      sections: [
        { title: "Recipe and preparation", items: [`Fix ingredient weight, container volume, and a reliable recipe before making ${name}.`, "Clean hands, tools, and containers; discard moldy, spoiled, or unknown ingredients."] },
        { title: "Control the process", items: ["Follow validated time, temperature, acidity, salt, or sugar controls rather than reducing critical amounts by taste.", "Prevent recontamination during portioning, cooling, and sealing."] },
        { title: "Store and record", items: ["Label production, batch, opening date, and storage method.", "Discard items with swelling, leaks, mold, unusual odor, or texture."] },
      ],
      cautions: ["Low-acid canning, vacuum sealing, and long room-temperature storage can carry severe food-safety risks and require validated processes.", "Smell or taste alone cannot establish safety."],
    },
    food_ferment: {
      parameters: [
        { label: "Ingredients & culture", value: "Known source and defined recipe" },
        { label: "Process", value: "Salt/acidity, temperature, time, and gas" },
        { label: "Track", value: "Batch, weight, conditions, aroma, surface" },
      ],
      cycle: recurringCycle("Fermentation batch", "Days to months, depending on the process", [
        { label: "Prepare/inoculate", duration: "Day 1" },
        { label: "Active fermentation", duration: "Days to weeks" },
        { label: "Maturation", duration: "Weeks to months" },
      ]),
      sections: [
        { title: "Create the batch", items: [`Fix ingredients, salt or culture ratio, and vessel for ${name}.`, "Use a reliable method and record sources, weights, temperature, and start time."] },
        { title: "Observe fermentation", items: ["Maintain submersion, venting, stirring, or pressing as the method requires.", "Track aroma, color, bubbles, surface, and temperature."] },
        { title: "Mature and store", items: ["Package or chill only when the process requirements are met.", "Keep labels and a batch sample; never blend a questionable batch into a good one."] },
      ],
      cautions: ["Do not taste a batch with unexpected mold colors, putrid odor, slime, or unknown contamination.", "Experience cannot replace food-safety controls, especially for low-salt, low-acid, or protein-rich foods."],
    },
    food_brew: {
      parameters: [
        { label: "Sugar/starch", value: "Record ingredient and sugar or loading ratio" },
        { label: "Fermentation", value: "Culture, temperature, time, and venting" },
        { label: "Finished batch", value: "Clarify, seal, store, and label" },
      ],
      cycle: recurringCycle("Brewing batch", "Usually weeks to months", [
        { label: "Prepare", duration: "Day 1" },
        { label: "Primary fermentation", duration: "Days to weeks" },
        { label: "Secondary/maturation", duration: "Weeks to months" },
      ]),
      sections: [
        { title: "Prepare", items: [`Fix ingredients, culture, vessel, and batch ID before making ${name}.`, "Thoroughly clean and appropriately sanitize every tool touching the liquid."] },
        { title: "Manage fermentation", items: ["Record additions, temperature, gravity or sugar, bubbles, and aroma.", "Use suitable venting during gas production to prevent pressure buildup."] },
        { title: "Mature and store", items: ["Transfer or bottle only after fermentation stabilizes, limiting sediment and oxygen.", "Label alcohol, date, and batch; store dark at the method's required temperature."] },
      ],
      cautions: ["Follow local law for producing, possessing, and sharing alcohol.", "Do not drink a batch with unknown contamination, unsafe pressure, or uncertain process control."],
    },
  };
}

function getTemplate(
  key: string | null | undefined,
  name: string,
  language: PublicGuideLanguage,
) {
  const templates = language === "en" ? enTemplates(name) : zhTemplates(name);
  return templates[key || "generic"] || templates.generic;
}

export function buildPublicGuideContent(
  entry: PublicGuideEntry,
  language: PublicGuideLanguage,
): PublicGuideContent {
  const name = getPublicGuideName(entry, language);
  const template = getTemplate(entry.content_template, name, language);
  const raw = parseGuideContent(language === "en" ? entry.content_en : entry.content);

  return {
    parameters: raw.parameters?.length ? raw.parameters : template.parameters,
    cycle: raw.cycle || template.cycle || null,
    sections: raw.sections?.length ? raw.sections : template.sections,
    cautions: raw.cautions?.length ? raw.cautions : template.cautions,
  };
}

export function sortPublicGuides<T extends { sort_order?: number | null; name: string }>(
  items: T[],
) {
  return [...items].sort((left, right) => {
    const orderDifference = Number(left.sort_order ?? 1000) - Number(right.sort_order ?? 1000);
    if (orderDifference !== 0) return orderDifference;
    return left.name.localeCompare(right.name, "zh-CN");
  });
}
