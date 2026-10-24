/**
 * 命运沙盘 —— 随机抽卡引擎（本地实现）
 * 从卡池中严谨随机抽取并组合生成世界，交由 AI 层润色。
 * 支持：世界背景 / 同人世界观 / 勇者外观·表面性格·核心性格。
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
 * 每次只抽取一个世界观，杜绝不同世界观杂糅混淆。
 * @param {object} opts { difficulty, fandom? }
 *   - fandom=true：异界锚定卡，仅从 IP_UNIVERSE_POOLS 抽取一个同人世界观，
 *     不抽原本的 WORLD_TYPE_POOLS，交由 LLM 润色生成完整世界观并匹配当前等级。
 *   - 否则：仅从 WORLD_TYPE_POOLS 抽取一个世界背景。
 */
export function drawWorld(opts = {}) {
  const difficulty = opts.difficulty || "F";
  const diff = P.DIFFICULTY_POOLS.find(d => d.level === difficulty) || P.DIFFICULTY_POOLS[0];

  let world;
  if (opts.fandom) {
    // 异界锚定：仅从同人世界观卡池抽取一个具体同人世界观，不抽原本世界观卡池
    world = pickOne(P.IP_UNIVERSE_POOLS);
  } else {
    // 常规：仅从世界背景卡池抽取一个世界观（每次只抽一个）
    world = pickOne(P.WORLD_TYPE_POOLS);
  }

  const hero = drawHero({ world: world.name });

  return { world, diff, fandom: !!opts.fandom, hero };
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
  const wdesc = draw.world.desc ? `（${draw.world.desc}）` : "";
  parts.push(`世界背景：${draw.world.name}${wdesc}`);
  parts.push(`灾厄侵蚀度：${draw.diff.level} · ${draw.diff.name}（${draw.diff.desc}）`);
  if (draw.fandom) parts.push(`同人锚定：本次世界基于「${draw.world.name}」同人世界观生成，请据此润色一个风格统一、逻辑自洽的完整世界观，并匹配当前灾厄等级。`);
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
