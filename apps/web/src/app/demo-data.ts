/**
 * 演示数据。
 *
 * ── 两条硬约束（AGENTS.md 第 4 节）──
 * 1. **独立 IndexedDB 库**（`petfocus-demo`），与真实数据物理隔离。
 *    演示模式下的任何操作都不碰用户自己的记录。
 * 2. 数据要**真实感**：有连续打卡、有多样化的餐次与账目、有已完成与未完成的待办。
 *    一份"看起来像真用过"的数据，比十个功能截图更能说明问题。
 *
 * 生成方式刻意用**相对当前时间**的偏移（最近 14 天），
 * 这样无论评审者什么时候打开，数据都是"最近"的。
 */
import { dayKeyOf, shiftDayKey, type PetFocusDb } from '@petfocus/shared';

const DAY = 86_400_000;

/** 演示数据覆盖的天数 */
const DEMO_DAYS = 14;

/** 取某天的正午时刻（避开 04:00 自然日边界） */
function noonOf(baseNow: number, daysAgo: number): number {
  const d = new Date(baseNow - daysAgo * DAY);
  d.setHours(12, 0, 0, 0);
  return d.getTime();
}

/** 在正午基础上偏移小时与分钟，得到当天的某个具体时刻 */
function at(noon: number, hour: number, minute = 0): number {
  const d = new Date(noon);
  d.setHours(hour, minute, 0, 0);
  return d.getTime();
}

/** 固定顺序取数（避免每次生成的演示数据都不一样，方便对照） */
function cycle<T>(list: ReadonlyArray<T>, index: number): T {
  const item = list[index % list.length];
  if (item === undefined) throw new Error('演示数据列表不应为空');
  return item;
}

/**
 * 写入演示数据。
 * **只在演示库上调用**（由 boot 决定），调用前应确保库是空的。
 */
export async function seedDemoData(db: PetFocusDb, now: number): Promise<void> {
  const todayKey = dayKeyOf(now);

  // ── 待办：过去若干天 + 今天 ──
  const taskTitles: ReadonlyArray<{ title: string; minutes: number; priority: 'HIGH' | 'MEDIUM' | 'LOW' }> = [
    { title: '写周报', minutes: 45, priority: 'HIGH' },
    { title: '复习英语单词', minutes: 25, priority: 'MEDIUM' },
    { title: '整理项目文档', minutes: 60, priority: 'MEDIUM' },
    { title: '读 30 页书', minutes: 30, priority: 'LOW' },
    { title: '健身 30 分钟', minutes: 30, priority: 'MEDIUM' },
    { title: '回邮件', minutes: 20, priority: 'LOW' },
  ];

  for (let dayOffset = DEMO_DAYS - 1; dayOffset >= 0; dayOffset -= 1) {
    const noon = noonOf(now, dayOffset);
    const dayKey = dayKeyOf(noon);
    // 每天 2–3 件，用偏移量决定数量，保证可复现
    const count = 2 + (dayOffset % 2);

    for (let i = 0; i < count; i += 1) {
      const spec = cycle(taskTitles, dayOffset * 3 + i);
      const startAt = at(noon, 9 + i * 2);
      // 过去的待办大多已完成；今天留一件未完成
      const isToday = dayOffset === 0;
      const status = isToday && i === 1 ? 'PENDING' : 'DONE';
      const id = `demo-task-${dayKey}-${i}`;

      await db.tasks.put({
        id,
        dayKey,
        title: spec.title,
        startAt,
        plannedMs: spec.minutes * 60_000,
        priority: spec.priority,
        status,
        linkedSessionIds: [`demo-session-${dayKey}-${i}`],
        ...(status === 'DONE' ? { completedAt: startAt + spec.minutes * 60_000 } : {}),
        createdAt: startAt,
        updatedAt: startAt,
      });
    }
  }

  // ── 会话：过去 13 天每天 1–2 次专注，形成稳定的统计曲线 ──
  for (let dayOffset = DEMO_DAYS - 1; dayOffset >= 1; dayOffset -= 1) {
    const noon = noonOf(now, dayOffset);
    const dayKey = dayKeyOf(noon);
    const sessionsToday = dayOffset % 3 === 0 ? 2 : 1;

    for (let i = 0; i < sessionsToday; i += 1) {
      const plannedMs = cycle([25, 45, 45, 60], dayOffset + i) * 60_000;
      const startedAt = at(noon, 9 + i * 3);
      // 有效时长略少于计划（真实感：总会有几次起身）
      const effectiveMs = Math.round(plannedMs * (0.86 + ((dayOffset + i) % 7) * 0.02));
      const violationMs = (dayOffset + i) % 4 === 0 ? 45_000 : 0;
      const id = `demo-session-${dayKey}-${i}`;
      const rewardCoin = 18 + (dayOffset % 5) * 3;

      await db.sessions.put({
        id,
        kind: 'FOCUS',
        status: 'SETTLED',
        taskId: `demo-task-${dayKey}-${i}`,
        title: cycle(taskTitles, dayOffset * 3 + i).title,
        plannedMs,
        startedAtMonotonic: startedAt,
        startedAtWall: startedAt,
        endedAt: startedAt + effectiveMs,
        pausedIntervals:
          violationMs > 0 ? [{ from: startedAt + 600_000, to: startedAt + 600_000 + violationMs }] : [],
        violations:
          violationMs > 0
            ? [{ startedAt: startedAt + 600_000, durationMs: violationMs, source: 'VISIBILITY', endedAt: startedAt + 600_000 + violationMs }]
            : [],
        effectiveMs,
        exitKind: 'NATURAL',
        rewardCoin,
        updatedAt: startedAt + effectiveMs,
      });

      await db.coinLedger.put({
        id: `demo-coin-${id}`,
        kind: 'FOCUS_DONE',
        amount: rewardCoin,
        balanceAfter: 0,
        refId: id,
        dayKey,
        serverTime: startedAt,
        confirmed: true,
        note: '专注完成',
      });
    }
  }

  // ── 锁机若干次（体现另一种模式也被用过）──
  for (const dayOffset of [10, 7, 4, 2]) {
    const noon = noonOf(now, dayOffset);
    const dayKey = dayKeyOf(noon);
    const startedAt = at(noon, 21);
    await db.sessions.put({
      id: `demo-lock-${dayKey}`,
      kind: 'LOCK',
      status: 'SETTLED',
      title: '主动锁机 45 分钟',
      plannedMs: 45 * 60_000,
      startedAtMonotonic: startedAt,
      startedAtWall: startedAt,
      endedAt: startedAt + 45 * 60_000,
      pausedIntervals: [],
      violations: [],
      effectiveMs: 45 * 60_000,
      exitKind: 'NATURAL',
      rewardCoin: 9,
      updatedAt: startedAt + 45 * 60_000,
    });
    await db.coinLedger.put({
      id: `demo-coin-lock-${dayKey}`,
      kind: 'LOCK_DONE',
      amount: 9,
      balanceAfter: 0,
      refId: `demo-lock-${dayKey}`,
      dayKey,
      serverTime: startedAt,
      confirmed: true,
      note: '锁机完成',
    });
  }

  // ── 配额：本月已用过 2 次退出机会（真实感）──
  const monthKey = todayKey.slice(0, 7);
  await db.quotaLedger.put({
    id: 'demo-quota-month',
    scope: 'FOCUS_MONTHLY',
    kind: 'GRANT',
    periodKey: monthKey,
    amount: 5,
    serverTime: 0,
    confirmed: true,
  });
  await db.quotaLedger.put({
    id: 'demo-quota-daily',
    scope: 'FOCUS_DAILY',
    kind: 'GRANT',
    periodKey: todayKey,
    amount: 1,
    serverTime: 0,
    confirmed: true,
  });
  for (let i = 0; i < 2; i += 1) {
    await db.quotaLedger.put({
      id: `demo-quota-consume-${i}`,
      scope: 'FOCUS_MONTHLY',
      kind: 'CONSUME',
      periodKey: monthKey,
      sessionId: `demo-session-${shiftDayKey(todayKey, -(i + 3))}-0`,
      serverTime: 0,
      confirmed: true,
    });
  }

  // ── 宠物：等级 3，穿着蝴蝶结 + 小手套，背包里有几件东西 ──
  await db.pet.put({
    id: 'singleton',
    name: '豆豆',
    level: 3,
    exp: 12,
    mood: 82,
    satiety: 64,
    energy: 71,
    equipped: { HEAD: 'outfit-crown', HAND: 'outfit-gloves' },
    outfits: [{ HEAD: 'outfit-crown' }],
    lastTickAt: now,
    interactedCount: 34,
    completedTasks: 21,
    updatedAt: now,
  });

  const inventory: ReadonlyArray<{ itemId: string; quantity: number }> = [
    { itemId: 'outfit-bow', quantity: 1 },
    { itemId: 'outfit-gloves', quantity: 1 },
    { itemId: 'outfit-crown', quantity: 1 },
    { itemId: 'food-apple', quantity: 3 },
    { itemId: 'food-bento', quantity: 1 },
    { itemId: 'item-candy', quantity: 2 },
  ];
  for (const item of inventory) {
    await db.inventory.put({
      id: item.itemId,
      itemId: item.itemId,
      quantity: item.quantity,
      acquiredAt: now - 5 * DAY,
    });
  }

  // ── 饮食：最近 14 天，每天 2–3 餐，菜色多样 ──
  // 为什么要 14 天而不是 7 天：饮食模块的趋势图与统计页会看更长的窗口，
  // 只有 7 天数据时更长的窗口就是一片空白。
  const mealPlan: ReadonlyArray<ReadonlyArray<{ name: string; grams: number; kcal: number; p: number; f: number; c: number }>> = [
    [
      { name: '豆浆', grams: 300, kcal: 93, p: 9, f: 4.8, c: 3.6 },
      { name: '鸡蛋灌饼', grams: 180, kcal: 482, p: 16.6, f: 20.5, c: 56.9 },
    ],
    [
      { name: '米饭', grams: 200, kcal: 232, p: 5.2, f: 0.6, c: 51.8 },
      { name: '西红柿炒蛋', grams: 200, kcal: 244, p: 11.6, f: 16.8, c: 12.4 },
      { name: '清炒小白菜', grams: 150, kcal: 138, p: 2.4, f: 11.4, c: 5.1 },
    ],
    [
      { name: '牛肉面', grams: 450, kcal: 594, p: 28.8, f: 18.5, c: 77.4 },
    ],
    [
      { name: '米饭', grams: 180, kcal: 209, p: 4.7, f: 0.5, c: 46.6 },
      { name: '宫保鸡丁', grams: 200, kcal: 434, p: 29.2, f: 26.8, c: 17.2 },
    ],
    [
      { name: '全麦吐司', grams: 100, kcal: 246, p: 9, f: 3.5, c: 45 },
      { name: '原味酸奶', grams: 200, kcal: 144, p: 5, f: 5.4, c: 18.6 },
      { name: '苹果', grams: 200, kcal: 106, p: 0.4, f: 0.4, c: 27 },
    ],
    [
      { name: '皮蛋瘦肉粥', grams: 400, kcal: 208, p: 8.8, f: 4.4, c: 32.8 },
      { name: '小笼包', grams: 180, kcal: 428, p: 14.4, f: 18.0, c: 51.5 },
    ],
    [
      { name: '米饭', grams: 200, kcal: 232, p: 5.2, f: 0.6, c: 51.8 },
      { name: '清蒸鲈鱼', grams: 200, kcal: 210, p: 37.0, f: 6.2, c: 0.8 },
      { name: '蒜蓉西兰花', grams: 150, kcal: 120, p: 4.5, f: 8.7, c: 7.4 },
    ],
    [
      { name: '燕麦片', grams: 60, kcal: 226, p: 8.4, f: 4.1, c: 39.0 },
      { name: '水煮蛋', grams: 100, kcal: 147, p: 13.3, f: 8.8, c: 2.8 },
      { name: '香蕉', grams: 120, kcal: 112, p: 1.7, f: 0.2, c: 26.2 },
    ],
    [
      { name: '猪肉白菜饺子', grams: 300, kcal: 723, p: 27.3, f: 27.6, c: 91.2 },
    ],
  ];
  const slots = ['BREAKFAST', 'LUNCH', 'DINNER'] as const;

  for (let dayOffset = DEMO_DAYS - 1; dayOffset >= 0; dayOffset -= 1) {
    const noon = noonOf(now, dayOffset);
    const dayKey = dayKeyOf(noon);
    const mealsToday = dayOffset === 0 ? 2 : 3;

    for (let i = 0; i < mealsToday; i += 1) {
      const planned = cycle(mealPlan, dayOffset + i);
      for (let j = 0; j < planned.length; j += 1) {
        const food = planned[j];
        if (!food) continue;
        const slot = cycle(slots, i);
        await db.mealEntries.put({
          id: `demo-meal-${dayKey}-${i}-${j}`,
          dayKey,
          slot,
          foodName: food.name,
          normalizedName: food.name,
          portionValue: food.grams,
          portionUnit: 'GRAM',
          nutrients: { kcal: food.kcal, proteinG: food.p, fatG: food.f, carbG: food.c },
          source: 'LOCAL_DB',
          recordedAt: at(noon, 8 + i * 5),
        });
      }
    }
  }

  // ── 健身：连续 12 天打卡（体现连续天数的效果）──
  const fitnessPlan: ReadonlyArray<{ name: string; unit: 'KM' | 'REPS' | 'MINUTES' | 'SETS'; value: number }> = [
    { name: '跑步', unit: 'KM', value: 3 },
    { name: '俯卧撑', unit: 'REPS', value: 20 },
    { name: '深蹲', unit: 'REPS', value: 30 },
    { name: '平板支撑', unit: 'MINUTES', value: 2 },
    { name: '跳绳', unit: 'MINUTES', value: 10 },
    { name: '哑铃', unit: 'SETS', value: 3 },
  ];

  for (let dayOffset = 11; dayOffset >= 0; dayOffset -= 1) {
    const noon = noonOf(now, dayOffset);
    const dayKey = dayKeyOf(noon);
    await db.fitnessCheckins.put({
      id: `demo-checkin-${dayKey}`,
      dayKey,
      checkedAt: at(noon, 20),
      streakAtTime: 12 - dayOffset,
      ...(dayOffset === 5 ? { note: '今天有点累，但还是动了' } : {}),
    });

    // 每天 1 项训练
    const spec = cycle(fitnessPlan, dayOffset);
    await db.fitnessRecords.put({
      id: `demo-fitness-${dayKey}`,
      dayKey,
      itemName: spec.name,
      unit: spec.unit,
      value: spec.value,
      note: '',
      recordedAt: at(noon, 20, 15),
    });
    await db.coinLedger.put({
      id: `demo-coin-fitness-${dayKey}`,
      kind: 'FITNESS',
      amount: 15,
      balanceAfter: 0,
      refId: `demo-fitness-${dayKey}`,
      dayKey,
      serverTime: at(noon, 20),
      confirmed: true,
      note: '健身记录',
    });
  }

  // ── 记账：本月 20 余笔，分类分布合理 ──
  const financePlan: ReadonlyArray<{ cat: string; amountCents: number; note: string; type: 'EXPENSE' | 'INCOME' }> = [
    { cat: 'cat-food', amountCents: 3200, note: '午饭', type: 'EXPENSE' },
    { cat: 'cat-transport', amountCents: 600, note: '地铁', type: 'EXPENSE' },
    { cat: 'cat-grocery', amountCents: 8900, note: '超市', type: 'EXPENSE' },
    { cat: 'cat-food', amountCents: 2800, note: '晚饭', type: 'EXPENSE' },
    { cat: 'cat-entertainment', amountCents: 4500, note: '电影', type: 'EXPENSE' },
    { cat: 'cat-communication', amountCents: 9900, note: '话费', type: 'EXPENSE' },
    { cat: 'cat-food', amountCents: 1500, note: '早餐', type: 'EXPENSE' },
    { cat: 'cat-shopping', amountCents: 19900, note: '键盘', type: 'EXPENSE' },
    { cat: 'cat-education', amountCents: 6800, note: '技术书', type: 'EXPENSE' },
    { cat: 'cat-food', amountCents: 4100, note: '和朋友吃饭', type: 'EXPENSE' },
  ];

  for (let dayOffset = 13; dayOffset >= 0; dayOffset -= 1) {
    const noon = noonOf(now, dayOffset);
    const dayKey = dayKeyOf(noon);
    const entriesToday = 1 + (dayOffset % 3);

    for (let i = 0; i < entriesToday; i += 1) {
      const spec = cycle(financePlan, dayOffset * 2 + i);
      await db.financeEntries.put({
        id: `demo-finance-${dayKey}-${i}`,
        dayKey,
        type: spec.type,
        amountCents: spec.amountCents,
        categoryId: spec.cat,
        note: spec.note,
        occurredAt: at(noon, 8 + i * 4),
      });
    }
  }

  // ── 收入：铺满近 14 天中的多天 ──
  // 为什么不能只放一笔工资：收支趋势图按天画，
  // 只有一笔收入时那张图的绿色柱子只有一根，看起来"图是空的"。
  // 真实生活里收入确实稀疏，但也不至于一个月只有一次——
  // 报销、退款、兼职、红包都会零星发生。
  const incomePlan: ReadonlyArray<{ cat: string; amountCents: number; note: string }> = [
    { cat: 'cat-salary', amountCents: 850000, note: '月薪' },
    { cat: 'cat-refund', amountCents: 12900, note: '退货退款' },
    { cat: 'cat-parttime', amountCents: 80000, note: '周末兼职' },
    { cat: 'cat-gift-money', amountCents: 20000, note: '朋友还的钱' },
    { cat: 'cat-bonus', amountCents: 150000, note: '项目奖金' },
    { cat: 'cat-investment', amountCents: 4360, note: '余额宝收益' },
  ];
  // 固定落在几个有代表性的日子：8 天前（月薪）、以及近两周内分散的 5 天
  const incomeDays = [8, 12, 10, 6, 4, 2];
  for (let i = 0; i < incomePlan.length; i += 1) {
    const spec = incomePlan[i];
    const dayOffset = incomeDays[i] ?? 3;
    if (spec === undefined) continue;
    const day = noonOf(now, dayOffset);
    await db.financeEntries.put({
      id: `demo-finance-income-${i}`,
      dayKey: dayKeyOf(day),
      type: 'INCOME',
      amountCents: spec.amountCents,
      categoryId: spec.cat,
      note: spec.note,
      occurredAt: at(day, 10),
    });
  }

  // ── 支出：保证近 14 天每一天都有至少一笔 ──
  // 否则趋势图里会出现"看起来断掉"的空白日，让人以为图坏了
  for (let dayOffset = 13; dayOffset >= 0; dayOffset -= 1) {
    const day = noonOf(now, dayOffset);
    const dayKey = dayKeyOf(day);
    const extra = cycle(financePlan, dayOffset + 5);
    await db.financeEntries.put({
      id: `demo-finance-extra-${dayKey}`,
      dayKey,
      type: 'EXPENSE',
      amountCents: 800 + (dayOffset % 5) * 1200,
      categoryId: 'cat-food',
      note: extra.type === 'EXPENSE' ? '加餐' : '零碎开销',
      occurredAt: at(day, 21),
    });
  }

  // 本月预算
  await db.financeBudgets.put({
    id: `demo-budget-${monthKey}`,
    monthKey,
    totalLimitCents: 400000,
    categoryLimits: {},
  });

  // 内置分类：明确写出每条的收支类型，不做字符串猜测
  const expenseCategories: ReadonlyArray<{ id: string; name: string; icon: string; order: number }> = [
    { id: 'cat-food', name: '餐饮', icon: '🍜', order: 1 },
    { id: 'cat-transport', name: '交通', icon: '🚌', order: 2 },
    { id: 'cat-grocery', name: '日用', icon: '🧺', order: 3 },
    { id: 'cat-housing', name: '房租', icon: '🏠', order: 4 },
    { id: 'cat-utility', name: '水电', icon: '💡', order: 5 },
    { id: 'cat-communication', name: '通讯', icon: '📱', order: 6 },
    { id: 'cat-entertainment', name: '娱乐', icon: '🎮', order: 7 },
    { id: 'cat-shopping', name: '购物', icon: '🛍️', order: 8 },
    { id: 'cat-medical', name: '医疗', icon: '💊', order: 9 },
    { id: 'cat-education', name: '学习', icon: '📚', order: 10 },
    { id: 'cat-social', name: '人情', icon: '🎁', order: 11 },
    { id: 'cat-fitness', name: '运动', icon: '🏃', order: 12 },
    { id: 'cat-other-expense', name: '其他', icon: '📦', order: 99 },
  ];
  const incomeCategories: ReadonlyArray<{ id: string; name: string; icon: string; order: number }> = [
    { id: 'cat-salary', name: '工资', icon: '💰', order: 1 },
    { id: 'cat-bonus', name: '奖金', icon: '🎊', order: 2 },
    { id: 'cat-parttime', name: '兼职', icon: '⏰', order: 3 },
    { id: 'cat-investment', name: '理财', icon: '📈', order: 4 },
    { id: 'cat-refund', name: '退款', icon: '↩️', order: 5 },
    { id: 'cat-gift-money', name: '红包', icon: '🧧', order: 6 },
    { id: 'cat-other-income', name: '其他', icon: '📦', order: 99 },
  ];

  for (const cat of expenseCategories) {
    await db.financeCategories.put({
      id: cat.id,
      name: cat.name,
      icon: cat.icon,
      type: 'EXPENSE',
      isBuiltin: true,
      order: cat.order,
    });
  }
  for (const cat of incomeCategories) {
    await db.financeCategories.put({
      id: cat.id,
      name: cat.name,
      icon: cat.icon,
      type: 'INCOME',
      isBuiltin: true,
      order: cat.order,
    });
  }
}

/** 演示用设备 ID（不参与真实结算） */
export const DEMO_DEVICE_ID = 'demo-device-00000000';
