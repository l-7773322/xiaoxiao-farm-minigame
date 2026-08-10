import { PileLayout, type PileBounds, type PackedTarget } from "./PileLayout";
import { Tile } from "./Tile";

export interface DropMove {
  tile: Tile;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  delay: number;
}

/**
 * Models a basket vacancy instead of pulling fruit toward the tap point.
 * A row shifts into the removed slot, so the empty slot travels to the row's
 * edge just like real fruit settling inside a packed basket.
 */
export class DropSystem {
  private readonly layout = new PileLayout();

  public constructor(private readonly bounds: PileBounds) {}

  public release(tiles: readonly Tile[], removed: Tile): DropMove[] {
    const active = tiles.filter((tile) => !tile.removed);
    const sameLayer = active.filter((tile) => tile.layer === removed.layer);
    if (sameLayer.length > 0) {
      return this.shiftRowIntoGap(tiles, removed);
    }
    return this.dropNextLayer(active, removed);
  }

  private shiftRowIntoGap(tiles: readonly Tile[], removed: Tile): DropMove[] {
    // PileLayout intentionally ignores removed tiles, so take one snapshot
    // with the removed slot restored to recover the row/sequence metadata.
    removed.removed = false;
    const before = this.layout.compute(tiles, this.bounds);
    removed.removed = true;
    const after = this.layout.compute(tiles, this.bounds);
    const removedTarget = before.find(({ tile }) => tile.id === removed.id);
    if (!removedTarget) {
      return [];
    }

    const beforeById = new Map<number, PackedTarget>(before.map((target) => [target.tile.id, target]));
    const afterById = new Map<number, PackedTarget>(after.map((target) => [target.tile.id, target]));
    const rowFollowers = after
      .filter(({ tile }) => tile.layer === removed.layer)
      .map((target) => ({ target, previous: beforeById.get(target.tile.id) }))
      .filter(({ previous }) => previous !== undefined
        && previous.tile.layer === removed.layer
        && previous.row === removedTarget.row
        && previous.sequence > removedTarget.sequence)
      .sort((left, right) => (left.previous?.sequence ?? 0) - (right.previous?.sequence ?? 0));

    const followers = rowFollowers.length > 0
      ? rowFollowers
      : this.findNextSlotFollower(after, beforeById, removedTarget);

    return followers
      .map(({ target, previous }) => {
        if (!previous) {
          return undefined;
        }
        const tile = target.tile;
        const deltaX = target.x - previous.x;
        const deltaY = target.y - previous.y;
        return {
          tile,
          fromX: tile.x,
          fromY: tile.y,
          toX: this.clamp(tile.x + deltaX, this.bounds.left + 3, this.bounds.right - tile.width - 3),
          toY: this.clamp(tile.y + deltaY, this.bounds.top + 3, this.bounds.bottom - tile.height - 3),
          delay: 0,
        };
      })
      .filter((move): move is DropMove => move !== undefined
        && (Math.abs(move.toX - move.fromX) > 0.5 || Math.abs(move.toY - move.fromY) > 0.5));
  }

  private findNextSlotFollower(
    after: readonly PackedTarget[],
    beforeById: ReadonlyMap<number, PackedTarget>,
    removedTarget: PackedTarget,
  ): Array<{ target: PackedTarget; previous: PackedTarget }> {
    const next = after
      .map((target) => ({ target, previous: beforeById.get(target.tile.id) }))
      .filter(({ previous }) => previous !== undefined
        && previous.tile.layer === removedTarget.tile.layer
        && previous.sequence === removedTarget.sequence + 1)
      .sort((left, right) => left.target.tile.id - right.target.tile.id)[0];
    return next?.previous ? [next as { target: PackedTarget; previous: PackedTarget }] : [];
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
