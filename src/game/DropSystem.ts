import { Tile } from "./Tile";
import type { PileBounds } from "./PileLayout";

export interface DropMove {
  tile: Tile;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  delay: number;
}

/**
 * Keeps a removal feeling like a basket: only the objects touching the new
 * gap squeeze toward it. Re-laying out the whole pile made every tap look
 * artificial and was unnecessarily expensive on dense stages.
 */
export class DropSystem {
  public constructor(private readonly bounds: PileBounds) {}

  public release(tiles: readonly Tile[], removed: Tile): DropMove[] {
    const active = tiles.filter((tile) => !tile.removed);
    const sameLayer = active.filter((tile) => tile.layer === removed.layer);

    if (sameLayer.length > 0) {
      return this.squeezeAroundGap(sameLayer, removed);
    }

    return this.dropNextLayer(active, removed);
  }

  private squeezeAroundGap(layerTiles: readonly Tile[], removed: Tile): DropMove[] {
    const gapX = removed.x + removed.width / 2;
    const gapY = removed.y + removed.height / 2;
    const influenceRadius = Math.max(removed.width, removed.height) * 2.3;
    const closingDistance = Math.min(removed.width, removed.height) * 0.88;

    return layerTiles
      .map((tile) => {
        const centerX = tile.x + tile.width / 2;
        const centerY = tile.y + tile.height / 2;
        const offsetX = gapX - centerX;
        const offsetY = gapY - centerY;
        const distance = Math.hypot(offsetX, offsetY);
        return { tile, offsetX, offsetY, distance };
      })
      .filter(({ distance }) => distance > 0.5 && distance < influenceRadius)
      .sort((left, right) => left.distance - right.distance)
      .slice(0, 12)
      .map(({ tile, offsetX, offsetY, distance }) => {
        const pressure = Math.pow(1 - distance / influenceRadius, 1.08);
        const shift = Math.min(closingDistance * pressure, distance * 0.4);
        const toX = this.clamp(tile.x + (offsetX / distance) * shift, this.bounds.left + 3, this.bounds.right - tile.width - 3);
        const toY = this.clamp(tile.y + (offsetY / distance) * shift, this.bounds.top + 3, this.bounds.bottom - tile.height - 3);
        return {
          tile,
          fromX: tile.x,
          fromY: tile.y,
          toX,
          toY,
          delay: 0,
        };
      })
      .filter(({ fromX, fromY, toX, toY }) => Math.abs(fromX - toX) > 0.5 || Math.abs(fromY - toY) > 0.5);
  }

  private dropNextLayer(active: readonly Tile[], removed: Tile): DropMove[] {
    const nextLayer = active
      .filter((tile) => tile.layer < removed.layer)
      .reduce<number | undefined>((highest, tile) => highest === undefined || tile.layer > highest ? tile.layer : highest, undefined);

    if (nextLayer === undefined) {
      return [];
    }

    const dropDistance = Math.max(9, Math.min(14, (this.bounds.bottom - this.bounds.top) * 0.032));
    return active
      .filter((tile) => tile.layer === nextLayer)
      .map((tile) => ({
        tile,
        fromX: tile.x,
        fromY: tile.y,
        toX: tile.x,
        toY: this.clamp(tile.y + dropDistance, this.bounds.top + 3, this.bounds.bottom - tile.height - 3),
        delay: 0,
      }))
      .filter(({ fromY, toY }) => Math.abs(fromY - toY) > 0.5);
  }

  private clamp(value: number, minimum: number, maximum: number): number {
    return Math.max(minimum, Math.min(maximum, value));
  }
}
