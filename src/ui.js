/**
 * 命运沙盘 —— UI 层
 * 悬浮球拖拽吸附 + 六大分栏 + 卡牌翻转 + 日夜皮肤 + 响应式。
 * 安装即用：悬浮球默认显示，不识别角色卡名称。
 * 「静默模式」开关：关闭后插件不再发送/接收信息。
 */
import { store, activePools } from "./store.js";
import * as Draw from "./draw.js";
import * as AI from "./ai.js";
import { CARD_DEFINITIONS, REWARD_TABLE, DIFFICULTY_ORDER, FLOOR_LIMIT } from "./pools.js";

const NS = "fate-sandbox";

// ---------- 状态 ----------
let currentPanel = 0;
let pendingRedeem = null;      // 待兑换卡牌
let unlockedField = null;      // 已解锁编辑的字段
let importField = null;        // 旧世复苏导入的目标字段

// ---------- 工具 ----------
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function el(tag, attrs = {}, html = "") {
  const e = document.createElement(tag);
  for (const k in attrs) {
    if (k === "class") e.className = attrs[k];
    else if (k === "style") e.style.cssText = attrs[k];
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), attrs[k]);
    else e.setAttribute(k, attrs[k]);
  }
  if (html) e.innerHTML = html;
  return e;
}

// 转义 HTML
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ---------- 资源路径解析 ----------
// 插件内的相对路径（如 assets/cards/xx.jpg）需转为酒馆可访问的绝对路径。
// SillyTavern 扩展资源统一挂在 /scripts/extensions/<插件名>/ 下。
let _pluginBase = null;
function assetUrl(rel) {
  if (!rel) return rel;
  if (/^(https?:|data:|blob:)/i.test(rel)) return rel; // 已是绝对/内联
  if (rel.startsWith("/")) return rel;
  if (_pluginBase == null) {
    // 尝试从已加载的样式/脚本中推断插件根路径
    const probe = document.querySelector('link[href*="fate-sandbox"], script[src*="fate-sandbox"]');
    if (probe) {
      const href = probe.href || probe.src || "";
      _pluginBase = href.replace(/\/[^\/]*$/, "") + "/";
    } else {
      // 兜底：按标准扩展路径拼接
      _pluginBase = "/scripts/extensions/fate-sandbox/";
    }
  }
  return _pluginBase + rel.replace(/^\.\//, "");
}

// ---------- 获取酒馆上下文（多版本兼容，仅楼层监控/AI 用） ----------
function getSTContext() {
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

// ---------- 静默模式 ----------
function isSilent() { return store.isSilent(); }

// 悬浮球状态：显隐 + 回缩
function applyBallState() {
  const ball = $("#fs-ball");
  if (!ball) return;
  const hidden = store.isBallHidden();
  const interacted = store.isBallInteracted();
  ball.style.display = hidden ? "none" : "flex";
  // 只有首次点击/拖拽后才缩回露 2/5；未交互时完整贴边显示
  ball.classList.toggle("fs-docked", hidden ? false : interacted);
  ball.classList.toggle("fs-silent", isSilent());
  ball.title = hidden ? "" : (isSilent() ? "命运沙盘 · 静默模式已开启" : "命运沙盘");
}

// 悬浮球激活状态：静默样式同步 + 扩展面板开关同步
function applyActive() {
  const silent = isSilent();
  const panel = $("#fs-panel");
  if (panel) panel.classList.toggle("fs-silent", silent);
  syncSilentBtn();
  applyBallState();
  syncExtToggle();
}

// ---------- 挂载 DOM ----------
// 当前插件版本指纹（与 manifest.json 保持一致）：
// 用于「双实例防御」——扩展目录存在两份副本（或浏览器缓存旧模块）时，
// 先挂载的旧版本会让新版 mount() 静默退出，导致用户点击的仍是旧代码按钮
// （症状：生成世界"成功"但文本框空白、上下文不注入，与修复前一模一样）。
const FS_VERSION = "1.9.2";

// 仅移除 DOM 节点（不动数据，供版本接管 / 卸载复用）
function removeDOM() {
  ["#fs-ball", "#fs-panel", "#fs-zoom-mask", "#fs-modal-mask", "#fs-import-file"].forEach(sel => {
    const n = $(sel);
    if (n) n.remove();
  });
}

function mount() {
  // 双实例防御：已有 DOM 且属于本版本 → 幂等返回
  const existing = document.getElementById("fs-ball");
  if (existing) {
    if (existing.dataset.fsVersion === FS_VERSION) return;
    // 属于旧版本实例 → 拆除其 DOM，由本版本接管 UI 控制权
    console.warn(`[命运沙盘] 检测到旧版本实例（v${existing.dataset.fsVersion || "?"}）已挂载，新版 v${FS_VERSION} 正在接管 UI。建议删除旧副本并重启酒馆。`);
    removeDOM();
    // 弹窗 DOM 在本函数后半段才创建，延迟到挂载完成后提示
    setTimeout(() => {
      showModal("⚠️ 检测到插件旧版本实例",
        `<p>扩展目录中似乎存在两份「命运沙盘」（或浏览器缓存了旧模块）。</p>
         <p>新版已接管界面，但旧实例的后台定时器可能仍在运行。</p>
         <p style="color:var(--fs-accent)">请删除旧副本文件夹后，重启酒馆（或 Ctrl+F5 硬刷新）。</p>`);
    }, 200);
  }
  // 悬浮球（安装即显示，兵棋外观；未交互前不回缩，点击后缩回露 2/5）
  const ball = el("div", { class: "fs-ball", id: "fs-ball" });
  ball.dataset.fsVersion = FS_VERSION;
  ball.innerHTML = `
    <img class="fs-ball-img" src="${assetUrl('assets/ball_pawn.png')}" alt="命运沙盘" draggable="false">
    <button class="fs-ball-close" id="fs-ball-close" title="关闭悬浮球（可在酒馆扩展中重新开启）"><i class="fa-solid fa-xmark"></i></button>`;
  ball.addEventListener("click", e => {
    if (ball.dataset.dragged) { ball.dataset.dragged = ""; return; }
    if (e.target.closest("#fs-ball-close")) return;
    if (!store.isBallInteracted()) { store.setBallInteracted(true); }
    togglePanel();
  });
  document.body.appendChild(ball);
  $("#fs-ball-close").addEventListener("click", e => {
    e.stopPropagation();
    store.setBallHidden(true);
    applyBallState();
    // 同步扩展面板与设置分栏开关
    const ext = $("#fs-ext-ball-toggle");
    if (ext) ext.checked = false;
    const inner = $("#fs-ball-toggle");
    if (inner) inner.checked = false;
  });

  // 主面板
  const panel = el("div", { class: "fs-panel", id: "fs-panel", style: "display:none" });
  panel.dataset.fsVersion = FS_VERSION;
  panel.innerHTML = buildPanelHTML();
  document.body.appendChild(panel);

  // 卡牌翻转遮罩
  const zoom = el("div", { class: "fs-zoom-mask", id: "fs-zoom-mask" });
  zoom.innerHTML = `
    <div class="fs-flip" id="fs-flip">
      <div class="fs-flip-inner">
        <div class="fs-flip-face fs-flip-front">
          <div class="fs-card-art" id="fs-zoom-icon">🃏</div>
          <div class="fs-card-name" id="fs-zoom-name"></div>
          <div class="fs-card-cost" id="fs-zoom-cost"></div>
        </div>
        <div class="fs-flip-face fs-flip-back">
          <h4 id="fs-zoom-back-name"></h4>
          <p id="fs-zoom-desc"></p>
        </div>
      </div>
    </div>
    <div class="fs-flip-tip">点击任意处收起卡牌</div>`;
  document.body.appendChild(zoom);

  // 通用弹窗
  const modal = el("div", { class: "fs-modal-mask", id: "fs-modal-mask" });
  modal.innerHTML = `
    <div class="fs-modal" id="fs-modal-box">
      <h3 id="fs-modal-title"></h3>
      <div id="fs-modal-body"></div>
      <button class="fs-modal-close" id="fs-modal-close">知晓</button>
    </div>`;
  document.body.appendChild(modal);

  // 隐藏文件导入框
  const file = el("input", { type: "file", accept: ".json", id: "fs-import-file", style: "display:none" });
  document.body.appendChild(file);

  bindEvents();
  initBallDrag();
  renderAll();
  // 安装即显示悬浮球，同步静默状态
  applyActive();
}

function buildPanelHTML() {
  return `
  <div class="fs-panel-header">
    <div class="fs-title"><i class="fa-solid fa-dice-d20"></i>命运沙盘</div>
    <div class="fs-skin-ctrl">
      <button class="fs-icon-btn" id="fs-silent-btn" title="静默模式：关闭后停止发送/接收信息"><i class="fa-solid fa-volume-high"></i></button>
    </div>
  </div>
  <div class="fs-nav">
    <div class="fs-tab active" data-panel="0"><i class="fa-solid fa-chess-board"></i>命运沙盘</div>
    <div class="fs-tab" data-panel="1"><i class="fa-solid fa-gem"></i>圣女印记</div>
    <div class="fs-tab" data-panel="2"><i class="fa-solid fa-scale-balanced"></i>交易所</div>
    <div class="fs-tab" data-panel="3"><i class="fa-solid fa-book-skull"></i>救世录</div>
    <div class="fs-tab" data-panel="4"><i class="fa-solid fa-scroll"></i>法则镌刻</div>
  </div>
  <div class="fs-body">
    <div class="fs-pane active" data-pane="0"></div>
    <div class="fs-pane" data-pane="1"></div>
    <div class="fs-pane" data-pane="2"></div>
    <div class="fs-pane" data-pane="3"></div>
    <div class="fs-pane" data-pane="4"></div>
  </div>
  <div class="fs-panel-footer">
    <button class="fs-close-btn" id="fs-close-btn"><i class="fa-solid fa-chevron-down"></i> 收起面板</button>
  </div>`;
}

// ---------- 悬浮球拖拽吸附 ----------
function initBallDrag() {
  const ball = $("#fs-ball");
  let sx, sy, bx, by, dragging = false;
  ball.addEventListener("pointerdown", e => {
    if (e.target.closest("#fs-ball-close")) return;
    dragging = true;
    ball.dataset.dragged = "";
    sx = e.clientX; sy = e.clientY;
    const r = ball.getBoundingClientRect();
    bx = r.left; by = r.top;
    ball.setPointerCapture(e.pointerId);
  });
  ball.addEventListener("pointermove", e => {
    if (!dragging) return;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    if (Math.abs(dx) + Math.abs(dy) > 5) ball.dataset.dragged = "1";
    const vw = window.innerWidth, vh = window.innerHeight;
    const w = ball.offsetWidth, h = ball.offsetHeight;
    let nx = Math.max(0, Math.min(vw - w, bx + dx));
    let ny = Math.max(0, Math.min(vh - h, by + dy));
    ball.style.left = nx + "px";
    ball.style.top = ny + "px";
    ball.style.right = "auto";
  });
  ball.addEventListener("pointerup", e => {
    dragging = false;
    if (ball.dataset.dragged) {
      // 拖拽过 = 已交互，之后允许缩回
      store.setBallInteracted(true);
      snapBall();
    }
    ball.dataset.dragged = "";
  });
}

function snapBall() {
  const ball = $("#fs-ball");
  const r = ball.getBoundingClientRect();
  const vw = window.innerWidth, vh = window.innerHeight;
  const cx = r.left + r.width / 2;
  const ny = Math.max(0, Math.min(vh - r.height, r.top));
  ball.style.transition = "left .35s cubic-bezier(.25,.8,.25,1), top .35s cubic-bezier(.25,.8,.25,1), right .35s cubic-bezier(.25,.8,.25,1)";
  ball.style.top = ny + "px";
  if (cx < vw / 2) {
    // 左侧吸附：露出 2/5，隐藏 3/5
    ball.style.right = "auto";
    ball.style.left = -(r.width * 3 / 5) + "px";
  } else {
    // 右侧吸附：露出 2/5
    ball.style.left = "auto";
    ball.style.right = -(r.width * 3 / 5) + "px";
    ball.style.top = ny + "px";
  }
  setTimeout(() => { ball.style.transition = ""; }, 400);
}

// ---------- 事件绑定 ----------
function bindEvents() {
  // 导航
  $$(".fs-tab").forEach(tab => tab.addEventListener("click", () => switchPanel(+tab.dataset.panel)));

  // 静默模式开关（顶栏）
  $("#fs-silent-btn").addEventListener("click", toggleSilent);

  // 关闭
  $("#fs-close-btn").addEventListener("click", () => togglePanel(false));

  // 弹窗
  $("#fs-modal-close").addEventListener("click", closeModal);
  $("#fs-modal-mask").addEventListener("click", e => { if (e.target.id === "fs-modal-mask") closeModal(); });

  // 卡牌翻转
  $("#fs-zoom-mask").addEventListener("click", confirmRedeem);

  // 文件导入
  $("#fs-import-file").addEventListener("change", handleImport);

  // 定时同步静默状态 + 楼层监控（不再识别角色卡）
  setInterval(() => { applyActive(); monitorFloor(); }, 1500);
  applyActive();
}

// ---------- 静默模式切换 ----------
function toggleSilent() {
  const next = !store.isSilent();
  store.setSilent(next);
  applyActive();
  syncSilentBtn();
  showModal(next ? "🔇 静默模式已开启" : "🔊 静默模式已关闭",
    next ? "<p>插件已进入静默模式：不再发送或接收任何信息（AI 生成、楼层监控均已暂停）。</p>"
         : "<p>插件已恢复运行，重新开始发送与接收信息。</p>");
}

// ---------- 酒馆扩展面板注入「显示悬浮球」开关 ----------
let _extToggleInjected = false;
function syncExtToggle() {
  // 仅注入一次；注入后由 checkbox 的 change 事件驱动状态，不再每次轮询覆盖 checked
  if (_extToggleInjected) return;
  const container = document.getElementById("extensions_settings2") || document.getElementById("extensions_settings");
  if (!container) return; // 未找到则下次轮询重试
  const block = el("div", { class: "extension_settings", id: "fs-extension-block" });
  block.innerHTML = `
    <div class="inline-drawer">
      <div class="inline-drawer-toggle inline-drawer-header">
        <b>命运沙盘 Fate Sandbox</b>
        <div class="inline-drawer-icon fa-solid fa-caret-down down"></div>
      </div>
      <div class="inline-drawer-content" style="padding:8px 12px">
        <label class="checkbox_label" style="display:flex;align-items:center;gap:8px;cursor:pointer">
          <input type="checkbox" id="fs-ext-ball-toggle" ${!store.isBallHidden() ? "checked" : ""}>
          <span>显示悬浮球</span>
        </label>
        <label class="checkbox_label" style="display:flex;align-items:center;gap:8px;cursor:pointer;margin-top:4px">
          <input type="checkbox" id="fs-ext-silent-toggle" ${isSilent() ? "checked" : ""}>
          <span>静默模式（停止发送/接收信息）</span>
        </label>
      </div>
    </div>`;
  container.appendChild(block);
  const ballCb = block.querySelector("#fs-ext-ball-toggle");
  ballCb.addEventListener("change", e => {
    const show = e.target.checked;
    store.setBallHidden(!show);
    applyBallState();
    // 同步设置分栏里的同名开关
    const inner = $("#fs-ball-toggle");
    if (inner) inner.checked = show;
  });
  block.querySelector("#fs-ext-silent-toggle").addEventListener("change", e => {
    store.setSilent(e.target.checked);
    applyActive();
    const inner = $("#fs-silent-toggle");
    if (inner) inner.checked = e.target.checked;
  });
  _extToggleInjected = true;
}

function syncSilentBtn() {
  const btn = $("#fs-silent-btn");
  if (!btn) return;
  const silent = isSilent();
  btn.classList.toggle("active", silent);
  const icon = btn.querySelector("i");
  if (icon) icon.className = silent ? "fa-solid fa-volume-xmark" : "fa-solid fa-volume-high";
  btn.title = silent ? "静默模式已开启（点击恢复）" : "静默模式：关闭后停止发送/接收信息";
}

// ---------- 100 层防死循环监控 ----------
let floorSettling = false;
function monitorFloor() {
  if (isSilent() || floorSettling) return; // 静默时暂停楼层监控
  try {
    const ctx = getSTContext();
    if (!ctx) return;
    const chatId = ctx.chatId || ctx.chat?.chatId || "default";
    // 切换了聊天/新任务 → 重置计数
    if (store.getLastChatId() !== chatId) {
      store.setLastChatId(chatId);
      store.setFloor(0);
      return;
    }
    const chatLen = Array.isArray(ctx.chat) ? ctx.chat.length : 0;
    if (chatLen > store.getFloor()) store.setFloor(chatLen);
    // 达到 100 层且未主动结算 → 强制拉起结算
    if (chatLen >= FLOOR_LIMIT) {
      floorSettling = true;
      showModal("☠ 「因果超过临界」",
        `<p>你已在本界域徘徊至第 <b>${FLOOR_LIMIT}</b> 层，仍未完成终局结算。</p>
         <p>命运沙盘将强制收回当前世界线，并根据邪恶势力是否被消灭进行判定——若邪恶尚存，本次任务将被判定为<b style="color:#c23b2a">失败</b>并扣除积分。</p>
         <button class="fs-wax danger" id="fs-forced-settle" style="margin-top:10px">接受强制结算</button>`, true);
      $("#fs-forced-settle").addEventListener("click", () => {
        closeModal();
        actionSettle({ forced: true }).finally(() => { floorSettling = false; });
      });
    }
  } catch (e) { /* 静默 */ }
}

function togglePanel(force) {
  const panel = $("#fs-panel");
  if (!panel) return;
  const open = force !== undefined ? force : !panel.classList.contains("open");
  if (open) {
    panel.classList.add("open");
    panel.style.display = "flex";   // 显式显示（面板挂载时是 display:none）
    renderAll();
  } else {
    panel.classList.remove("open");
    panel.style.display = "none";
    // 已交互过的悬浮球在面板关闭后缩回屏幕，只露 2/5
    if (store.isBallInteracted()) snapBall();
  }
}

function switchPanel(idx) {
  currentPanel = idx;
  $$(".fs-tab").forEach(t => t.classList.toggle("active", +t.dataset.panel === idx));
  $$(".fs-pane").forEach(p => p.classList.toggle("active", +p.dataset.pane === idx));
  renderPanel(idx);
}

// ---------- 弹窗 ----------
function showModal(title, bodyHTML, noBtn) {
  $("#fs-modal-title").innerHTML = title;
  $("#fs-modal-body").innerHTML = bodyHTML;
  $("#fs-modal-close").style.display = noBtn ? "none" : "inline-block";
  $("#fs-modal-mask").classList.add("show");
}
function closeModal() { $("#fs-modal-mask").classList.remove("show"); }
function warn(title, text) { showModal("⚠️ " + title, `<p>${esc(text)}</p>`); }

// ---------- 渲染 ----------
function renderAll() {
  renderPanel(currentPanel);
}

function renderPanel(idx) {
  if (idx === 0) renderSandbox();
  else if (idx === 1) renderAssets();
  else if (idx === 2) renderShop();
  else if (idx === 3) renderArchive();
  else if (idx === 4) renderSettings();
}

// ===== 面板0：命运沙盘 =====
const FIELD_DEFS = [
  { key: "goal", id: "sandbox-goal-text", title: "终焉之劫", sub: "任务目标", icon: "fa-skull" },
  { key: "difficultyText", id: "sandbox-difficulty-text", title: "灾厄侵蚀度", sub: "世界难度", icon: "fa-biohazard" },
  { key: "disaster", id: "sandbox-disaster-text", title: "灾厄形态", sub: "末世类型", icon: "fa-tornado" },
  { key: "hero", id: "sandbox-hero-text", title: "契约勇者", sub: "勇者角色卡", icon: "fa-shield-halved" }
];

function renderSandbox() {
  const pane = $('.fs-pane[data-pane="0"]');
  const floor = store.getFloor();
  const floorPct = Math.min(100, Math.floor(floor / FLOOR_LIMIT * 100));
  const floorWarn = floorPct >= 70;
  pane.innerHTML = `
    <h2 class="fs-sub"><i class="fa-solid fa-hourglass-end"></i>命运沙盘 · 当前任务</h2>
    <div class="fs-floor-bar ${floorWarn ? 'warn' : ''}">
      <div class="fs-floor-label"><i class="fa-solid fa-layer-group"></i>界域深度 ${floor} / ${FLOOR_LIMIT} 层${floorWarn ? ' · ⚠️ 临近强制结算' : ''}</div>
      <div class="fs-floor-track"><div class="fs-floor-fill" style="width:${floorPct}%"></div></div>
    </div>`;
  const world = store.getWorld();

  FIELD_DEFS.forEach((f, i) => {
    const locked = unlockedField !== f.key;
    const field = el("div", { class: "fs-field" });
    field.innerHTML = `
      <span class="fs-lock-tag"><i class="fa-solid ${locked ? 'fa-lock' : 'fa-lock-open'}"></i> ${locked ? '锁定' : '可篡改'}</span>
      <div class="fs-field-head"><i class="fa-solid ${f.icon}"></i>${f.title}<span class="fs-field-sub">${f.sub}</span></div>
      <textarea id="${f.id}" data-key="${f.key}" ${locked ? 'disabled' : ''}>${esc(world[f.key] || '')}</textarea>
      <div class="fs-field-btns">
        <button class="fs-wax" data-act="tamper"><i class="fa-solid fa-pen-ruler"></i>法则篡改</button>
        <button class="fs-wax ${locked ? '' : 'show'}" data-act="save" style="${locked ? 'display:none' : ''}"><i class="fa-solid fa-floppy-disk"></i>保存篡改</button>
      </div>`;
    field.querySelector('[data-act="tamper"]').addEventListener("click", () => onTamper(f.key));
    field.querySelector('[data-act="save"]').addEventListener("click", () => onSaveTamper(f.key));
    pane.appendChild(field);
  });

  // 底部操作按钮（5 + 终局结算）
  const footer = el("div", { class: "fs-sandbox-footer" });
  footer.innerHTML = `
    <button class="fs-wax" data-act="reroll"><i class="fa-solid fa-dice"></i>重塑因果</button>
    <button class="fs-wax alt" data-act="import"><i class="fa-solid fa-upload"></i>旧世复苏</button>
    <button class="fs-wax alt" data-act="anchor"><i class="fa-solid fa-wand-sparkles"></i>异界锚定</button>
    <button class="fs-wax alt" data-act="special"><i class="fa-solid fa-crown"></i>异界特典</button>
    <button class="fs-wax alt" data-act="challenge"><i class="fa-solid fa-flag"></i>越级挑战</button>
    <button class="fs-wax primary" data-act="settle" style="width:100%"><i class="fa-solid fa-sword"></i>终局结算</button>`;
  footer.querySelector('[data-act="reroll"]').addEventListener("click", () => actionReroll());
  footer.querySelector('[data-act="import"]').addEventListener("click", () => actionImport());
  footer.querySelector('[data-act="anchor"]').addEventListener("click", () => actionAnchor());
  footer.querySelector('[data-act="special"]').addEventListener("click", () => actionSpecial());
  footer.querySelector('[data-act="challenge"]').addEventListener("click", () => actionChallenge());
  footer.querySelector('[data-act="settle"]').addEventListener("click", () => actionSettle());
  pane.appendChild(footer);
}

// 通用强效填值函数：底层 DOM 直接强写（即使 locked/disabled/readonly 也强制赋值）
function updateSandboxUI(worldData) {
  if (!worldData) worldData = store.getWorld();
  if (!worldData) return;
  // 双选择器兜底：稳定 id + data-field/data-key 属性
  const fields = {
    goal: document.querySelector('#sandbox-goal-text, [data-key="goal"], [data-field="goal"]'),
    difficulty: document.querySelector('#sandbox-difficulty-text, [data-key="difficultyText"], [data-field="difficulty"]'),
    disaster: document.querySelector('#sandbox-disaster-text, [data-key="disaster"], [data-field="disaster"]'),
    hero: document.querySelector('#sandbox-hero-text, [data-key="hero"], [data-field="hero"]')
  };
  const values = {
    goal: worldData.goal || "",
    difficulty: worldData.difficultyText || worldData.difficulty || "",
    disaster: worldData.disaster || "",
    hero: typeof worldData.hero === "object" ? JSON.stringify(worldData.hero, null, 2) : (worldData.hero || "")
  };
  for (const [key, element] of Object.entries(fields)) {
    if (element) {
      // 哪怕是 readonly / disabled 状态，也强制赋值
      element.value = values[key];
      // 手动派发 input 和 change 事件，防止响应式框架拦截
      try { element.dispatchEvent(new Event("input", { bubbles: true })); } catch (_) {}
      try { element.dispatchEvent(new Event("change", { bubbles: true })); } catch (_) {}
    } else {
      console.error(`[命运沙盘] 找不到字段 ${key} 对应的 DOM 元素！`);
    }
  }
  // 同步刷新官方扩展提示词，确保酒馆内存里的沙盘数据随时最新
  registerExtensionPrompt();
  console.log("[命运沙盘] 沙盘 UI 已强制刷新：", {
    goal: values.goal ? "√" : "空",
    difficulty: values.difficulty ? "√" : "空",
    disaster: values.disaster ? "√" : "空",
    hero: values.hero ? "√" : "空"
  });
}

// 卡牌名映射
const CARD_BY_ACT = {
  reroll: "重塑因果", import: "旧世复苏", tamper: "法则篡改",
  anchor: "异界锚定", special: "异界特典"
};

async function onTamper(fieldKey) {
  const card = "法则篡改";
  if (!store.hasCard(card)) {
    warn("「因果干涉失败」", `缺少【${card}】，无法干涉当前世界线。请前往【交易所】兑换。`);
    return;
  }
  unlockedField = fieldKey;
  renderSandbox();
}

async function onSaveTamper(fieldKey) {
  const ta = $(`textarea[data-key="${fieldKey}"]`);
  const val = ta.value.trim();
  if (!store.consumeCard("法则篡改")) return;
  const world = store.getWorld();
  world[fieldKey] = val;
  store.setWorld(world);
  unlockedField = null;
  updateSandboxUI(world);   // 存盘即刷盘
  renderSandbox();
  showModal("✦ 法则已篡改", `<p>「${FIELD_DEFS.find(f => f.key === fieldKey).title}」已被改写。</p>`);
  // 铭刻法则 Prompt（可选 AI 润色，此处直接本地保存）
}

// 通用卡牌消耗 + AI 生成
async function actionReroll() {
  if (!store.hasCard("重塑因果")) return warn("「因果干涉失败」", "缺少【重塑因果】，无法干涉当前世界线。请前往【交易所】兑换。");
  store.consumeCard("重塑因果");
  await doGenerateWorld({});
}

async function actionAnchor() {
  if (!store.hasCard("异界锚定")) return warn("「因果干涉失败」", "缺少【异界锚定】，无法干涉当前世界线。请前往【交易所】兑换。");
  store.consumeCard("异界锚定");
  await doGenerateWorld({ fandom: true });
}

async function actionSpecial() {
  if (!store.hasCard("异界特典")) return warn("「因果干涉失败」", "缺少【异界特典】，无法干涉当前世界线。请前往【交易所】兑换。");
  showModal("异界特典", `<p>请输入你想要进入的世界（影视/动漫/游戏 IP 或世界观）：</p><textarea id="fs-special-input" style="width:100%;min-height:70px"></textarea><button class="fs-wax" id="fs-special-confirm" style="margin-top:10px">确认生成</button>`);
  $("#fs-special-confirm").addEventListener("click", async () => {
    const hint = $("#fs-special-input").value.trim();
    if (!hint) return;
    store.consumeCard("异界特典");
    closeModal();
    if (isSilent()) { warn("🔇 静默模式", "插件处于静默模式，已停止发送/接收信息。请先关闭静默模式。"); return; }
    showLoading();
    try {
      const result = await AI.generateWorldSpecial(hint);
      store.setWorld(result);
      updateSandboxUI(result);   // 存盘即刷盘
      showModal("✦ 世界已生成", "异界特典世界已编织完成。");
    } catch (e) {
      showModal("「界域演化失败」", `<p>${esc(e.message)}</p><button class="fs-wax" id="fs-retry" data-act="special">再次生成</button>`);
    }
    renderSandbox();
    updateSandboxUI();           // 双保险：renderSandbox 重建 DOM 后再强写一次
  });
}

async function actionChallenge() {
  const opts = DIFFICULTY_ORDER.map(lv => {
    const card = `越级挑战·${lv}`;
    const cost = CARD_DEFINITIONS.find(c => c.level === lv)?.cost ?? 0;
    return `<button class="fs-wax" data-lv="${lv}">${lv}级（${cost}积分）</button>`;
  }).join("");
  showModal("越级挑战", `<p>选择目标难度等级：</p><div style="display:flex;flex-wrap:wrap;gap:8px">${opts}</div>`);
  $$(".fs-modal [data-lv]").forEach(b => b.addEventListener("click", async () => {
    const lv = b.dataset.lv;
    const card = `越级挑战·${lv}`;
    closeModal();
    if (!store.hasCard(card)) return warn("「因果干涉失败」", `缺少【${card}】，无法干涉当前世界线。请前往【交易所】兑换。`);
    store.consumeCard(card);
    store.setDifficulty(lv);
    await doGenerateWorld({ difficulty: lv });
  }));
}

async function actionImport() {
  if (!store.hasCard("旧世复苏")) return warn("「因果干涉失败」", "缺少【旧世复苏】，无法干涉当前世界线。请前往【交易所】兑换。");
  importField = "all";
  $("#fs-import-file").click();
}

async function handleImport(e) {
  const f = e.target.files[0];
  if (!f) return;
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const data = JSON.parse(ev.target.result);
      if (!store.consumeCard("旧世复苏")) return;
      const world = store.getWorld();
      if (data.终焉之劫 || data.goal) world.goal = data.终焉之劫 || data.goal;
      if (data.灾厄侵蚀度 || data.difficultyText) world.difficultyText = data.灾厄侵蚀度 || data.difficultyText;
      if (data.灾厄形态 || data.disaster) world.disaster = data.灾厄形态 || data.disaster;
      if (data.契约勇者 || data.hero) world.hero = data.契约勇者 || data.hero;
      if (data.title) world.goal = data.title + (world.goal ? "\n" + world.goal : "");
      store.setWorld(world);
      updateSandboxUI(world);   // 存盘即刷盘
      renderSandbox();
      showModal("「旧世复苏」", "旧世界已从界域种子中唤回。");
    } catch (err) {
      warn("「界域种子损坏」", "无法解析该 JSON 文件，请确认它是由「凝炼界域种子」导出的存档。");
    }
  };
  reader.readAsText(f);
  e.target.value = "";
}

// 判断是否处于「初始空档」：无归档、无进行中世界
function isInitialEmpty() {
  const world = store.getWorld();
  const hasWorld = !!(world.goal || world.disaster || world.hero || world.difficultyText);
  return store.getArchives().length === 0 && !hasWorld;
}

// 初次开启任务：自动生成 F 级初始世界并填入四大文本框
async function doGenerateInitialWorld() {
  showLoading("「界域创生中...」", "侦测到空白沙盘，正在为你创生第一个 F 级命运世界...");
  try {
    store.setDifficulty("F");
    const draw = Draw.drawWorld({ difficulty: "F", fandom: false });
    const result = await AI.generateWorldWithDraw(draw, {});
    store.setWorld(result);
    store.setFloor(0);
    updateSandboxUI(result);   // 存盘即刷盘
    closeModal();
    showModal("✦ 命运世界已创生",
      `<p>已为你开启第一个 <b>F 级</b>命运任务，四大核心设定已填入沙盘。</p>
       <p style="color:var(--fs-accent)">请前往「命运沙盘」查看任务目标，开启你的救世之旅。</p>`);
    renderAll();
    updateSandboxUI();         // 双保险：renderAll 重建 DOM 后再强写一次文本框
  } catch (e) {
    closeModal();
    showModal("「界域创生失败」", `<p>${esc(e.message)}</p><button class="fs-wax" id="fs-retry">重试</button>`);
    $("#fs-retry").addEventListener("click", () => { closeModal(); doGenerateInitialWorld(); });
  }
}

// 通用世界生成
async function doGenerateWorld(opts = {}) {
  if (isSilent()) { warn("🔇 静默模式", "插件处于静默模式，已停止发送/接收信息。请先关闭静默模式。"); return; }
  showLoading();
  try {
    const draw = Draw.drawWorld({ difficulty: opts.difficulty || store.getDifficulty(), fandom: opts.fandom });
    const result = await AI.generateWorldWithDraw(draw, { fandom: opts.fandom });
    store.setWorld(result);
    store.setDifficulty(draw.diff.level);
    updateSandboxUI(result);   // 存盘即刷盘：强制写入四大文本框
    closeModal();
    showModal("✦ 世界已重塑", "新的因果线已编织完成。");
    renderSandbox();
    updateSandboxUI();         // 双保险：renderSandbox 重建 DOM 后再强写一次
  } catch (e) {
    closeModal();
    showModal("「界域演化失败」", `<p>${esc(e.message)}</p><button class="fs-wax" id="fs-retry">再次手动结算</button>`);
    $("#fs-retry").addEventListener("click", () => { closeModal(); doGenerateWorld(opts); });
  }
}

// 终局结算（opts.forced = 100层强制触发）
async function actionSettle(opts = {}) {
  if (isSilent()) { warn("🔇 静默模式", "插件处于静默模式，已停止发送/接收信息。请先关闭静默模式。"); return; }

  // 初始为空 → 等同于「第一次开启任务」，自动生成 F 级初始世界
  if (isInitialEmpty()) {
    await doGenerateInitialWorld();
    return;
  }

  showLoading("「界域演化中...」", opts.forced
    ? "⚠️ 已抵达第 100 层界域深渊，命运沙盘正在强制收回因果线..."
    : "正在消耗【创世微尘】，为新世界编织因果与召唤勇者...");
  try {
    const { judgeText, sagaText } = await AI.settleJudgement(opts);

    // 解析判定结果（优先 JSON，兜底正则）
    const judge = parseJudge(judgeText);
    const reward = REWARD_TABLE[store.getDifficulty()];
    let star = judge.star ?? 0;
    let points = judge.points;
    if (points == null && reward) {
      points = star > 0 ? reward.success[star - 1] : reward.fail;
    }
    store.addCrystal(points ?? 0);

    // 解析故事（title/summary/story）
    const saga = parseSaga(sagaText);

    // 归档（失败也归档，标记结局）
    store.addArchive({
      title: saga.title, summary: saga.summary, story: saga.story,
      world: store.getWorld(), ts: Date.now(),
      result: star > 0 ? `${"⭐".repeat(star)}（${star}星）` : "任务失败"
    });

    // 难度阶梯：成功升一级，失败停留原等级
    if (star > 0) {
      const order = DIFFICULTY_ORDER;
      const idx = order.indexOf(store.getDifficulty());
      if (idx >= 0 && idx < order.length - 1) store.setDifficulty(order[idx + 1]);
    }

    // 生成新任务（自动填充下一世界）
    const nextDraw = Draw.drawWorld({ difficulty: store.getDifficulty(), fandom: false });
    const nextWorld = await AI.generateWorldWithDraw(nextDraw, {});
    store.setWorld(nextWorld);
    updateSandboxUI(nextWorld);   // 存盘即刷盘：新任务填充四大文本框

    // 重置楼层计数
    store.setFloor(0);

    closeModal();
    const verdict = star > 0
      ? `<p>任务判定：<b>${"⭐".repeat(star)}</b>（${star} 星）</p><p>获得积分：${points ?? 0}</p>`
      : `<p>任务判定：<b style="color:#c23b2a">任务失败</b></p><p>扣除积分：${points ?? 0}</p>`;
    const forcedNote = opts.forced ? `<p style="color:#c23b2a;font-size:.85em">本结算由「100 层防死循环机制」强制触发。</p>` : "";
    showModal(star > 0 ? "✦ 任务判定" : "☠ 任务判定",
      verdict + forcedNote + `<p style="color:var(--fs-accent)">请在酒馆对话框输入「我要进入下一个任务」开启新任务。</p>`, true);
    renderAll();
    updateSandboxUI();            // 双保险：renderAll 重建 DOM 后再强写一次
  } catch (e) {
    closeModal();
    showModal("「界域演化失败」", `<p>${esc(e.message)}</p><button class="fs-wax" id="fs-retry">再次手动结算</button>`);
    $("#fs-retry").addEventListener("click", () => { closeModal(); actionSettle(opts); });
  }
}

// JSON 优先解析判定结果
function parseJudge(text) {
  try {
    const m = text.match(/\{[\s\S]*\}/);
    if (m) {
      const j = JSON.parse(m[0]);
      return { success: !!j.success, star: Math.max(0, Math.min(3, +j.star || 0)), points: j.points != null ? +j.points : null, reason: j.reason || "" };
    }
  } catch (e) { /* 兜底正则 */ }
  const starMatch = text.match(/([1-3])\s*星/);
  const ptsMatch = text.match(/[-+]?\d+\s*(?:积分|点|结晶)/);
  return { star: starMatch ? +starMatch[1] : 0, points: ptsMatch ? parseInt(ptsMatch[0]) : null };
}
function parseSaga(text) {
  let data = { title: "", summary: "", story: text };
  try {
    const m = text.match(/\{[\s\S]*\}/);
    if (m) data = JSON.parse(m[0]);
  } catch (e) { /* 兜底 */ }
  if (!data.title) data.title = "未命名界域";
  if (!data.summary) data.summary = "（无摘要）";
  return data;
}

function showLoading(title = "「界域演化中...」", text = "正在消耗【创世微尘】，为新世界编织因果与召唤勇者...") {
  showModal(title, `<div class="fs-spin"><i class="fa-solid fa-atom"></i></div><p style="margin-top:12px">${esc(text)}</p>`, true);
}

// ===== 面板1：圣女印记 =====
function renderAssets() {
  const pane = $('.fs-pane[data-pane="1"]');
  const crystal = store.getCrystal();
  const debt = crystal < 0;
  pane.innerHTML = `
    <h2 class="fs-sub"><i class="fa-solid fa-gem"></i>圣女印记 · 个人资产</h2>
    <div class="fs-crystal-box">
      <div class="fs-crystal-label">✦ 星光结晶 ✦</div>
      <div class="fs-crystal-val ${debt ? 'debt' : ''}">${crystal}</div>
      <div class="fs-debt-tag ${debt ? 'show' : ''}" id="fs-debt"><i class="fa-solid fa-triangle-exclamation"></i> 负债</div>
    </div>
    <h3 class="fs-sub" style="font-size:.95em"><i class="fa-solid fa-id-badge"></i>持有卡牌</h3>
    <div class="fs-inv-grid" id="fs-inv-grid"></div>
    <button class="fs-wax primary" id="fs-bankrupt" style="margin-top:16px"><i class="fa-solid fa-eraser"></i>破产保护（负债归零）</button>`;

  const inv = store.getInventory();
  const grid = $("#fs-inv-grid");
  const keys = Object.keys(inv);
  if (!keys.length) grid.innerHTML = '<div class="fs-empty">尚无任何卡牌</div>';
  keys.forEach(name => {
    const def = CARD_DEFINITIONS.find(c => c.name === name);
    const icon = def ? def.icon : "fa-id-badge";
    grid.appendChild(el("div", { class: "fs-inv-item" }, `
      <div class="fs-inv-icon"><i class="fa-solid ${icon}"></i></div>
      <div class="fs-inv-name">${esc(name)}</div>
      <div class="fs-inv-count">× ${inv[name]}</div>`));
  });

  $("#fs-bankrupt").addEventListener("click", () => {
    store.bankrupt();
    renderAssets();
    showModal("✦ 破产保护", "负债已归零，星光结晶恢复为 0。");
  });
}

// ===== 面板2：交易所 =====
function renderShop() {
  const pane = $('.fs-pane[data-pane="2"]');
  pane.innerHTML = `
    <h2 class="fs-sub"><i class="fa-solid fa-scale-balanced"></i>交易所 · 积分商城</h2>
    <div class="fs-shop-group-title"><i class="fa-solid fa-layer-group"></i>常规卡牌组</div>
    <div class="fs-shop-grid" id="fs-shop-normal"></div>
    <div class="fs-shop-group-title" style="margin-top:20px"><i class="fa-solid fa-wand-sparkles"></i>同人卡牌组</div>
    <div class="fs-shop-grid" id="fs-shop-fan"></div>
    <div class="fs-shop-group-title" style="margin-top:20px"><i class="fa-solid fa-flag"></i>越级挑战卡组</div>
    <div class="fs-shop-grid" id="fs-shop-challenge"></div>`;

  buildShopGroup("normal", "#fs-shop-normal");
  buildShopGroup("fandom", "#fs-shop-fan");
  buildShopGroup("difficulty", "#fs-shop-challenge");
}

function buildShopGroup(category, selector) {
  const grid = $(selector);
  grid.innerHTML = "";
  const cards = CARD_DEFINITIONS.filter(c => c.category === category);
  cards.forEach(card => {
    const c = el("div", { class: "fs-card" });
    const art = card.img
      ? `<img class="fs-card-img" src="${assetUrl(card.img)}" alt="${esc(card.name)}" loading="lazy">`
      : `<i class="fa-solid ${card.icon}"></i>`;
    // 越级挑战卡：公用途图片，叠加等级标签
    const levelTag = card.level ? `<span class="fs-card-level">${esc(card.level)}</span>` : "";
    c.innerHTML = `
      <div class="fs-card-art">${art}${levelTag}</div>
      <div class="fs-card-name">${esc(card.name)}</div>
      <div class="fs-card-cost"><i class="fa-solid fa-gem"></i>${card.cost}</div>
      <button class="fs-redeem"><i class="fa-solid fa-arrows-rotate"></i> 结晶转化</button>`;
    c.querySelector(".fs-redeem").addEventListener("click", () => openRedeem(card));
    grid.appendChild(c);
  });
}

function openRedeem(card) {
  if (store.getCrystal() < card.cost) {
    warn("「因果点数透支」", "你需要拯救更多世界或清偿负债，方可获取此权柄。");
    return;
  }
  pendingRedeem = card;
  $("#fs-zoom-icon").innerHTML = card.img
    ? `<img class="fs-card-img" src="${assetUrl(card.img)}" alt="${esc(card.name)}">`
    : `<i class="fa-solid ${card.icon}"></i>`;
  $("#fs-zoom-name").textContent = card.name;
  $("#fs-zoom-cost").innerHTML = `<i class="fa-solid fa-gem"></i> ${card.cost}`;
  $("#fs-zoom-back-name").textContent = card.name;
  $("#fs-zoom-desc").textContent = card.desc || "（暂无功能简介）";
  const flip = $("#fs-flip");
  flip.classList.remove("flipped");
  $("#fs-zoom-mask").classList.add("show");
  setTimeout(() => flip.classList.add("flipped"), 350);
}

function confirmRedeem() {
  if (!pendingRedeem) return;
  const card = pendingRedeem;
  pendingRedeem = null;
  $("#fs-zoom-mask").classList.remove("show");
  store.addCrystal(-card.cost);
  store.addCard(card.name, 1);
  showModal("✦ 结晶转化成功", `<p>已消耗 <b>${card.cost}</b> 枚星光结晶，获得【${esc(card.name)}】×1。<br>当前余额：${store.getCrystal()}</p>`);
  renderAssets();
  renderShop();
}

// ===== 面板3：救世录 =====
function renderArchive() {
  const pane = $('.fs-pane[data-pane="3"]');
  pane.innerHTML = `<h2 class="fs-sub"><i class="fa-solid fa-book-skull"></i>救世录 · 归档与导出</h2><div id="fs-archive-list"></div>`;
  const list = $("#fs-archive-list");
  const archives = store.getArchives();
  if (!archives.length) { list.innerHTML = '<div class="fs-empty">尚无被拯救的世界，史册等待第一笔墨迹。</div>'; return; }

  archives.forEach((a, i) => {
    const item = el("div", { class: "fs-saga" });
    item.innerHTML = `
      <div class="fs-saga-title"><i class="fa-solid fa-book"></i>${esc(a.title || "未命名界域")}${a.result ? `<span class="fs-saga-result">${esc(a.result)}</span>` : ""}</div>
      <div class="fs-saga-sum">${esc(a.summary || "")}</div>
      <div class="fs-saga-btns">
        <button class="fs-wax" data-act="read"><i class="fa-solid fa-ear-listen"></i>聆听回响</button>
        <button class="fs-wax alt" data-act="txt"><i class="fa-solid fa-feather-pointed"></i>传唱吟游诗篇</button>
        <button class="fs-wax alt" data-act="json"><i class="fa-solid fa-seedling"></i>凝炼界域种子</button>
        <button class="fs-wax danger" data-act="del"><i class="fa-solid fa-fire"></i>焚毁史册</button>
      </div>`;
    item.querySelector('[data-act="read"]').onclick = () => showModal(`<i class="fa-solid fa-book-open"></i> ${esc(a.title)}`, `<div class="fs-story-text">${esc(a.story || "（这段回响已然湮灭）")}</div>`);
    item.querySelector('[data-act="txt"]').onclick = () => download(`${a.title}.txt`, `${a.title}\n\n${a.summary}\n\n${a.story}`, "text/plain;charset=utf-8");
    item.querySelector('[data-act="json"]').onclick = () => {
      const w = a.world || {};
      download(`${a.title}.json`, JSON.stringify({ 标题: a.title, 摘要: a.summary, 终焉之劫: w.goal, 灾厄侵蚀度: w.difficultyText, 灾厄形态: w.disaster, 契约勇者: w.hero }, null, 2), "application/json");
    };
    item.querySelector('[data-act="del"]').onclick = () => {
      showModal("🔥 焚毁史册", `<p>确定要将《${esc(a.title)}》付之一炬吗？此举不可逆。</p><button class="fs-wax danger" id="fs-confirm-del" style="margin-top:8px">确认焚毁</button>`);
      $("#fs-confirm-del").onclick = () => { store.removeArchive(i); closeModal(); renderArchive(); };
    };
    list.appendChild(item);
  });
}

function download(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = el("a", { href: url, download: filename });
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

// ===== 面板4：法则镌刻 =====
function renderSettings() {
  const pane = $('.fs-pane[data-pane="4"]');
  const s = store.getSettings();
  pane.innerHTML = `
    <h2 class="fs-sub"><i class="fa-solid fa-scroll"></i>法则镌刻 · 设置</h2>
    <div class="fs-set-block">
      <label><i class="fa-solid fa-eye"></i>悬浮球显示</label>
      <div class="fs-silent-row">
        <span style="font-size:.88em;color:var(--fs-ink-soft)">关闭后隐藏悬浮球（也可在酒馆「扩展」设置中重新开启）。</span>
        <label class="fs-toggle">
          <input type="checkbox" id="fs-ball-toggle" ${!store.isBallHidden() ? 'checked' : ''}>
          <span class="fs-toggle-slider"></span>
        </label>
      </div>
    </div>
    <div class="fs-set-block">
      <label><i class="fa-solid fa-volume-xmark"></i>静默模式</label>
      <div class="fs-silent-row">
        <span style="font-size:.88em;color:var(--fs-ink-soft)">开启后插件不再发送 / 接收任何信息（AI 生成、楼层监控暂停）。</span>
        <label class="fs-toggle">
          <input type="checkbox" id="fs-silent-toggle" ${isSilent() ? 'checked' : ''}>
          <span class="fs-toggle-slider"></span>
        </label>
      </div>
    </div>
    <div class="fs-set-block">
      <label><i class="fa-solid fa-scale-unbalanced"></i>审判 · 任务判定标准 Prompt</label>
      <textarea id="fs-prompt-judge">${esc(s.prompts.judge || "")}</textarea>
    </div>
    <div class="fs-set-block">
      <label><i class="fa-solid fa-wand-magic-sparkles"></i>创世神谕 · 任务生成 Prompt</label>
      <textarea id="fs-prompt-world">${esc(s.prompts.world || "")}</textarea>
    </div>
    <div class="fs-set-block">
      <label><i class="fa-solid fa-pen-nib"></i>史官笔触 · 归档故事生成 Prompt</label>
      <textarea id="fs-prompt-saga">${esc(s.prompts.saga || "")}</textarea>
    </div>
    <div class="fs-set-block">
      <label><i class="fa-solid fa-stamp"></i>铭刻法则 · 保存修改 Prompt</label>
      <textarea id="fs-prompt-save">${esc(s.prompts.save || "")}</textarea>
    </div>

    <div class="fs-set-block">
      <label><i class="fa-solid fa-cloud"></i>API 配置</label>
      <div class="fs-api-row">
        <label style="display:flex;align-items:center;gap:6px"><input type="radio" name="fs-apimode" value="host" ${s.apiMode === 'host' ? 'checked' : ''}> 复用酒馆主 API</label>
        <label style="display:flex;align-items:center;gap:6px"><input type="radio" name="fs-apimode" value="external" ${s.apiMode === 'external' ? 'checked' : ''}> 外接独立 API</label>
      </div>
      <div id="fs-external-fields" style="${s.apiMode === 'external' ? '' : 'display:none'}">
        <input id="fs-ext-url" placeholder="API 地址（如 https://api.example.com）" value="${esc(s.externalApi?.baseUrl || '')}">
        <input id="fs-ext-key" placeholder="API Key（可选）" value="${esc(s.externalApi?.key || '')}">
        <div class="fs-model-row">
          <select id="fs-ext-model-select" style="flex:1">
            ${(s.externalApi?.model) ? `<option value="${esc(s.externalApi.model)}">${esc(s.externalApi.model)}</option>` : '<option value="">（请先拉取模型）</option>'}
          </select>
          <button class="fs-wax alt" id="fs-fetch-models"><i class="fa-solid fa-download"></i> 拉取模型</button>
        </div>
        <input id="fs-ext-model" placeholder="模型名（也可手动输入）" value="${esc(s.externalApi?.model || '')}">
      </div>
    </div>

    <button class="fs-wax primary" id="fs-save-settings"><i class="fa-solid fa-stamp"></i>铭刻法则（保存）</button>
    <div class="fs-admin-deco" id="fs-admin-entry">✦</div>`;

  // API 模式切换
  $$('input[name="fs-apimode"]', pane).forEach(r => r.addEventListener("change", () => {
    $("#fs-external-fields").style.display = r.value === "external" ? "" : "none";
  }));

  // 拉取模型列表
  $("#fs-fetch-models").addEventListener("click", async () => {
    const btn = $("#fs-fetch-models");
    const baseUrl = $("#fs-ext-url").value.trim();
    const key = $("#fs-ext-key").value.trim();
    if (!baseUrl) { warn("拉取模型", "请先填写外接 API 地址（Base URL）。"); return; }
    // 先把当前输入的 baseUrl/key 临时写入，供 fetchExternalModels 读取
    const tmp = { baseUrl, key, model: "" };
    const orig = s.externalApi;
    s.externalApi = tmp;
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 拉取中...';
    try {
      const models = await AI.fetchExternalModels();
      const sel = $("#fs-ext-model-select");
      sel.innerHTML = models.map(m => `<option value="${esc(m)}">${esc(m)}</option>`).join("");
      // 默认选中第一个
      if (models.length) { sel.value = models[0]; $("#fs-ext-model").value = models[0]; }
      showModal("✦ 模型已拉取", `<p>共获取 <b>${models.length}</b> 个可用模型，请在下拉菜单中选择。</p>`);
    } catch (e) {
      warn("拉取模型失败", e.message || String(e));
    } finally {
      s.externalApi = orig;
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-download"></i> 拉取模型';
    }
  });

  // 模型下拉选择 → 同步到 model 输入框
  $("#fs-ext-model-select").addEventListener("change", e => {
    $("#fs-ext-model").value = e.target.value;
  });

  // 静默模式开关（设置分栏）
  $("#fs-silent-toggle").addEventListener("change", e => {
    store.setSilent(e.target.checked);
    applyActive();
    syncSilentBtn();
    const ext = $("#fs-ext-silent-toggle");
    if (ext) ext.checked = e.target.checked;
  });

  // 悬浮球显隐开关（设置分栏）
  $("#fs-ball-toggle").addEventListener("change", e => {
    store.setBallHidden(!e.target.checked);
    applyBallState();
    const ext = $("#fs-ext-ball-toggle");
    if (ext) ext.checked = e.target.checked;
  });

  // 保存
  $("#fs-save-settings").addEventListener("click", () => {
    s.prompts.judge = $("#fs-prompt-judge").value;
    s.prompts.world = $("#fs-prompt-world").value;
    s.prompts.saga = $("#fs-prompt-saga").value;
    s.prompts.save = $("#fs-prompt-save").value;
    const mode = $('input[name="fs-apimode"]:checked').value;
    s.apiMode = mode;
    s.externalApi = { baseUrl: $("#fs-ext-url").value, key: $("#fs-ext-key").value, model: $("#fs-ext-model").value };
    store.saveSettings(s);
    showModal("✦ 法则已铭刻", "设置已保存。");
  });

  // 隐藏管理员入口
  $("#fs-admin-entry").addEventListener("click", () => {
    showModal("管理员验证", `<p>请输入管理员密码：</p><input type="password" id="fs-admin-pass" style="width:100%"><button class="fs-wax" id="fs-admin-confirm" style="margin-top:10px">确认</button>`);
    $("#fs-admin-confirm").addEventListener("click", () => {
      if ($("#fs-admin-pass").value === "123123") {
        closeModal();
        showAdminPanel();
      } else {
        warn("验证失败", "密码错误。");
      }
    });
  });
}

// ===== 隐藏管理员：卡池管理后台 =====
// 有 desc 的条目展示「名称 + 描述」两个字段；纯字符串条目只展示「名称」。
function showAdminPanel() {
  showModal("卡池管理后台", `<div id="fs-admin-body" style="max-height:60vh;overflow-y:auto;text-align:left"></div><button class="fs-wax" id="fs-admin-save" style="margin-top:10px">保存卡池</button>`, false);
  const pools = activePools();
  const body = $("#fs-admin-body");
  body.innerHTML = "";

  Object.keys(pools).forEach(key => {
    const pool = pools[key];
    if (!pool || typeof pool !== "object") return;
    const title = el("div", { class: "fs-shop-group-title" }, key);
    body.appendChild(title);

    // 数组卡池（WORLD_TYPE / DIFFICULTY / DISASTER / EVIL / CORE_TRAIT / FANDOM / STAR_CRITERIA）
    if (Array.isArray(pool)) {
      pool.forEach((item, i) => {
        const row = el("div", { class: "fs-admin-item" });
        if (item && typeof item === "object") {
          const name = item.name || item.type || item.level || item.id || "";
          const hasDesc = typeof item.desc === "string";
          row.innerHTML = `
            <input data-pool="${key}" data-idx="${i}" data-field="name" value="${esc(name)}" placeholder="名称">
            ${hasDesc ? `<textarea data-pool="${key}" data-idx="${i}" data-field="desc" placeholder="描述">${esc(item.desc)}</textarea>` : ""}`;
        } else {
          // 纯字符串条目（数组池中不应出现，兜底只显示名称）
          row.innerHTML = `<input data-pool="${key}" data-idx="${i}" data-field="name" value="${esc(String(item))}" placeholder="名称">`;
        }
        body.appendChild(row);
      });
      return;
    }

    // 对象卡池（HERO_APPEARANCE_POOLS / HERO_PERSONALITY_POOLS）
    Object.keys(pool).forEach(subKey => {
      const arr = pool[subKey];
      if (!Array.isArray(arr)) return;
      const subTitle = el("div", { class: "fs-admin-sub" }, `${key}.${subKey}`);
      body.appendChild(subTitle);
      arr.forEach((item, i) => {
        const row = el("div", { class: "fs-admin-item" });
        if (item && typeof item === "object") {
          // 有 desc 的对象条目（如 bodyBuild / heightCategory）
          const name = item.name || item.type || "";
          const hasDesc = typeof item.desc === "string";
          row.innerHTML = `
            <input data-pool="${key}" data-sub="${subKey}" data-idx="${i}" data-field="name" value="${esc(name)}" placeholder="名称">
            ${hasDesc ? `<textarea data-pool="${key}" data-sub="${subKey}" data-idx="${i}" data-field="desc" placeholder="描述">${esc(item.desc)}</textarea>` : ""}`;
        } else {
          // 纯字符串条目：只显示名称，无 desc（保持原文）
          row.innerHTML = `
            <input data-pool="${key}" data-sub="${subKey}" data-idx="${i}" data-field="name" value="${esc(String(item))}" placeholder="名称">`;
        }
        body.appendChild(row);
      });
    });
  });

  $("#fs-admin-save").addEventListener("click", () => {
    // 收集编辑结果，写回覆盖层
    const override = JSON.parse(JSON.stringify(pools));
    $$("#fs-admin-body [data-pool]").forEach(inp => {
      const { pool, sub, idx, field } = inp.dataset;
      const val = inp.value;
      const arr = sub ? override[pool][sub] : override[pool];
      const item = arr && arr[+idx];
      if (item == null) return;
      if (typeof item === "object") {
        // 对象条目：写 name 或 desc 字段；若 name 字段名是 type，则写 type
        const nameField = (field === "name") ? ("name" in item ? "name" : ("type" in item ? "type" : "level")) : field;
        item[nameField] = val;
      } else {
        // 纯字符串条目：写回字符串
        if (field === "name") arr[+idx] = val;
      }
    });
    store.setPoolsOverride(override);
    closeModal();
    showModal("✦ 卡池已更新", "新的卡池配置将在下一次抽卡时生效。");
  });
}

// ---------- 入口 ----------
let _inited = false;

// ---------- 命运沙盘内容 → 每轮对话上下文注入（核心 · 官方 setExtensionPrompt + 兜底钩子） ----------
// 构建沙盘四字段的注入文本（接受可选 world 参数）
function buildSandboxContext(world) {
  if (!world) world = store.getWorld();
  const diff = store.getDifficulty();
  const goal = world.goal || "（未设定）";
  const difficulty = world.difficultyText || world.difficulty || `${diff} 级`;
  const disaster = world.disaster || "（未设定）";
  const hero = world.hero || "（未契约）";
  return `[命运沙盘·当前任务状态]
- 任务目标（终焉之劫）：${goal}
- 世界难度（灾厄侵蚀度）：${difficulty}
- 末世类型（灾厄形态）：${disaster}
- 契约勇者（契约伙伴）：${hero}`;
}

const EXT_PROMPT_KEY = "fate-sandbox-sandbox-state";

// 主方案：酒馆官方 Extension Prompt 注入（提示词查看器 100% 可见）
function registerExtensionPrompt() {
  try {
    const ST = getSTContext();
    if (ST && typeof ST.setExtensionPrompt === "function") {
      if (isSilent()) {
        // 静默模式：清空注入
        ST.setExtensionPrompt(EXT_PROMPT_KEY, "", 0, 0);
        console.log("[命运沙盘] 静默模式，已清空扩展提示词");
        return true;
      }
      const world = store.getWorld();
      if (!world || (!world.goal && !world.hero && !world.disaster)) {
        console.warn("[命运沙盘] 当前没有生效的世界线数据，暂不挂载扩展提示词");
        return false;
      }
      const promptContent = buildSandboxContext(world);
      console.log("[命运沙盘] 正在注入的数据内容为:", promptContent);
      // 参数: key, value, position(0=System 顶部/角色设定前), depth
      ST.setExtensionPrompt(EXT_PROMPT_KEY, promptContent, 0, 0);
      console.log("[命运沙盘] 注入状态: 成功（setExtensionPrompt 已挂载）");
      return true;
    }
    console.warn("[命运沙盘] 未找到 setExtensionPrompt，触发备用注入方案");
    return false;
  } catch (e) {
    console.warn("[命运沙盘] setExtensionPrompt 挂载异常：", e);
    return false;
  }
}

// 备用兜底：监听 chat_completion_prompt_ready，直接修改 eventData
function injectSandboxContext(eventData) {
  try {
    if (isSilent()) return;
    const world = store.getWorld();
    if (!world || (!world.goal && !world.hero && !world.disaster)) {
      console.warn("[命运沙盘] 当前没有生效的世界线数据，暂不注入上下文");
      return;
    }
    // 每轮发送前都刷新一次官方扩展提示词，确保内容最新；
    // 官方通道生效时直接返回，避免与手动注入产生重复内容
    if (registerExtensionPrompt()) {
      console.log("[命运沙盘] 官方扩展提示词已刷新，将随本轮对话发送给模型");
      return;
    }

    const injectionContent = buildSandboxContext(world);

    // 兜底 1：eventData.chat 数组 → 插到最前排
    if (Array.isArray(eventData.chat)) {
      // 防止重复注入：先移除旧的沙盘 system 消息
      eventData.chat = eventData.chat.filter(m => !(m && typeof m.content === "string" && m.content.startsWith("[命运沙盘·当前任务状态]")));
      eventData.chat.unshift({
        role: "system",
        content: injectionContent,
        is_system: true,
        force_avatar: false,
      });
      console.log("[命运沙盘] 成功通过 eventData.chat 注入沙盘上下文！");
    }
    // 兜底 2：eventData.system_prompt 字符串 → 拼接顶部
    else if (typeof eventData.system_prompt === "string") {
      eventData.system_prompt = `${injectionContent}\n\n${eventData.system_prompt}`;
      console.log("[命运沙盘] 成功通过 system_prompt 拼接注入沙盘上下文！");
    }
    // 兜底 3：eventData.full_prompt 字符串 → 拼接顶部
    else if (typeof eventData.full_prompt === "string") {
      eventData.full_prompt = `${injectionContent}\n\n${eventData.full_prompt}`;
      console.log("[命运沙盘] 成功通过 full_prompt 拼接注入沙盘上下文！");
    }
    console.log("[命运沙盘注入校验]", eventData);
  } catch (e) {
    console.warn("[命运沙盘] 上下文注入异常：", e);
  }
}

// 注册：官方 Extension Prompt 优先 + 兜底事件钩子（同时监听多事件，兼容主流酒馆版本）
let _injectionRegistered = false;
function registerContextInjection() {
  try {
    const ctx = getSTContext();
    if (!ctx) return false;

    // 主方案：官方 setExtensionPrompt（只要 API 存在即标记就位）
    const hasExtPrompt = typeof ctx.setExtensionPrompt === "function";
    if (hasExtPrompt) {
      registerExtensionPrompt();
    }

    // 兜底：事件钩子
    const eventSource = ctx.eventSource;
    const event_types = ctx.event_types;
    if (eventSource && event_types) {
      if (event_types.CHAT_COMPLETION_PROMPT_READY) {
        eventSource.on(event_types.CHAT_COMPLETION_PROMPT_READY, injectSandboxContext);
      }
      if (event_types.BEFORE_COMPLETION) {
        eventSource.on(event_types.BEFORE_COMPLETION, injectSandboxContext);
      }
    }

    if (hasExtPrompt || (eventSource && event_types)) {
      _injectionRegistered = true;
      console.log("[命运沙盘] 上下文注入监听器已就位", hasExtPrompt ? "（setExtensionPrompt 主方案）" : "（事件钩子兜底方案）");
      return true;
    }
    return false;
  } catch (e) {
    console.warn("[命运沙盘] 上下文注入监听器注册失败：", e);
    return false;
  }
}

// 延时/循环注册：防止初始化过早，反复确认监听器已挂载
function ensureContextInjection() {
  let attempts = 0;
  const tryRegister = () => {
    if (_injectionRegistered) return; // 已就位
    const ok = registerContextInjection();
    if (!ok && attempts < 30) {
      attempts++;
      setTimeout(tryRegister, 500); // 每 500ms 重试，最多 15 秒
    }
  };
  tryRegister();
}

// ---------- 诊断工具：浏览器控制台输入 FateSandbox.debug() ----------
// 输出运行版本 / 存储宿主 / store 中四大字段 / DOM 文本框实际值 / 注入通道状态
export function debug() {
  const world = store.getWorld() || {};
  const domState = {};
  for (const f of FIELD_DEFS) {
    const ta = document.getElementById(f.id);
    domState[f.key] = ta ? `长度${(ta.value || "").length}` : "DOM不存在";
  }
  let hostType = "unknown";
  try {
    const ctx = getSTContext();
    if (ctx && ctx.extensionSettings && ctx.extensionSettings.__fateSandbox) hostType = "extensionSettings（官方推荐，可持久化）";
    else if (typeof window !== "undefined" && window.__fateSandbox) hostType = "window（降级内存）";
    else hostType = "内存兜底";
  } catch (e) { hostType = "检测失败"; }
  const info = {
    运行版本: FS_VERSION,
    存储宿主: hostType,
    静默模式: store.isSilent(),
    "store·任务目标": (world.goal || "").slice(0, 40) || "（空）",
    "store·世界难度": (world.difficultyText || "").slice(0, 40) || "（空）",
    "store·灾厄形态": (world.disaster || "").slice(0, 40) || "（空）",
    "store·契约勇者": (world.hero || "").slice(0, 40) || "（空）",
    "DOM·文本框": domState,
    setExtensionPrompt可用: typeof getSTContext()?.setExtensionPrompt === "function",
  };
  console.log("[命运沙盘·诊断]", info);
  return info;
}

export function init() {
  // 注入 FontAwesome（若无）
  if (!$('link[href*="font-awesome"]') && !$('link[href*="fontawesome"]')) {
    const link = el("link", { rel: "stylesheet", href: "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css" });
    document.head.appendChild(link);
  }
  if (_inited) { applyActive(); syncSilentBtn(); return; }
  _inited = true;
  console.log(`[命运沙盘] 插件加载，运行版本 v${FS_VERSION}。如遇异常请在控制台执行 FateSandbox.debug()`);
  mount();
  // 注册每轮对话的沙盘上下文注入（延时/循环注册 + load 兜底）
  ensureContextInjection();
  if (typeof window !== "undefined") {
    window.addEventListener("load", () => ensureContextInjection());
  }
}

// ---------- 卸载钩子 ----------
export function onRemove() {
  removeDOM();
  // 清空挂载在酒馆上的官方扩展提示词，避免卸载后仍向上下文注入残留内容
  try {
    const ST = getSTContext();
    if (ST && typeof ST.setExtensionPrompt === "function") {
      ST.setExtensionPrompt(EXT_PROMPT_KEY, "", 0, 0);
    }
  } catch (e) { /* 忽略 */ }
  store.clearAll();
}
