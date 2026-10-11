/**
 * 宠物状态引擎：三维状态衰减、事件回补、状态→动作映射。纯函数，零依赖。
 *
 * 硬约束（AGENTS.md 产品原则 3）：**宠物永不死亡、不离家出走、不掉级到无法恢复**。
 * 任何越界/惩罚最多让它「蔫」一段时间，且必须能用抚摸或食物恢复。
 *
 * 对应 PRD AC-6.2.6 / AC-6.2.7 / AC-6.2.8 与技术设计 5.5.2。
 */

import { PET, TIME_UNITS } from '../config/index.ts';
import type { PetAnimation, PetDecayInput, PetMood, PetVitals } from '../types.ts';

const HOUR_MS = TIME_UNITS.MS_PER_HOUR;

export type PetActionPriority = 0 | 1 | 2;

export interface PetActionRequest {
  animation: PetAnimation;
  /** 0 = 待机随机 | 1 = 事件反应 | 2 = 用户交互 */
  priority: PetActionPriority;
}

function clamp(value: number, min = 0, max = 100): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/** 初始三维（新用户） */
export function initialVitals(): PetVitals {
  return {
    mood: PET.initialMood,
    satiety: PET.initialSatiety,
    energy: PET.initialEnergy,
  };
}

/** 心情档位 [PRD AC-6.2.7] */
export function moodLevelOf(vitals: PetVitals, now?: number): PetMood {
  if (vitals.wiltingUntil !== undefined && now !== undefined && now < vitals.wiltingUntil) {
    return 'WILTING';
  }
  if (vitals.mood >= PET.moodHappyThreshold) return 'HAPPY';
  if (vitals.mood >= PET.moodCalmThreshold) return 'CALM';
  return 'WILTING';
}

/** 是否处于蔫状态（越界惩罚造成，可被食物/抚摸提前解除） */
export function isWilting(vitals: PetVitals, now: number): boolean {
  return vitals.wiltingUntil !== undefined && now < vitals.wiltingUntil;
}

/** 是否显示饥饿气泡 */
export function isHungry(vitals: PetVitals): boolean {
  return vitals.satiety < PET.hungerBubbleSatiety;
}

/**
 * 饱食度衰减量（正值表示减少）。
 * 用积分而不是「一次性套用当前速率」：饱食度在区间中途跌破饥饿阈值时，
 * 心情的额外衰减应当只对**跌破之后**的那段时间生效，否则长时间离线会过度惩罚。
 */
function satietyDecayTotal(elapsedMs: number): number {
  return Math.max(0, elapsedMs) * (PET.satietyDecayPerHour / HOUR_MS);
}

/** 心情衰减量：离线期间按「饱食度跌破饥饿阈值」的时刻分段积分 */
function moodDecayTotal(elapsedMs: number, satietyAtStart: number): number {
  if (elapsedMs <= 0) return 0;
  const hungryMoodPerMs = PET.hungryMoodDecayPerHour / HOUR_MS;
  const threshold = PET.hungrySatietyThreshold;

  if (satietyAtStart <= threshold || PET.satietyDecayPerHour <= 0) {
    // 整段都处于饥饿状态（或饱食度根本不衰减）
    return elapsedMs * hungryMoodPerMs;
  }

  // 饱食度以每小时 satietyDecayPerHour 递减，算出「还要多久跌到阈值」
  const msToThreshold = Math.max(0, ((satietyAtStart - threshold) / PET.satietyDecayPerHour) * HOUR_MS);
  const hungryMs = Math.max(0, elapsedMs - msToThreshold);
  return hungryMs * hungryMoodPerMs;
}

/**
 * 按时间推进三维状态。
 * - 饱食度 −1/小时
 * - 精力 −0.5/小时
 * - 心情：饱食度 < 30 时 −2/小时（分段积分，见上）
 */
export function decayVitals(input: PetDecayInput): PetVitals {
  const { vitals, lastTickAt, now } = input;
  const elapsedMs = now - lastTickAt;

  if (elapsedMs <= 0) {
    // 时间倒流（用户改了系统时间）：不推进、不惩罚，只把游标前移由调用方决定
    return { ...vitals };
  }

  const satiety = clamp(vitals.satiety - satietyDecayTotal(elapsedMs));
  const energy = clamp(vitals.energy - elapsedMs * (PET.energyDecayPerHour / HOUR_MS));
  const mood = clamp(vitals.mood - moodDecayTotal(elapsedMs, vitals.satiety));

  const next: PetVitals = { mood, satiety, energy };
  if (vitals.wiltingUntil !== undefined) {
    next.wiltingUntil = vitals.wiltingUntil;
  }
  return next;
}

// ─────────────────────────────────────────────────────────────
// 事件回补
// ─────────────────────────────────────────────────────────────

export interface FeedEffects {
  satiety?: number;
  mood?: number;
  energy?: number;
  clearsWilting?: boolean;
}

/** 喂食：叠加效果，可提前解除蔫状态 */
export function feedVitals(vitals: PetVitals, effects: FeedEffects, now: number): PetVitals {
  const next: PetVitals = {
    mood: clamp(vitals.mood + (effects.mood ?? 0)),
    satiety: clamp(vitals.satiety + (effects.satiety ?? 0)),
    energy: clamp(vitals.energy + (effects.energy ?? 0)),
  };
  const wiltingUntil = effects.clearsWilting ? undefined : vitals.wiltingUntil;
  if (wiltingUntil !== undefined && wiltingUntil > now) next.wiltingUntil = wiltingUntil;
  return next;
}

/** 抚摸：回补少量心情 [PRD AC-6.2.4 / AC-6.2.6] */
export function petVitals(vitals: PetVitals): PetVitals {
  return {
    ...vitals,
    mood: clamp(vitals.mood + PET.petReactionMoodGain),
  };
}

/** 完成待办/专注：回补心情（欢呼动作同时触发） */
export function cheerVitals(vitals: PetVitals): PetVitals {
  return {
    ...vitals,
    mood: clamp(vitals.mood + PET.cheerMoodGain),
  };
}

/** 锁机结束：主人努力过，它也有饭吃 [PRD 10.4 场景表] */
export function lockRewardVitals(vitals: PetVitals): PetVitals {
  return {
    ...vitals,
    satiety: clamp(vitals.satiety + PET.lockSatietyGain),
    mood: clamp(vitals.mood + PET.petReactionMoodGain),
  };
}

/** 越界惩罚：进入蔫状态（**不扣三维、不死亡**） */
export function applyWilting(vitals: PetVitals, now: number, wiltingMs: number): PetVitals {
  return { ...vitals, wiltingUntil: now + wiltingMs };
}

/** 蔫状态是否已到期（到期后应清除标记） */
export function clearExpiredWilting(vitals: PetVitals, now: number): PetVitals {
  if (vitals.wiltingUntil === undefined || now < vitals.wiltingUntil) return vitals;
  // 用解构丢弃 wiltingUntil，得到不含该字段的新对象
  const { wiltingUntil, ...rest } = vitals;
  void wiltingUntil;
  return rest;
}

// ─────────────────────────────────────────────────────────────
// 动作调度 [技术设计 5.5.2]
// ─────────────────────────────────────────────────────────────

const IDLE_ANIMATIONS: ReadonlyArray<PetAnimation> = ['IDLE', 'BLINK', 'LOOK_AROUND', 'YAWN', 'TAIL_WAG'];

/**
 * 决定此刻播放什么动作。
 * 优先级：用户交互(2) > 事件反应(1) > 待机随机(0)；
 * 但「蔫状态」会压过事件反应（蔫的时候不该欢呼），只有用户交互能打断。
 */
export function resolvePetAction(
  vitals: PetVitals,
  request: PetActionRequest,
  now: number,
  random: () => number = Math.random,
): PetAnimation {
  if (request.priority >= 2) return request.animation;
  if (isWilting(vitals, now)) return 'WILT';
  if (request.priority === 1) return request.animation;
  return pickIdleAnimation(vitals, random);
}

/** 待机随机：心情越好越活泼（多摇尾/张望，少打哈欠） */
export function pickIdleAnimation(
  vitals: PetVitals,
  random: () => number = Math.random,
): PetAnimation {
  const mood = moodLevelOf(vitals);
  const r = random();
  const w = PET.idleWeights;

  if (mood === 'WILTING') {
    // 蔫：动作迟钝，几乎只有眨眼
    return r < w.wiltBlink ? 'BLINK' : 'IDLE';
  }
  if (mood === 'CALM') {
    // 平静：喜怒参半
    if (r < w.calmBlink) return 'BLINK';
    if (r < w.calmIdle) return 'IDLE';
    if (r < w.calmLookAround) return 'LOOK_AROUND';
    return 'YAWN';
  }
  // 活泼：在整个待机动作表里均匀取一个（含甩尾与张望）
  const index = Math.min(IDLE_ANIMATIONS.length - 1, Math.floor(r * IDLE_ANIMATIONS.length));
  return IDLE_ANIMATIONS[index] ?? 'IDLE';
}

/** 亲密度计分：互动次数 + 完成待办数 × 权重 */
function intimacyScore(interactedCount: number, completedTasks: number): number {
  return (
    Math.max(0, interactedCount) + Math.max(0, completedTasks) * PET.leveling.taskWeight
  );
}

/** 亲密度等级：累积互动与完成待办数升到 1–10 级 */
export function levelOf(interactedCount: number, completedTasks: number): number {
  const perLevel = PET.leveling.accumulatedScorePerLevel;
  return Math.min(PET.maxLevel, 1 + Math.floor(intimacyScore(interactedCount, completedTasks) / perLevel));
}

/** 升到下一级还需多少分（已满级返回 0） */
export function expToNextLevel(interactedCount: number, completedTasks: number): number {
  const perLevel = PET.leveling.accumulatedScorePerLevel;
  const score = intimacyScore(interactedCount, completedTasks);
  const level = levelOf(interactedCount, completedTasks);
  if (level >= PET.maxLevel) return 0;
  return level * perLevel - score;
}
