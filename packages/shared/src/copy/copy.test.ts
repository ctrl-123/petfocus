/**
 * 奖励话术测试。
 *
 * 重点是**红线自检**（AGENTS.md 产品原则 2：惩罚不羞辱）：
 * 话术可以平淡，但绝不能指向人格。这些测试是这条原则的可执行保障。
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  ALL_COPY_POOLS,
  FOCUS_REWARD_COPY,
  LOCK_REWARD_COPY,
  TASK_DONE_COPY,
  findForbiddenCopy,
  pickCopy,
  pickFocusRewardCopy,
  rewardTierOf,
  type RewardTier,
} from './index.ts';

const TIERS: RewardTier[] = ['S', 'A', 'B', 'C', 'D'];

describe('话术数量要求 [PRD FR-1.5：每档 ≥ 8 条]', () => {
  it('专注结算每档至少 8 条', () => {
    for (const tier of TIERS) {
      const pool = FOCUS_REWARD_COPY[tier];
      assert.ok(pool.length >= 8, `${tier} 档只有 ${pool.length} 条，要求 ≥ 8`);
    }
  });

  it('锁机与待办话术也有足够变化', () => {
    assert.ok(LOCK_REWARD_COPY.length >= 8);
    assert.ok(TASK_DONE_COPY.length >= 8);
  });

  it('同一档内没有重复文案', () => {
    for (const tier of TIERS) {
      const pool = FOCUS_REWARD_COPY[tier];
      assert.equal(new Set(pool).size, pool.length, `${tier} 档存在重复文案`);
    }
  });

  it('跨档也没有重复（避免不同表现拿到同一句话）', () => {
    const all = ALL_COPY_POOLS.flat();
    const seen = new Set<string>();
    const dupes: string[] = [];
    for (const line of all) {
      if (seen.has(line)) dupes.push(line);
      seen.add(line);
    }
    assert.deepEqual(dupes, [], `存在跨档重复：${dupes.join(' / ')}`);
  });
});

describe('文案红线自检 [AGENTS.md 产品原则 2]', () => {
  it('没有任何话术命中羞辱性表达', () => {
    const offenders = findForbiddenCopy(ALL_COPY_POOLS);
    assert.deepEqual(offenders, [], `发现羞辱性文案：${offenders.join(' / ')}`);
  });

  it('D 档（最差表现）尤其不得指责', () => {
    const d = FOCUS_REWARD_COPY.D;
    for (const line of d) {
      // 不得出现第二人称指责
      assert.ok(!/你不|你总是|你从来|你根本/.test(line), `D 档指责了用户：${line}`);
    }
  });

  it('全部话术都不含「懒」「失败者」「对不起宠物」这类表述', () => {
    for (const pool of ALL_COPY_POOLS) {
      for (const line of pool) {
        for (const bad of ['懒', '失败者', '对不起宠物', '宠物失望', '没救了']) {
          assert.ok(!line.includes(bad), `话术含「${bad}」：${line}`);
        }
      }
    }
  });

  it('全部话术都不含「防作弊」「无法破解」等承诺 [ADR-010]', () => {
    for (const pool of ALL_COPY_POOLS) {
      for (const line of pool) {
        for (const bad of ['防作弊', '无法破解']) {
          assert.ok(!line.includes(bad), `话术含「${bad}」：${line}`);
        }
      }
    }
  });

  it('每句话都不为空且不过长（UI 气泡不适合长文）', () => {
    for (const pool of ALL_COPY_POOLS) {
      for (const line of pool) {
        assert.ok(line.trim().length > 0);
        assert.ok(line.length <= 40, `话术过长（${line.length} 字）：${line}`);
      }
    }
  });
});

describe('rewardTierOf：档位判定与 PRD 17.1 口径一致', () => {
  it('完成度 100% 且零违规 → S', () => {
    assert.equal(rewardTierOf({ exitKind: 'NONE', completion: 1, violationRatio: 0 }), 'S');
  });

  it('完成度 ≥80% 且违规 <10% → A', () => {
    assert.equal(rewardTierOf({ exitKind: 'NONE', completion: 0.9, violationRatio: 0.05 }), 'A');
  });

  it('完成度 ≥50% → B', () => {
    assert.equal(rewardTierOf({ exitKind: 'NONE', completion: 0.6, violationRatio: 0.3 }), 'B');
  });

  it('完成度 >0 但不足 50% → C', () => {
    assert.equal(rewardTierOf({ exitKind: 'NONE', completion: 0.3, violationRatio: 0 }), 'C');
  });

  it('完成度为 0 → D', () => {
    assert.equal(rewardTierOf({ exitKind: 'NONE', completion: 0, violationRatio: 0 }), 'D');
  });

  it('越界或跳过一律 D（不因完成度好看而给好评）', () => {
    assert.equal(rewardTierOf({ exitKind: 'BREACH', completion: 1, violationRatio: 0 }), 'D');
    assert.equal(rewardTierOf({ exitKind: 'SKIP', completion: 1, violationRatio: 0 }), 'D');
  });

  it('违规会拉低档位（100% 完成但违规 30% 进不了 S/A）', () => {
    assert.notEqual(rewardTierOf({ exitKind: 'NONE', completion: 1, violationRatio: 0.3 }), 'S');
  });
});

describe('pickCopy / pickFocusRewardCopy：可确定性选取', () => {
  it('随机源为 0 时取第一条', () => {
    assert.equal(pickCopy(['a', 'b', 'c'], () => 0), 'a');
  });

  it('随机源接近 1 时取最后一条（不会越界）', () => {
    assert.equal(pickCopy(['a', 'b', 'c'], () => 0.999999), 'c');
    assert.equal(pickCopy(['a', 'b', 'c'], () => 1), 'c');
  });

  it('空池返回空串（不抛异常）', () => {
    assert.equal(pickCopy([]), '');
  });

  it('相同随机值在相同档位上结果稳定', () => {
    const first = pickFocusRewardCopy('S', () => 0.3);
    const second = pickFocusRewardCopy('S', () => 0.3);
    assert.equal(first, second);
    assert.ok(FOCUS_REWARD_COPY.S.includes(first));
  });

  it('每个档位都能选出该档自己的话术', () => {
    for (const tier of TIERS) {
      const line = pickFocusRewardCopy(tier, () => 0.5);
      assert.ok(FOCUS_REWARD_COPY[tier].includes(line), `${tier} 档选出了别的档位的文案`);
    }
  });
});
