# 全套真实物件模型素材包

本目录为《消消农场》新增果蔬、水杯、厨房杂货和甜品套装提供写实风格的透明多视角精灵。

- `sprites/master/`：`512 × 512` 透明 PNG 母版，共 45 种物品、每种 4 个观察角度。
- `sprites/runtime/`：`256 × 256` 透明 WebP 运行时素材，用于微信小游戏加载。
- 每种物品均含 `front`、`three-quarter`、`side`、`top` 四个视角；统一采用左上柔光和无投影的透明背景，保证在密集堆叠时材质、尺寸和透视一致。

运行 `scripts/process-real-item-assets.py` 可以由归档的源周转图重新生成这套精灵。运行 `scripts/verify-real-item-assets.py` 会检查资源完整性、尺寸、透明角、主体覆盖率和边距。
