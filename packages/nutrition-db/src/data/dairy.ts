/**
 * 奶制品、豆奶与蛋奶制品（每 100 克 / 100 毫升）。
 * 乳糖不耐受者常喝的低乳糖奶与植物奶也一并列出。
 */
import { foods } from '../entry.ts';
import type { FoodRecord } from '@petfocus/shared';

export const DAIRY_FOODS: ReadonlyArray<FoodRecord> = [
  ...foods([
    { id: 'dairy-milk-whole', name: '全脂牛奶', aliases: ['牛奶', '纯牛奶'], per: { value: 100, unit: 'ML' }, kcal: 65, protein: 3.3, fat: 3.6, carb: 4.9, sodium: 44, tags: ['奶制品', '饮品'] },
    { id: 'dairy-milk-semi', name: '低脂牛奶', per: { value: 100, unit: 'ML' }, kcal: 47, protein: 3.4, fat: 1.5, carb: 5.0, sodium: 45, tags: ['奶制品', '饮品'] },
    { id: 'dairy-milk-skim', name: '脱脂牛奶', per: { value: 100, unit: 'ML' }, kcal: 35, protein: 3.4, fat: 0.2, carb: 5.0, sodium: 46, tags: ['奶制品', '饮品'] },
    { id: 'dairy-milk-lactose-free', name: '零乳糖牛奶', per: { value: 100, unit: 'ML' }, kcal: 60, protein: 3.3, fat: 3.2, carb: 4.6, sodium: 44, tags: ['奶制品', '饮品'] },
    { id: 'dairy-milk-one-cup', name: '一杯牛奶', aliases: ['一盒牛奶', '250ml牛奶'], per: { value: 1, unit: 'SERVING' }, kcal: 163, protein: 8.3, fat: 9.0, carb: 12.3, sodium: 110, tags: ['奶制品', '份量参考'] },
    { id: 'dairy-yogurt-plain', name: '原味酸奶', aliases: ['酸奶', '无糖酸奶'], kcal: 72, protein: 2.5, fat: 2.7, carb: 9.3, sodium: 39, tags: ['奶制品'] },
    { id: 'dairy-yogurt-sweet', name: '含糖酸奶', aliases: ['甜酸奶'], kcal: 93, protein: 2.8, fat: 2.6, carb: 14.6, sodium: 42, tags: ['奶制品', '甜'] },
    { id: 'dairy-yogurt-greek', name: '希腊酸奶', aliases: ['浓缩酸奶'], kcal: 97, protein: 9.0, fat: 5.0, carb: 3.6, sodium: 36, tags: ['奶制品', '高蛋白'] },
    { id: 'dairy-yogurt-one', name: '一杯酸奶', per: { value: 1, unit: 'SERVING' }, kcal: 100, protein: 2.8, fat: 2.6, carb: 16.0, sodium: 44, tags: ['奶制品', '份量参考'] },
    { id: 'dairy-cheese-slice', name: '奶酪片', aliases: ['芝士片', '起司'], kcal: 328, protein: 25.7, fat: 23.5, carb: 3.5, sodium: 584, tags: ['奶制品'] },
    { id: 'dairy-cheese-cheddar', name: '切达奶酪', aliases: ['车打芝士'], kcal: 403, protein: 24.9, fat: 33.1, carb: 1.3, sodium: 621, tags: ['奶制品', '高脂'] },
    { id: 'dairy-cream-cheese', name: '奶油奶酪', aliases: ['奶油芝士'], kcal: 349, protein: 5.9, fat: 34.9, carb: 4.1, sodium: 314, tags: ['奶制品', '高脂'] },
    { id: 'dairy-butter', name: '黄油', aliases: ['牛油'], kcal: 717, protein: 0.9, fat: 81.1, carb: 0.1, sodium: 643, tags: ['奶制品', '油脂'] },
    { id: 'dairy-cream', name: '淡奶油', aliases: ['稀奶油'], kcal: 340, protein: 2.0, fat: 36.0, carb: 3.1, sodium: 38, tags: ['奶制品', '油脂'] },
    { id: 'dairy-condensed-milk', name: '炼乳', kcal: 321, protein: 7.9, fat: 8.7, carb: 55.4, sodium: 127, tags: ['奶制品', '甜'] },
    { id: 'dairy-milk-powder', name: '全脂奶粉', kcal: 478, protein: 20.1, fat: 21.2, carb: 51.7, sodium: 260, tags: ['奶制品', '干货'] },
    { id: 'dairy-milk-powder-skim', name: '脱脂奶粉', kcal: 360, protein: 34.0, fat: 1.0, carb: 51.0, sodium: 400, tags: ['奶制品', '干货'] },
    { id: 'dairy-icecream', name: '冰淇淋', aliases: ['冰激凌', '雪糕'], kcal: 207, protein: 3.5, fat: 11.0, carb: 24.0, sodium: 80, tags: ['奶制品', '甜', '零食'] },
    { id: 'dairy-pudding', name: '布丁', kcal: 126, protein: 3.0, fat: 4.0, carb: 19.0, sodium: 90, tags: ['奶制品', '甜'] },
    { id: 'dairy-double-skin-milk', name: '双皮奶', kcal: 138, protein: 4.6, fat: 6.2, carb: 15.6, sodium: 62, tags: ['奶制品', '甜', '中式甜品'] },

    // ── 植物奶 ──
    { id: 'dairy-soy-milk-unsweet', name: '无糖豆奶', per: { value: 100, unit: 'ML' }, kcal: 33, protein: 3.3, fat: 1.8, carb: 1.0, sodium: 5, tags: ['植物奶', '饮品'] },
    { id: 'dairy-oat-milk', name: '燕麦奶', per: { value: 100, unit: 'ML' }, kcal: 46, protein: 1.0, fat: 1.5, carb: 6.7, fiber: 0.8, sodium: 60, tags: ['植物奶', '饮品'] },
    { id: 'dairy-almond-milk', name: '杏仁奶', per: { value: 100, unit: 'ML' }, kcal: 24, protein: 0.6, fat: 1.1, carb: 3.0, sodium: 72, tags: ['植物奶', '饮品'] },
    { id: 'dairy-coconut-milk', name: '椰奶', per: { value: 100, unit: 'ML' }, kcal: 230, protein: 2.3, fat: 24.0, carb: 3.2, sodium: 15, tags: ['植物奶', '高脂'] },
    { id: 'dairy-rice-milk', name: '米浆', per: { value: 100, unit: 'ML' }, kcal: 47, protein: 0.3, fat: 1.0, carb: 9.0, sodium: 40, tags: ['植物奶', '饮品'] },
  ]),
];
