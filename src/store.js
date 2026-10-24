/**
 * 命运沙盘 —— 数据持久化层
 * 多端适配：本地酒馆 / 云酒馆 / TauriTavern
 * 通过 SillyTavern 提供的 settings 存储机制写入插件专属命名空间，
 * 卸载时由 onRemove 钩子调用 clearAll() 清空，不留残余。
 *
 * ⚠ 关键实现说明：SillyTavern.getContext() 每次调用都会返回一个【全新的临时
 * 快照对象】，把数据直接挂在它上面会随对象被丢弃而丢失（这正是此前
 * 「生成世界成功但文本框空白 / 上下文不注入」两个 bug 的根源）。
 * 因此本层统一把 __fateSandbox 命名空间挂在引用稳定的
 * ctx.extensionSettings 上：内存中引用唯一，且随 saveSettingsDebounced
 * 持久化到酒馆设置，也是官方推荐的第三方扩展数据存放位置。
 */
import * as P from "./pools.js";

const NS = "fate_sandbox";

// 默认状态
function defaultState() {
  return {
    crystal: 0,                 // 星光结晶（积分，可为负）
    inventory: {},              // 卡牌名 -> 数量
    difficulty: "F",            // 当前任务难度等级
    currentWorld: {             // 命运沙盘四大文本框
      goal: "",                 // 终焉之劫（任务目标）
      difficultyText: "",       // 灾厄侵蚀度（世界难度）
      disaster: "",             // 灾厄形态（末世类型）
      hero: ""                  // 契约勇者（勇者角色卡 YAML）
    },
    archives: [],               // 救世录：[{title, summary, story, world, ts}]
    settings: {
      prompts: {
        judge: P.DEFAULT_PROMPTS.judge,   // 审判（任务判定标准 Prompt）
        world: P.DEFAULT_PROMPTS.world,   // 创世神谕（任务生成 Prompt）
        saga: P.DEFAULT_PROMPTS.saga,     // 史官笔触（归档故事生成 Prompt）
        save: P.DEFAULT_PROMPTS.save      // 铭刻法则（保存修改 Prompt）
      },
      apiMode: "host",          // host（复用酒馆主 API）| external
      externalApi: { baseUrl: "", key: "", model: "" }
    },
    silent: false,              // 静默模式：关闭后不发送/接收信息
    skin: "light",              // 皮肤：light（日间浅色）| dark（夜间）
    ballHidden: false,          // 悬浮球被用户手动关闭
    ballInteracted: false,      // 用户是否已首次点击悬浮球（点击前不回缩）
    pools: null,                // 卡池覆盖（后台编辑后存此，null 表示用默认）
    pendingJudge: null,         // 终局结算判定缓存（防止重复结算）
    floor: 0,                   // 当前任务在酒馆内已进行的楼层数（100 层强制结算用）
    lastChatId: null            // 检测切换聊天/新任务时重置楼层
  };
}

// 多版本兼容：获取酒馆上下文对象（仅用于读取 API / 事件等，
// 绝不可作为存储宿主——它每次调用都是新对象）
function getContextObject() {
  if (typeof SillyTavern !== "undefined") {
    if (typeof SillyTavern.getContext === "function") {
      const c = SillyTavern.getContext();
      if (c) return c;
    }
    if (SillyTavern.extensionSettings || SillyTavern.characters) return SillyTavern;
  }
  if (typeof window !== "undefined") {
    for (const key of ["SillyTavern", "ST", "context"]) {
      const w = window[key];
      if (w) {
        if (typeof w.getContext === "function") { const c = w.getContext(); if (c) return c; }
        if (w.extensionSettings || w.characters) return w;
      }
    }
  }
  return null;
}

// 获取稳定、可持久化的设置宿主：extensionSettings。
// 候选顺序：context 快照上的 extensionSettings 引用 →
// 全局 SillyTavern.extensionSettings → window → null。
function getSettingsHost() {
  const ctx = getContextObject();
  if (ctx && ctx.extensionSettings && typeof ctx.extensionSettings === "object") {
    return ctx.extensionSettings;
  }
  if (typeof SillyTavern !== "undefined" && SillyTavern.extensionSettings && typeof SillyTavern.extensionSettings === "object") {
    return SillyTavern.extensionSettings;
  }
  if (typeof window !== "undefined") return window;
  return null;
}

// 无任何宿主时的内存兜底（保证插件在极端环境下仍可运行）
let _memStore = null;

// 获取持久化存储对象（SillyTavern 扩展 settings）
function getStore() {
  const host = getSettingsHost();
  if (!host) {
    if (!_memStore) _memStore = defaultState();
    return _memStore;
  }
  if (!host.__fateSandbox || typeof host.__fateSandbox !== "object") host.__fateSandbox = defaultState();
  // 迁移：补齐缺失的默认 Prompt（老存档兼容）
  const s = host.__fateSandbox.settings;
  if (s && s.prompts) {
    for (const k of ["judge", "world", "saga", "save"]) {
      if (!s.prompts[k]) s.prompts[k] = P.DEFAULT_PROMPTS[k];
    }
    // 迁移：旧版「创世神谕」缺少勇者完整性规范（导致勇者 YAML 只有只言片语）→ 升级为 v2 模板
    if (typeof s.prompts.world === "string" && !s.prompts.world.includes("勇者角色卡完整性规范")) {
      s.prompts.world = P.DEFAULT_PROMPTS.world;
    }
  }
  // 迁移：清理旧版卡池覆盖（v2 结构变更——删除 DISASTER/EVIL、合并三档西幻、新增同人池）
  const po = host.__fateSandbox.pools;
  if (po && typeof po === "object") {
    let changed = false;
    if (po.DISASTER_POOLS || po.EVIL_FACTION_POOLS) {
      delete po.DISASTER_POOLS;
      delete po.EVIL_FACTION_POOLS;
      changed = true;
    }
    if (Array.isArray(po.WORLD_TYPE_POOLS)) {
      const oldIds = ["low_magic", "mid_magic", "high_magic"];
      const hasOld = po.WORLD_TYPE_POOLS.some(w => w && oldIds.includes(w.id));
      const hasMerged = po.WORLD_TYPE_POOLS.some(w => w && w.id === "western_fantasy");
      if (hasOld && !hasMerged) {
        const at = Math.max(po.WORLD_TYPE_POOLS.findIndex(w => w && oldIds.includes(w.id)), 0);
        po.WORLD_TYPE_POOLS = po.WORLD_TYPE_POOLS.filter(w => !(w && oldIds.includes(w.id)));
        po.WORLD_TYPE_POOLS.splice(at, 0, P.WORLD_TYPE_POOLS[0]);
        changed = true;
      }
    }
    if (!po.IP_UNIVERSE_POOLS) { po.IP_UNIVERSE_POOLS = P.IP_UNIVERSE_POOLS; changed = true; }
    if (changed) persist();
  }
  return host.__fateSandbox;
}

// 同步写回 settings（触发酒馆保存）
function persist() {
  try {
    const ctx = getContextObject();
    if (ctx && typeof ctx.saveSettingsDebounced === "function") ctx.saveSettingsDebounced();
  } catch (e) { /* 忽略 */ }
}

export const store = {
  get() { return getStore(); },

  // 积分
  getCrystal() { return getStore().crystal; },
  addCrystal(n) { getStore().crystal += n; persist(); },
  setCrystal(n) { getStore().crystal = n; persist(); },

  // 卡牌库存
  getInventory() { return getStore().inventory; },
  addCard(name, n = 1) {
    const inv = getStore().inventory;
    inv[name] = (inv[name] || 0) + n;
    persist();
  },
  consumeCard(name) {
    const inv = getStore().inventory;
    if ((inv[name] || 0) <= 0) return false;
    inv[name]--;
    persist();
    return true;
  },
  hasCard(name) { return (getStore().inventory[name] || 0) > 0; },

  // 当前世界
  getWorld() { return getStore().currentWorld; },
  setWorld(w) { getStore().currentWorld = w; persist(); },
  getDifficulty() { return getStore().difficulty; },
  setDifficulty(d) { getStore().difficulty = d; persist(); },

  // 归档
  getArchives() { return getStore().archives; },
  addArchive(a) { getStore().archives.push(a); persist(); },
  removeArchive(i) { getStore().archives.splice(i, 1); persist(); },

  // 设置
  getSettings() { return getStore().settings; },
  saveSettings(s) { getStore().settings = s; persist(); },

  // 静默模式
  isSilent() { return !!getStore().silent; },
  setSilent(v) { getStore().silent = !!v; persist(); },

  // 皮肤（日间浅色 / 夜间）
  getSkin() { return getStore().skin || "light"; },
  setSkin(v) { getStore().skin = v === "dark" ? "dark" : "light"; persist(); },

  // 悬浮球显隐与首触状态
  isBallHidden() { return !!getStore().ballHidden; },
  setBallHidden(v) { getStore().ballHidden = !!v; persist(); },
  isBallInteracted() { return !!getStore().ballInteracted; },
  setBallInteracted(v) { getStore().ballInteracted = !!v; persist(); },

  // 卡池覆盖
  getPoolsOverride() { return getStore().pools; },
  setPoolsOverride(p) { getStore().pools = p; persist(); },

  // 结算判定缓存
  getPendingJudge() { return getStore().pendingJudge; },
  setPendingJudge(j) { getStore().pendingJudge = j; persist(); },

  // 楼层计数（100 层防死循环）
  getFloor() { return getStore().floor; },
  setFloor(n) { getStore().floor = n; persist(); },
  getLastChatId() { return getStore().lastChatId; },
  setLastChatId(id) { getStore().lastChatId = id; persist(); },

  // 破产保护
  bankrupt() { getStore().crystal = 0; persist(); },

  // 一键初始化：所有存档数据归零（保留皮肤偏好，避免界面突变）
  resetAll() {
    const keepSkin = store.getSkin();
    const fresh = defaultState();
    const host = getSettingsHost();
    if (host) host.__fateSandbox = fresh;
    else _memStore = fresh;
    if (keepSkin === "dark") fresh.skin = "dark";
    persist();
    return fresh;
  },

  // 卸载清空（不留残余）
  clearAll() {
    try {
      const ctx = getContextObject();
      const host = getSettingsHost();
      if (host) delete host.__fateSandbox;
      _memStore = null;
      if (typeof window !== "undefined") delete window.__fateSandbox;
      if (ctx && typeof ctx.saveSettingsDebounced === "function") ctx.saveSettingsDebounced();
    } catch (e) {
      _memStore = null;
      if (typeof window !== "undefined") delete window.__fateSandbox;
    }
  }
};

// 获取生效的卡池（优先后台覆盖，否则默认）
export function activePools() {
  const override = store.getPoolsOverride();
  if (override) return override;
  return {
    WORLD_TYPE_POOLS: P.WORLD_TYPE_POOLS,
    DIFFICULTY_POOLS: P.DIFFICULTY_POOLS,
    HERO_APPEARANCE_POOLS: P.HERO_APPEARANCE_POOLS,
    HERO_PERSONALITY_POOLS: P.HERO_PERSONALITY_POOLS,
    HERO_CORE_TRAIT_POOLS: P.HERO_CORE_TRAIT_POOLS,
    FANDOM_POOLS: P.FANDOM_POOLS,
    IP_UNIVERSE_POOLS: P.IP_UNIVERSE_POOLS
  };
}
