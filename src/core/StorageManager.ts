export interface ProgressData {
  highestUnlocked: number;
  completedLevels: number[];
}

const STORAGE_KEY = "xiaoxiao-farm-progress-v1";

export class StorageManager {
  public load(): ProgressData {
    const stored = wx.getStorageSync?.(STORAGE_KEY);
    if (!stored || typeof stored !== "object") {
      return { highestUnlocked: 1, completedLevels: [] };
    }

    const candidate = stored as Partial<ProgressData>;
    const highestUnlocked = Number.isInteger(candidate.highestUnlocked)
      ? Math.max(1, Math.min(30, candidate.highestUnlocked as number))
      : 1;
    const completedLevels = Array.isArray(candidate.completedLevels)
      ? candidate.completedLevels.filter(
        (level): level is number => Number.isInteger(level) && level >= 1 && level <= 30,
      )
      : [];
    return { highestUnlocked, completedLevels: [...new Set(completedLevels)] };
  }

  public completeLevel(progress: ProgressData, level: number): ProgressData {
    const completedLevels = progress.completedLevels.includes(level)
      ? progress.completedLevels
      : [...progress.completedLevels, level];
    const updated = {
      highestUnlocked: Math.min(30, Math.max(progress.highestUnlocked, level + 1)),
      completedLevels,
    };
    wx.setStorageSync?.(STORAGE_KEY, updated);
    return updated;
  }
}
