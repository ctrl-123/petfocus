/**
 * 配额系统单测 —— 验证 PRD AC-1.4.5 / AC-1.4.6 / AC-3.2.4 的规则，
 * 特别是「专注优先扣每日、再扣月度」与「锁机配额完全独立」这两个关键点。
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  computeRemaining,
  consumeQuota,
  grantAmountFor,
  grantEntries,
  refundEntry,
  remainingFor,
  requestSkip,
  skipRemainingToday,
  wiltingUntilOf,
} from './quota.ts';
import { QUOTA } from '../config/index.ts';
import type { QuotaEntry, QuotaScope } from '../types.ts';

const DAY = '2026-02-14';
const MONTH = '2026-02';
const NEXT_DAY = '2026-02-15';
const NEXT_MONTH = '2026-03';
const KEYS = { daily: DAY, monthly: MONTH } as const;

/** 构造一份「已按当周期足额发放」的账本 */
function freshLedger(scopes: ReadonlyArray<QuotaScope> = ['FOCUS_DAILY', 'FOCUS_MONTHLY', 'LOCK_MONTHLY']): QuotaEntry[] {
  return grantEntries(scopes, KEYS);
}

describe('grantAmountFor：各 scope 的发放上限 [PRD AC-1.4.5 / AC-3.2.4]', () => {
  it('专注每日 1 次、每月 5 次；锁机每月 5 次', () => {
    assert.equal(grantAmountFor('FOCUS_DAILY'), QUOTA.focusDaily);
    assert.equal(grantAmountFor('FOCUS_MONTHLY'), QUOTA.focusMonthly);
    assert.equal(grantAmountFor('LOCK_MONTHLY'), QUOTA.lockMonthly);
    assert.equal(grantAmountFor('FOCUS_DAILY'), 1);
    assert.equal(grantAmountFor('FOCUS_MONTHLY'), 5);
    assert.equal(grantAmountFor('LOCK_MONTHLY'), 5);
  });
});

describe('remainingFor：净剩余额度计算', () => {
  it('刚发放时等于上限', () => {
    const l = freshLedger();
    assert.equal(remainingFor(l, 'FOCUS_DAILY', DAY), 1);
    assert.equal(remainingFor(l, 'FOCUS_MONTHLY', MONTH), 5);
    assert.equal(remainingFor(l, 'LOCK_MONTHLY', MONTH), 5);
  });

  it('消耗 1 次后减 1', () => {
    const l = [...freshLedger(), { scope: 'FOCUS_MONTHLY', kind: 'CONSUME', periodKey: MONTH } satisfies QuotaEntry];
    assert.equal(remainingFor(l, 'FOCUS_MONTHLY', MONTH), 4);
  });

  it('退还（REFUND）加回 1 次', () => {
    const l = [
      ...freshLedger(),
      { scope: 'FOCUS_MONTHLY', kind: 'CONSUME', periodKey: MONTH } satisfies QuotaEntry,
      refundEntry('FOCUS_MONTHLY', KEYS),
    ];
    assert.equal(remainingFor(l, 'FOCUS_MONTHLY', MONTH), 5);
  });

  it('其他周期的记录不影响本周期', () => {
    const l = [
      ...freshLedger(),
      { scope: 'FOCUS_MONTHLY', kind: 'CONSUME', periodKey: NEXT_MONTH } satisfies QuotaEntry,
      { scope: 'FOCUS_DAILY', kind: 'CONSUME', periodKey: NEXT_DAY } satisfies QuotaEntry,
    ];
    assert.equal(remainingFor(l, 'FOCUS_MONTHLY', MONTH), 5);
    assert.equal(remainingFor(l, 'FOCUS_DAILY', DAY), 1);
  });

  it('从不返回负数（账本被篡改或重复消耗时）', () => {
    const l: QuotaEntry[] = [{ scope: 'FOCUS_DAILY', kind: 'CONSUME', periodKey: DAY }];
    assert.equal(remainingFor(l, 'FOCUS_DAILY', DAY), 0);
  });

  it('发放超量时被上限夹住（防御导入异常数据）', () => {
    // 两条 GRANT 各带 amount，累加 10，仍被每日上限 1 夹住
    const l: QuotaEntry[] = [
      { scope: 'FOCUS_DAILY', kind: 'GRANT', periodKey: DAY, amount: 5 },
      { scope: 'FOCUS_DAILY', kind: 'GRANT', periodKey: DAY, amount: 5 },
    ];
    assert.equal(remainingFor(l, 'FOCUS_DAILY', DAY), 1);
  });

  it('GRANT 的 amount 语义：一条 GRANT 即代表整周期额度', () => {
    const l = grantEntries(['FOCUS_MONTHLY'], KEYS);
    assert.equal(l.length, 1);
    assert.equal(l[0]?.amount, 5, '专注月度的 GRANT 应携带 5 次');
    assert.equal(remainingFor(l, 'FOCUS_MONTHLY', MONTH), 5);
  });
});

describe('computeRemaining：会话视角的剩余额度', () => {
  it('专注返回每日与月度两个值', () => {
    const r = computeRemaining(freshLedger(), 'FOCUS', KEYS);
    assert.deepEqual(r, { daily: 1, monthly: 5 });
  });

  it('锁机只返回月度，daily 恒为 0', () => {
    const r = computeRemaining(freshLedger(), 'LOCK', KEYS);
    assert.deepEqual(r, { daily: 0, monthly: 5 });
  });
});

describe('consumeQuota：决策顺序（专注优先扣每日）[PRD AC-1.4.5]', () => {
  it('每日有余额 → 扣每日，月度不受影响', () => {
    const d = consumeQuota(freshLedger(), { kind: 'FOCUS', periodKeys: KEYS, allowBreach: true });
    assert.equal(d.outcome, 'CONSUMED');
    assert.equal(d.pool, 'DAILY');
    assert.deepEqual(d.entries, [{ scope: 'FOCUS_DAILY', kind: 'CONSUME', periodKey: DAY }]);
    assert.deepEqual(d.remaining, { daily: 0, monthly: 5 });
  });

  it('每日用尽后 → 从月度池扣', () => {
    const afterDaily = consumeQuota(freshLedger(), { kind: 'FOCUS', periodKeys: KEYS, allowBreach: true });
    const ledger = [...freshLedger(), ...afterDaily.entries];
    const second = consumeQuota(ledger, { kind: 'FOCUS', periodKeys: KEYS, allowBreach: true });
    assert.equal(second.outcome, 'CONSUMED');
    assert.equal(second.pool, 'MONTHLY');
    assert.deepEqual(second.remaining, { daily: 0, monthly: 4 });
  });

  it('连续消耗：第 1 次走每日，第 2–6 次共 5 次走月度，第 7 次越界', () => {
    let ledger = freshLedger();
    const pools: string[] = [];
    for (let i = 0; i < 6; i += 1) {
      const d = consumeQuota(ledger, { kind: 'FOCUS', periodKeys: KEYS, allowBreach: false });
      assert.equal(d.outcome, 'CONSUMED');
      pools.push(d.pool);
      ledger = [...ledger, ...d.entries];
    }
    assert.deepEqual(pools, ['DAILY', 'MONTHLY', 'MONTHLY', 'MONTHLY', 'MONTHLY', 'MONTHLY']);
    // 第 7 次：两池皆空 → 越界
    const seventh = consumeQuota(ledger, { kind: 'FOCUS', periodKeys: KEYS, allowBreach: true });
    assert.equal(seventh.outcome, 'BREACH');
    assert.equal(seventh.pool, 'NONE');
    assert.deepEqual(seventh.entries, [], '越界不应写入配额消耗记录');
  });

  it('不允许越界时，配额用尽会抛错而不是静默失败', () => {
    let ledger = freshLedger();
    for (let i = 0; i < 6; i += 1) {
      ledger = [...ledger, ...consumeQuota(ledger, { kind: 'FOCUS', periodKeys: KEYS, allowBreach: false }).entries];
    }
    assert.throws(
      () => consumeQuota(ledger, { kind: 'FOCUS', periodKeys: KEYS, allowBreach: false }),
      /配额已用尽/,
    );
  });

  it('跨天后每日额度恢复，但月度池继续扣减', () => {
    let ledger = freshLedger();
    for (let i = 0; i < 6; i += 1) {
      ledger = [...ledger, ...consumeQuota(ledger, { kind: 'FOCUS', periodKeys: KEYS, allowBreach: false }).entries];
    }
    // 第二天：补发当日额度
    ledger = [...ledger, ...grantEntries(['FOCUS_DAILY'], { daily: NEXT_DAY, monthly: MONTH })];
    const nextDay = consumeQuota(ledger, {
      kind: 'FOCUS',
      periodKeys: { daily: NEXT_DAY, monthly: MONTH },
      allowBreach: true,
    });
    assert.equal(nextDay.outcome, 'CONSUMED');
    assert.equal(nextDay.pool, 'DAILY');
    assert.equal(nextDay.remaining.monthly, 0, '月度池已耗尽，不因换日恢复');
  });

  it('跨月后月度额度恢复', () => {
    let ledger = freshLedger();
    for (let i = 0; i < 6; i += 1) {
      ledger = [...ledger, ...consumeQuota(ledger, { kind: 'FOCUS', periodKeys: KEYS, allowBreach: false }).entries];
    }
    ledger = [...ledger, ...grantEntries(['FOCUS_DAILY', 'FOCUS_MONTHLY'], { daily: NEXT_DAY, monthly: NEXT_MONTH })];
    const r = computeRemaining(ledger, 'FOCUS', { daily: NEXT_DAY, monthly: NEXT_MONTH });
    assert.deepEqual(r, { daily: 1, monthly: 5 });
  });
});

describe('consumeQuota：锁机配额与专注完全独立 [PRD AC-3.2.4]', () => {
  it('锁机消耗不影响专注配额，反之亦然', () => {
    const ledger = freshLedger();
    const focus = consumeQuota(ledger, { kind: 'FOCUS', periodKeys: KEYS, allowBreach: true });
    const lock = consumeQuota([...ledger, ...focus.entries], { kind: 'LOCK', periodKeys: KEYS, allowBreach: true });

    assert.equal(lock.pool, 'MONTHLY');
    const after = [...ledger, ...focus.entries, ...lock.entries];
    const r = computeRemaining(after, 'FOCUS', KEYS);
    assert.deepEqual(r, { daily: 0, monthly: 5 }, '锁机消耗不应占用专注月度池');
  });

  it('锁机连续 5 次用尽后越界', () => {
    let ledger = freshLedger();
    for (let i = 0; i < 5; i += 1) {
      const d = consumeQuota(ledger, { kind: 'LOCK', periodKeys: KEYS, allowBreach: false });
      assert.equal(d.outcome, 'CONSUMED');
      assert.equal(d.entries[0]?.scope, 'LOCK_MONTHLY');
      ledger = [...ledger, ...d.entries];
    }
    const sixth = consumeQuota(ledger, { kind: 'LOCK', periodKeys: KEYS, allowBreach: true });
    assert.equal(sixth.outcome, 'BREACH');
    assert.equal(sixth.remaining.monthly, 0);
  });

  it('锁机每日不消耗（daily 恒为 0，不因换日获得额外次数）', () => {
    const ledger = [...freshLedger(), ...grantEntries(['LOCK_MONTHLY'], { daily: NEXT_DAY, monthly: MONTH })];
    const r = computeRemaining(ledger, 'LOCK', { daily: NEXT_DAY, monthly: MONTH });
    assert.equal(r.daily, 0);
  });
});

describe('「本次跳过」[PRD AC-1.4.6]', () => {
  it('每日上限 2 次', () => {
    assert.equal(QUOTA.skipDaily, 2);
    const used: QuotaEntry[] = [
      { scope: 'FOCUS_DAILY', kind: 'CONSUME', periodKey: DAY },
    ];
    assert.equal(skipRemainingToday(used, DAY), 1);
    assert.equal(skipRemainingToday([], DAY), 2);
    assert.equal(skipRemainingToday([...used, ...used], DAY), 0);
  });

  it('未用满时允许跳过并给出扣费与剩余次数', () => {
    const d = requestSkip([], DAY, 10);
    assert.deepEqual(d, { allowed: true, coinCost: 10, remainingToday: 1 });
  });

  it('用满后拒绝跳过', () => {
    const three: QuotaEntry[] = Array.from({ length: 3 }, () => ({
      scope: 'FOCUS_DAILY' as const,
      kind: 'CONSUME' as const,
      periodKey: DAY,
    }));
    const d = requestSkip(three, DAY, 10);
    assert.deepEqual(d, { allowed: false, coinCost: 0, remainingToday: 0 });
  });

  it('跳过记录不消耗月度配额池（它是另一个 scope 的语义）', () => {
    const ledger = freshLedger();
    const r = computeRemaining(ledger, 'FOCUS', KEYS);
    assert.deepEqual(r, { daily: 1, monthly: 5 });
  });
});

describe('wiltingUntilOf：越界后宠物蔫状态', () => {
  it('返回 now + 时长', () => {
    const now = 1_770_000_000_000;
    assert.equal(wiltingUntilOf(now, 30 * 60_000), now + 30 * 60_000);
  });
});
