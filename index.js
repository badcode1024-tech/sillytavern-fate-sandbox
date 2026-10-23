/**
 * 命运沙盘 Fate Sandbox —— 插件入口
 * 挂载到 SillyTavern 扩展系统，注册 init / onRemove 钩子。
 *
 * 说明：SillyTavern 插件以 ES Module 或 IIFE 方式加载。
 * 为保证对本地酒馆 / 云酒馆 / TauriTavern 的最大兼容性，
 * 本入口统一走 SillyTavern 的 import 机制。
 */
import { init, onRemove } from "./src/ui.js";

// 全局挂载供酒馆识别
(function () {
  const sandbox = {
    id: "fate-sandbox",
    init,
    onRemove,
  };

  // SillyTavern 新版通过事件注册
  if (typeof SillyTavern !== "undefined" && SillyTavern.getContext) {
    const ctx = SillyTavern.getContext();
    // 注册到扩展列表
    ctx.extensionSettings = ctx.extensionSettings || {};
    ctx.extensionSettings.fateSandbox = ctx.extensionSettings.fateSandbox || {};

    // 挂载初始化事件
    try {
      if (typeof eventSource !== "undefined") {
        eventSource.on(event_types.APP_READY, init);
        eventSource.on(event_types.CHAT_CHANGED, () => {
          // 角色卡切换时重新检测绑定
          const ui = document.querySelector("#fs-ball");
          if (ui) {
            // 由 ui.js 的轮询接管
          }
        });
      }
    } catch (e) {
      // 事件源不可用时直接初始化
      init();
    }
  } else {
    // 兜底：直接初始化
    setTimeout(init, 100);
  }

  // 暴露全局（供调试 / 其他插件联动）
  if (typeof window !== "undefined") {
    window.FateSandbox = sandbox;
  }
})();
