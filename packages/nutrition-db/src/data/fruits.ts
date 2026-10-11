/**
 * 水果（每 100 克可食部）。
 * 注意"可食部"：香蕉、橘子等带皮水果的数值已按可食部分计。
 */
import { foods } from '../entry.ts';
import type { FoodRecord } from '@petfocus/shared';

export const FRUIT_FOODS: ReadonlyArray<FoodRecord> = [
  ...foods([
    { id: 'fruit-apple', name: '苹果', aliases: ['红富士'], kcal: 53, protein: 0.2, fat: 0.2, carb: 13.5, fiber: 1.2, sodium: 1, tags: ['水果'] },
    { id: 'fruit-apple-one', name: '一个苹果', per: { value: 1, unit: 'SERVING' }, kcal: 106, protein: 0.4, fat: 0.4, carb: 27.0, fiber: 2.4, sodium: 2, tags: ['水果', '份量参考'] },
    { id: 'fruit-banana', name: '香蕉', kcal: 93, protein: 1.4, fat: 0.2, carb: 22.0, fiber: 1.2, sodium: 1, tags: ['水果'] },
    { id: 'fruit-banana-one', name: '一根香蕉', per: { value: 1, unit: 'SERVING' }, kcal: 112, protein: 1.7, fat: 0.2, carb: 26.4, fiber: 1.4, sodium: 1, tags: ['水果', '份量参考'] },
    { id: 'fruit-orange', name: '橙子', aliases: ['甜橙'], kcal: 48, protein: 0.8, fat: 0.2, carb: 11.1, fiber: 0.6, sodium: 1, tags: ['水果', '柑橘'] },
    { id: 'fruit-mandarin', name: '橘子', aliases: ['柑橘', '桔子'], kcal: 51, protein: 0.7, fat: 0.2, carb: 11.9, fiber: 0.4, sodium: 1, tags: ['水果', '柑橘'] },
    { id: 'fruit-grapefruit', name: '柚子', aliases: ['文旦'], kcal: 42, protein: 0.8, fat: 0.2, carb: 9.5, fiber: 0.4, sodium: 3, tags: ['水果', '柑橘'] },
    { id: 'fruit-lemon', name: '柠檬', kcal: 37, protein: 1.1, fat: 1.2, carb: 6.2, fiber: 1.3, sodium: 1, tags: ['水果', '柑橘'] },
    { id: 'fruit-lime', name: '青柠', kcal: 30, protein: 0.7, fat: 0.2, carb: 7.4, fiber: 2.8, sodium: 2, tags: ['水果', '柑橘'] },
    { id: 'fruit-grape', name: '葡萄', aliases: ['提子'], kcal: 45, protein: 0.5, fat: 0.2, carb: 10.3, fiber: 0.4, sodium: 1, tags: ['水果'] },
    { id: 'fruit-watermelon', name: '西瓜', kcal: 26, protein: 0.6, fat: 0.1, carb: 5.8, fiber: 0.3, sodium: 3, tags: ['水果', '瓜类'] },
    { id: 'fruit-melon', name: '哈密瓜', aliases: ['甜瓜'], kcal: 34, protein: 0.5, fat: 0.1, carb: 7.9, fiber: 0.2, sodium: 27, tags: ['水果', '瓜类'] },
    { id: 'fruit-cantaloupe', name: '香瓜', aliases: ['白兰瓜'], kcal: 26, protein: 0.4, fat: 0.1, carb: 6.2, fiber: 0.4, sodium: 14, tags: ['水果', '瓜类'] },
    { id: 'fruit-strawberry', name: '草莓', kcal: 32, protein: 1.0, fat: 0.2, carb: 7.1, fiber: 1.1, sodium: 4, tags: ['水果', '浆果'] },
    { id: 'fruit-blueberry', name: '蓝莓', kcal: 57, protein: 0.7, fat: 0.3, carb: 14.5, fiber: 2.4, sodium: 1, tags: ['水果', '浆果'] },
    { id: 'fruit-raspberry', name: '树莓', aliases: ['覆盆子'], kcal: 52, protein: 1.2, fat: 0.7, carb: 11.9, fiber: 6.5, sodium: 1, tags: ['水果', '浆果'] },
    { id: 'fruit-blackberry', name: '黑莓', kcal: 43, protein: 1.4, fat: 0.5, carb: 9.6, fiber: 5.3, sodium: 1, tags: ['水果', '浆果'] },
    { id: 'fruit-cherry', name: '樱桃', aliases: ['车厘子'], kcal: 63, protein: 1.1, fat: 0.2, carb: 16.0, fiber: 0.3, sodium: 8, tags: ['水果'] },
    { id: 'fruit-peach', name: '桃子', aliases: ['水蜜桃'], kcal: 42, protein: 0.9, fat: 0.1, carb: 10.9, fiber: 1.3, sodium: 3, tags: ['水果'] },
    { id: 'fruit-nectarine', name: '油桃', kcal: 44, protein: 1.1, fat: 0.2, carb: 10.6, fiber: 1.7, sodium: 0, tags: ['水果'] },
    { id: 'fruit-plum', name: '李子', aliases: ['黑布林', '青李'], kcal: 46, protein: 0.7, fat: 0.2, carb: 11.4, fiber: 0.9, sodium: 4, tags: ['水果'] },
    { id: 'fruit-pear', name: '梨', aliases: ['雪梨', '鸭梨'], kcal: 44, protein: 0.4, fat: 0.2, carb: 10.8, fiber: 3.1, sodium: 2, tags: ['水果'] },
    { id: 'fruit-pineapple', name: '菠萝', aliases: ['凤梨'], kcal: 44, protein: 0.5, fat: 0.1, carb: 10.8, fiber: 1.3, sodium: 1, tags: ['水果', '热带'] },
    { id: 'fruit-mango', name: '芒果', kcal: 60, protein: 0.8, fat: 0.4, carb: 13.6, fiber: 1.6, sodium: 1, tags: ['水果', '热带'] },
    { id: 'fruit-papaya', name: '木瓜', aliases: ['番木瓜'], kcal: 43, protein: 0.5, fat: 0.3, carb: 10.2, fiber: 1.7, sodium: 8, tags: ['水果', '热带'] },
    { id: 'fruit-kiwi', name: '猕猴桃', aliases: ['奇异果'], kcal: 61, protein: 1.1, fat: 0.5, carb: 14.5, fiber: 3.0, sodium: 3, tags: ['水果'] },
    { id: 'fruit-dragon', name: '火龙果', kcal: 60, protein: 1.1, fat: 0.2, carb: 13.3, fiber: 1.6, sodium: 3, tags: ['水果', '热带'] },
    { id: 'fruit-lychee', name: '荔枝', kcal: 71, protein: 0.9, fat: 0.2, carb: 16.6, fiber: 0.5, sodium: 2, tags: ['水果', '热带'] },
    { id: 'fruit-longan', name: '龙眼', aliases: ['桂圆'], kcal: 71, protein: 1.2, fat: 0.1, carb: 16.6, fiber: 0.4, sodium: 4, tags: ['水果', '热带'] },
    { id: 'fruit-persimmon', name: '柿子', kcal: 71, protein: 0.4, fat: 0.1, carb: 18.5, fiber: 1.4, sodium: 1, tags: ['水果'] },
    { id: 'fruit-pomegranate', name: '石榴', kcal: 72, protein: 1.4, fat: 0.2, carb: 18.7, fiber: 4.8, sodium: 1, tags: ['水果'] },
    { id: 'fruit-fig', name: '无花果', kcal: 74, protein: 0.8, fat: 0.3, carb: 19.2, fiber: 2.9, sodium: 1, tags: ['水果'] },
    { id: 'fruit-grapefruit-pomelo', name: '西柚', aliases: ['葡萄柚'], kcal: 33, protein: 0.8, fat: 0.1, carb: 8.3, fiber: 1.1, sodium: 1, tags: ['水果', '柑橘'] },
    { id: 'fruit-avocado', name: '牛油果', aliases: ['鳄梨'], kcal: 171, protein: 2.0, fat: 15.3, carb: 7.4, fiber: 6.7, sodium: 7, tags: ['水果', '高脂'] },
    { id: 'fruit-coconut', name: '椰子肉', aliases: ['椰肉'], kcal: 241, protein: 4.0, fat: 12.1, carb: 31.3, fiber: 4.7, sodium: 55, tags: ['水果', '高脂'] },
    { id: 'fruit-coconut-water', name: '椰子水', per: { value: 100, unit: 'ML' }, kcal: 19, protein: 0.7, fat: 0.2, carb: 3.7, sodium: 105, tags: ['水果', '饮品'] },
    { id: 'fruit-jujube-fresh', name: '鲜枣', aliases: ['冬枣'], kcal: 122, protein: 1.1, fat: 0.3, carb: 30.5, fiber: 1.9, sodium: 1, tags: ['水果'] },
    { id: 'fruit-jujube-dry', name: '红枣（干）', aliases: ['大枣'], kcal: 276, protein: 3.2, fat: 0.5, carb: 67.8, fiber: 6.2, sodium: 6, tags: ['水果', '干货'] },
    { id: 'fruit-raisin', name: '葡萄干', kcal: 344, protein: 2.5, fat: 0.4, carb: 83.4, fiber: 1.6, sodium: 19, tags: ['水果', '干货'] },
    { id: 'fruit-dried-apricot', name: '杏干', kcal: 329, protein: 3.4, fat: 0.4, carb: 79.0, fiber: 4.4, sodium: 11, tags: ['水果', '干货'] },
    { id: 'fruit-dates', name: '椰枣', aliases: ['蜜枣'], kcal: 282, protein: 2.5, fat: 0.4, carb: 75.0, fiber: 8.0, sodium: 1, tags: ['水果', '干货'] },
    { id: 'fruit-canned-peach', name: '黄桃罐头', kcal: 82, protein: 0.4, fat: 0.1, carb: 20.4, fiber: 0.5, sodium: 12, tags: ['水果', '罐头', '甜'] },
    { id: 'fruit-watermelon-juice', name: '西瓜汁', per: { value: 100, unit: 'ML' }, kcal: 30, protein: 0.4, fat: 0.1, carb: 7.2, sodium: 2, tags: ['水果', '饮品'] },
  ]),
];
