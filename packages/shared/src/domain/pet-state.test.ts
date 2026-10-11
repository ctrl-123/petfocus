/**
 * 宠物状态引擎单测。
 * 重点验证三件事：分段积分是否正确、蔫状态语义、以及最硬的那条约束——**宠物永不死亡**。
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  applyWilting,
  cheerVitals,
  clearExpiredWilting,
  decayVitals,
  expToNextLevel,
  feedVitals,
  initialVitals,
  isHungry,
  isWilting,
  levelOf,
  lockRewardVitals,
  moodLevelOf,
  petVitals,
  pickIdleAnimation,
  resolvePetAction,
} from './pet-state.ts';
import { PENALTY, PET } from '../config/index.ts';
import type { PetVitals } from '../types.ts';

const HOUR = 3_600_000;
const NOW = 1_770_000_000_000;

function vitals(partial: Partial<PetVitals> = {}): PetVitals {
  return { ...initialVitals(), ...partial };
}

describe('初始状态与档位映射', () => {
  it('初始三维与配置一致', () => {
    assert.deepEqual(initialVitals(), {
      mood: PET.initialMood,
      satiety: PET.initialSatiety,
      energy: PET.initialEnergy,
    });
  });

  it('心情分档：≥70 活泼、30–69 平静、<30 蔫 [PRD AC-6.2.7]', () => {
    assert.equal(moodLevelOf(vitals({ mood: 100 })), 'HAPPY');
    assert.equal(moodLevelOf(vitals({ mood: 70 })), 'HAPPY');
    assert.equal(moodLevelOf(vitals({ mood: 69 })), 'CALM');
    assert.equal(moodLevelOf(vitals({ mood: 30 })), 'CALM');
    assert.equal(moodLevelOf(vitals({ mood: 29 })), 'WILTING');
    assert.equal(moodLevelOf(vitals({ mood: 0 })), 'WILTING');
  });

  it('未过期的蔫标记优先于心情值', () => {
    const v = vitals({ mood: 100, wiltingUntil: NOW + 1000 });
    assert.equal(moodLevelOf(v, NOW), 'WILTING');
    assert.equal(isWilting(v, NOW), true);
  });

  it('蔫标记过期后不再生效（但标记本身需显式清理）', () => {
    const v = vitals({ mood: 100, wiltingUntil: NOW - 1000 });
    assert.equal(moodLevelOf(v, NOW), 'HAPPY');
    assert.equal(isWilting(v, NOW), false);
  });

  it('饥饿气泡阈值', () => {
    assert.equal(isHungry(vitals({ satiety: PET.hungerBubbleSatiety - 1 })), true);
    assert.equal(isHungry(vitals({ satiety: PET.hungerBubbleSatiety })), false);
  });
});

describe('decayVitals：随时间衰减', () => {
  it('饱食度 −1/小时、精力 −0.5/小时', () => {
    const start = vitals({ mood: 100, satiety: 100, energy: 100 });
    const after = decayVitals({ vitals: start, lastTickAt: NOW, now: NOW + 10 * HOUR });
    assert.equal(after.satiety, 90);
    assert.equal(after.energy, 95);
  });

  it('饱食度高于阈值期间心情不衰减', () => {
    const start = vitals({ mood: 100, satiety: 100, energy: 100 });
    // 饱食度 100 → 阈值 30 需要 70 小时；只过 10 小时
    const after = decayVitals({ vitals: start, lastTickAt: NOW, now: NOW + 10 * HOUR });
    assert.equal(after.mood, 100);
  });

  it('分段积分：饱食度跌破 30 之后心情才开始 −2/小时', () => {
    const start = vitals({ mood: 100, satiety: 40, energy: 100 });
    // 饱食度 40 → 30 需 10 小时；再过 5 小时处于饥饿
    const after = decayVitals({ vitals: start, lastTickAt: NOW, now: NOW + 15 * HOUR });
    assert.equal(after.satiety, 25);
    // 心情只应衰减饥饿的那 5 小时：5 × 2 = 10
    assert.equal(after.mood, 90);
  });

  it('起点已在饥饿区间：整段都按 −2/小时', () => {
    const start = vitals({ mood: 100, satiety: 20, energy: 100 });
    const after = decayVitals({ vitals: start, lastTickAt: NOW, now: NOW + 3 * HOUR });
    assert.equal(after.mood, 94);
  });

  it('三维被夹在 0–100，不会出现负数', () => {
    const start = vitals({ mood: 5, satiety: 5, energy: 5 });
    const after = decayVitals({ vitals: start, lastTickAt: NOW, now: NOW + 500 * HOUR });
    assert.equal(after.mood, 0);
    assert.equal(after.satiety, 0);
    assert.equal(after.energy, 0);
    assert.ok(after.mood >= 0 && after.satiety >= 0 && after.energy >= 0);
  });

  it('长时间离线不会把状态打成负数（回归：避免一次性套用速率）', () => {
    const start = vitals({ mood: 80, satiety: 80, energy: 80 });
    const after = decayVitals({ vitals: start, lastTickAt: NOW, now: NOW + 30 * 24 * HOUR }); // 30 天
    assert.equal(after.satiety, 0);
    assert.equal(after.mood, 0);
    assert.ok(Number.isFinite(after.mood));
  });

  it('时间倒流（改了系统时间）不推进也不惩罚', () => {
    const start = vitals({ mood: 80, satiety: 80, energy: 80 });
    const after = decayVitals({ vitals: start, lastTickAt: NOW, now: NOW - 5 * HOUR });
    assert.deepEqual(after, start);
  });

  it('零时长不变化', () => {
    const start = vitals();
    assert.deepEqual(decayVitals({ vitals: start, lastTickAt: NOW, now: NOW }), start);
  });

  it('衰减过程中保留未过期的蔫标记', () => {
    const start = vitals({ wiltingUntil: NOW + 10 * HOUR });
    const after = decayVitals({ vitals: start, lastTickAt: NOW, now: NOW + HOUR });
    assert.equal(after.wiltingUntil, NOW + 10 * HOUR);
  });
});

describe('事件回补', () => {
  it('喂食叠加效果并夹在 0–100', () => {
    const v = vitals({ satiety: 90, mood: 20 });
    const after = feedVitals(v, { satiety: 30, mood: 10 }, NOW);
    assert.equal(after.satiety, 100);
    assert.equal(after.mood, 30);
  });

  it('特定食物可提前解除蔫状态 [PRD AC-1.4.7]', () => {
    const v = applyWilting(vitals({ mood: 50 }), NOW, PENALTY.wiltingMs);
    assert.equal(isWilting(v, NOW), true);
    const cured = feedVitals(v, { satiety: 20, clearsWilting: true }, NOW);
    assert.equal(isWilting(cured, NOW), false);
    assert.equal(cured.wiltingUntil, undefined);
  });

  it('不能解除蔫状态的食物不会清掉标记', () => {
    const v = applyWilting(vitals(), NOW, PENALTY.wiltingMs);
    const after = feedVitals(v, { satiety: 10 }, NOW);
    assert.equal(after.wiltingUntil, NOW + PENALTY.wiltingMs);
  });

  it('抚摸回补少量心情 [PRD AC-6.2.4]', () => {
    const after = petVitals(vitals({ mood: 50 }));
    assert.equal(after.mood, 50 + PET.petReactionMoodGain);
  });

  it('完成待办回补心情 [PRD 10.4]', () => {
    const after = cheerVitals(vitals({ mood: 50 }));
    assert.equal(after.mood, 50 + PET.cheerMoodGain);
  });

  it('锁机结束回补饱食度（主人在努力，它也有饭吃）', () => {
    const after = lockRewardVitals(vitals({ satiety: 50 }));
    assert.equal(after.satiety, 50 + PET.lockSatietyGain);
  });

  it('回补不会超过 100', () => {
    assert.equal(cheerVitals(vitals({ mood: 99 })).mood, 100);
    assert.equal(petVitals(vitals({ mood: 100 })).mood, 100);
  });
});

describe('蔫状态：越界惩罚与恢复', () => {
  it('applyWilting 设置到期时间且不动三维（不扣血）', () => {
    const before = vitals({ mood: 60, satiety: 60, energy: 60 });
    const after = applyWilting(before, NOW, PENALTY.wiltingMs);
    assert.equal(after.wiltingUntil, NOW + PENALTY.wiltingMs);
    assert.equal(after.mood, before.mood);
    assert.equal(after.satiety, before.satiety);
    assert.equal(after.energy, before.energy);
  });

  it('蔫时长与配置一致（30 分钟）', () => {
    assert.equal(PENALTY.wiltingMs, 30 * 60_000);
  });

  it('到期前不清除标记，到期后清除', () => {
    const v = applyWilting(vitals(), NOW, 1000);
    assert.equal(clearExpiredWilting(v, NOW + 500).wiltingUntil, NOW + 1000);
    assert.equal(clearExpiredWilting(v, NOW + 1000).wiltingUntil, undefined);
    assert.equal(clearExpiredWilting(v, NOW + 5000).wiltingUntil, undefined);
  });

  it('无蔫标记时清理是空操作', () => {
    const v = vitals();
    assert.equal(clearExpiredWilting(v, NOW), v);
  });
});

describe('动作调度 [技术设计 5.5.2]', () => {
  it('用户交互（优先级 2）可打断蔫状态', () => {
    const v = applyWilting(vitals(), NOW, PENALTY.wiltingMs);
    assert.equal(resolvePetAction(v, { animation: 'PET_REACTION', priority: 2 }, NOW), 'PET_REACTION');
  });

  it('蔫状态下事件反应被压制为 WILT（不该欢呼）', () => {
    const v = applyWilting(vitals({ mood: 90 }), NOW, PENALTY.wiltingMs);
    assert.equal(resolvePetAction(v, { animation: 'CHEER', priority: 1 }, NOW), 'WILT');
  });

  it('正常时事件反应直接采用', () => {
    assert.equal(resolvePetAction(vitals(), { animation: 'CHEER', priority: 1 }, NOW), 'CHEER');
  });

  it('待机随机落在合法动作集合内', () => {
    const v = vitals();
    for (const r of [0, 0.25, 0.5, 0.75, 0.999]) {
      const a = resolvePetAction(v, { animation: 'IDLE', priority: 0 }, NOW, () => r);
      assert.ok(
        ['IDLE', 'BLINK', 'LOOK_AROUND', 'YAWN', 'TAIL_WAG'].includes(a),
        `随机值 ${r} 产生了非法动作 ${a}`,
      );
    }
  });

  it('蔫状态几乎只眨眼', () => {
    const v = vitals({ mood: 10 });
    assert.equal(pickIdleAnimation(v, () => 0.1), 'BLINK');
    assert.equal(pickIdleAnimation(v, () => 0.9), 'IDLE');
  });

  it('平静与活泼的待机分布不同（活泼更可能甩尾/张望）', () => {
    const calm = vitals({ mood: 50 });
    const happy = vitals({ mood: 90 });
    expectDifferent(pickIdleAnimation(calm, () => 0.9), pickIdleAnimation(happy, () => 0.9));
  });

  function expectDifferent(a: string, b: string): void {
    assert.notEqual(a, b, `期望平静(${a})与活泼(${b})在同一随机值下产生不同动作`);
  }
});

describe('亲密度等级 [PRD AC-6.2.8]', () => {
  it('新用户为 1 级', () => {
    assert.equal(levelOf(0, 0), 1);
  });

  it('每 20 分升 1 级，完成待办权重 2 倍', () => {
    assert.equal(levelOf(19, 0), 1);
    assert.equal(levelOf(20, 0), 2);
    assert.equal(levelOf(0, 10), 2); // 10 × 2 = 20
  });

  it('封顶 10 级', () => {
    assert.equal(levelOf(10_000, 10_000), PET.maxLevel);
    assert.equal(PET.maxLevel, 10);
  });

  it('expToNextLevel 在满级时为 0，否则为正', () => {
    assert.equal(expToNextLevel(0, 0), 20);
    assert.equal(expToNextLevel(15, 0), 5);
    assert.equal(expToNextLevel(10_000, 10_000), 0);
  });
});

describe('最硬约束：宠物永不死亡、不离家出走 [AGENTS.md 原则 3]', () => {
  it('极端离线 + 连续越界后，三维仍在 0–100 且宠物依然存在', () => {
    let v = vitals();
    // 模拟：30 天不打开 + 被罚 20 次
    for (let i = 0; i < 20; i += 1) {
      v = decayVitals({ vitals: v, lastTickAt: NOW + i * HOUR, now: NOW + (i + 1) * 36 * HOUR });
      v = applyWilting(v, NOW + (i + 1) * 36 * HOUR, PENALTY.wiltingMs);
    }
    assert.ok(v.mood >= 0 && v.mood <= 100);
    assert.ok(v.satiety >= 0 && v.satiety <= 100);
    assert.ok(v.energy >= 0 && v.energy <= 100);
    // 没有「死亡」字段，也没有等级清零逻辑——状态对象始终有效
    assert.equal(typeof v.mood, 'number');
    assert.ok(Number.isFinite(v.mood));
  });

  it('任何惩罚路径都不会把等级打回 0 以下', () => {
    assert.ok(levelOf(0, 0) >= 1);
  });
});
