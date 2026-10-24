/**
 * 命运沙盘 —— AI 调用层
 * 复用酒馆主 API 或外接独立 API；统一封装 generate()，含异常捕获与重试。
 * 涉及 LLM 的：世界初始化 / 重Roll / 故事生成 / 大局总结 / 法则篡改 / 终局结算。
 */
import { store } from "./store.js";
import * as Draw from "./draw.js";
import { REWARD_TABLE, DEFAULT_PROMPTS } from "./pools.js";

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

// ---------- 外接独立 API：拉取模型列表（参考「记忆宫殿」实现） ----------
export async function fetchExternalModels() {
  const s = store.getSettings();
  const api = s.externalApi || {};
  const url = (api.baseUrl || "").trim();
  const key = (api.key || "").trim();

  if (!url) throw new Error("请先填写外接 API 地址（Base URL）。");

  // 从可能含 /chat/completions 的地址反推 base URL
  let baseUrl = url;
  baseUrl = baseUrl.replace(/\/chat\/completions\/?$/, "");
  baseUrl = baseUrl.replace(/\/completions\/?$/, "");
  baseUrl = baseUrl.replace(/\/+$/, "");

  const modelsUrl = `${baseUrl}/models`;
  const headers = {};
  if (key) headers["Authorization"] = `Bearer ${key}`;

  const resp = await fetch(modelsUrl, { method: "GET", headers });
  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status}`);
  }
  const data = await resp.json();
  const models = (data.data || data.models || [])
    .map(m => m.id || m.name || m.model)
    .filter(x => typeof x === "string" && x)
    .sort();
  return models;
}

// ---------- 外接独立 API 调用（参考「记忆宫殿」实现） ----------
async function callExternalApi(prompt, opts = {}) {
  const s = store.getSettings();
  const api = s.externalApi || {};
  let url = (api.baseUrl || "").trim();
  const key = (api.key || "").trim();
  const model = (api.model || "").trim();

  if (!url) throw new Error("未配置外接 API 地址，请前往「法则镌刻」设置。");

  // URL 规范化：用户可能填 base URL（如 https://xxx.com/v1）而非完整
  // chat/completions 地址，自动补全，避免 POST 打到 base URL 上 404/405。
  if (!/\/chat\/completions\/?$/i.test(url)) {
    url = url.replace(/\/+$/, "") + "/chat/completions";
  }

  const system = opts.system || "";
  const merged = system ? `${system}\n\n---\n\n${prompt}` : prompt;

  const body = { messages: [{ role: "user", content: merged }] };
  // 只有填了 model 才带 model 字段（有些网关不填也能跑）
  if (model) body.model = model;
  if (opts.temperature != null) body.temperature = opts.temperature;
  if (opts.maxTokens != null) body.max_tokens = opts.maxTokens;

  const headers = { "Content-Type": "application/json" };
  if (key) headers["Authorization"] = `Bearer ${key}`;

  let resp;
  try {
    resp = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
  } catch (e) {
    throw new Error(`无法连接外部 API（${e?.message || "网络错误"}）。请检查地址是否可访问、是否需走代理。`);
  }

  if (!resp.ok) {
    let detail = "";
    try {
      const errData = await resp.json();
      detail = errData?.error?.message || errData?.message || errData?.error || "";
    } catch (_) { /* 忽略 */ }
    throw new Error(`外部 API 请求失败：HTTP ${resp.status}${detail ? " — " + detail : ""}`);
  }

  const data = await resp.json();
  // 兼容 OpenAI / Anthropic / 其他常见返回格式
  if (data.choices && data.choices[0] && data.choices[0].message) {
    return data.choices[0].message.content || "";
  }
  if (data.content && Array.isArray(data.content)) {
    const textParts = data.content.filter(c => c.type === "text").map(c => c.text);
    if (textParts.length) return textParts.join("\n");
  }
  if (typeof data.content === "string") return data.content;
  if (data.output_text) return data.output_text;
  if (data.output && Array.isArray(data.output)) {
    const txt = data.output.filter(c => c.type === "text").map(c => c.text).join("\n");
    if (txt) return txt;
  }
  return "";
}

// ---------- 复用酒馆主 API（官方 generateQuietPrompt 接口） ----------
// 参考「记忆宫殿」插件的成熟实现：generateQuietPrompt 只接受 { quietPrompt } 对象，
// 需把 system 与 user 合并进 quietPrompt，否则系统指令会被忽略。
async function callHostApi(prompt, opts = {}) {
  const ctx = getContext();
  if (!ctx) throw new Error("无法读取酒馆上下文（SillyTavern 全局对象未就绪）。");

  const system = opts.system || "";
  const merged = system ? `${system}\n\n---\n\n${prompt}` : prompt;

  // 首选官方 generateQuietPrompt（对象传参）
  if (typeof ctx.generateQuietPrompt === "function") {
    try {
      const result = await ctx.generateQuietPrompt({ quietPrompt: merged });
      return normalizeText(result);
    } catch (e) {
      throw new Error("酒馆 generateQuietPrompt 调用失败：" + (e?.message || e));
    }
  }

  // 备选：generateQuiet(type, prompt, options)
  if (typeof ctx.generateQuiet === "function") {
    try {
      const result = await ctx.generateQuiet("quiet", merged, {
        quietToLoud: false,
        skipWIAN: true,
        ...(opts.temperature != null ? { temperature: opts.temperature } : {})
      });
      return normalizeText(result);
    } catch (e) {
      throw new Error("酒馆 generateQuiet 调用失败：" + (e?.message || e));
    }
  }

  // 兜底：generate(type, prompt, options)
  if (typeof ctx.generate === "function") {
    try {
      const result = await ctx.generate("quiet", merged, {
        quietToLoud: false,
        skipWIAN: true,
        ...(opts.temperature != null ? { temperature: opts.temperature } : {})
      });
      return normalizeText(result);
    } catch (e) {
      throw new Error("酒馆 generate 调用失败：" + (e?.message || e));
    }
  }

  throw new Error("当前酒馆版本未暴露可用的生成接口，请切换为「外接独立 API」。");
}

// 归一化 AI 返回文本
function normalizeText(v) {
  if (typeof v === "string") return v;
  if (v && typeof v === "object") {
    if (typeof v.text === "string") return v.text;
    if (typeof v.content === "string") return v.content;
    if (Array.isArray(v.content)) {
      return v.content.map(c => c?.text || c?.content || "").join("");
    }
  }
  return String(v ?? "");
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
  return parseWorldResult(text, { world: { name: fandomHint }, diff: { level: store.getDifficulty(), name: "" }, fandom: true, hero: null });
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

请据此润色生成完整世界设定，并严格按以下四个标签分段输出（每段以标签行开头，标签后紧跟中文冒号，内容写在冒号之后或下一行；四个字段缺一不可，顺序如下）：
任务目标（终焉之劫）：
世界难度（灾厄侵蚀度）：
末世类型（灾厄形态）：
契约勇者（勇者角色卡 YAML）：`;
}

function buildHeroPrompt(draw) {
  const heroText = draw && draw.hero ? Draw.heroToPromptText(draw.hero) : "";
  return `请根据以下勇者抽取结果，润色生成一个完整的 SillyTavern YAML 格式角色卡（包含 name、description、personality、scenario、first_mes 等字段），勇者名字需符合世界背景。

${heroText}

【核心视角铁律：勇者对使命一无所知】
- 勇者绝对不知道「命运沙盘系统」「救世圣女」「拯救世界任务」以及「自己是勇者」的存在！他坚信自己只是生活在这个世界的普通本土原住民。
- YAML 的 description / personality / scenario / first_mes 中，绝对禁止出现「我是勇者」「拯救世界」「圣女」「系统」「积分」「任务面板」等跨维度词汇。
- 勇者的一切心理活动与行为逻辑，完全由其抽中的表面性格与核心性格驱动：正直→可能自发对抗邪恶、保护弱小；咸鱼/逃避→只想混吃等死、远离麻烦；自私/伪善→只顾谋取私利、保全自己。
- scenario 中勇者以普通人身份身处末世灾厄之中，对灾厄的反应（困惑、恐惧、麻木或抗争）必须符合其性格，而非任务意识。
- first_mes 中勇者以原住民日常状态与突然出现在他生命中的 <user>（圣女）相遇，对其身份来历可以好奇或警惕，但绝不能预先知晓其救世使命。
- 任务目标与积分机制是只属于 <user> 的系统面板信息，勇者视角对此完全不可见。

要求：
1. 名字贴合世界背景，富有记忆点。
2. description 整合外观与核心性格，展现灵魂底色（以本土原住民视角书写）。
3. personality 整合表面性格（正面3/负面1/中性1）。
4. scenario 设定勇者作为普通人在灾厄世界中的日常处境，与 <user> 的初始相遇关系。
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
  // 用正则/标记提取，宽松匹配；hero 为多行 YAML，需多行提取。
  // 注意 label 顺序：主标签在前（与提示词输出模板一致），别名在后兜底
  const g = extractField(text, ["任务目标", "终焉之劫"]);
  const d = extractField(text, ["世界难度", "灾厄侵蚀度"]);
  const dis = extractField(text, ["末世类型", "灾厄形态"]);
  const h = extractField(text, ["契约勇者", "勇者角色卡"], { multiline: true });

  // 四个标签全部提取失败时：若返回文本本身是 YAML 角色卡
  // （模型忽略分段指令、直接输出角色卡），整段作为 hero，其余三字段用抽卡兜底
  if (!g && !d && !dis && !h && looksLikeHeroYaml(text)) {
    return {
      goal: `在「${draw.world?.name || "灾厄"}」之下，勇者需拯救世界`,
      difficultyText: `${draw.diff?.level || "?"}级 · ${draw.diff?.name || ""}`,
      disaster: "（末世形态尚未显现）",
      hero: cleanLinePrefix(String(text)).trim()
    };
  }

  result.goal = g || `在「${draw.world?.name || "灾厄"}」之下，勇者需拯救世界`;
  result.difficultyText = d || `${draw.diff?.level || "?"}级 · ${draw.diff?.name || ""}`;
  result.disaster = dis || "（末世形态尚未显现）";
  // 兜底：用抽卡的勇者结构化文本（此前误调用不存在的 heroToPrompt，必然抛 ReferenceError）
  result.hero = h || (draw.hero ? Draw.heroToPromptText(draw.hero) : "（勇者尚未契约，可使用【法则篡改】补充角色卡）");
  return result;
}

// 四大字段的全部已知标签（用于识别"下一个字段开始"，截断多行提取）
const WORLD_FIELD_LABELS = ["任务目标", "终焉之劫", "世界难度", "灾厄侵蚀度", "末世类型", "灾厄形态", "勇者角色卡", "契约勇者"];

// 清理 markdown 代码块围栏（```yaml 等）与行首的加粗/列表装饰符号
function cleanLinePrefix(s) {
  return String(s || "").replace(/```[a-zA-Z0-9_-]*/g, "").replace(/^[\s*#>\-·：:、【】\[\]]+/, "");
}

// 判断某行是否是另一个字段的标签行（行首附近出现已知标签）
function isLabelLine(line) {
  const s = String(line || "").trim();
  if (!s) return false;
  return WORLD_FIELD_LABELS.some(lb => new RegExp(`^[【\\[\\*#\\s>\\-（(]*${lb}`, "i").test(s));
}

// 无效内容判定：仅由括号/标点/空白构成，或恰好是字段别名词本身。
// 典型场景：模型按输出模板写出「任务目标（终焉之劫）：」时，
// 提取器误把括号别名「（终焉之劫）：」当成内容返回，导致文本框只有标签残留。
function isJunkValue(s) {
  const t = String(s || "").trim();
  if (!t) return true;
  if (/^[（(【\[）)】\]：:·,，.。\s|/\\\-—_=+~`!*#><"'“”‘’]+$/.test(t)) return true;
  if (/^(yaml|json|角色卡|勇者角色卡|契约勇者|终焉之劫|灾厄侵蚀度|灾厄形态|任务目标|世界难度|末世类型)\s*[（(【\[）)】\]：:·,，。\s]*$/i.test(t)) return true;
  return false;
}

// 判断文本是否是 YAML 角色卡（含 name: 与 description/first_mes/personality 之一）
function looksLikeHeroYaml(text) {
  const t = String(text || "");
  return /^\s*name\s*:/m.test(t)
    && (/^\s*description\s*:/m.test(t) || /^\s*first_mes\s*:/m.test(t) || /^\s*personality\s*:/m.test(t));
}

/**
 * 从 AI 返回文本中提取字段内容。
 * @param {string} text  AI 返回全文
 * @param {string[]} labels  该字段的可能标签名（主标签在前）
 * @param {object} opts  { multiline: true } 时收集标签行之后的多个行（适配 YAML 角色卡）
 */
function extractField(text, labels, opts = {}) {
  const multiline = !!opts.multiline;
  const lines = String(text || "").split(/\r?\n/);
  for (const label of labels) {
    // 匹配「标签 + 可选括号别名 + 可选冒号」：
    // 覆盖 "任务目标：xxx" / "任务目标（终焉之劫）：xxx" / "任务目标（终焉之劫）: xxx" 等格式
    const re = new RegExp(`${label}\\s*(?:[（(【\\[][^）)】\\]]{0,24}[）)】\\]])?\\s*[：:]?\\s*`, "i");
    for (let i = 0; i < lines.length; i++) {
      const lm = lines[i].match(re);
      if (!lm) continue;
      // 标签同行残余内容（正则已消费括号别名与冒号）
      const sameLine = cleanLinePrefix(lines[i].slice(lm.index + lm[0].length)).trim();
      if (!multiline) {
        if (!isJunkValue(sameLine) && sameLine.length >= 4) return sameLine;
        // 同行无有效内容 → 向下找第一个非标签的非空行
        for (let j = i + 1; j < lines.length; j++) {
          if (isLabelLine(lines[j])) return "";
          const t = cleanLinePrefix(lines[j]).trim();
          if (!isJunkValue(t) && t.length >= 4) return t;
        }
        return "";
      }
      // 多行模式：收集到下一个字段标签行或文本末尾（适配 YAML 角色卡）
      const out = sameLine && !isJunkValue(sameLine) ? [sameLine] : [];
      for (let j = i + 1; j < lines.length; j++) {
        if (isLabelLine(lines[j])) break;
        out.push(cleanLinePrefix(lines[j]));
      }
      const joined = out.join("\n").trim();
      if (joined.length >= 4) return joined;
    }
  }
  return "";
}

// ---------- 兜底默认提示词（统一取自 pools.DEFAULT_PROMPTS） ----------
const DEFAULT_WORLD_PROMPT = DEFAULT_PROMPTS.world;
const DEFAULT_JUDGE_PROMPT = DEFAULT_PROMPTS.judge;
const DEFAULT_SAGA_PROMPT = DEFAULT_PROMPTS.saga;
