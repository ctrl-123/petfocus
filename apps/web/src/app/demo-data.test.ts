/**
 * 演示数据测试（真实 Dexie + fake-indexeddb）。
 *
 * 为什么必须测：演示数据是**评审者第一眼看到的东西**。
 * 如果 seed 抛异常或写得不完整，演示模式就是一片空白——
 * 而那正是"给简历附链接"最不能出差错的地方。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { closeDb, deleteDb, openDb, type PetFocusDb } from '../../../../packages/shared/src/data/db.ts';
import { createDexieRepositories } from '../../../../packages/shared/src/data/dexie-stores.ts';
import { calculateStreak, dayKeyOf, summarizeFinance } from '@petfocus/shared';
import { seedDemoData } from './demo-data.ts';

/** 用一个固定的"现在"让断言可复现 */
const NOW = new Date(2026, 1, 14, 12, 0, 0, 0).getTime();

let db: PetFocusDb | undefined;
let dbName = '';

beforeEach(async () => {
  dbName = `pf-demo-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  db = await openDb(dbName);
});

afterEach(async () => {
  if (db) closeDb(db);
  if (dbName) await deleteDb(dbName);
  db = undefined;
});

async function seed(): Promise<PetFocusDb> {
  if (!db) throw new Error('db 未初始化');
  await seedDemoData(db, NOW);
  return db;
}

describe('seedDemoData：数据能被完整写入', () => {
  it('不抛异常且各表都有数据', async () => {
    const database = await seed();
    const repos = createDexieRepositories(database);

    const [tasks, sessions, coins, meals, finance, fitness, checkins, inventory] = await Promise.all([
      repos.tasks.count(),
      repos.sessions.count(),
      repos.coinLedger.count(),
      repos.meals.count(),
      repos.finance.count(),
      repos.fitness.count(),
      repos.fitness.checkins(),
      repos.inventory.count(),
    ]);

    assert.ok(tasks > 20, `待办应有 20+ 条，实际 ${tasks}`);
    assert.ok(sessions > 10, `会话应有 10+ 条，实际 ${sessions}`);
    assert.ok(coins > 10, `金币流水应有 10+ 条，实际 ${coins}`);
    assert.ok(meals > 30, `饮食记录应有 30+ 条，实际 ${meals}`);
    assert.ok(finance > 20, `账目应有 20+ 条，实际 ${finance}`);
    assert.ok(fitness > 10, `健身记录应有 10+ 条，实际 ${fitness}`);
    assert.ok(checkins.length >= 12, `打卡应有 12+ 天，实际 ${checkins.length}`);
    assert.ok(inventory > 3, `背包应有几件东西，实际 ${inventory}`);
  });

  it('宠物存在且戴着装扮（首页第一眼就有内容）', async () => {
    const database = await seed();
    const pet = await createDexieRepositories(database).pet.get();
    assert.ok(pet, '演示模式必须有宠物');
    assert.equal(pet.name, '豆豆');
    assert.ok(pet.level >= 2, '演示宠物应有等级');
    assert.ok(Object.keys(pet.equipped).length > 0, '演示宠物应穿着装扮');
  });

  it('宠物戴的是发光皇冠（需求方指定，且要能看出皇冠真的渲染了）', async () => {
    const database = await seed();
    const pet = await createDexieRepositories(database).pet.get();
    assert.ok(pet);
    assert.equal(
      pet.equipped.HEAD,
      'outfit-crown',
      '演示宠物的头饰应为发光皇冠（原来是蝴蝶结，需求方要求换掉）',
    );
  });

  it('重复 seed 不会崩（幂等写入）', async () => {
    const database = await seed();
    await seedDemoData(database, NOW);
    // 用固定 id，重复写入是覆盖而非追加
    assert.ok(await createDexieRepositories(database).tasks.count() > 0);
  });
});

describe('演示数据的"真实感"（评审者要能看出功能）', () => {
  it('健身是连续 12 天（不是零散几天），能体现连续天数与里程碑', async () => {
    const database = await seed();
    const checkins = await createDexieRepositories(database).fitness.checkins();
    const streak = calculateStreak(
      checkins.map((c) => ({ dayKey: c.dayKey })),
      dayKeyOf(NOW),
    );
    assert.ok(streak.current >= 6, `连续天数应可观（体现里程碑），实际 ${streak.current}`);
    assert.ok(streak.longest >= 12, `历史最长应有 12 天左右，实际 ${streak.longest}`);
  });

  it('专注会话集中在最近两周内（统计图表不会是一片空白）', async () => {
    const database = await seed();
    const sessions = await createDexieRepositories(database).sessions.all();
    const dayKeys = new Set(sessions.map((s) => dayKeyOf(s.startedAtWall)));
    assert.ok(dayKeys.size >= 10, `应有 10+ 天有专注记录，实际 ${dayKeys.size}`);
  });

  it('同时有专注与锁机两种会话', async () => {
    const database = await seed();
    const sessions = await createDexieRepositories(database).sessions.all();
    assert.ok(sessions.some((s) => s.kind === 'FOCUS'), '应有专注会话');
    assert.ok(sessions.some((s) => s.kind === 'LOCK'), '应有锁机会话');
  });

  it('近 14 天每天都有支出（趋势图不会出现"看起来断掉"的空白日）', async () => {
    const database = await seed();
    const entries = await createDexieRepositories(database).finance.all();
    const expenseDays = new Set(
      entries.filter((e) => e.type === 'EXPENSE').map((e) => e.dayKey),
    );
    assert.ok(
      expenseDays.size >= 14,
      `支出应覆盖 14 天以上，实际 ${expenseDays.size} 天`,
    );
  });

  it('收入分布在多个日子（否则收支图里绿色只有一根，看着像空的）', async () => {
    const database = await seed();
    const entries = await createDexieRepositories(database).finance.all();
    const incomeDays = new Set(
      entries.filter((e) => e.type === 'INCOME').map((e) => e.dayKey),
    );
    assert.ok(
      incomeDays.size >= 5,
      `收入应分布在 5 天以上，实际 ${incomeDays.size} 天（只有 1 天时图表看起来是空的）`,
    );
  });

  it('收入覆盖多种来源（工资之外还有报销/兼职/红包等）', async () => {
    const database = await seed();
    const entries = await createDexieRepositories(database).finance.all();
    const incomeCats = new Set(
      entries.filter((e) => e.type === 'INCOME').map((e) => e.categoryId),
    );
    assert.ok(incomeCats.size >= 4, `收入分类应有 4 种以上，实际 ${incomeCats.size}`);
  });

  it('饮食记录铺满 14 天（更长的统计窗口也有数据）', async () => {
    const database = await seed();
    const meals = await createDexieRepositories(database).meals.all();
    const mealDays = new Set(meals.map((m) => m.dayKey));
    assert.ok(
      mealDays.size >= 14,
      `饮食应覆盖 14 天，实际 ${mealDays.size} 天（少于窗口长度时趋势图会有空档）`,
    );
  });

  it('账目里既有收入也有支出，净额为正（更像真实生活）', async () => {
    const database = await seed();
    const entries = await createDexieRepositories(database).finance.all();
    const summary = summarizeFinance(
      entries.map((e) => ({
        dayKey: e.dayKey,
        type: e.type,
        amountCents: e.amountCents,
        categoryId: e.categoryId,
      })),
    );
    assert.ok(summary.expenseCents > 0, '应有支出');
    assert.ok(summary.incomeCents > 0, '应有收入');
    assert.ok(summary.netCents > 0, `净额应为正，实际 ${summary.netCents}`);
    assert.ok(summary.expenseByCategory.length >= 5, '支出应分布在多个分类上');
  });

  it('本月预算已设置（预算进度条有东西可显示）', async () => {
    const database = await seed();
    const budgets = await createDexieRepositories(database).finance.budgets();
    assert.ok(budgets.length > 0, '演示数据应带一个预算');
    assert.ok((budgets[0]?.totalLimitCents ?? 0) > 0);
  });

  it('饮食记录覆盖多个餐次与多种食物', async () => {
    const database = await seed();
    const meals = await createDexieRepositories(database).meals.all();
    const slots = new Set(meals.map((m) => m.slot));
    const foods = new Set(meals.map((m) => m.normalizedName));
    assert.ok(slots.size >= 2, `应覆盖多个餐次，实际 ${slots.size}`);
    assert.ok(foods.size >= 5, `应有多种食物，实际 ${foods.size}`);
  });

  it('待办里既有已完成也有未完成（首页能看到可操作的状态）', async () => {
    const database = await seed();
    const tasks = await createDexieRepositories(database).tasks.all();
    assert.ok(tasks.some((t) => t.status === 'DONE'), '应有已完成的');
    assert.ok(tasks.some((t) => t.status === 'PENDING'), '应留一件未完成的，让界面有可操作内容');
  });

  it('存在配额记录（配额面板有数据）', async () => {
    const database = await seed();
    const quota = await createDexieRepositories(database).quotaLedger.allEntries();
    assert.ok(quota.some((q) => q.kind === 'GRANT'), '应有发放记录');
    assert.ok(quota.some((q) => q.kind === 'CONSUME'), '应有消耗记录，体现"用过机会"');
  });

  it('部分会话带违规记录（离开累计不是 0）', async () => {
    const database = await seed();
    const sessions = await createDexieRepositories(database).sessions.all();
    assert.ok(
      sessions.some((s) => s.violations.length > 0),
      '应有会话带违规，否则统计页的"离开累计"永远是 0',
    );
  });

  it('记账分类齐全（记账页有可选项）', async () => {
    const database = await seed();
    const categories = await createDexieRepositories(database).finance.categories();
    assert.ok(categories.length >= 15, `分类应齐全，实际 ${categories.length}`);
    assert.ok(categories.some((c) => c.type === 'EXPENSE'));
    assert.ok(categories.some((c) => c.type === 'INCOME'));
  });
});

describe('演示数据不污染真实库', () => {
  it('seed 只写入传入的那个库', async () => {
    // 另开一个"真实库"，seed 之后它必须仍然是空的
    const realName = `pf-real-${Date.now()}`;
    const realDb = await openDb(realName);
    try {
      await seed();
      const realRepos = createDexieRepositories(realDb);
      assert.equal(await realRepos.tasks.count(), 0, '真实库不应被演示数据写入');
      assert.equal(await realRepos.sessions.count(), 0);
      assert.equal(await realRepos.finance.count(), 0);
    } finally {
      closeDb(realDb);
      await deleteDb(realName);
    }
  });
});
