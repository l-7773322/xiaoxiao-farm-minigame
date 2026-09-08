import { ITEM_TYPES, type ItemType } from "../data/ItemConfig";

export interface DailyProgress {
  stamp: string;
  completed: boolean;
  stars: number;
}

export interface RewardProgress {
  coins: number;
  streak: number;
  lastRewardStamp: string;
}

export interface ProgressData {
  highestUnlocked: number;
  completedLevels: number[];
  levelStars: Record<number, number>;
  discoveredItems: ItemType[];
  daily: DailyProgress;
  reward: RewardProgress;
}

const STORAGE_KEY = "xiaoxiao-farm-progress-v1";

function getStorageApi(): WxMiniGameApi | undefined {
  return typeof wx === "undefined" ? undefined : wx;
}

export function getDateStamp(now = Date.now()): string {
  const date = new Date(now);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function createDefaultProgress(): ProgressData {
  return {
    highestUnlocked: 1,
    completedLevels: [],
    levelStars: {},
    discoveredItems: [],
    daily: { stamp: getDateStamp(), completed: false, stars: 0 },
    reward: { coins: 0, streak: 0, lastRewardStamp: "" },
  };
}

export class StorageManager {
  public load(): ProgressData {
    const stored = getStorageApi()?.getStorageSync?.(STORAGE_KEY);
    if (!stored || typeof stored !== "object") {
      return createDefaultProgress();
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
    const levelStars: Record<number, number> = {};
    if (candidate.levelStars && typeof candidate.levelStars === "object") {
      Object.entries(candidate.levelStars as Record<string, unknown>).forEach(([level, stars]) => {
        const levelNumber = Number(level);
        if (Number.isInteger(levelNumber) && levelNumber >= 1 && levelNumber <= 30 && Number.isInteger(stars)) {
          levelStars[levelNumber] = Math.max(1, Math.min(3, stars as number));
        }
      });
    }
    const discoveredItems = Array.isArray(candidate.discoveredItems)
      ? candidate.discoveredItems.filter((type): type is ItemType => ITEM_TYPES.includes(type as ItemType))
      : [];
    const stamp = getDateStamp();
    const storedDaily = candidate.daily && typeof candidate.daily === "object"
      ? candidate.daily as Partial<DailyProgress>
      : undefined;
    const daily: DailyProgress = storedDaily?.stamp === stamp
      ? {
        stamp,
        completed: storedDaily.completed === true,
        stars: Number.isInteger(storedDaily.stars) ? Math.max(0, Math.min(3, storedDaily.stars as number)) : 0,
      }
      : { stamp, completed: false, stars: 0 };
    const storedReward = candidate.reward && typeof candidate.reward === "object"
      ? candidate.reward as Partial<RewardProgress>
      : undefined;
    const reward: RewardProgress = {
      coins: Number.isInteger(storedReward?.coins) ? Math.max(0, storedReward?.coins as number) : 0,
      streak: Number.isInteger(storedReward?.streak) ? Math.max(0, Math.min(99, storedReward?.streak as number)) : 0,
      lastRewardStamp: typeof storedReward?.lastRewardStamp === "string" ? storedReward.lastRewardStamp : "",
    };
    return {
      highestUnlocked,
      completedLevels: [...new Set(completedLevels)],
      levelStars,
      discoveredItems: [...new Set(discoveredItems)],
      daily,
      reward,
    };
  }

  public completeLevel(progress: ProgressData, level: number, stars = 1): ProgressData {
    const completedLevels = progress.completedLevels.includes(level)
      ? progress.completedLevels
      : [...progress.completedLevels, level];
    const updated = {
      ...progress,
      highestUnlocked: Math.min(30, Math.max(progress.highestUnlocked, level + 1)),
      completedLevels,
      levelStars: {
        ...progress.levelStars,
        [level]: Math.max(progress.levelStars[level] ?? 0, Math.max(1, Math.min(3, stars))),
      },
    };
    getStorageApi()?.setStorageSync?.(STORAGE_KEY, updated);
    return updated;
  }

  public discoverItem(progress: ProgressData, type: ItemType): ProgressData {
    return this.discoverItems(progress, [type]);
  }

  public discoverItems(progress: ProgressData, types: readonly ItemType[]): ProgressData {
    const discoveredItems = [...new Set([...progress.discoveredItems, ...types])];
    if (discoveredItems.length === progress.discoveredItems.length) {
      return progress;
    }
    const updated = {
      ...progress,
      discoveredItems,
    };
    getStorageApi()?.setStorageSync?.(STORAGE_KEY, updated);
    return updated;
  }

  public completeDaily(progress: ProgressData, stars: number, now = Date.now()): ProgressData {
    const stamp = getDateStamp(now);
    const previous = progress.daily.stamp === stamp ? progress.daily : { stamp, completed: false, stars: 0 };
    const updated = {
      ...progress,
      daily: {
        stamp,
        completed: true,
        stars: Math.max(previous.stars, Math.max(1, Math.min(3, stars))),
      },
      reward: {
        ...progress.reward,
        coins: progress.reward.coins + Math.max(10, stars * 10),
        streak: progress.reward.lastRewardStamp === getDateStamp(now - 86400000)
          ? progress.reward.streak + 1
          : progress.reward.streak > 0 && progress.reward.lastRewardStamp === stamp
            ? progress.reward.streak
            : 1,
        lastRewardStamp: stamp,
      },
    };
    getStorageApi()?.setStorageSync?.(STORAGE_KEY, updated);
    return updated;
  }

  public completeStageReward(progress: ProgressData, level: number, stars: number, now = Date.now()): ProgressData {
    const stamp = getDateStamp(now);
    const coins = Math.max(5, stars * 5 + Math.min(10, Math.floor(level / 5)));
    const updated = {
      ...progress,
      reward: {
        ...progress.reward,
        coins: progress.reward.coins + coins,
        streak: progress.reward.lastRewardStamp === stamp ? progress.reward.streak : progress.reward.streak,
        lastRewardStamp: progress.reward.lastRewardStamp,
      },
    };
    getStorageApi()?.setStorageSync?.(STORAGE_KEY, updated);
    return updated;
  }
}
