/**
 * 命运沙盘 —— 随机抽卡引擎（本地实现）
 * 从卡池中严谨随机抽取并组合生成世界，交由 AI 层润色。
 * 支持：世界背景 / 灾难 / 邪恶势力 / 勇者外观·表面性格·核心性格。
 */
import * as P from "./pools.js";

// 安全随机（拒绝 Math.random 的分布隐患，用密码级随机源增强公平性）
function secureRandom() {
  const arr = new Uint32Array(1);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(arr);
    return arr[0] / 4294967296;
  }
  return Math.random();
}

// 从数组随机取 1 个
function pickOne(arr) {
  if (!arr || !arr.length) return null;
  return arr[Math.floor(secureRandom() * arr.length)];
}

// 从数组随机取 n 个（不重复）
function pickN(arr, n) {
  const pool = arr.slice();
  const out = [];
  const count = Math.min(n, pool.length);
  for (let i = 0; i < count; i++) {
    const idx = Math.floor(secureRandom() * pool.length);
    out.push(pool.splice(idx, 1)[0]);
  }
  return out;
}

/**
 * 抽取完整世界（不含难度，难度由外部传入当前/目标等级）
 * @param {object} opts { difficulty, fandom?, fandomHint? }
 */
export function drawWorld(opts = {}) {
  const difficulty = opts.difficulty || "F";
  const world = pickOne(P.WORLD_TYPE_POOLS);
  const disaster = pickOne(P.DISASTER_POOLS);
  const evil = pickOne(P.EVIL_FACTION_POOLS);
  const diff = P.DIFFICULTY_POOLS.find(d => d.level === difficulty) || P.DIFFICULTY_POOLS[0];

  let fandom = null;
  if (opts.fandom) {
    // 异界锚定：从同人卡池抽取；若提供了提示词（异界特典），则用提示词覆盖
    fandom = opts.fandomHint ? { name: opts.fandomHint, desc: "用户指定的影视/动漫/游戏世界观" } : pickOne(P.FANDOM_POOLS);
  }

  const hero = drawHero({ world: world.name });

  return { world, disaster, evil, diff, fandom, hero };
}

/**
 * 抽取勇者角色卡（外观 + 表面性格 + 核心性格）
 */
export function drawHero({ world } = {}) {
  const ap = P.HERO_APPEARANCE_POOLS;
  const appearance = {
    hairColor: pickOne(ap.hairColor),
    eyeColor: pickOne(ap.eyeColor),
    facialFeatures: pickOne(ap.facialFeatures),
    hairStyle: pickOne(ap.hairStyle),
    bodyBuild: pickOne(ap.bodyBuild),
    height: pickOne(ap.heightCategory),
    styleDaily: pickOne(ap.styleDaily),
    styleCombat: pickOne(ap.styleCombat),
    styleAdvanced: pickOne(ap.styleAdvanced)
  };

  const personality = {
    positive: pickN(P.HERO_PERSONALITY_POOLS.positive, 3),
    negative: pickOne(P.HERO_PERSONALITY_POOLS.negative),
    neutral: pickOne(P.HERO_PERSONALITY_POOLS.neutral)
  };

  const core = pickOne(P.HERO_CORE_TRAIT_POOLS);

  return { appearance, personality, core, world };
}

/**
 * 组装供 AI 润色的结构化提示片段（世界）
 */
export function worldToPromptText(draw) {
  const parts = [];
  parts.push(`世界背景：${draw.world.name}（${draw.world.desc}）`);
  parts.push(`灾厄形态：${draw.disaster.name}（${draw.disaster.desc}）`);
  parts.push(`邪恶势力：${draw.evil.name}（${draw.evil.desc}）`);
  parts.push(`灾厄侵蚀度：${draw.diff.level} · ${draw.diff.name}（${draw.diff.desc}）`);
  if (draw.fandom) parts.push(`同人锚定：${draw.fandom.name}（${draw.fandom.desc}）`);
  return parts.join("\n");
}

/**
 * 组装勇者卡的结构化描述（供 AI 润色为 YAML）
 * 兼容两种条目：纯字符串（无 desc）与 {name/type, desc} 对象。
 * 有 desc 的展示描述，无 desc 的只展示名称。
 */
export function heroToPromptText(hero) {
  const a = hero.appearance;
  const p = hero.personality;
  const nm = (x) => (x && typeof x === "object") ? (x.name || x.type || "") : String(x ?? "");
  const ds = (x) => (x && typeof x === "object") ? (x.desc || "") : "";
  const fmt = (x) => ds(x) ? `${nm(x)}（${ds(x)}）` : nm(x);
  const lines = [];
  lines.push(`勇者所在世界：${hero.world || "（由世界背景决定）"}`);
  lines.push(`发色：${fmt(a.hairColor)}`);
  lines.push(`瞳色：${fmt(a.eyeColor)}`);
  lines.push(`面部：${fmt(a.facialFeatures)}`);
  lines.push(`发型：${fmt(a.hairStyle)}`);
  lines.push(`身材：${fmt(a.bodyBuild)}`);
  lines.push(`身高：${fmt(a.height)}`);
  lines.push(`日常服饰：${fmt(a.styleDaily)}`);
  lines.push(`战斗服饰：${fmt(a.styleCombat)}`);
  lines.push(`高阶服饰：${fmt(a.styleAdvanced)}`);
  const posTxt = p.positive.map(fmt).join("、");
  lines.push(`表面性格（正面）：${posTxt}`);
  lines.push(`表面性格（负面）：${fmt(p.negative)}`);
  lines.push(`表面性格（中性）：${fmt(p.neutral)}`);
  lines.push(`核心性格：${fmt(hero.core)}`);
  return lines.join("\n");
}
