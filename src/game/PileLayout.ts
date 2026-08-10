import { Tile } from "./Tile";

export interface PileBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface PackedTarget {
  tile: Tile;
  x: number;
  y: number;
  layerRank: number;
  row: number;
  sequence: number;
}

/**
 * Packs every active layer from the bottom of the wooden box upwards.
 *
 * A layer keeps a deterministic order, so removing one tile makes the tiles
 * after it fill the empty slot. Layers are separated by a small vertical
 * offset; once a complete upper layer is gone, every layer below it drops by
 * exactly that offset.
 */
export class PileLayout {
  public compute(tiles: readonly Tile[], bounds: PileBounds): PackedTarget[] {
    const active = tiles.filter((tile) => !tile.removed);
    if (active.length === 0) {
      return [];
    }

    const allLayers = [...new Set(tiles.map((tile) => tile.layer))].sort((left, right) => right - left);
    const activeLayers = [...new Set(active.map((tile) => tile.layer))].sort((left, right) => right - left);
    const maximumWidth = Math.max(...tiles.map((tile) => tile.width));
    const maximumHeight = Math.max(...tiles.map((tile) => tile.height));
    const innerWidth = Math.max(maximumWidth, bounds.right - bounds.left - 8);
    const idealStepX = maximumWidth * 0.63;
    const columns = Math.max(2, Math.floor((innerWidth - maximumWidth) / idealStepX) + 1);
    const stepX = columns > 1
      ? Math.min(idealStepX, (innerWidth - maximumWidth) / (columns - 1))
      : 0;
    const maximumRows = Math.max(
      1,
      ...allLayers.map((layer) => Math.ceil(tiles.filter((tile) => tile.layer === layer).length / columns)),
    );
    const layerDrop = Math.max(9, Math.min(14, (bounds.bottom - bounds.top) * 0.032));
    const availableForRows = Math.max(
      maximumHeight * 0.42,
      bounds.bottom - bounds.top - maximumHeight - 8 - (allLayers.length - 1) * layerDrop,
    );
    const stepY = maximumRows > 1
      ? Math.max(maximumHeight * 0.42, Math.min(maximumHeight * 0.58, availableForRows / (maximumRows - 1)))
      : maximumHeight * 0.55;
    const centerX = (bounds.left + bounds.right) / 2;
    const targets: PackedTarget[] = [];

    activeLayers.forEach((layer, layerRank) => {
      const layerTiles = active
        .filter((tile) => tile.layer === layer)
        .sort((left, right) => left.id - right.id);
      const layerShift = ((layer % 3) - 1) * stepX * 0.22;
      const rowBottom = bounds.bottom - maximumHeight - 4 - layerRank * layerDrop;

      layerTiles.forEach((tile, sequence) => {
        const row = Math.floor(sequence / columns);
        const column = sequence % columns;
        const rowCount = Math.min(columns, layerTiles.length - row * columns);
        const flowsLeftToRight = (row + layer) % 2 === 0;
        const packedColumn = flowsLeftToRight ? column : rowCount - 1 - column;
        const rowWidth = maximumWidth + Math.max(0, rowCount - 1) * stepX;
        const rowShift = (((row + layer) % 3) - 1) * stepX * 0.16;
        const jitterX = (this.slotNoise(layer, row, packedColumn, 17) - 0.5) * stepX * 0.42;
        const jitterY = (this.slotNoise(layer, row, packedColumn, 43) - 0.5) * stepY * 0.46;
        const unclampedX = centerX - rowWidth / 2 + packedColumn * stepX + layerShift + rowShift + jitterX
          + (maximumWidth - tile.width) / 2;
        const unclampedY = rowBottom - row * stepY + jitterY + (maximumHeight - tile.height) / 2;
        targets.push({
          tile,
          x: this.clamp(unclampedX, bounds.left + 4, bounds.right - tile.width - 4),
          y: this.clamp(unclampedY, bounds.top + 4, bounds.bottom - tile.height - 4),
          layerRank,
          row,
          sequence,
        });
      });
    });

    return targets;
  }

  private clamp(value: number, minimum: number, maximum: number): number {
    return Math.max(minimum, Math.min(maximum, value));
  }

  private slotNoise(layer: number, row: number, column: number, salt: number): number {
    let value = (layer + 11) * 73856093
      ^ (row + 17) * 19349663
      ^ (column + 23) * 83492791
      ^ salt * 2654435761;
    value = Math.imul(value ^ (value >>> 16), 2246822507);
    value = Math.imul(value ^ (value >>> 13), 3266489909);
    return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
  }
}
