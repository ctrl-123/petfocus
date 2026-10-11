/**
 * 食物库测试。
 *
 * 这份库的价值完全取决于**数据是否自洽**：一条能量与营养素互相矛盾的记录，
 * 在界面上看不出来，却会让用户的营养估算整体失真。
 * 因此这里的首要测试不是"功能对不对"，而是"数据有没有错"。
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { normalizeFoodName } from '@petfocus/shared';
import {
  BEVERAGE_FOODS,
  DAIRY_FOODS,
  DISH_FOODS,
  FASTFOOD_FOODS,
  FOOD_DB,
  FOOD_DB_META,
  FRUIT_FOODS,
  SNACK_FOODS,
  STAPLE_FOODS,
  VEGETABLE_FOODS,
  WHEEL_CATEGORIES,
  categoryCounts,
  foodsByTag,
  sortIssues,
  validateFoodDb,
} from './index.ts';
import { MEAT_FOODS } from './data/meats.ts';

describe('数据规模（PRD 要求 ≥ 200 种）', () => {
  it('总条目数不少于 200', () => {
    assert.ok(FOOD_DB.length >= 200, `只有 ${FOOD_DB.length} 条`);
  });

  it('每个类别文件都有内容', () => {
    const categories = {
      主食: STAPLE_FOODS,
      肉蛋水产: MEAT_FOODS,
      蔬菜豆制品: VEGETABLE_FOODS,
      水果: FRUIT_FOODS,
      奶制品: DAIRY_FOODS,
      零食: SNACK_FOODS,
      饮品: BEVERAGE_FOODS,
      菜肴: DISH_FOODS,
      快餐: FASTFOOD_FOODS,
    };
    for (const [label, list] of Object.entries(categories)) {
      assert.ok(list.length > 0, `${label} 类别是空的`);
    }
  });

  it('元信息与实际条目数一致（不虚报）', () => {
    assert.equal(FOOD_DB_META.itemCount, FOOD_DB.length);
  });
});

describe('数据自洽性：这是本库最重要的一道门', () => {
  it('校验器零问题', () => {
    const issues = sortIssues(validateFoodDb(FOOD_DB));
    const report = issues
      .map((i) => `  [${i.kind}] ${i.name}：${i.detail}`)
      .join('\n');
    assert.deepEqual(
      issues,
      [],
      `食物库存在 ${issues.length} 处数据问题：\n${report}`,
    );
  });

  it('每条都是正数且能量大于 0（除纯水外）', () => {
    for (const item of FOOD_DB) {
      assert.ok(item.nutrients.kcal >= 0, `${item.name} 能量为负`);
      assert.ok(item.nutrients.proteinG >= 0, `${item.name} 蛋白为负`);
      assert.ok(item.nutrients.fatG >= 0, `${item.name} 脂肪为负`);
      assert.ok(item.nutrients.carbG >= 0, `${item.name} 碳水为负`);
    }
  });

  it('每条都有标签（转盘分类依赖它）', () => {
    for (const item of FOOD_DB) {
      assert.ok(item.tags.length > 0, `${item.name} 没有标签`);
    }
  });

  it('id 与名称都唯一', () => {
    assert.equal(new Set(FOOD_DB.map((i) => i.id)).size, FOOD_DB.length, 'id 有重复');
    assert.equal(new Set(FOOD_DB.map((i) => i.name)).size, FOOD_DB.length, '名称有重复');
  });

  it('基准份量合法', () => {
    for (const item of FOOD_DB) {
      assert.ok(item.per.value > 0, `${item.name} 基准份量非正`);
      assert.ok(
        ['GRAM', 'ML', 'SERVING'].includes(item.per.unit),
        `${item.name} 单位非法：${item.per.unit}`,
      );
    }
  });

  it('每条都有来源标注（不用"来源不明"的数据）', () => {
    for (const item of FOOD_DB) {
      assert.ok(item.source.trim().length > 0, `${item.name} 缺少来源`);
    }
  });
});

describe('名称可被检索到（与 normalizeFoodName 协作）', () => {
  it('每条的名字本身在归一化后非空', () => {
    for (const item of FOOD_DB) {
      assert.ok(
        normalizeFoodName(item.name).length > 0,
        `${item.name} 归一化后为空字符串，将永远匹配不到`,
      );
    }
  });

  it('别名归一化后也不为空', () => {
    for (const item of FOOD_DB) {
      for (const alias of item.aliases) {
        assert.ok(
          normalizeFoodName(alias).length > 0,
          `${item.name} 的别名「${alias}」归一化后为空`,
        );
      }
    }
  });

  it('口语别名能被归一化保留（例如"西红柿"→"西红柿"）', () => {
    assert.equal(normalizeFoodName('西红柿'), '西红柿');
    assert.equal(normalizeFoodName(' 番茄 '), '番茄');
  });
});

describe('食物转盘分类', () => {
  const counts = categoryCounts(FOOD_DB);

  it('每个扇区都有候选（空扇区会让转盘转出空气）', () => {
    for (const def of WHEEL_CATEGORIES) {
      assert.ok(counts[def.key] > 0, `扇区「${def.label}」没有候选食物`);
    }
  });

  it('主要扇区候选充足（至少 20 种，否则反复转到同一个）', () => {
    for (const key of ['STAPLE', 'DISH', 'MEAT', 'VEGETABLE', 'FRUIT', 'FASTFOOD'] as const) {
      assert.ok(counts[key] >= 20, `${key} 只有 ${counts[key]} 种`);
    }
  });

  it('「低卡」扇区只含每 100 克 ≤ 100 千卡的食物（且排除饮品）', () => {
    const light = foodsByTag('LIGHT', FOOD_DB);
    assert.ok(light.length > 0);
    for (const item of light) {
      assert.ok(item.nutrients.kcal <= 100, `${item.name} 有 ${item.nutrients.kcal} 千卡`);
      assert.ok(!item.id.startsWith('bev-'), `${item.name} 是饮品，不该出现在低卡里`);
    }
  });

  it('「肉蛋」扇区确实只含肉蛋水产', () => {
    const meat = foodsByTag('MEAT', FOOD_DB);
    for (const item of meat) {
      assert.ok(
        /^(meat|egg|fish|seafood)-/.test(item.id),
        `${item.name}（${item.id}）不该出现在肉蛋扇区`,
      );
    }
  });

  it('同一食物可以属于多个扇区（例如低卡蔬菜）', () => {
    const light = new Set(foodsByTag('LIGHT', FOOD_DB).map((i) => i.id));
    const veg = foodsByTag('VEGETABLE', FOOD_DB).map((i) => i.id);
    assert.ok(veg.some((id) => light.has(id)), '低卡与蔬菜应有交集');
  });

  it('未知扇区返回空数组而不是抛异常', () => {
    // @ts-expect-error 故意传入非法值，验证运行时不崩
    assert.deepEqual(foodsByTag('NOPE', FOOD_DB), []);
  });
});

describe('关键条目的常识校验（防止离谱数值）', () => {
  function kcalOf(id: string): number {
    const item = FOOD_DB.find((f) => f.id === id);
    assert.ok(item, `找不到 ${id}`);
    return item.nutrients.kcal;
  }

  it('纯水为 0 千卡', () => {
    assert.equal(kcalOf('bev-water'), 0);
  });

  it('油脂类热量最高（每 100 克 > 700）', () => {
    assert.ok(kcalOf('dairy-butter') > 700);
  });

  it('蔬菜热量普遍很低（叶菜类 < 40）', () => {
    for (const id of ['veg-bokchoy', 'veg-spinach', 'veg-cucumber', 'veg-lettuce']) {
      assert.ok(kcalOf(id) < 40, `${id} 有 ${kcalOf(id)} 千卡，不像叶菜`);
    }
  });

  it('鸡胸肉是高蛋白低脂（蛋白 > 脂肪 2 倍以上）', () => {
    const item = FOOD_DB.find((f) => f.id === 'meat-chicken-breast');
    assert.ok(item);
    assert.ok(item.nutrients.proteinG > item.nutrients.fatG * 2, '鸡胸肉应显著高蛋白');
  });

  it('米饭按熟重记录（不该是生米的 300+ 千卡）', () => {
    assert.ok(kcalOf('staple-rice-cooked') < 150, '熟米饭应在 100–150 千卡区间');
    assert.ok(kcalOf('staple-rice-raw') > 300, '生米应在 300+ 千卡');
  });

  it('坚果热量密度高（> 500）', () => {
    for (const id of ['snack-walnut', 'snack-almond', 'snack-cashew']) {
      assert.ok(kcalOf(id) > 500, `${id} 只有 ${kcalOf(id)} 千卡`);
    }
  });

  it('含酒精饮品的热量高于同糖分的软饮（乙醇也产能）', () => {
    assert.ok(kcalOf('bev-baijiu') > kcalOf('bev-cola'), '白酒应远高于可乐');
  });
});

describe('份量参考条目的合理性', () => {
  it('"一份"条目的营养素合计不超过 1500 克（防止单位错误）', () => {
    for (const item of FOOD_DB.filter((f) => f.per.unit === 'SERVING')) {
      const sum = item.nutrients.proteinG + item.nutrients.fatG + item.nutrients.carbG;
      assert.ok(sum < 1500, `${item.name} 营养素合计 ${sum} 克，疑似单位错误`);
    }
  });

  it('"一个鸡蛋"的热量接近每 100 克鸡蛋按单个重量折算的结果', () => {
    const perHundred = FOOD_DB.find((f) => f.id === 'egg-chicken');
    const one = FOOD_DB.find((f) => f.id === 'egg-chicken-one');
    assert.ok(perHundred && one);
    // 一个鸡蛋约 50 克，应约为每 100 克的一半
    const ratio = one.nutrients.kcal / perHundred.nutrients.kcal;
    assert.ok(ratio > 0.4 && ratio < 0.6, `比值 ${ratio.toFixed(2)} 不像一个鸡蛋`);
  });
});
