import { ITEM_SET_TYPES, type ItemSetName, type ItemType } from "../data/ItemConfig";
import { PileLayout, type PileBounds } from "./PileLayout";
import { Tile } from "./Tile";

export const CHAPTER_NAMES = ["新手农场", "丰收田园", "疯狂农庄"] as const;

export interface LevelSpec {
  id: number;
  chapter: (typeof CHAPTER_NAMES)[number];
  name: string;
  subtitle: string;
  itemSet: ItemSetName;
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
  const sceneTop = Math.max(198, height * 0.25);
  const controlsTop = height - 206;
  const baseRadiusY = Math.min(226, height * 0.27);
  const availableRadiusY = (controlsTop - sceneTop - 18) / 2;
  const radiusY = Math.max(56, Math.min(baseRadiusY, Math.max(56, availableRadiusY)));
  const centerY = sceneTop + radiusY + 6;
  const radiusX = Math.max(130, width / 2 - 28);
  const sceneBottom = Math.min(controlsTop - 18, centerY + radiusY - 12);
  return {
    sceneTop,
    sceneBottom,
    centerX: width / 2,
    centerY,
    radiusX,
    radiusY,
  };
}

export function getPileBounds(width: number, height: number): PileBounds {
  const { centerX, centerY, radiusX, radiusY } = getSceneLayout(width, height);
  // Keep a substantial container wall around the play area. The returned
  // bounds are the single top opening of the box, not the outside silhouette.
  const horizontalInset = Math.max(26, Math.min(38, width * 0.075));
  const topInset = Math.max(24, Math.min(34, radiusY * 0.18));
  const bottomInset = Math.max(34, Math.min(38, radiusY * 0.18));
  return {
    left: centerX - radiusX + horizontalInset,
    top: centerY - radiusY + topInset,
    right: centerX + radiusX - horizontalInset,
    bottom: centerY + radiusY - bottomInset,
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
  // Level 1 is deliberately tiny. Level 2 jumps straight to a five-layer,
  // 126-piece "hell" pile; later levels keep adding groups and depth without
  // exceeding the existing 330-piece low-end-device budget.
  const tripletGroups = Math.min(110, 42 + (id - 2) * 3);
  const layers = Math.min(8, 5 + Math.floor((id - 2) / 5));
  return makeLayerCounts(tripletGroups, layers);
});

export const LEVEL_SPECS: readonly LevelSpec[] = LEVEL_LAYER_COUNTS.map((layerCounts, index) => {
  const id = index + 1;
  const chapterIndex = Math.floor(index / 10);
  const chapter = CHAPTER_NAMES[chapterIndex];
  // A level describes difficulty and layout only.  The game-wide active set
  // is supplied by GameManager when a stage starts, so chapters never switch
  // item families behind the player's back.
  const itemSet: ItemSetName = "produce";
  // The second stage immediately unlocks the entire selected theme. For the
  // produce theme this means all 18 photorealistic fruits are already mixed
  // into the first hard pile instead of being drip-fed over many levels.
  const itemTypeCount = id === 1 ? 6 : ITEM_SET_TYPES.produce.length;
  const subtitle = id === 1
    ? "熟悉抓取与三消节奏"
    : id <= 5
      ? "地狱级 · 五层错位遮挡"
      : id <= 10
        ? "炼狱级 · 近似水果混排"
        : id <= 20
          ? "深渊级 · 高密度连锁拆解"
          : "终极级 · 八层极限果阵";
  return {
    id,
    chapter,
    name: LEVEL_NAMES[index],
    subtitle,
    itemSet,
    itemTypes: ITEM_SET_TYPES.produce.slice(0, itemTypeCount),
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
  private readonly pileLayout = new PileLayout();

  public generate(spec: LevelSpec, width: number, height: number, itemSet: ItemSetName = spec.itemSet): Tile[] {
    const random = new SeededRandom(spec.seed);
    const densityScale = Math.max(0.74, 1 - Math.max(0, spec.id - 12) * 0.012);
    // Give the pile a fuller, more tactile look while keeping the same
    // density rules. PileLayout uses these dimensions for spacing, so taps
    // and drop animations stay aligned with the larger visual items.
    const tileSize = Math.min(66, Math.max(47, width * 0.16)) * densityScale;
    const tiles: Tile[] = [];
    const itemTypes = ITEM_SET_TYPES[itemSet];
    const itemTypeCount = Math.min(spec.itemTypes.length, itemTypes.length);
    const activeTypes = itemTypes.slice(0, itemTypeCount);
    let id = 1;

    const typesByLayer = spec.id === 1
      ? this.createBeginnerLayers(spec.layerCounts, activeTypes, random)
      : this.createHellLayers(spec.layerCounts, activeTypes, random);

    typesByLayer.forEach((layerTypes, layer) => {
      for (const type of layerTypes) {
        const itemSize = tileSize * this.getSizeScale(type);
        tiles.push(
          new Tile({
            id: id++,
            type,
            x: 0,
            y: 0,
            width: itemSize,
            height: itemSize,
            layer,
            rotation: (random.next() - 0.5) * 1.05,
          }),
        );
      }
    });

    const pileBounds = getPileBounds(width, height);
    // The opening is intentionally tall, while the first stage only has 18
    // pieces. Lift that small starter pile into the visual center so the crate
    // does not look empty above the produce. Dense stages stay bottom-anchored
    // and continue to use the normal drop geometry.
    const starterLift = 0;
    const starterRowSpacing = spec.id === 1 ? 0.82 : 0.58;
    for (const target of this.pileLayout.compute(tiles, pileBounds, starterLift, starterRowSpacing)) {
      target.tile.x = target.x;
      target.tile.y = target.y;
    }

    return tiles;
  }

  private createBeginnerLayers(
    layerCounts: readonly number[],
    activeTypes: readonly ItemType[],
    random: SeededRandom,
  ): ItemType[][] {
    const requiredTypes = [...activeTypes];
    return layerCounts.map((count) => {
      const requiredForLayer = requiredTypes.splice(0, Math.min(count / 3, requiredTypes.length));
      return this.createTripletTypes(count, activeTypes, random, requiredForLayer);
    });
  }

  private createHellLayers(
    layerCounts: readonly number[],
    activeTypes: readonly ItemType[],
    random: SeededRandom,
  ): ItemType[][] {
    const totalCount = layerCounts.reduce((sum, count) => sum + count, 0);
    const generatedTypes = this.createTripletTypes(totalCount, activeTypes, random, activeTypes);
    // Place each type's required copies together while the layer capacities
    // are still balanced. This guarantees every active type can span at
    // least three depths even after the produce set grows beyond the original
    // fruit-only roster.
    const allTypes: ItemType[] = [];
    const typeOccurrences = new Map<ItemType, number>();
    for (const type of activeTypes) {
      typeOccurrences.set(type, generatedTypes.filter((candidate) => candidate === type).length);
    }
    const maxOccurrences = Math.max(...typeOccurrences.values());
    for (let occurrence = 0; occurrence < maxOccurrences; occurrence += 1) {
      for (const type of activeTypes) {
        if ((typeOccurrences.get(type) ?? 0) <= occurrence) {
          continue;
        }
        allTypes.push(type);
      }
    }
    const layers = layerCounts.map(() => [] as ItemType[]);

    // Spread each matching triplet over different depths. This removes the
    // old loophole where all three copies lived in one exposed layer, while
    // keeping every global type count divisible by three and therefore
    // preserving solvability.
    for (const type of allTypes) {
      const available = layers
        .map((layer, index) => ({
          index,
          remaining: layerCounts[index] - layer.length,
          typeCount: layer.filter((candidate) => candidate === type).length,
          repeatsLast: layer[layer.length - 1] === type,
        }))
        .filter((candidate) => candidate.remaining > 0);
      const minTypeCount = Math.min(...available.map((candidate) => candidate.typeCount));
      let candidates = available.filter((candidate) => candidate.typeCount === minTypeCount);
      const withoutRepeat = candidates.filter((candidate) => !candidate.repeatsLast);
      if (withoutRepeat.length > 0) {
        candidates = withoutRepeat;
      }
      const fullestNeed = Math.max(...candidates.map((candidate) => candidate.remaining / layerCounts[candidate.index]));
      const balanced = candidates.filter(
        (candidate) => Math.abs(candidate.remaining / layerCounts[candidate.index] - fullestNeed) < 0.0001,
      );
      const selected = random.pick(balanced);
      layers[selected.index].push(type);
    }

    return layers.map((layer) => this.repairAdjacentDuplicates(layer));
  }

  private repairAdjacentDuplicates(types: ItemType[]): ItemType[] {
    const remaining = new Map<ItemType, number>();
    for (const type of types) {
      remaining.set(type, (remaining.get(type) ?? 0) + 1);
    }
    const repaired: ItemType[] = [];
    while (repaired.length < types.length) {
      const previous = repaired[repaired.length - 1];
      const candidates = [...remaining.entries()]
        .filter(([type, count]) => count > 0 && type !== previous)
        .sort((left, right) => right[1] - left[1]);
      const fallback = [...remaining.entries()]
        .filter(([, count]) => count > 0)
        .sort((left, right) => right[1] - left[1]);
      const selected = candidates[0] ?? fallback[0];
      if (!selected) {
        break;
      }
      repaired.push(selected[0]);
      remaining.set(selected[0], selected[1] - 1);
    }
    return repaired;
  }

  private getSizeScale(type: ItemType): number {
    const scales: Record<ItemType, number> = {
      apple: 1.02,
      pear: 1.02,
      orange: 1.04,
      banana: 1.08,
      pineapple: 1.12,
      mango: 1.04,
      watermelon: 1.18,
      cantaloupe: 1.15,
      pomegranate: 1.03,
      dragonFruit: 1.08,
      coconut: 1.08,
      avocado: 1.04,
      strawberry: 0.9,
      lemon: 1,
      peach: 1.06,
      kiwi: 0.96,
      grapes: 1.12,
      papaya: 1.1,
      tomato: 1.02,
      cucumber: 1.08,
      onion: 1.06,
      broccoli: 1.12,
      radish: 1.1,
      garlic: 1.02,
      cherry: 0.92,
      lime: 0.98,
      zucchini: 1.1,
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
      cheese: 1.04,
      rollingPin: 1.12,
      whisk: 1.1,
      cup: 0.98,
      mug: 1.06,
      bottle: 0.94,
      tumbler: 1.02,
      glass: 0.92,
      thermos: 1.08,
      teacup: 0.9,
      canteen: 1.05,
      wineGlass: 1.08,
      masonJar: 1.02,
      enamelMug: 1.04,
      cake: 1.12,
      donut: 1.02,
      candy: 0.9,
      cookie: 1.02,
      icecream: 1.05,
      pudding: 1.02,
      macaron: 0.98,
      cupcake: 1.06,
      croissant: 1.08,
      fruitTart: 1.08,
      chocolate: 1.02,
    };
    return scales[type];
  }

  private createTripletTypes(
    count: number,
    itemTypes: readonly ItemType[],
    random: SeededRandom,
    requiredTypes: readonly ItemType[] = [],
  ): ItemType[] {
    if (count % 3 !== 0) {
      throw new Error("物品总数必须是 3 的倍数");
    }

    const counts = new Map<ItemType, number>();
    let groupCount = 0;
    for (const type of requiredTypes) {
      counts.set(type, (counts.get(type) ?? 0) + 3);
      groupCount += 1;
    }
    while (groupCount < count / 3) {
      const cycle = [...itemTypes];
      this.shuffle(cycle, random);
      for (const type of cycle) {
        if (groupCount >= count / 3) {
          break;
        }
        counts.set(type, (counts.get(type) ?? 0) + 3);
        groupCount += 1;
      }
    }

    const shuffled: ItemType[] = [];
    while (shuffled.length < count) {
      const recent = shuffled.slice(-2);
      const available = itemTypes.filter((type) => (counts.get(type) ?? 0) > 0);
      const varied = available.filter((type) => !recent.includes(type));
      const candidates = varied.length > 0 ? varied : available;
      const mostRemaining = Math.max(...candidates.map((type) => counts.get(type) ?? 0));
      const balanced = candidates.filter((type) => (counts.get(type) ?? 0) === mostRemaining);
      const type = random.pick(balanced);
      shuffled.push(type);
      counts.set(type, (counts.get(type) ?? 0) - 1);
    }

    // Required variety can leave one type as the final remaining candidate.
    // Repair any adjacent duplicate by swapping with a later different item,
    // while preserving the exact triplet counts for the layer.
    for (let index = 1; index < shuffled.length; index += 1) {
      if (shuffled[index] !== shuffled[index - 1]) {
        continue;
      }
      const swapIndex = shuffled.findIndex(
        (candidate, candidateIndex) => candidateIndex > index
          && candidate !== shuffled[index - 1]
          && (candidateIndex === shuffled.length - 1 || shuffled[candidateIndex + 1] !== shuffled[index]),
      );
      if (swapIndex !== -1) {
        [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
      }
    }
    return shuffled;
  }

  private shuffle<T>(values: T[], random: SeededRandom): void {
    for (let index = values.length - 1; index > 0; index -= 1) {
      const target = Math.floor(random.next() * (index + 1));
      [values[index], values[target]] = [values[target], values[index]];
    }
  }

}
