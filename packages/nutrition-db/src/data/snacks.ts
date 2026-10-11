/**
 * 零食、坚果、甜点与烘焙（每 100 克）。
 * 坚果热量密度高，用户常低估份量，因此多数配有"一小把"的份量条目。
 */
import { foods } from '../entry.ts';
import type { FoodRecord } from '@petfocus/shared';

export const SNACK_FOODS: ReadonlyArray<FoodRecord> = [
  ...foods([
    // ── 坚果种子 ──
    { id: 'snack-peanut', name: '花生', aliases: ['花生米'], kcal: 574, protein: 24.8, fat: 44.3, carb: 21.7, fiber: 5.5, sodium: 3, tags: ['坚果', '高脂'] },
    { id: 'snack-peanut-roasted', name: '炒花生', kcal: 601, protein: 23.9, fat: 48.0, carb: 21.0, fiber: 5.4, sodium: 340, tags: ['坚果', '高脂'] },
    { id: 'snack-walnut', name: '核桃', aliases: ['核桃仁'], kcal: 646, protein: 14.9, fat: 58.8, carb: 19.1, fiber: 9.5, sodium: 6, tags: ['坚果', '高脂'] },
    { id: 'snack-almond', name: '杏仁', aliases: ['巴旦木'], kcal: 578, protein: 22.5, fat: 45.4, carb: 23.9, fiber: 11.8, sodium: 8, tags: ['坚果', '高脂'] },
    { id: 'snack-cashew', name: '腰果', kcal: 559, protein: 17.3, fat: 36.7, carb: 41.6, fiber: 3.6, sodium: 251, tags: ['坚果', '高脂'] },
    { id: 'snack-pistachio', name: '开心果', kcal: 614, protein: 20.6, fat: 53.0, carb: 21.9, fiber: 8.2, sodium: 757, tags: ['坚果', '高脂'] },
    { id: 'snack-hazelnut', name: '榛子', kcal: 594, protein: 20.0, fat: 44.8, carb: 24.1, fiber: 9.6, sodium: 4, tags: ['坚果', '高脂'] },
    { id: 'snack-pine-nut', name: '松子', aliases: ['松仁'], kcal: 698, protein: 13.4, fat: 70.6, carb: 12.2, fiber: 10.0, sodium: 3, tags: ['坚果', '高脂'] },
    { id: 'snack-macadamia', name: '夏威夷果', aliases: ['澳洲坚果'], kcal: 718, protein: 7.9, fat: 75.8, carb: 13.8, fiber: 8.6, sodium: 5, tags: ['坚果', '高脂'] },
    { id: 'snack-pecan', name: '碧根果', aliases: ['长寿果'], kcal: 691, protein: 9.2, fat: 72.0, carb: 13.9, fiber: 9.6, sodium: 1, tags: ['坚果', '高脂'] },
    { id: 'snack-chestnut', name: '板栗', aliases: ['栗子'], kcal: 185, protein: 4.2, fat: 0.7, carb: 42.2, fiber: 1.7, sodium: 13, tags: ['坚果', '主食'] },
    { id: 'snack-chestnut-roasted', name: '糖炒栗子', kcal: 214, protein: 4.0, fat: 1.5, carb: 46.0, fiber: 1.6, sodium: 15, tags: ['坚果', '甜'] },
    { id: 'snack-sunflower-seed', name: '葵花籽', aliases: ['瓜子'], kcal: 606, protein: 19.1, fat: 53.4, carb: 16.0, fiber: 4.8, sodium: 5, tags: ['坚果', '种子'] },
    { id: 'snack-pumpkin-seed', name: '南瓜子', kcal: 566, protein: 33.2, fat: 48.1, carb: 4.9, fiber: 4.9, sodium: 20, tags: ['坚果', '种子'] },
    { id: 'snack-watermelon-seed', name: '西瓜子', kcal: 573, protein: 32.7, fat: 44.8, carb: 8.6, fiber: 4.5, sodium: 12, tags: ['坚果', '种子'] },
    { id: 'snack-sesame', name: '黑芝麻', kcal: 559, protein: 19.1, fat: 46.1, carb: 24.0, fiber: 14.0, sodium: 8, tags: ['坚果', '种子'] },
    { id: 'snack-flaxseed', name: '亚麻籽', kcal: 534, protein: 18.3, fat: 42.2, carb: 28.9, fiber: 27.3, sodium: 30, tags: ['坚果', '种子'] },
    { id: 'snack-chia', name: '奇亚籽', kcal: 486, protein: 16.5, fat: 30.7, carb: 42.1, fiber: 34.4, sodium: 16, tags: ['坚果', '种子'] },
    { id: 'snack-a-handful', name: '一小把坚果', aliases: ['一把坚果', '一份坚果'], per: { value: 1, unit: 'SERVING' }, kcal: 180, protein: 5.0, fat: 15.0, carb: 6.0, fiber: 2.5, sodium: 3, tags: ['坚果', '份量参考'] },

    // ── 饼干薯片等膨化零食 ──
    { id: 'snack-potato-chips', name: '薯片', aliases: ['薯条片'], kcal: 548, protein: 6.3, fat: 35.2, carb: 51.8, fiber: 3.1, sodium: 585, tags: ['零食', '膨化', '高脂'] },
    { id: 'snack-shrimp-cracker', name: '虾条', kcal: 494, protein: 5.4, fat: 23.4, carb: 65.1, sodium: 820, tags: ['零食', '膨化'] },
    { id: 'snack-prawn-cracker', name: '虾片', kcal: 526, protein: 4.8, fat: 30.1, carb: 58.2, sodium: 780, tags: ['零食', '膨化'] },
    { id: 'snack-corn-chips', name: '玉米片', aliases: ['粟米片'], kcal: 499, protein: 7.0, fat: 25.0, carb: 62.0, fiber: 3.0, sodium: 690, tags: ['零食', '膨化'] },
    { id: 'snack-cracker-soda', name: '苏打饼干', kcal: 408, protein: 8.4, fat: 7.7, carb: 76.2, fiber: 2.1, sodium: 1022, tags: ['零食', '饼干'] },
    { id: 'snack-cracker-sandwich', name: '夹心饼干', kcal: 489, protein: 6.0, fat: 22.0, carb: 67.0, sodium: 420, tags: ['零食', '饼干', '甜'] },
    { id: 'snack-biscuit-digestive', name: '消化饼干', aliases: ['全麦饼干'], kcal: 471, protein: 7.0, fat: 20.0, carb: 64.0, fiber: 4.0, sodium: 520, tags: ['零食', '饼干'] },
    { id: 'snack-wafer', name: '威化饼干', kcal: 502, protein: 5.5, fat: 25.0, carb: 63.0, sodium: 300, tags: ['零食', '饼干', '甜'] },
    { id: 'snack-pocky', name: '巧克力棒', aliases: ['百奇'], kcal: 500, protein: 7.0, fat: 24.0, carb: 63.0, sodium: 200, tags: ['零食', '甜'] },
    { id: 'snack-popcorn', name: '爆米花', kcal: 459, protein: 9.0, fat: 18.0, carb: 66.0, fiber: 8.0, sodium: 620, tags: ['零食', '膨化'] },
    { id: 'snack-rice-cracker', name: '米饼', aliases: ['仙贝'], kcal: 383, protein: 6.0, fat: 3.0, carb: 82.0, sodium: 700, tags: ['零食', '膨化'] },
    { id: 'snack-seaweed-snack', name: '海苔片零食', aliases: ['即食海苔'], kcal: 400, protein: 25.0, fat: 15.0, carb: 40.0, fiber: 20.0, sodium: 1400, tags: ['零食'] },
    { id: 'snack-beef-jerky', name: '牛肉干', kcal: 550, protein: 45.6, fat: 40.0, carb: 1.9, sodium: 1580, tags: ['零食', '肉制品'] },
    { id: 'snack-dried-tofu-snack', name: '素肉干', aliases: ['豆干零食'], kcal: 418, protein: 27.0, fat: 22.0, carb: 30.0, fiber: 3.0, sodium: 1200, tags: ['零食', '豆制品'] },
    { id: 'snack-jelly', name: '果冻', kcal: 60, protein: 0.1, fat: 0.0, carb: 15.0, sodium: 25, tags: ['零食', '甜'] },
    { id: 'snack-marshmallow', name: '棉花糖', kcal: 318, protein: 1.8, fat: 0.0, carb: 81.0, sodium: 80, tags: ['零食', '甜'] },

    // ── 巧克力与糖果 ──
    { id: 'snack-chocolate-milk', name: '牛奶巧克力', kcal: 535, protein: 7.7, fat: 30.6, carb: 59.6, sodium: 111, tags: ['零食', '甜', '巧克力'] },
    { id: 'snack-chocolate-dark', name: '黑巧克力', aliases: ['苦巧克力'], kcal: 546, protein: 7.8, fat: 40.0, carb: 45.9, fiber: 5.5, sodium: 20, tags: ['零食', '甜', '巧克力'] },
    { id: 'snack-chocolate-white', name: '白巧克力', kcal: 539, protein: 5.9, fat: 32.1, carb: 59.2, sodium: 90, tags: ['零食', '甜', '巧克力'] },
    { id: 'snack-chocolate-bar', name: '一条巧克力', per: { value: 1, unit: 'SERVING' }, kcal: 260, protein: 3.8, fat: 15.0, carb: 29.0, sodium: 55, tags: ['零食', '甜', '份量参考'] },
    { id: 'snack-candy-hard', name: '硬糖', aliases: ['水果糖'], kcal: 397, protein: 0.0, fat: 0.2, carb: 98.4, sodium: 30, tags: ['零食', '甜'] },
    { id: 'snack-candy-gummy', name: '软糖', aliases: ['QQ糖'], kcal: 348, protein: 6.0, fat: 0.1, carb: 80.0, sodium: 40, tags: ['零食', '甜'] },

    // ── 烘焙 ──
    { id: 'snack-bread-white', name: '白吐司', aliases: ['吐司', '面包'], kcal: 312, protein: 8.3, fat: 5.1, carb: 58.6, fiber: 1.5, sodium: 460, tags: ['烘焙', '主食'] },
    { id: 'snack-bread-wholewheat', name: '全麦吐司', aliases: ['全麦面包'], kcal: 246, protein: 9.0, fat: 3.5, carb: 45.0, fiber: 6.0, sodium: 420, tags: ['烘焙', '主食', '粗粮'] },
    { id: 'snack-bread-rye', name: '黑麦面包', kcal: 259, protein: 8.5, fat: 3.3, carb: 48.3, fiber: 5.8, sodium: 500, tags: ['烘焙', '主食', '粗粮'] },
    { id: 'snack-croissant', name: '可颂', aliases: ['牛角包', '羊角面包'], kcal: 406, protein: 8.2, fat: 21.0, carb: 45.8, sodium: 480, tags: ['烘焙', '高脂'] },
    { id: 'snack-cake-sponge', name: '海绵蛋糕', aliases: ['蛋糕'], kcal: 347, protein: 6.5, fat: 14.5, carb: 48.6, sodium: 200, tags: ['烘焙', '甜'] },
    { id: 'snack-cake-cream', name: '奶油蛋糕', kcal: 390, protein: 5.0, fat: 22.0, carb: 43.0, sodium: 220, tags: ['烘焙', '甜', '高脂'] },
    { id: 'snack-chiffon-cake', name: '戚风蛋糕', kcal: 297, protein: 6.8, fat: 13.0, carb: 38.6, sodium: 190, tags: ['烘焙', '甜'] },
    { id: 'snack-muffin', name: '玛芬', aliases: ['麦芬'], kcal: 377, protein: 5.5, fat: 18.0, carb: 48.0, sodium: 320, tags: ['烘焙', '甜'] },
    { id: 'snack-donut', name: '甜甜圈', aliases: ['多拿滋'], kcal: 452, protein: 5.7, fat: 25.0, carb: 51.3, sodium: 380, tags: ['烘焙', '甜', '油炸'] },
    { id: 'snack-egg-tart', name: '蛋挞', kcal: 272, protein: 5.4, fat: 16.5, carb: 25.4, sodium: 180, tags: ['烘焙', '甜'] },
    { id: 'snack-mooncake', name: '月饼', aliases: ['广式月饼'], kcal: 405, protein: 6.5, fat: 17.0, carb: 56.0, sodium: 230, tags: ['烘焙', '甜', '中式'] },
    { id: 'snack-pineapple-cake', name: '凤梨酥', kcal: 452, protein: 4.5, fat: 22.0, carb: 60.0, sodium: 200, tags: ['烘焙', '甜', '中式'] },
    { id: 'snack-sachima', name: '沙琪玛', kcal: 452, protein: 6.0, fat: 20.0, carb: 62.0, sodium: 260, tags: ['烘焙', '甜', '中式'] },
    { id: 'snack-glutinous-rice-cake', name: '糯米糕', aliases: ['年糕'], kcal: 154, protein: 3.3, fat: 0.6, carb: 34.7, sodium: 40, tags: ['烘焙', '中式'] },
    { id: 'snack-egg-roll', name: '蛋卷', kcal: 452, protein: 7.0, fat: 18.0, carb: 65.0, sodium: 300, tags: ['零食', '甜'] },
    { id: 'snack-sesame-cookie', name: '芝麻饼干', aliases: ['桃酥'], kcal: 483, protein: 6.0, fat: 24.0, carb: 60.0, sodium: 380, tags: ['烘焙', '甜'] },
    { id: 'snack-mochi', name: '麻薯', aliases: ['大福'], kcal: 235, protein: 3.0, fat: 3.0, carb: 49.0, sodium: 90, tags: ['零食', '甜'] },
  ]),
];
