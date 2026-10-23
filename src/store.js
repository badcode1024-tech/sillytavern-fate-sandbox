/**
 * 命运沙盘 —— 数据持久化层
 * 多端适配：本地酒馆 / 云酒馆 / TauriTavern
 * 通过 SillyTavern 提供的 settings 存储机制写入插件专属命名空间，
 * 卸载时由 onRemove 钩子调用 clearAll() 清空，不留残余。
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
        judge: "",    // 审判（任务判定标准 Prompt）
        world: "",    // 创世神谕（任务生成 Prompt）
        saga: "",     // 史官笔触（归档故事生成 Prompt）
        save: ""      // 铭刻法则（保存修改 Prompt）
      },
      theme: "day",             // day | night
      apiMode: "host",          // host（复用酒馆主 API）| external
      externalApi: { baseUrl: "", key: "", model: "" },
      cardBind: "谁召唤了全能之神" // 角色卡精确匹配名
    },
    pools: null,                // 卡池覆盖（后台编辑后存此，null 表示用默认）
    pendingJudge: null,         // 终局结算判定缓存（防止重复结算）
    floor: 0,                   // 当前任务在酒馆内已进行的楼层数（100 层强制结算用）
    lastChatId: null            // 检测切换聊天/新任务时重置楼层
  };
}

// 获取持久化存储对象（SillyTavern 扩展 settings）
function getStore() {
  // 兼容不同版本酒馆的 settings 扩展方式
  const ext = (typeof SillyTavern !== "undefined" && SillyTavern.getContext)
    ? SillyTavern.getContext()
    : (typeof window !== "undefined" ? window : {});
  if (!ext.__fateSandbox) ext.__fateSandbox = defaultState();
  return ext.__fateSandbox;
}

// 同步写回 settings（触发酒馆保存）
function persist() {
  try {
    if (typeof SillyTavern !== "undefined" && SillyTavern.getContext) {
      const ctx = SillyTavern.getContext();
      ctx.saveSettingsDebounced && ctx.saveSettingsDebounced();
    }
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

  // 卸载清空（不留残余）
  clearAll() {
    try {
      if (typeof SillyTavern !== "undefined" && SillyTavern.getContext) {
        const ctx = SillyTavern.getContext();
        delete ctx.__fateSandbox;
        ctx.saveSettingsDebounced && ctx.saveSettingsDebounced();
      }
    } catch (e) {
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
    DISASTER_POOLS: P.DISASTER_POOLS,
    EVIL_FACTION_POOLS: P.EVIL_FACTION_POOLS,
    HERO_APPEARANCE_POOLS: P.HERO_APPEARANCE_POOLS,
    HERO_PERSONALITY_POOLS: P.HERO_PERSONALITY_POOLS,
    HERO_CORE_TRAIT_POOLS: P.HERO_CORE_TRAIT_POOLS,
    FANDOM_POOLS: P.FANDOM_POOLS
  };
}
