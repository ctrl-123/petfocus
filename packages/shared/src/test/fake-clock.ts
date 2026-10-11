/**
 * 测试基建：可注入的假时钟（AGENTS.md 第 5 节要求）
 *
 * 为什么不用真实定时器：领域层的所有时间行为都必须可确定性复现。
 * 单调时钟与墙钟可**分别**推进，用来模拟「系统时间被改动」这类场景。
 */
import type { Clock } from '../domain/session-engine.ts';

export interface MutableClock extends Clock {
  /** 同时推进两种时钟（正常流逝） */
  advance(ms: number): void;
  /** 只推进墙钟（模拟用户改系统时间） */
  advanceWallOnly(ms: number): void;
  /** 只推进单调时钟（模拟休眠：单调时钟前进而墙钟停滞） */
  advanceMonotonicOnly(ms: number): void;
  setWall(value: number): void;
}

/** 起始基准取一个固定值，保证测试可复现 */
export const FIXED_WALL_START = 1_770_000_000_000; // 2026-02-04 前后
export const FIXED_MONOTONIC_START = FIXED_WALL_START; // 真实环境两者量级接近

export function createFakeClock(
  wallStart: number = FIXED_WALL_START,
  monotonicStart: number = FIXED_MONOTONIC_START,
): MutableClock {
  let wall = wallStart;
  let monotonic = monotonicStart;
  return {
    monotonic: () => monotonic,
    wall: () => wall,
    advance(ms: number): void {
      wall += ms;
      monotonic += ms;
    },
    advanceWallOnly(ms: number): void {
      wall += ms;
    },
    advanceMonotonicOnly(ms: number): void {
      monotonic += ms;
    },
    setWall(value: number): void {
      wall = value;
    },
  };
}
