/**
 * 命运沙盘 —— AI 调用层
 * 复用酒馆主 API 或外接独立 API；统一封装 generate()，含异常捕获与重试。
 * 涉及 LLM 的：世界初始化 / 重Roll / 故事生成 / 大局总结 / 法则篡改 / 终局结算。
 */
import { store } from "./store.js";
import * as Draw from "./draw.js";
import { REWARD_TABLE } from "./pools.js";

// ---------- 读取酒馆上下文（多版本兼容） ----------
function getContext() {
  if (typeof SillyTavern !== "undefined") {
    if (typeof SillyTavern.getContext === "function") {
      const c = SillyTavern.getContext();
      if (c) return c;
    }
    if (SillyTavern.characters || SillyTavern.extensionSettings) return SillyTavern;
  }
  if (typeof window !== "undefined") {
    for (const key of ["SillyTavern", "ST", "context", "SillyTavernContext"]) {
      const w = window[key];
      if (w) {
        if (typeof w.getContext === "function") { const c = w.getContext(); if (c) return c; }
        if (w.characters) return w;
      }
    }
  }
  return null;
}

// ---------- 记忆宫殿联动 ----------
// 读取外部记忆插件「记忆宫殿」的摘要记忆，作为故事生成参考
function readMemoryPalace() {
  try {
    const ctx = getContext();
    if (!ctx) return "";
    // 常见记忆插件会把摘要写入 chat 元数据或全局
    const chat = ctx.chat || [];
    // 尝试从 chat 元数据的 extension 里找记忆摘要
    const meta = ctx.chat_metadata || ctx.characterData || {};
    const sources = [
      meta?.memoryPalace,
      meta?.extensions?.memoryPalace,
      meta?.extensions?.memory_palace,
      meta?.memory,
      meta?.summary
    ];
    for (const s of sources) {
      if (s && typeof s === "string" && s.trim()) return s.trim();
    }
    // 兜底：若 memory palace 以变量挂载在全局
    if (typeof window !== "undefined") {
      for (const key of ["memoryPalaceSummary", "memory_palace_summary", "MemoryPalace"]) {
        if (window[key] && typeof window[key] === "string" && window[key].trim()) {
          return window[key].trim();
        }
      }
    }
    return "";
  } catch (e) { return ""; }
}

// ---------- 外接独立 API 调用 ----------
async function callExternalApi(prompt, opts = {}) {
  const s = store.getSettings();
  const api = s.externalApi || {};
  if (!api.baseUrl) throw new Error("未配置外接 API 地址，请前往「法则镌刻」设置。");
  const url = api.baseUrl.replace(/\/$/, "") + "/v1/chat/completions";
  const body = {
    model: api.model || "gpt-4o-mini",
    messages: [{ role: "system", content: opts.system || "" }, { role: "user", content: prompt }],
    temperature: opts.temperature ?? 0.8,
    max_tokens: opts.maxTokens ?? 2048
  };
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(api.key ? { Authorization: `Bearer ${api.key}` } : {})
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`外部 API 返回错误：HTTP ${res.status}`);
  const data = await res.json();
  return data?.choices?.[0]?.message?.content || "";
}

// ---------- 复用酒馆主 API ----------
async function callHostApi(prompt, opts = {}) {
  const ctx = getContext();
  if (!ctx) throw new Error("无法读取酒馆上下文。");
  const generate = ctx.generate || ctx.generateQuietPrompt || null;
  if (typeof generate !== "function") {
    throw new Error("当前酒馆版本不支持静默生成，请切换为外接 API。");
  }
  // 静默生成，不污染聊天
  const text = await generate("quiet", prompt, {
    quietToLoud: false,
    skipWIAN: true,
    ...(opts.temperature != null ? { temperature: opts.temperature } : {})
  });
  return (typeof text === "string" ? text : (text?.text || ""));
}

// ---------- 统一入口 ----------
async function generate(prompt, opts = {}) {
  const s = store.getSettings();
  const mode = s.apiMode || "host";
  const runner = mode === "external" ? callExternalApi : callHostApi;
  return runner(prompt, opts);
}

// ---------- 带重试的封装 ----------
async function generateWithRetry(prompt, opts = {}) {
  const maxRetry = opts.maxRetry ?? 1;
  let lastErr;
  for (let i = 0; i <= maxRetry; i++) {
    try {
      return await generate(prompt, opts);
    } catch (e) {
      lastErr = e;
      if (i < maxRetry) await new Promise(r => setTimeout(r, 800));
    }
  }
  throw lastErr;
}

// ---------- 业务：初始化/重Roll 生成世界 ----------
// draw 由 draw.js 产出（本地抽卡结果），此处组装提示词并调用 LLM 润色
export async function generateWorldWithDraw(draw, { fandom = false } = {}) {
  const s = store.getSettings();
  const worldPrompt = s.prompts.world || DEFAULT_WORLD_PROMPT;
  const prompt = buildWorldPrompt(draw, worldPrompt, fandom);
  const text = await generateWithRetry(prompt, { temperature: 0.9, maxTokens: 2048 });
  return parseWorldResult(text, draw);
}

// 异界特典：自定义提示词 + 同人世界观
export async function generateWorldSpecial(fandomHint) {
  const s = store.getSettings();
  const worldPrompt = s.prompts.world || DEFAULT_WORLD_PROMPT;
  const prompt = `${worldPrompt}\n\n【异界特典 · 用户指定世界观】\n请围绕以下用户指定 IP/世界观生成完整世界：${fandomHint}`;
  const text = await generateWithRetry(prompt, { temperature: 0.9, maxTokens: 2048 });
  return parseWorldResult(text, { world: { name: fandomHint }, disaster: { name: "" }, evil: { name: "" }, diff: { level: store.getDifficulty(), name: "" }, fandom: { name: fandomHint }, hero: null });
}

// ---------- 勇者 YAML 润色 ----------
export async function polishHeroYaml(draw) {
  const s = store.getSettings();
  const prompt = buildHeroPrompt(draw);
  const text = await generateWithRetry(prompt, { temperature: 0.85, maxTokens: 1600 });
  return text.trim();
}

// ---------- 终局结算（三组内容） ----------
// opts.forced: 是否为 100 层强制结算（触发失败判定）
export async function settleJudgement(opts = {}) {
  const s = store.getSettings();
  const judgePrompt = s.prompts.judge || DEFAULT_JUDGE_PROMPT;
  const sagaPrompt = s.prompts.saga || DEFAULT_SAGA_PROMPT;
  const memory = readMemoryPalace();
  const world = store.getWorld();
  const difficulty = store.getDifficulty();

  // 1. 任务判定（传入星级标准 + 强制结算规则）
  const judgeText = await generateWithRetry(buildJudgePrompt(judgePrompt, world, difficulty, memory, opts), { temperature: 0.4, maxTokens: 800 });

  // 2. 归档故事（标题 + summary + 800-1000 字小说）
  const sagaText = await generateWithRetry(buildSagaPrompt(sagaPrompt, world, judgeText, memory), { temperature: 0.85, maxTokens: 2200 });

  // 3. 新任务由 ui 层再次调用 generateWorldWithDraw 生成
  return { judgeText, sagaText, memory };
}

// ---------- 提示词构造 ----------
function buildWorldPrompt(draw, worldPrompt, fandom) {
  const worldText = Draw.worldToPromptText(draw);
  const heroText = draw.hero ? Draw.heroToPromptText(draw.hero) : "";
  return `${worldPrompt}

【本轮本地抽卡结果】
${worldText}
${heroText ? "\n【勇者抽取结果】\n" + heroText : ""}

请据此润色生成完整世界设定，并输出以下四个字段（用清晰标签分隔）：
- 任务目标（终焉之劫）
- 世界难度（灾厄侵蚀度）
- 末世类型（灾厄形态）
- 勇者角色卡（契约勇者，YAML 格式）`;
}

function buildHeroPrompt(draw) {
  return `请根据以下勇者抽取结果，润色生成一个完整的 SillyTavern YAML 格式角色卡（包含 name、description、personality、scenario、first_mes 等字段），勇者名字需符合世界背景。

${heroToPrompt(draw)}

要求：
1. 名字贴合世界背景，富有记忆点。
2. description 整合外观与核心性格，展现灵魂底色。
3. personality 整合表面性格（正面3/负面1/中性1）。
4. scenario 设定勇者与灾厄、与<user>的初始关系。
5. 直接输出合法 YAML，不要多余说明。`;
}

function buildJudgePrompt(judgePrompt, world, difficulty, memory, opts = {}) {
  const starCriteria = `【任务完成星级评定标准】
- ⭐ 一星（隐患留存）：世界勉强拯救完成，但根基未稳，仍留存重大隐患，旧的邪恶势力随时可能卷土重来。
- ⭐⭐ 二星（中规中矩）：世界成功拯救，过程表现中规中矩，平稳过渡为一个普通的世界，各项秩序恢复到原本的起点。
- ⭐⭐⭐ 三星（完美拯救）：完美拯救世界，世界迎来新生并取得实质性突破，呈现出肉眼可见的蓬勃发展与繁荣景象。`;
  const forcedRule = opts.forced ? `

【⚠️ 强制结算规则】
本次结算由「100 层防死循环机制」强制触发。若根据上下文判断，本世界的“邪恶势力”尚未被彻底消灭或驱除，则必须直接判定为「任务失败」（0星），并给出失败结论。` : "";
  return `${judgePrompt}

${starCriteria}${forcedRule}

【当前世界】
任务目标：${world.goal || "（未设定）"}
世界难度：${difficulty}
末世类型：${world.disaster || ""}
契约勇者：${world.hero || ""}

【记忆宫殿摘要】
${memory || "（无）"}

请严格按以下 JSON 格式输出判定结果：
{"success": true/false, "star": 0-3, "points": 积分数值, "reason": "判定理由"}
积分参考表：${JSON.stringify(REWARD_TABLE[difficulty] || {})}`;
}

function buildSagaPrompt(sagaPrompt, world, judgeText, memory) {
  return `${sagaPrompt}

【世界信息】
${world.goal ? "任务目标：" + world.goal : ""}
${world.disaster ? "末世类型：" + world.disaster : ""}
${world.hero ? "契约勇者：" + world.hero : ""}

【任务判定】
${judgeText}

【记忆宫殿摘要】
${memory || "（无）"}

请生成：标题、Summary（一句话摘要）、以及 800-1000 字的小说故事。以 JSON 格式返回：{"title":"...","summary":"...","story":"..."}`;
}

// ---------- 解析世界结果（提取四大字段） ----------
function parseWorldResult(text, draw) {
  // 尝试从 AI 返回中提取四个字段；若失败则用抽卡原始数据兜底
  const result = { goal: "", difficultyText: "", disaster: "", hero: "" };
  // 用正则/标记提取，宽松匹配
  const g = extractField(text, ["任务目标", "终焉之劫"]);
  const d = extractField(text, ["世界难度", "灾厄侵蚀度"]);
  const dis = extractField(text, ["末世类型", "灾厄形态"]);
  const h = extractField(text, ["勇者角色卡", "契约勇者"]);
  result.goal = g || `任务目标：${draw.disaster.name}之下，勇者需拯救世界`;
  result.difficultyText = d || `${draw.diff.level}级 · ${draw.diff.name}`;
  result.disaster = dis || draw.disaster.name;
  result.hero = h || heroToPrompt(draw);
  return result;
}

function extractField(text, labels) {
  for (const label of labels) {
    const re = new RegExp(`${label}[：:【】\\s]*([^\\n]{4,})`, "i");
    const m = text.match(re);
    if (m) return m[1].trim();
  }
  return "";
}

// ---------- 兜底默认提示词 ----------
const DEFAULT_WORLD_PROMPT = `你是一位末世沙盘设计师。请依据以下随机抽取要素，生成一个完整的高沉浸世界设定，输出四个字段：任务目标（终焉之劫）、世界难度（灾厄侵蚀度）、末世类型（灾厄形态）、勇者角色卡（契约勇者，YAML 格式）。`;
const DEFAULT_JUDGE_PROMPT = `你是命运沙盘的审判者。根据当前世界与上下文，判定勇者任务是否完成。`;
const DEFAULT_SAGA_PROMPT = `你是史官。将本次救世历程书写为一段可传唱的史诗故事。`;
