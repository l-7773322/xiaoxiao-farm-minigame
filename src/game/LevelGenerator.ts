import { ITEM_TYPES, type ItemType } from "../data/ItemConfig";
import { Tile } from "./Tile";

export interface LevelSpec {
  id: number;
  name: string;
  subtitle: string;
  itemTypes: readonly ItemType[];
  layerCounts: readonly number[];
  seed: number;
}

export const LEVEL_SPECS: readonly LevelSpec[] = [
  {
    id: 1,
    name: "热身小摊",
    subtitle: "先清掉桌面上的小堆",
    itemTypes: ITEM_TYPES.slice(0, 6),
    layerCounts: [9, 6, 3],
    seed: 20260809,
  },
  {
    id: 2,
    name: "丰收大堆",
    subtitle: "真正的挑战现在开始",
    itemTypes: ITEM_TYPES.slice(0, 10),
    layerCounts: [18, 12, 9, 6, 3],
    seed: 20260810,
  },
];

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
    const sceneTop = Math.max(154, height * 0.19);
    const sceneBottom = height - 238;
    const sceneHeight = Math.max(260, sceneBottom - sceneTop);
    const centerX = width / 2;
    const centerY = sceneTop + sceneHeight * 0.53;
    const tileSize = Math.min(62, Math.max(48, width * 0.15));
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
        sceneHeight,
        tileSize,
        random,
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
    sceneHeight: number,
    tileSize: number,
    random: SeededRandom,
  ): Array<{ x: number; y: number; rotation: number }> {
    const positions: Array<{ x: number; y: number; rotation: number }> = [];
    const density = 1 - layer / Math.max(1, layerTotal - 1);
    const radiusX = width * (0.12 + density * 0.3);
    const radiusY = sceneHeight * (0.1 + density * 0.34);

    for (let index = 0; index < count; index += 1) {
      const ring = Math.floor(index / 6) + 1;
      const angle = (index / Math.max(1, count)) * Math.PI * 2 + layer * 0.73;
      const ringScale = Math.min(1, 0.48 + ring * 0.25);
      const jitterX = (random.next() - 0.5) * tileSize * 0.55;
      const jitterY = (random.next() - 0.5) * tileSize * 0.42;
      const x = centerX + Math.cos(angle) * radiusX * ringScale + jitterX - tileSize / 2;
      const y = centerY + Math.sin(angle) * radiusY * ringScale + jitterY - tileSize / 2;
      positions.push({
        x: Math.max(8, Math.min(width - tileSize - 8, x)),
        y,
        rotation: (random.next() - 0.5) * 0.9,
      });
    }
    return positions;
  }
}
