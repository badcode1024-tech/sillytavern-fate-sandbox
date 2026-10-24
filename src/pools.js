/**
 * 命运沙盘 —— 卡池数据定义
 * 所有卡池集中于此，供「抽卡引擎」与「卡池管理后台」共用。
 * 后台对卡池的增删改会直接写回此结构对应的本地存储副本，并在下次抽卡时生效。
 */

// ==================== 1. 世界背景卡池 ====================
export const WORLD_TYPE_POOLS = [
  { id: "low_magic", name: "低魔法西幻（古代/现代）", desc: "魔法稀少且神秘，智慧种族只有人类，超凡力量隐秘，多依托冷兵器或初阶工业社会的背景。" },
  { id: "mid_magic", name: "中等魔法西幻（古代/现代）", desc: "魔法常规存在，智慧种族以人类为主，其他种族在繁华地区更为常见。术法与科技并行，中坚力量可左右局部战局。" },
  { id: "high_magic", name: "高等魔法西幻（古代/现代）", desc: "魔法昌盛泛滥，智慧种族丰富，毁天灭地的神迹频现，高维伟力重塑世界规则。" },
  { id: "regency", name: "架空古西方", desc: "阶层森严的宫廷沙龙与舞会，充斥着贵族爵位、社交名利场与暗流。" },
  { id: "ancient_china", name: "中国古代", desc: "遵循封建皇朝历史，宗法、门阀或官场权谋与古典市井并存。" },
  { id: "modern", name: "现代", desc: "高楼林立的现代都市，科技、法律与资本主导，表面平静暗藏危机。" },
  { id: "jp_fantasy", name: "日式古西幻", desc: "带有日式奇幻与风情的剑与魔法世界，种族多样化，常伴随神道或异世界传说，以及丰富的地下城冒险。" },
  { id: "xianxia", name: "中式仙侠（修仙）", desc: "崇尚逆天长生，以灵气、宗门、渡劫飞升为核心的修真世界。" },
  { id: "wuxia", name: "中式武侠（架空）", desc: "以内功、招式、侠义恩仇与江湖门派为核心的架空传统武林世界。" },
  { id: "scifi", name: "星际背景", desc: "跨星系文明交织，星舰、机甲、跃迁与高科技帝国争霸的宇宙时代。" }
];

// ==================== 2. 任务 / 灾厄等级 ====================
export const DIFFICULTY_POOLS = [
  { level: "F", name: "局部压迫", desc: "局限于闭塞的小镇或独立据点。核心危机源于本地坏领导人或割据势力的残酷统治，社会秩序混乱但尚未溃败。" },
  { level: "E", name: "区域失控", desc: "蔓延至数个村镇或小型城市。邪恶势力或灾异现象初步扩散，地方政权瘫痪，居民生活在强权或未知恐慌的阴影中。" },
  { level: "D", name: "政权危机", desc: "涉及整个省份或重要邦国。统治阶层被腐蚀或颠覆，社会暴乱频繁，局部战争或污染/异变灾害已彻底摧毁基层秩序。" },
  { level: "C", name: "文明阵痛", desc: "跨越数个国家或大型板块。核心文明面临灭顶之灾，旧有法律与道德全面崩塌，资源极度匮乏，割据混战与天灾交织。" },
  { level: "B", name: "大陆浩劫", desc: "影响整块大陆或核心栖息地。极具毁灭性的天灾、异族或绝症狂潮肆虐，文明濒临断代，过半人口在死亡边缘挣扎。" },
  { level: "A", name: "法则崩坏", desc: "席卷整个星球或核心维度。生态系统与基本秩序濒临解体，极端天灾或不可逆的腐化力量蔓延，救世希望几近断绝。" },
  { level: "S", name: "全球废土", desc: "星球或主力星系已沦为废土与死地。旧文明全数毁灭，残存幸存者在绝望中苟延残喘，邪恶势力或灾变源头已掌握绝对统治权。" },
  { level: "SS", name: "星系浩劫", desc: "跨越多个星系或核心维度。灭世级势力彻底统治或蚕食所有已知世界，抵抗星火几近熄灭。" },
  { level: "SSS", name: "宇宙终局", desc: "整个宇宙、星际帝国或诸天万界处于终局时刻。基本生存法则被扭曲，文明遭遇毁灭性清洗，一切即将归于虚无。" }
];

// ==================== 3. 勇者外观卡池 ====================
export const HERO_APPEARANCE_POOLS = {
  hairColor: [
    "鸦羽黑", "墨棕", "栗木茶", "金亚麻", "深海蓝黑", "银灰",
    "纯白如雪", "炽烈红发", "紫罗兰", "浅金琥珀", "冰蓝", "樱花粉", "粉白双色"
  ],
  eyeColor: [
    "琥珀棕", "深邃黑曜", "翡翠绿", "湛蓝", "灰紫",
    "熔岩金", "冰晶浅蓝", "血色绯红", "银白", "异色双瞳", "灵力微光瞳"
  ],
  facialFeatures: [
    "桃花眼与薄唇", "狭长凤眼与挺拔悬胆鼻", "深邃下垂眼与嘴角笑意",
    "锐利鹰眼与颧骨伤痕", "圆润杏眼与微苍白脸色", "独眼/带眼罩与凌厉下颌"
  ],
  hairStyle: [
    "干练碎短发", "微卷凌乱短发", "齐肩半绑发", "遮眼刘海短发", "背头/油头",
    "高马尾", "束发高髻", "披肩散发", "编发长辫"
  ],
  bodyBuild: [
    { type: "薄肌", desc: "体脂低，肌肉紧实爆发力强，穿衣显瘦脱衣有肉。" },
    { type: "脂包肌", desc: "体脂稍高但皮下肌肉厚重，力量感十足，耐打抗造。" },
    { type: "纤细", desc: "骨架偏小，体型修长轻盈，灵敏度高，带有优雅感。" },
    { type: "爆肌", desc: "肌肉块面极其明显，青筋暴起，具有极强的物理威慑力。" },
    { type: "匀称健美", desc: "体脂与肌肉达到完美平衡，线条极具美感。" }
  ],
  heightCategory: [
    { type: "高个子", desc: "身材高挑修长，比例极佳，在人群中醒目。" },
    { type: "矮小可爱", desc: "身材矮小身手敏捷，极具欺骗性或保护欲。" },
    { type: "小巨人", desc: "远超常人的庞大体格，站立如一堵肉盾墙壁。" },
    { type: "中等标准", desc: "标准身形，融入人群不显眼，便于隐蔽与行动。" }
  ],
  styleDaily: ["朴素实用风", "优雅贵气风", "随性散漫风", "严谨禁欲风"],
  styleCombat: ["重型铠甲/防护服", "轻盈潜行/劲装", "战袍法袍仪式风", "战损废土风"],
  styleAdvanced: ["宫廷/社交高定礼服", "极端环境特种防护服", "祭祀/仪式圣衣", "隐匿伪装兜帽服"]
};

// ==================== 6. 勇者表面性格卡池 ====================
export const HERO_PERSONALITY_POOLS = {
  positive: [
    "热情", "幽默", "忠诚", "坚定", "四两拨千斤", "聪明", "智慧", "元气",
    "开朗", "乐观", "爽朗", "温柔", "体贴", "慷慨", "坦荡",
    "勇敢", "坚毅", "敏锐", "细腻", "果断", "灵活变通", "足智多谋", "大智若愚",
    "正直", "善良", "仁慈", "宽容", "谦逊", "刚正不阿", "侠义心肠", "责任心强", "热血", "坚忍不拔"
  ],
  negative: [
    "自恋", "自大", "软弱", "放荡", "淫荡", "色情", "不正经", "没有上进心", "懒惰", "冲动",
    "贪婪", "虚荣", "好色", "嗜酒", "享乐主义", "贪生怕死",
    "嫉妒", "暴躁", "多疑", "记仇", "小气", "狭隘", "偏执", "阴险", "卑鄙",
    "傲慢", "盲目", "莽撞", "逃避现实", "不负责任", "执拗", "自私自利", "虚伪"
  ],
  neutral: [
    "冷淡", "中二病", "过于正经", "过度谨慎",
    "淡漠", "随性", "散漫", "沉默寡言", "孤傲", "慢热", "高冷", "社交恐慌",
    "务实", "现实", "严谨", "刻板", "理性", "感性", "实用主义", "随波逐流",
    "咸鱼", "佛系", "随遇而安", "神经质", "游离于世外", "固执己见", "精分", "自由散漫"
  ]
};

// ==================== 7. 勇者核心性格卡池 ====================
export const HERO_CORE_TRAIT_INFO = {
  description: "核心性格代表勇者的本质与灵魂底色。平时可能被表面性格掩盖，但在绝境、抉择或与<user>建立深度羁绊时会展现，决定其终极行动逻辑。"
};

export const HERO_CORE_TRAIT_POOLS = [
  { name: "殉道者信仰", desc: "将自身生命视为拯救世界的消耗品，随时准备自我牺牲。" },
  { name: "绝对救赎观", desc: "对生命极度偏执地珍视，试图拯救遇到的每一个人。" },
  { name: "博爱与无我", desc: "平等地爱着世间万物，但也因此缺乏私情与偏爱。" },
  { name: "执拗的守护者", desc: "不在乎公理如何，为守护认可之人不惜与全世界为敌。" },
  { name: "终极秩序狂", desc: "厌恶混乱，以建立绝对秩序与安定为终极追求。" },
  { name: "求真与复仇", desc: "驱使其前进的核心动力是揭开真相或向幕后黑手复仇。" },
  { name: "清醒的虚无主义", desc: "认为一切拯救皆无意义，但出于某种承诺依然麻木推石上山。" },
  { name: "自我厌恶", desc: "认为自己污秽软弱，成为英雄只是为了赎罪或寻求解脱。" },
  { name: "被困在过去的人", desc: "灵魂死在过去的灾难中，仅靠执念与回忆驱动肉身。" },
  { name: "伪善的利己者", desc: "拯救世界只因害怕世界毁灭影响自己，利用英雄名号谋利。" },
  { name: "极致的反骨", desc: "厌恶命运与权威，哪怕救世也要以叛逆的方式撕碎剧本。" },
  { name: "求生本能", desc: "顽强的野草型人格，底线极低，为了生存不择手段。" },
  { name: "孤独的局外人", desc: "灵魂极度疏离，感觉自己与世界格格不入，毫无归属感。" },
  { name: "追求解脱者", desc: "厌倦战斗与责任，终极愿望是完成使命后彻底归于安息。" },
  { name: "至死求道者", desc: "将末世视为磨炼意志的试炼场，追求力量与灵魂的极致升华。" },
  { name: "情感饥渴", desc: "渴望被理解与爱，内心脆弱，对接纳他的人会产生病态依赖。" },
  { name: "隐秘的温柔", desc: "深层藏着无尽包容，遭受折磨与背叛后依然温柔对待世界。" }
];

// ==================== 8. 卡牌定义（商城 + 库存） ====================
// category: normal | fandom | difficulty
export const CARD_DEFINITIONS = [
  { id: "reroll",    name: "重塑因果", category: "normal",  cost: 5,   icon: "fa-dice",            img: "assets/cards/reroll.jpg",    desc: "重新消耗 token，再生成一次当前等级的随机新世界。" },
  { id: "import",    name: "旧世复苏", category: "normal",  cost: 20,  icon: "fa-upload",          img: "assets/cards/import.jpg",    desc: "导入历史归档导出的 JSON 界域种子，恢复旧世界。" },
  { id: "tamper",    name: "法则篡改", category: "normal",  cost: 30,  icon: "fa-pen-ruler",       img: "assets/cards/tamper.jpg",    desc: "解锁单个沙盘文本框，允许自定义修改一次。" },
  { id: "anchor",    name: "异界锚定", category: "fandom",  cost: 15,  icon: "fa-wand-sparkles",   img: "assets/cards/anchor.jpg",    desc: "从同人特化卡池随机抽取角色与世界观，重新生成世界。" },
  { id: "special",   name: "异界特典", category: "fandom",  cost: 35,  icon: "fa-crown",           img: "assets/cards/special.jpg",   desc: "输入自定义提示词，按指定 IP/世界观生成专属世界。" },
  // 越级挑战难度卡
  { id: "challenge_F",   name: "越级挑战·F",   category: "difficulty", cost: 0,   icon: "fa-flag", img: "assets/cards/challenge.jpg", level: "F" },
  { id: "challenge_E",   name: "越级挑战·E",   category: "difficulty", cost: 6,   icon: "fa-flag", img: "assets/cards/challenge.jpg", level: "E" },
  { id: "challenge_D",   name: "越级挑战·D",   category: "difficulty", cost: 15,  icon: "fa-flag", img: "assets/cards/challenge.jpg", level: "D" },
  { id: "challenge_C",   name: "越级挑战·C",   category: "difficulty", cost: 20,  icon: "fa-flag", img: "assets/cards/challenge.jpg", level: "C" },
  { id: "challenge_B",   name: "越级挑战·B",   category: "difficulty", cost: 30,  icon: "fa-flag", img: "assets/cards/challenge.jpg", level: "B" },
  { id: "challenge_A",   name: "越级挑战·A",   category: "difficulty", cost: 45,  icon: "fa-flag", img: "assets/cards/challenge.jpg", level: "A" },
  { id: "challenge_S",   name: "越级挑战·S",   category: "difficulty", cost: 65,  icon: "fa-flag", img: "assets/cards/challenge.jpg", level: "S" },
  { id: "challenge_SS",  name: "越级挑战·SS",  category: "difficulty", cost: 90,  icon: "fa-flag", img: "assets/cards/challenge.jpg", level: "SS" },
  { id: "challenge_SSS", name: "越级挑战·SSS", category: "difficulty", cost: 125, icon: "fa-flag", img: "assets/cards/challenge.jpg", level: "SSS" }
];

// ==================== 11. 素材路径 ====================
export const ASSETS = {
  bgParchmentV1: "assets/bg/parchment_v1.png",  // 竖版羊皮纸（面板/弹窗背景）
  bgParchmentV2: "assets/bg/parchment_v2.png",  // 竖版羊皮纸·燃烧边（夜间皮肤背景）
  bgMapH1: "assets/bg/map_h1.png"               // 横版藏宝图（命运沙盘分栏背景）
};

// ==================== 12. 星级评定标准 ====================
export const STAR_CRITERIA = [
  { star: 1, name: "隐患留存", desc: "世界勉强拯救完成，但根基未稳，仍留存重大隐患，旧的邪恶势力随时可能卷土重来。" },
  { star: 2, name: "中规中矩", desc: "世界成功拯救，过程表现中规中矩，平稳过渡为一个普通的世界，各项秩序恢复到原本的起点。" },
  { star: 3, name: "完美拯救", desc: "完美拯救世界，世界迎来新生并取得实质性突破，呈现出肉眼可见的蓬勃发展与繁荣景象。" }
];

// ==================== 13. 防死循环机制配置 ====================
export const FLOOR_LIMIT = 100;  // 酒馆楼层上限，达到即强制结算

// ==================== 14. 内置默认 Prompt ====================
// 用户未手动设置时的默认值，可在「法则镌刻」设置面板随时覆盖。

export const DEFAULT_PROMPTS = {
  // 审判 —— 任务判定标准 Prompt
  judge: `你是「命运沙盘」的终局审判者，负责依据当前世界设定与玩家在上下文中的真实表现，客观判定这一次救世任务是否完成、完成度星级以及应得积分。

【星级评定标准】
- ⭐ 一星（隐患留存）：世界勉强拯救完成，但根基未稳，仍留存重大隐患，旧的邪恶势力随时可能卷土重来。
- ⭐⭐ 二星（中规中矩）：世界成功拯救，过程表现中规中矩，平稳过渡为一个普通的世界，各项秩序恢复到原本的起点。
- ⭐⭐⭐ 三星（完美拯救）：完美拯救世界，世界迎来新生并取得实质性突破，呈现出肉眼可见的蓬勃发展与繁荣景象。

【判定要求】
1. 仅依据玩家在对话中实际做出的行动与结果判定，不可凭空臆断。
2. 若邪恶势力未被彻底消灭或驱除，最高只能给一星或直接判失败。
3. 严格输出 JSON，格式如下，不要输出任何多余文字：
{"success": true/false, "star": 0-3, "points": 积分数值, "reason": "简明判定理由"}`,

  // 创世神谕 —— 任务生成 Prompt
  world: `你是「命运沙盘」的创世主神，负责依据给定的本地抽卡结果，编织一个高沉浸、逻辑自洽的末世世界，并召唤一位契约勇者。

【生成要求】
1. 任务目标（终焉之劫）：用 1-2 句话点明世界面临的核心危机与勇者必须达成的终极目标。
2. 世界难度（灾厄侵蚀度）：一句话概括当前灾厄的等级与影响范围。
3. 末世类型（灾厄形态）：具体描绘末世的表现形态，让人身临其境。
4. 契约勇者（契约勇者）：依据勇者抽取结果润色成一份完整 YAML 格式角色卡，名字须贴合世界背景，包含 name、description、personality、scenario、first_mes 等字段。

【输出格式】严格按以下四个标签分段输出，每段以标签行开头（标签后紧跟中文冒号），内容写在冒号之后或下一行；四个字段缺一不可、顺序不可颠倒，不要输出任何多余说明：
任务目标（终焉之劫）：
世界难度（灾厄侵蚀度）：
末世类型（灾厄形态）：
契约勇者（勇者角色卡 YAML）：`,

  // 史官笔触 —— 归档故事生成 Prompt
  saga: `你是「命运沙盘」的史官，负责将本次救世历程书写为一段可传唱的史诗故事，永久归档于「救世录」。

【写作要求】
1. 为本次世界取一个富有诗意的标题。
2. 写一句精炼的 Summary（一句话摘要）。
3. 正文为 800-1000 字的第三人称小说体故事，语言凝练、意象鲜明、有起承转合。
4. 忠实于任务判定结果与勇者的性格命运，不可擅自改写结局。

【输出格式】严格输出 JSON，不要输出任何多余文字：
{"title": "标题", "summary": "一句话摘要", "story": "800-1000字正文"}`,

  // 铭刻法则 —— 保存修改 Prompt
  save: `你是「命运沙盘」的法则守护者。用户即将篡改命运沙盘中的某一个字段设定，请你确认并接纳这次修改，确保修改后的设定与其余字段保持逻辑自洽、不产生矛盾。

【说明】该字段内容已由用户直接改写并保存，你只需知晓并默认接纳，无需重述或质疑。后续生成世界与故事时，请以修改后的设定为准。`
};


// ==================== 9. 任务成败积分奖惩表 ====================
// key: 难度等级 level
export const REWARD_TABLE = {
  F:   { success: [3, 6, 15],  fail: -3 },
  E:   { success: [6, 12, 20], fail: -6 },
  D:   { success: [10, 20, 30], fail: -10 },
  C:   { success: [15, 30, 45], fail: -15 },
  B:   { success: [20, 40, 65], fail: -20 },
  A:   { success: [30, 60, 90], fail: -30 },
  S:   { success: [45, 90, 125], fail: -45 },
  SS:  { success: [60, 120, 170], fail: -60 },
  SSS: { success: [80, 160, 230], fail: -80 }
};

// 难度等级顺序（用于阶梯上升）
export const DIFFICULTY_ORDER = ["F", "E", "D", "C", "B", "A", "S", "SS", "SSS"];

// ==================== 10. 同人特化卡池（异界锚定 / 异界特典） ====================
// 仅允许泛化分类，严禁出现任何具名 IP（具体动漫/游戏/影视作品名）
export const FANDOM_POOLS = [
  { id: "game", name: "游戏作品", desc: "以角色扮演、动作冒险或开放世界电子游戏为基底的世界观。" },
  { id: "anime", name: "动漫作品", desc: "以动画、漫画叙事为基底的世界观与角色体系。" },
  { id: "western_film", name: "欧美影视作品", desc: "以欧美电影、剧集为基底的世界观。" },
  { id: "asian_film", name: "日韩影视作品", desc: "以日韩影视剧为基底的世界观。" },
  { id: "domestic_film", name: "国产影视作品", desc: "以国产电影、剧集为基底的世界观。" },
  { id: "novel", name: "小说作品", desc: "以网络小说、轻小说或经典文学为基底的世界观。" },
  { id: "manga", name: "漫画作品", desc: "以漫画、绘本叙事为基底的世界观。" },
  { id: "tokusatsu", name: "特摄作品", desc: "以特摄剧、变身英雄为基底的世界观。" }
];

// ==================== 11. 同人世界观卡池（异界锚定专用） ====================
// 仅在使用「异界锚定卡」时从此处抽取一个具体同人世界观，替代原本的 WORLD_TYPE_POOLS，
// 交由 LLM 润色生成完整世界观并匹配当前灾厄等级。每个条目只含 id 与 name。
export const IP_UNIVERSE_POOLS = [
  { id: "us_horror_movie", name: "欧美恐怖电影" },
  { id: "jp_shonen_anime", name: "日式热血/少年漫" },
  { id: "game_3a_fantasy", name: "欧美3A奇幻/RPG游戏" },
  { id: "kr_chaebol_drama", name: "韩剧/财阀权谋" },
  { id: "us_hero_anim", name: "美式超级英雄动画" },
  { id: "jp_drama_work", name: "日剧/职业与悬疑" },
  { id: "us_crime_show", name: "欧美罪案剧" },
  { id: "game_otome", name: "乙女/女性向游戏" },
  { id: "us_magic_show", name: "欧美魔幻剧" },
  { id: "jp_isekai_anime", name: "日式异世界/轻小说" },
  { id: "kr_zombie_drama", name: "韩剧/丧尸与惊悚" },
  { id: "game_souls_like", name: "欧美3A魂系/暗黑游戏" },
  { id: "us_superhero", name: "超级英雄电影" },
  { id: "jp_mecha_anime", name: "日式科幻/机甲漫" },
  { id: "us_sci_anim", name: "美式荒诞/科幻动画" },
  { id: "us_comedy_show", name: "欧美喜剧" },
  { id: "game_acg_gacha", name: "国产/二次元手游" },
  { id: "jp_shojo_anime", name: "日式恋爱/少女漫" },
  { id: "kr_fantasy_drama", name: "韩剧/奇幻浪漫" },
  { id: "us_movie_general", name: "欧美电影" },
  { id: "game_3a_scifi", name: "欧美3A动作/科幻游戏" },
  { id: "us_fantasy_movie", name: "欧美魔幻电影" },
  { id: "jp_mystery_anime", name: "日式悬疑/推理漫" },
  { id: "kr_thriller_drama", name: "韩剧/悬疑缉凶" },
  { id: "us_scifi_show", name: "欧美科幻/废土剧" },
  { id: "us_fantasy_anim", name: "美式奇幻/冒险动画" },
  { id: "jp_drama_youth", name: "日剧/校园与青春" },
  { id: "us_teen_show", name: "欧美青春/校园剧" },
  { id: "game_jrpg", name: "日式RPG (JRPG) 游戏" }
];
