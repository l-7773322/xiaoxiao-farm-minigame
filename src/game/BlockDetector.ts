import { Tile } from "./Tile";

export class BlockDetector {
  public constructor(private readonly overlapThreshold = 0.12) {}

  public recalculate(tiles: readonly Tile[]): void {
    const activeTiles = tiles.filter((tile) => !tile.removed);
    for (const tile of activeTiles) {
      tile.blocked = activeTiles.some(
        (other) =>
          other.layer > tile.layer && this.getOverlapRatio(tile, other) >= this.overlapThreshold,
      );
    }
  }

  public getOverlapRatio(lower: Tile, upper: Tile): number {
    const overlapWidth = Math.max(
      0,
      Math.min(lower.x + lower.width, upper.x + upper.width) - Math.max(lower.x, upper.x),
    );
    const overlapHeight = Math.max(
      0,
      Math.min(lower.y + lower.height, upper.y + upper.height) - Math.max(lower.y, upper.y),
    );
    return (overlapWidth * overlapHeight) / (lower.width * lower.height);
  }
}
