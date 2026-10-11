/**
 * 快餐、外卖与连锁餐品（每 100 克，另有"一份"参考条目）。
 *
 * ⚠️ 这类食物的**份量差异极大**（中薯/大薯、单层/双层），
 * 因此重点提供"一份"条目，并明确标注规格。
 * 数值按常见连锁品牌的公开营养信息折算，为参考值。
 */
import { food, foods } from '../entry.ts';
import type { FoodRecord } from '@petfocus/shared';

export const FASTFOOD_FOODS: ReadonlyArray<FoodRecord> = [
  ...foods([
    // ── 汉堡类（每 100 克） ──
    { id: 'ff-hamburger', name: '汉堡', aliases: ['牛肉汉堡'], kcal: 254, protein: 12.4, fat: 10.6, carb: 28.6, sodium: 500, tags: ['快餐', '汉堡'] },
    { id: 'ff-cheeseburger', name: '芝士汉堡', aliases: ['吉士汉堡'], kcal: 285, protein: 14.2, fat: 13.4, carb: 27.8, sodium: 620, tags: ['快餐', '汉堡'] },
    { id: 'ff-big-burger', name: '双层牛肉堡', aliases: ['巨无霸'], kcal: 268, protein: 13.6, fat: 14.2, carb: 24.4, sodium: 560, tags: ['快餐', '汉堡'] },
    { id: 'ff-chicken-burger', name: '鸡腿堡', aliases: ['香辣鸡腿堡'], kcal: 278, protein: 12.8, fat: 14.6, carb: 25.2, sodium: 640, tags: ['快餐', '汉堡'] },
    { id: 'ff-fish-burger', name: '鱼堡', aliases: ['鳕鱼堡'], kcal: 262, protein: 11.4, fat: 12.6, carb: 26.8, sodium: 580, tags: ['快餐', '汉堡'] },
    { id: 'ff-veggie-burger', name: '素食汉堡', kcal: 214, protein: 7.4, fat: 8.6, carb: 28.4, fiber: 3.2, sodium: 520, tags: ['快餐', '汉堡'] },

    // ── 炸物 ──
    { id: 'ff-fries', name: '薯条', aliases: ['炸薯条'], kcal: 298, protein: 3.4, fat: 14.6, carb: 38.4, fiber: 3.4, sodium: 420, tags: ['快餐', '油炸'] },
    { id: 'ff-fries-medium', name: '一份中薯条', aliases: ['中薯'], per: { value: 1, unit: 'SERVING' }, kcal: 340, protein: 3.9, fat: 16.6, carb: 43.8, fiber: 3.9, sodium: 480, tags: ['快餐', '油炸', '份量参考'] },
    { id: 'ff-fries-large', name: '一份大薯条', aliases: ['大薯'], per: { value: 1, unit: 'SERVING' }, kcal: 470, protein: 5.4, fat: 23.0, carb: 60.5, fiber: 5.4, sodium: 660, tags: ['快餐', '油炸', '份量参考'] },
    { id: 'ff-fried-chicken', name: '炸鸡', aliases: ['炸鸡块'], kcal: 279, protein: 18.6, fat: 17.4, carb: 11.2, sodium: 720, tags: ['快餐', '油炸'] },
    { id: 'ff-chicken-nuggets', name: '鸡块', aliases: ['鸡米花', '麦乐鸡'], kcal: 296, protein: 15.4, fat: 18.6, carb: 16.4, sodium: 680, tags: ['快餐', '油炸'] },
    { id: 'ff-nuggets-six', name: '六块鸡块', per: { value: 1, unit: 'SERVING' }, kcal: 280, protein: 14.6, fat: 17.6, carb: 15.5, sodium: 640, tags: ['快餐', '油炸', '份量参考'] },
    { id: 'ff-chicken-wing-fried', name: '炸鸡翅', kcal: 268, protein: 18.4, fat: 18.2, carb: 8.6, sodium: 680, tags: ['快餐', '油炸'] },
    { id: 'ff-chicken-strip', name: '鸡柳', aliases: ['鸡条'], kcal: 248, protein: 17.6, fat: 13.4, carb: 14.2, sodium: 620, tags: ['快餐', '油炸'] },
    { id: 'ff-onion-ring', name: '洋葱圈', kcal: 326, protein: 4.4, fat: 18.6, carb: 36.2, fiber: 1.8, sodium: 560, tags: ['快餐', '油炸'] },
    { id: 'ff-hash-brown', name: '薯饼', aliases: ['薯宝'], kcal: 286, protein: 2.6, fat: 16.4, carb: 32.6, fiber: 2.4, sodium: 480, tags: ['快餐', '油炸', '早餐'] },
    { id: 'ff-corn-soup', name: '玉米浓汤', per: { value: 100, unit: 'ML' }, kcal: 62, protein: 1.8, fat: 2.4, carb: 8.6, sodium: 420, tags: ['快餐', '汤'] },
    { id: 'ff-apple-pie', name: '苹果派', kcal: 328, protein: 3.4, fat: 16.2, carb: 42.6, fiber: 1.4, sodium: 320, tags: ['快餐', '甜', '油炸'] },
    { id: 'ff-chicken-wrap', name: '鸡肉卷', aliases: ['老北京鸡肉卷'], kcal: 254, protein: 12.4, fat: 11.6, carb: 25.4, sodium: 620, tags: ['快餐'] },

    // ── 披萨 ──
    { id: 'ff-pizza-cheese', name: '芝士披萨', kcal: 266, protein: 11.4, fat: 10.6, carb: 30.4, sodium: 580, tags: ['快餐', '披萨'] },
    { id: 'ff-pizza-pepperoni', name: '培根披萨', aliases: ['腊肠披萨'], kcal: 298, protein: 13.2, fat: 14.4, carb: 28.6, sodium: 720, tags: ['快餐', '披萨'] },
    { id: 'ff-pizza-slice', name: '一块披萨', per: { value: 1, unit: 'SERVING' }, kcal: 285, protein: 12.2, fat: 11.4, carb: 32.6, sodium: 620, tags: ['快餐', '披萨', '份量参考'] },
    { id: 'ff-garlic-bread', name: '蒜香面包', kcal: 348, protein: 8.4, fat: 14.6, carb: 45.2, fiber: 2.1, sodium: 620, tags: ['快餐', '烘焙'] },

    // ── 中式快餐 ──
    { id: 'ff-braised-pork-rice', name: '卤肉饭', aliases: ['台湾卤肉饭'], kcal: 196, protein: 6.4, fat: 8.4, carb: 24.6, sodium: 620, tags: ['快餐', '中式', '主食'] },
    { id: 'ff-beef-noodle-bowl', name: '一碗牛肉面', per: { value: 1, unit: 'SERVING' }, kcal: 560, protein: 27.0, fat: 17.4, carb: 73.0, sodium: 2600, tags: ['快餐', '中式', '份量参考'] },
    { id: 'ff-fried-rice-plate', name: '一份炒饭', per: { value: 1, unit: 'SERVING' }, kcal: 620, protein: 18.5, fat: 17.6, carb: 97.5, sodium: 1700, tags: ['快餐', '中式', '份量参考'] },
    { id: 'ff-congee-set', name: '一份粥套餐', per: { value: 1, unit: 'SERVING' }, kcal: 320, protein: 12.0, fat: 8.0, carb: 48.0, sodium: 1200, tags: ['快餐', '中式', '份量参考'] },
    { id: 'ff-rice-with-pork-chop', name: '猪排饭', aliases: ['炸猪排饭'], kcal: 238, protein: 10.4, fat: 9.6, carb: 28.4, sodium: 620, tags: ['快餐', '中式', '主食'] },
    { id: 'ff-stinky-tofu', name: '臭豆腐', kcal: 186, protein: 11.2, fat: 10.4, carb: 12.6, sodium: 720, tags: ['快餐', '小吃', '油炸'] },
    { id: 'ff-grilled-sausage', name: '烤肠', aliases: ['热狗肠'], kcal: 320, protein: 12.4, fat: 26.6, carb: 7.4, sodium: 1080, tags: ['快餐', '小吃'] },
    { id: 'ff-teppanyaki', name: '铁板鱿鱼', aliases: ['烤鱿鱼'], kcal: 148, protein: 16.4, fat: 6.4, carb: 5.6, sodium: 780, tags: ['快餐', '小吃'] },
    { id: 'ff-grilled-corn', name: '烤玉米', kcal: 148, protein: 4.0, fat: 3.6, carb: 25.4, fiber: 3.0, sodium: 120, tags: ['快餐', '小吃'] },
    { id: 'ff-baked-sweet-potato-big', name: '一个烤红薯', per: { value: 1, unit: 'SERVING' }, kcal: 264, protein: 3.0, fat: 0.6, carb: 64.8, fiber: 4.0, sodium: 70, tags: ['快餐', '小吃', '份量参考'] },
    { id: 'ff-bubble-waffle', name: '鸡蛋仔', kcal: 386, protein: 7.4, fat: 14.6, carb: 55.2, sodium: 280, tags: ['快餐', '小吃', '甜'] },
    { id: 'ff-waffle', name: '华夫饼', kcal: 348, protein: 7.8, fat: 14.2, carb: 46.4, sodium: 420, tags: ['快餐', '甜品'] },
    { id: 'ff-pancake', name: '松饼', aliases: ['热香饼'], kcal: 296, protein: 6.4, fat: 10.2, carb: 44.6, sodium: 480, tags: ['快餐', '甜品', '早餐'] },
    { id: 'ff-sandwich-ham', name: '火腿三明治', kcal: 248, protein: 11.4, fat: 9.6, carb: 28.6, fiber: 1.8, sodium: 720, tags: ['快餐', '三明治', '早餐'] },
    { id: 'ff-sandwich-tuna', name: '金枪鱼三明治', kcal: 226, protein: 12.6, fat: 8.4, carb: 25.4, fiber: 1.6, sodium: 620, tags: ['快餐', '三明治'] },
    { id: 'ff-burrito', name: '卷饼', aliases: ['墨西哥卷'], kcal: 218, protein: 9.4, fat: 8.6, carb: 25.8, fiber: 2.4, sodium: 620, tags: ['快餐', '西式'] },
    { id: 'ff-taco', name: '塔可', kcal: 226, protein: 9.8, fat: 10.4, carb: 22.6, fiber: 2.2, sodium: 580, tags: ['快餐', '西式'] },
    { id: 'ff-fried-rice-fast', name: '快餐炒饭', kcal: 178, protein: 5.4, fat: 5.6, carb: 27.2, sodium: 620, tags: ['快餐', '主食'] },
  ]),

  // 按"套餐"计的参考条目：这类组合用户最常整份记录
  food({
    id: 'ff-combo-burger-meal',
    name: '汉堡套餐',
    aliases: ['汉堡+薯条+可乐'],
    per: { value: 1, unit: 'SERVING' },
    kcal: 1090,
    protein: 32.0,
    fat: 45.0,
    carb: 140.0,
    fiber: 6.0,
    sodium: 1900,
    tags: ['快餐', '套餐', '份量参考'],
  }),
  food({
    id: 'ff-combo-fried-chicken',
    name: '炸鸡套餐',
    per: { value: 1, unit: 'SERVING' },
    kcal: 1250,
    protein: 58.0,
    fat: 68.0,
    carb: 105.0,
    sodium: 2600,
    tags: ['快餐', '套餐', '份量参考'],
  }),
  food({
    id: 'ff-combo-pizza',
    name: '披萨套餐（两人份）',
    per: { value: 1, unit: 'SERVING' },
    kcal: 1680,
    protein: 68.0,
    fat: 62.0,
    carb: 210.0,
    sodium: 3800,
    tags: ['快餐', '套餐', '份量参考'],
  }),
];
