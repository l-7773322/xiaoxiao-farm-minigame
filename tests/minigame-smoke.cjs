const assert = require("node:assert/strict");
const path = require("node:path");

const drawnTexts = [];
let touchListener;
let vibrationCount = 0;

const gradient = { addColorStop() {} };
const context = new Proxy(
  {},
  {
    get(target, property) {
      if (property === "createLinearGradient") {
        return () => gradient;
      }
      if (property === "fillText") {
        return (value) => drawnTexts.push(String(value));
      }
      if (!(property in target)) {
        target[property] = () => {};
      }
      return target[property];
    },
    set(target, property, value) {
      target[property] = value;
      return true;
    },
  },
);

global.wx = {
  getSystemInfoSync() {
    return { windowWidth: 375, windowHeight: 812, pixelRatio: 2 };
  },
  createCanvas() {
    return { width: 0, height: 0, getContext: () => context };
  },
  onTouchStart(listener) {
    touchListener = listener;
  },
  vibrateShort() {
    vibrationCount += 1;
  },
};

require(path.resolve(__dirname, "..", "minigame", "game.js"));
assert.equal(typeof touchListener, "function", "小游戏入口应注册触摸事件");
assert(drawnTexts.includes("消消农场"), "首页应绘制游戏标题");
assert(drawnTexts.includes("开始挑战"), "首页应显示开始按钮");
assert(drawnTexts.includes("12,638"), "首页应显示今日挑战人数");

drawnTexts.length = 0;
touchListener({ touches: [{ clientX: 187, clientY: 661 }], changedTouches: [] });
assert(drawnTexts.includes("第 1 关 · 热身小摊"), "点击开始后应进入第一关");
assert(drawnTexts.some((text) => text.includes("剩余 18")), "第一关应有 18 个堆叠物品");
assert(drawnTexts.includes("↥  移出"), "第一关应提供移出道具");
assert(drawnTexts.includes("✦  凑齐"), "第一关应提供凑齐道具");
assert(drawnTexts.includes("↻  打乱"), "第一关应提供打乱道具");

drawnTexts.length = 0;
touchListener({ touches: [{ clientX: 187, clientY: 630 }], changedTouches: [] });
assert(drawnTexts.includes("✦  凑齐 ✓"), "凑齐道具成功后应标记已使用");
assert(vibrationCount > 0, "有效操作应触发轻触反馈");

console.log("✓ 微信小游戏首页、首关堆叠、工具栏与触摸入口冒烟测试通过");
