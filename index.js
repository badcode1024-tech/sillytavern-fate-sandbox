/**
 * 命运沙盘 Fate Sandbox —— 插件入口
 * 挂载到 SillyTavern 扩展系统，注册 init / onRemove 钩子。
 *
 * 兼容策略：SillyTavern 扩展插件通过顶层 `init()` 函数被加载器调用，
 * 本入口直接导出 init/onRemove，并由顶层立即执行 init。
 */
import { init, onRemove, debug } from "./src/ui.js";

// SillyTavern 的插件加载器会调用顶层作用域的 init()。
// 为保证万无一失，这里在模块加载完成后立刻执行一次 init。
// init() 内部做了幂等保护（重复调用不会重复挂载 DOM）。
init();

// 暴露全局（供调试 / 其他插件联动 / 手动重载）
if (typeof window !== "undefined") {
  window.FateSandbox = { id: "fate-sandbox", init, onRemove, debug };
}
