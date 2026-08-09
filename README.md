# 消消农场（阶段 1）

《消消农场》是一款原创的微信小游戏堆叠三消 Demo。本阶段专注验证核心循环：点击场景物品、进入 7 个收集槽、同类自动靠拢、三个相同物品自动消除，以及槽位占满失败。

## 当前内容

- 12 个原创代码绘制的农场测试物品，共 4 类、每类 3 个。
- 竖屏自适应 Canvas 2D 场景，不依赖外部图片素材。
- 点击收集、同类靠拢、三消、胜利、槽满失败和重新开始。
- `Tile`、`SlotManager`、`GameManager`、运行时适配和绘制工具分层。
- 6 项核心逻辑自动化测试，以及入口、胜利流程、失败流程冒烟测试。

## 构建与测试

需要 Node.js 18+ 和 pnpm。首次使用先安装依赖：

```powershell
pnpm install
pnpm run verify
```

构建结果生成在 `minigame/`。该目录包含微信小游戏入口 `game.js`、`game.json` 和 `project.config.json`。

## 在微信开发者工具中运行

1. 执行 `pnpm run build`。
2. 打开微信开发者工具，选择“小游戏”。
3. 导入本项目生成的 `minigame/` 目录。
4. 本地体验可使用测试 AppID；正式发布前需替换为自己的小游戏 AppID。
5. 编译后用竖屏模拟器点击物品进行测试。

> 当前电脑如果没有安装微信开发者工具，可以先完成命令行编译与核心逻辑测试；真机与模拟器交互需要在安装开发者工具后验证。

## 项目结构

```text
src/
  core/GameManager.ts
  data/ItemConfig.ts
  game/Tile.ts
  game/SlotManager.ts
  platform/WechatRuntime.ts
  types/wechat-minigame.d.ts
  ui/CanvasDrawing.ts
  game.ts
tests/run-tests.ts
config/game.json
config/project.config.json
```

## 下一阶段

下一阶段将实现真正的堆叠物品系统：层级、旋转、覆盖面积检测、被遮挡物品的灰态表现，以及移除上层物品后局部重新计算可点击状态。
