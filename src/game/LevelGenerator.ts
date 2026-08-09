import { ITEM_TYPES, type ItemType } from "../data/ItemConfig";
import { Tile } from "./Tile";

export const CHAPTER_NAMES = ["新手农场", "丰收田园", "疯狂农庄"] as const;

export interface LevelSpec {
  id: number;
  chapter: (typeof CHAPTER_NAMES)[number];
  name: string;
  subtitle: string;
  itemTypes: readonly ItemType[];
  layerCounts: readonly number[];
  seed: number;
}

export interface SceneLayout {
  sceneTop: number;
  sceneBottom: number;
  centerX: number;
  centerY: number;
  radiusX: number;
  radiusY: number;
}

export function getSceneLayout(width: number, height: number): SceneLayout {
  const sceneTop = Math.max(154, height * 0.19);
  const controlsTop = height - 206;
  const baseRadiusY = Math.min(226, height * 0.28);
  const availableRadiusY = (controlsTop - sceneTop - 20) / 2;
  const radiusY = Math.max(56, Math.min(baseRadiusY, Math.max(56, availableRadiusY)));
  const centerY = Math.min(365, sceneTop + radiusY + 8);
  const radiusX = Math.max(130, width / 2 - 18);
  const sceneBottom = Math.min(height - 238, controlsTop - 20, centerY + radiusY - 18);
  return {
    sceneTop,
    sceneBottom,
    centerX: width / 2,
    centerY,
    radiusX,
    radiusY,
  };
}

const LEVEL_NAMES = [
  "清晨果摊", "玉米小径", "南瓜木屋", "莓果花圃", "菜园午后",
  "谷仓门前", "牛奶工坊", "面包集市", "金色田埂", "农场晚霞",
  "丰收货架", "果蔬转盘", "蘑菇雨林", "田园餐桌", "秋日粮仓",
  "忙碌市集", "缤纷菜篮", "丰收派对", "满载货车", "庆典大桌",
  "旋转农庄", "密林寻宝", "疯狂果宴", "谷物迷阵", "夜色农场",
  "满园丰收", "超级菜市", "金秋盛宴", "终极粮仓", "农庄传奇",
] as const;

function makeLayerCounts(tripletGroups: number, layers: number): readonly number[] {
  const counts = new Array<number>(layers).fill(0);
  for (let group = 0; group < tripletGroups; group += 1) {
    counts[group % layers] += 3;
  }
  return counts;
}

const LEVEL_LAYER_COUNTS: readonly (readonly number[])[] = Array.from({ length: 30 }, (_, index) => {
  if (index === 0) {
    return [12, 6];
  }
  const id = index + 1;
  const tripletGroups = Math.min(110, 36 + (id - 2) * 5);
  const layers = Math.min(8, 4 + Math.floor((id - 2) / 4));
  return makeLayerCounts(tripletGroups, layers);
});

export const LEVEL_SPECS: readonly LevelSpec[] = LEVEL_LAYER_COUNTS.map((layerCounts, index) => {
  const id = index + 1;
  const chapterIndex = Math.floor(index / 10);
  const chapter = CHAPTER_NAMES[chapterIndex];
  const itemTypeCount = chapterIndex === 0
    ? Math.min(8, 4 + Math.floor(index / 2))
    : chapterIndex === 1
      ? Math.min(11, 7 + Math.floor((index - 10) / 2))
      : Math.min(12, 10 + Math.floor((index - 20) / 3));
  const subtitles = [
    "熟悉抓取与三消节奏",
    "物品更多，留意槽位组合",
    "高密度散堆，真正的挑战",
  ] as const;
  return {
    id,
    chapter,
    name: LEVEL_NAMES[index],
    subtitle: subtitles[chapterIndex],
    itemTypes: ITEM_TYPES.slice(0, itemTypeCount),
    layerCounts,
    seed: 20260809 + id * 97,
  };
});

class SeededRandom {
  private state: number;

  public constructor(seed: number) {
    this.state = seed >>> 0;
  }

  public next(): number {
    this.state = (this.state * 1664525 + 1013904223) >>> 0;
    return this.state / 4294967296;
  }

  public pick<T>(values: readonly T[]): T {
    return values[Math.floor(this.next() * values.length)];
  }
}

export class LevelGenerator {
  public generate(spec: LevelSpec, width: number, height: number): Tile[] {
    const random = new SeededRandom(spec.seed);
    const layout = getSceneLayout(width, height);
    const { sceneTop, sceneBottom, centerX, centerY } = layout;
    const densityScale = Math.max(0.74, 1 - Math.max(0, spec.id - 12) * 0.012);
    const tileSize = Math.min(62, Math.max(44, width * 0.15)) * densityScale;
    const tiles: Tile[] = [];
    let id = 1;

    spec.layerCounts.forEach((count, layer) => {
      const tripletTypes = this.createTripletTypes(count, spec.itemTypes, random);
      const positions = this.createLayerPositions(
        count,
        layer,
        spec.layerCounts.length,
        centerX,
        centerY,
        width,
        tileSize,
        random,
        sceneTop,
        sceneBottom,
        layout.radiusX,
        layout.radiusY,
      );

      for (let index = 0; index < count; index += 1) {
        const position = positions[index];
        const type = tripletTypes[index];
        const itemSize = tileSize * this.getSizeScale(type);
        tiles.push(
          new Tile({
            id: id++,
            type,
            x: position.x + (tileSize - itemSize) / 2,
            y: position.y + (tileSize - itemSize) / 2,
            width: itemSize,
            height: itemSize,
            layer,
            rotation: position.rotation,
          }),
        );
      }
    });

    return tiles;
  }

  private getSizeScale(type: ItemType): number {
    const scales: Record<ItemType, number> = {
      apple: 1.02,
      corn: 0.94,
      pumpkin: 1.18,
      berry: 0.9,
      carrot: 0.94,
      eggplant: 1.04,
      mushroom: 1.12,
      milk: 0.92,
      bread: 1.08,
      egg: 0.84,
      pepper: 1,
      potato: 1.12,
    };
    return scales[type];
  }

  private createTripletTypes(
    count: number,
    itemTypes: readonly ItemType[],
    random: SeededRandom,
  ): ItemType[] {
    if (count % 3 !== 0) {
      throw new Error("每一层的物品数量必须是 3 的倍数");
    }

    const groups: ItemType[][] = [];
    for (let index = 0; index < count / 3; index += 1) {
      const type = random.pick(itemTypes);
      groups.push([type, type, type]);
    }

    for (let index = groups.length - 1; index > 0; index -= 1) {
      const target = Math.floor(random.next() * (index + 1));
      [groups[index], groups[target]] = [groups[target], groups[index]];
    }
    return groups.reduce<ItemType[]>((result, group) => result.concat(group), []);
  }

  private createLayerPositions(
    count: number,
    layer: number,
    layerTotal: number,
    centerX: number,
    centerY: number,
    width: number,
    tileSize: number,
    random: SeededRandom,
    sceneTop: number,
    sceneBottom: number,
    containerRadiusX: number,
    containerRadiusY: number,
  ): Array<{ x: number; y: number; rotation: number }> {
    const positions: Array<{ x: number; y: number; rotation: number }> = [];
    const density = 1 - layer / Math.max(1, layerTotal - 1);
    const radiusX = containerRadiusX * (0.18 + density * 0.68);
    const radiusY = containerRadiusY * (0.18 + density * 0.68);
    const safeHalfWidth = Math.max(28, containerRadiusX - tileSize * 0.72 - 14);
    const safeHalfHeight = Math.max(28, containerRadiusY - tileSize * 0.58 - 24);
    const minCenterX = centerX - safeHalfWidth;
    const maxCenterX = centerX + safeHalfWidth;
    const minCenterY = Math.max(sceneTop + tileSize / 2 + 4, centerY - safeHalfHeight);
    const maxCenterY = Math.min(sceneBottom - tileSize / 2 - 4, centerY + safeHalfHeight);

    for (let index = 0; index < count; index += 1) {
      const spiral = Math.sqrt((index + 0.5) / Math.max(1, count));
      const angle = index * 2.39996 + layer * 0.82;
      const jitterX = (random.next() - 0.5) * tileSize * 0.72;
      const jitterY = (random.next() - 0.5) * tileSize * 0.58;
      let x = centerX + Math.cos(angle) * radiusX * spiral + jitterX - tileSize / 2;
      let y = centerY + Math.sin(angle) * radiusY * spiral + jitterY - tileSize / 2;
      const itemCenterX = x + tileSize / 2;
      const itemCenterY = y + tileSize / 2;
      const clampedCenterX = Math.max(minCenterX, Math.min(maxCenterX, itemCenterX));
      const clampedCenterY = Math.max(minCenterY, Math.min(maxCenterY, itemCenterY));
      x = clampedCenterX - tileSize / 2;
      y = clampedCenterY - tileSize / 2;
      positions.push({
        x: Math.max(15, Math.min(width - tileSize - 15, x)),
        y: Math.max(sceneTop + 4, Math.min(sceneBottom - tileSize - 4, y)),
        rotation: (random.next() - 0.5) * 1.35,
      });
    }
    return positions;
  }
}
