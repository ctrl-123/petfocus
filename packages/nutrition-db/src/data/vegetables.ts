/**
 * 蔬菜、菌藻与豆制品（每 100 克可食部，生重）。
 *
 * 蔬菜整体热量低，但**烹调油**会显著改变结果；
 * 「清炒」类条目已把常见用油量算进去，与生重条目分开。
 */
import { foods } from '../entry.ts';
import type { FoodRecord } from '@petfocus/shared';

export const VEGETABLE_FOODS: ReadonlyArray<FoodRecord> = [
  ...foods([
    // ── 叶菜 ──
    { id: 'veg-bokchoy', name: '小白菜', aliases: ['青菜', '油菜'], kcal: 15, protein: 1.5, fat: 0.3, carb: 2.7, fiber: 1.1, sodium: 73, tags: ['蔬菜', '叶菜'] },
    { id: 'veg-napa', name: '大白菜', aliases: ['白菜'], kcal: 18, protein: 1.5, fat: 0.1, carb: 3.4, fiber: 0.8, sodium: 57, tags: ['蔬菜', '叶菜'] },
    { id: 'veg-spinach', name: '菠菜', kcal: 28, protein: 2.6, fat: 0.3, carb: 4.5, fiber: 1.7, sodium: 85, tags: ['蔬菜', '叶菜'] },
    { id: 'veg-lettuce', name: '生菜', aliases: ['莴苣叶'], kcal: 15, protein: 1.3, fat: 0.3, carb: 2.0, fiber: 0.7, sodium: 32, tags: ['蔬菜', '叶菜'] },
    { id: 'veg-cabbage', name: '卷心菜', aliases: ['圆白菜', '包菜', '甘蓝'], kcal: 24, protein: 1.5, fat: 0.2, carb: 4.6, fiber: 1.0, sodium: 27, tags: ['蔬菜', '叶菜'] },
    { id: 'veg-purple-cabbage', name: '紫甘蓝', kcal: 25, protein: 1.2, fat: 0.2, carb: 6.2, fiber: 2.0, sodium: 27, tags: ['蔬菜', '叶菜'] },
    { id: 'veg-chinese-broccoli', name: '菜心', aliases: ['菜薹'], kcal: 24, protein: 2.8, fat: 0.4, carb: 3.0, fiber: 1.7, sodium: 74, tags: ['蔬菜', '叶菜'] },
    { id: 'veg-crown-daisy', name: '茼蒿', aliases: ['蓬蒿'], kcal: 21, protein: 1.9, fat: 0.3, carb: 3.9, fiber: 1.2, sodium: 161, tags: ['蔬菜', '叶菜'] },
    { id: 'veg-water-spinach', name: '空心菜', aliases: ['蕹菜', '通菜'], kcal: 20, protein: 2.2, fat: 0.3, carb: 3.6, fiber: 1.4, sodium: 94, tags: ['蔬菜', '叶菜'] },
    { id: 'veg-amaranth', name: '苋菜', kcal: 25, protein: 2.8, fat: 0.3, carb: 2.0, fiber: 2.2, sodium: 32, tags: ['蔬菜', '叶菜'] },
    { id: 'veg-shepherd-purse', name: '荠菜', kcal: 27, protein: 2.9, fat: 0.4, carb: 4.7, fiber: 1.7, sodium: 31, tags: ['蔬菜', '叶菜'] },
    { id: 'veg-chrysanthemum', name: '芹菜叶', kcal: 31, protein: 2.6, fat: 0.6, carb: 5.9, fiber: 2.2, sodium: 159, tags: ['蔬菜', '叶菜'] },
    { id: 'veg-rape', name: '油菜', aliases: ['小油菜'], kcal: 23, protein: 1.8, fat: 0.5, carb: 3.8, fiber: 1.1, sodium: 55, tags: ['蔬菜', '叶菜'] },

    // ── 瓜茄果类蔬菜 ──
    { id: 'veg-tomato', name: '西红柿', aliases: ['番茄', '洋柿子'], kcal: 20, protein: 0.9, fat: 0.2, carb: 4.0, fiber: 0.5, sodium: 5, tags: ['蔬菜', '茄果'] },
    { id: 'veg-cherry-tomato', name: '圣女果', aliases: ['小番茄', '樱桃番茄'], kcal: 25, protein: 1.0, fat: 0.2, carb: 5.8, fiber: 1.0, sodium: 5, tags: ['蔬菜', '茄果'] },
    { id: 'veg-cucumber', name: '黄瓜', aliases: ['青瓜'], kcal: 16, protein: 0.8, fat: 0.2, carb: 2.9, fiber: 0.5, sodium: 5, tags: ['蔬菜', '瓜类'] },
    { id: 'veg-eggplant', name: '茄子', kcal: 23, protein: 1.1, fat: 0.2, carb: 4.9, fiber: 1.3, sodium: 5, tags: ['蔬菜', '茄果'] },
    { id: 'veg-pepper-green', name: '青椒', aliases: ['柿子椒', '菜椒'], kcal: 22, protein: 1.4, fat: 0.3, carb: 2.6, fiber: 1.9, sodium: 3, tags: ['蔬菜', '茄果'] },
    { id: 'veg-pepper-red', name: '红椒', aliases: ['甜椒'], kcal: 32, protein: 1.0, fat: 0.2, carb: 7.4, fiber: 1.4, sodium: 3, tags: ['蔬菜', '茄果'] },
    { id: 'veg-chili', name: '辣椒', aliases: ['尖椒', '小米椒'], kcal: 32, protein: 1.3, fat: 0.4, carb: 7.0, fiber: 2.1, sodium: 2, tags: ['蔬菜', '茄果', '辣'] },
    { id: 'veg-winter-melon', name: '冬瓜', kcal: 12, protein: 0.4, fat: 0.2, carb: 2.6, fiber: 0.7, sodium: 1, tags: ['蔬菜', '瓜类'] },
    { id: 'veg-pumpkin', name: '南瓜', kcal: 23, protein: 0.7, fat: 0.1, carb: 5.3, fiber: 0.8, sodium: 1, tags: ['蔬菜', '瓜类'] },
    { id: 'veg-bitter-melon', name: '苦瓜', aliases: ['凉瓜'], kcal: 22, protein: 1.0, fat: 0.1, carb: 4.9, fiber: 1.4, sodium: 2, tags: ['蔬菜', '瓜类'] },
    { id: 'veg-luffa', name: '丝瓜', kcal: 20, protein: 1.0, fat: 0.2, carb: 4.2, fiber: 0.6, sodium: 1, tags: ['蔬菜', '瓜类'] },
    { id: 'veg-loofah', name: '西葫芦', aliases: ['角瓜'], kcal: 19, protein: 0.8, fat: 0.2, carb: 3.8, fiber: 0.6, sodium: 5, tags: ['蔬菜', '瓜类'] },
    { id: 'veg-wax-gourd', name: '葫芦瓜', aliases: ['瓠子'], kcal: 15, protein: 0.7, fat: 0.2, carb: 2.9, fiber: 0.8, sodium: 1, tags: ['蔬菜', '瓜类'] },
    { id: 'veg-okra', name: '秋葵', aliases: ['羊角豆'], kcal: 37, protein: 2.0, fat: 0.1, carb: 7.5, fiber: 3.9, sodium: 3, tags: ['蔬菜'] },
    { id: 'veg-okra-cooked', name: '白灼秋葵', kcal: 45, protein: 2.1, fat: 1.2, carb: 7.4, fiber: 3.8, sodium: 220, tags: ['蔬菜', '熟食'] },

    // ── 根茎类蔬菜 ──
    { id: 'veg-carrot', name: '胡萝卜', aliases: ['红萝卜'], kcal: 39, protein: 1.0, fat: 0.2, carb: 8.8, fiber: 2.6, sodium: 71, tags: ['蔬菜', '根茎'] },
    { id: 'veg-white-radish', name: '白萝卜', aliases: ['萝卜'], kcal: 21, protein: 0.9, fat: 0.1, carb: 5.0, fiber: 1.0, sodium: 62, tags: ['蔬菜', '根茎'] },
    { id: 'veg-onion', name: '洋葱', aliases: ['葱头'], kcal: 40, protein: 1.1, fat: 0.2, carb: 9.0, fiber: 0.9, sodium: 4, tags: ['蔬菜', '根茎'] },
    { id: 'veg-garlic', name: '大蒜', aliases: ['蒜'], kcal: 128, protein: 4.5, fat: 0.2, carb: 27.6, fiber: 1.1, sodium: 19, tags: ['蔬菜', '调味'] },
    { id: 'veg-ginger', name: '生姜', aliases: ['姜'], kcal: 41, protein: 1.3, fat: 0.6, carb: 10.3, fiber: 2.7, sodium: 14, tags: ['蔬菜', '调味'] },
    { id: 'veg-scallion', name: '大葱', aliases: ['葱'], kcal: 33, protein: 1.7, fat: 0.3, carb: 6.5, fiber: 1.3, sodium: 4, tags: ['蔬菜', '调味'] },
    { id: 'veg-spring-onion', name: '小葱', aliases: ['香葱'], kcal: 27, protein: 1.6, fat: 0.3, carb: 4.9, fiber: 1.3, sodium: 4, tags: ['蔬菜', '调味'] },
    { id: 'veg-cilantro', name: '香菜', aliases: ['芫荽'], kcal: 33, protein: 1.8, fat: 0.4, carb: 6.2, fiber: 1.2, sodium: 48, tags: ['蔬菜', '调味'] },
    { id: 'veg-celery', name: '芹菜', aliases: ['西芹'], kcal: 17, protein: 0.8, fat: 0.1, carb: 3.9, fiber: 1.4, sodium: 159, tags: ['蔬菜', '茎'] },
    { id: 'veg-asparagus', name: '芦笋', kcal: 22, protein: 1.4, fat: 0.1, carb: 4.9, fiber: 1.9, sodium: 3, tags: ['蔬菜', '茎'] },
    { id: 'veg-bamboo-shoot', name: '竹笋', aliases: ['春笋'], kcal: 23, protein: 2.6, fat: 0.2, carb: 3.6, fiber: 1.8, sodium: 0, tags: ['蔬菜', '茎'] },
    { id: 'veg-lotus-root', name: '莲藕', aliases: ['藕'], kcal: 73, protein: 1.9, fat: 0.2, carb: 16.4, fiber: 1.2, sodium: 44, tags: ['蔬菜', '根茎'] },
    { id: 'veg-lotus-seed', name: '莲子', kcal: 344, protein: 17.2, fat: 2.0, carb: 67.2, fiber: 3.0, sodium: 5, tags: ['蔬菜', '干货'] },
    { id: 'veg-water-chestnut', name: '荸荠', aliases: ['马蹄'], kcal: 61, protein: 1.2, fat: 0.2, carb: 14.2, fiber: 1.1, sodium: 16, tags: ['蔬菜', '根茎'] },
    { id: 'veg-beet', name: '甜菜根', kcal: 43, protein: 1.6, fat: 0.2, carb: 9.6, fiber: 2.8, sodium: 78, tags: ['蔬菜', '根茎'] },
    { id: 'veg-broccoli', name: '西兰花', aliases: ['绿花菜'], kcal: 36, protein: 4.1, fat: 0.6, carb: 4.3, fiber: 1.6, sodium: 19, tags: ['蔬菜', '花菜'] },
    { id: 'veg-cauliflower', name: '菜花', aliases: ['花椰菜', '白花菜'], kcal: 24, protein: 2.1, fat: 0.2, carb: 4.6, fiber: 1.2, sodium: 32, tags: ['蔬菜', '花菜'] },

    // ── 菌藻 ──
    { id: 'veg-shiitake-fresh', name: '香菇（鲜）', aliases: ['冬菇'], kcal: 26, protein: 2.2, fat: 0.3, carb: 5.2, fiber: 3.3, sodium: 2, tags: ['菌藻', '菌菇'] },
    { id: 'veg-shiitake-dry', name: '香菇（干）', kcal: 274, protein: 20.0, fat: 1.2, carb: 61.7, fiber: 31.6, sodium: 11, tags: ['菌藻', '菌菇', '干货'] },
    { id: 'veg-oyster-mushroom', name: '平菇', aliases: ['侧耳'], kcal: 24, protein: 1.9, fat: 0.3, carb: 4.6, fiber: 2.3, sodium: 8, tags: ['菌藻', '菌菇'] },
    { id: 'veg-enoki', name: '金针菇', kcal: 32, protein: 2.4, fat: 0.4, carb: 6.0, fiber: 2.7, sodium: 4, tags: ['菌藻', '菌菇'] },
    { id: 'veg-king-oyster', name: '杏鲍菇', kcal: 35, protein: 1.3, fat: 0.1, carb: 8.3, fiber: 2.1, sodium: 3, tags: ['菌藻', '菌菇'] },
    { id: 'veg-black-fungus', name: '黑木耳（干）', aliases: ['木耳'], kcal: 265, protein: 12.1, fat: 1.5, carb: 65.6, fiber: 29.9, sodium: 48, tags: ['菌藻', '菌菇', '干货'] },
    { id: 'veg-white-fungus', name: '银耳（干）', aliases: ['白木耳'], kcal: 261, protein: 10.0, fat: 1.4, carb: 67.3, fiber: 30.4, sodium: 82, tags: ['菌藻', '菌菇', '干货'] },
    { id: 'veg-kelp', name: '海带（鲜）', aliases: ['昆布'], kcal: 13, protein: 1.2, fat: 0.1, carb: 2.1, fiber: 0.5, sodium: 8, tags: ['菌藻', '海藻'] },
    { id: 'veg-kelp-dry', name: '海带（干）', kcal: 77, protein: 4.8, fat: 0.4, carb: 14.0, fiber: 23.0, sodium: 327, tags: ['菌藻', '海藻', '干货'] },
    { id: 'veg-seaweed', name: '紫菜（干）', kcal: 250, protein: 26.7, fat: 1.1, carb: 44.1, fiber: 21.6, sodium: 710, tags: ['菌藻', '海藻', '干货'] },
    { id: 'veg-nori', name: '海苔', kcal: 177, protein: 29.4, fat: 4.8, carb: 16.0, fiber: 36.0, sodium: 1300, tags: ['菌藻', '海藻', '零食'] },

    // ── 豆制品 ──
    { id: 'bean-tofu-firm', name: '北豆腐', aliases: ['老豆腐', '硬豆腐'], kcal: 98, protein: 12.2, fat: 4.8, carb: 2.0, fiber: 0.5, sodium: 7, tags: ['豆制品'] },
    { id: 'bean-tofu-soft', name: '南豆腐', aliases: ['嫩豆腐', '水豆腐'], kcal: 57, protein: 6.2, fat: 2.5, carb: 2.6, fiber: 0.4, sodium: 7, tags: ['豆制品'] },
    { id: 'bean-tofu-silken', name: '内酯豆腐', kcal: 50, protein: 5.0, fat: 1.9, carb: 3.3, sodium: 6, tags: ['豆制品'] },
    { id: 'bean-tofu-dry', name: '豆腐干', aliases: ['香干', '豆干'], kcal: 140, protein: 16.2, fat: 3.6, carb: 11.5, fiber: 0.8, sodium: 76, tags: ['豆制品'] },
    { id: 'bean-tofu-skin', name: '豆腐皮', aliases: ['千张', '百叶'], kcal: 409, protein: 44.6, fat: 17.4, carb: 18.8, fiber: 0.2, sodium: 20, tags: ['豆制品'] },
    { id: 'bean-tofu-skin-fried', name: '油豆腐', aliases: ['豆泡', '豆腐泡'], kcal: 244, protein: 17.0, fat: 17.6, carb: 4.9, fiber: 0.6, sodium: 8, tags: ['豆制品'] },
    { id: 'bean-soy-milk', name: '豆浆', aliases: ['豆奶'], per: { value: 100, unit: 'ML' }, kcal: 31, protein: 3.0, fat: 1.6, carb: 1.2, fiber: 0.2, sodium: 3, tags: ['豆制品', '饮品'] },
    { id: 'bean-soy-milk-sweet', name: '甜豆浆', per: { value: 100, unit: 'ML' }, kcal: 54, protein: 2.4, fat: 1.3, carb: 8.4, sodium: 5, tags: ['豆制品', '饮品', '甜'] },
    { id: 'bean-dried-tofu', name: '腐竹（干）', kcal: 459, protein: 44.6, fat: 21.7, carb: 22.3, fiber: 1.0, sodium: 26, tags: ['豆制品', '干货'] },
    { id: 'bean-fermented-tofu', name: '腐乳', aliases: ['豆腐乳'], kcal: 133, protein: 10.9, fat: 8.2, carb: 4.8, sodium: 2460, tags: ['豆制品', '调味'] },
    { id: 'bean-soybean', name: '黄豆', aliases: ['大豆'], kcal: 390, protein: 35.0, fat: 16.0, carb: 34.2, fiber: 15.5, sodium: 2, tags: ['豆类', '干货'] },
    { id: 'bean-black', name: '黑豆', kcal: 401, protein: 36.0, fat: 15.9, carb: 33.6, fiber: 10.2, sodium: 3, tags: ['豆类', '干货'] },
    { id: 'bean-red', name: '红豆', aliases: ['赤小豆', '小豆'], kcal: 324, protein: 20.2, fat: 0.6, carb: 63.4, fiber: 7.7, sodium: 2, tags: ['豆类', '干货'] },
    { id: 'bean-mung', name: '绿豆', kcal: 329, protein: 21.6, fat: 0.8, carb: 62.0, fiber: 6.4, sodium: 3, tags: ['豆类', '干货'] },
    { id: 'bean-kidney', name: '芸豆', aliases: ['四季豆干'], kcal: 314, protein: 23.4, fat: 1.4, carb: 57.2, fiber: 9.8, sodium: 4, tags: ['豆类', '干货'] },
    { id: 'bean-chickpea', name: '鹰嘴豆', kcal: 364, protein: 19.3, fat: 6.0, carb: 60.6, fiber: 17.4, sodium: 24, tags: ['豆类', '干货'] },
    { id: 'bean-green-soy', name: '毛豆', aliases: ['青豆', '枝豆'], kcal: 131, protein: 13.1, fat: 5.0, carb: 10.5, fiber: 4.0, sodium: 3, tags: ['豆类', '蔬菜'] },
    { id: 'bean-green-pea', name: '豌豆', aliases: ['青豌豆'], kcal: 105, protein: 7.4, fat: 0.3, carb: 21.2, fiber: 3.0, sodium: 1, tags: ['豆类', '蔬菜'] },
    { id: 'bean-snow-pea', name: '荷兰豆', aliases: ['甜豆'], kcal: 30, protein: 2.5, fat: 0.3, carb: 4.9, fiber: 1.4, sodium: 8, tags: ['豆类', '蔬菜'] },
    { id: 'bean-long-bean', name: '豇豆', aliases: ['长豆角'], kcal: 34, protein: 2.7, fat: 0.2, carb: 5.8, fiber: 2.3, sodium: 4, tags: ['豆类', '蔬菜'] },
    { id: 'bean-green-bean', name: '四季豆', aliases: ['刀豆'], kcal: 31, protein: 2.0, fat: 0.4, carb: 5.7, fiber: 2.1, sodium: 4, tags: ['豆类', '蔬菜'] },
    { id: 'bean-sprout-soy', name: '黄豆芽', kcal: 47, protein: 4.5, fat: 1.6, carb: 4.5, fiber: 1.5, sodium: 7, tags: ['豆类', '芽菜'] },
    { id: 'bean-sprout-mung', name: '绿豆芽', aliases: ['豆芽'], kcal: 18, protein: 2.1, fat: 0.1, carb: 2.9, fiber: 0.8, sodium: 5, tags: ['豆类', '芽菜'] },
    { id: 'bean-tofu-pudding', name: '豆腐脑', aliases: ['豆花'], kcal: 47, protein: 4.2, fat: 2.2, carb: 2.5, sodium: 6, tags: ['豆制品', '早餐'] },
  ]),

  // 清炒类：已把常见用油量（约 8 克/100 克菜）计入
  ...foods([
    { id: 'veg-stirfry-bokchoy', name: '清炒小白菜', aliases: ['炒青菜'], kcal: 92, protein: 1.6, fat: 7.6, carb: 3.4, fiber: 1.0, sodium: 210, tags: ['蔬菜', '熟食', '清炒'] },
    { id: 'veg-stirfry-spinach', name: '清炒菠菜', aliases: ['炒菠菜'], kcal: 100, protein: 2.7, fat: 8.0, carb: 4.5, fiber: 1.6, sodium: 230, tags: ['蔬菜', '熟食', '清炒'] },
    { id: 'veg-stirfry-broccoli', name: '清炒西兰花', aliases: ['炒西兰花'], kcal: 108, protein: 4.2, fat: 8.0, carb: 5.0, fiber: 1.6, sodium: 215, tags: ['蔬菜', '熟食', '清炒'] },
    { id: 'veg-stirfry-cabbage', name: '手撕包菜', aliases: ['炒卷心菜'], kcal: 96, protein: 1.5, fat: 7.8, carb: 4.8, fiber: 1.0, sodium: 260, tags: ['蔬菜', '熟食', '清炒'] },
    { id: 'veg-stirfry-tomato-egg', name: '西红柿炒蛋', aliases: ['番茄炒蛋'], kcal: 122, protein: 5.8, fat: 8.4, carb: 6.2, fiber: 0.8, sodium: 340, tags: ['蔬菜', '熟食', '家常菜'] },
    { id: 'veg-stirfry-potato-shred', name: '醋溜土豆丝', aliases: ['炒土豆丝'], kcal: 138, protein: 2.2, fat: 8.2, carb: 15.6, fiber: 1.0, sodium: 380, tags: ['蔬菜', '熟食', '家常菜'] },
    { id: 'veg-stirfry-eggplant', name: '鱼香茄子', kcal: 186, protein: 2.4, fat: 14.2, carb: 11.6, fiber: 1.6, sodium: 620, tags: ['蔬菜', '熟食', '家常菜'] },
    { id: 'veg-stirfry-string-bean', name: '干煸四季豆', kcal: 158, protein: 3.4, fat: 12.4, carb: 8.6, fiber: 2.6, sodium: 520, tags: ['蔬菜', '熟食', '家常菜'] },
    { id: 'veg-cold-cucumber', name: '凉拌黄瓜', aliases: ['拍黄瓜'], kcal: 58, protein: 1.0, fat: 4.6, carb: 3.4, fiber: 0.6, sodium: 420, tags: ['蔬菜', '凉菜'] },
    { id: 'veg-cold-fungus', name: '凉拌木耳', kcal: 74, protein: 1.4, fat: 5.2, carb: 6.0, fiber: 3.4, sodium: 460, tags: ['蔬菜', '凉菜'] },
    { id: 'veg-cold-kelp', name: '凉拌海带丝', kcal: 62, protein: 1.4, fat: 4.4, carb: 4.2, fiber: 1.2, sodium: 720, tags: ['蔬菜', '凉菜'] },
    { id: 'veg-boiled-broccoli', name: '白灼西兰花', kcal: 44, protein: 4.2, fat: 1.0, carb: 5.0, fiber: 1.7, sodium: 240, tags: ['蔬菜', '熟食', '低脂'] },
    { id: 'veg-boiled-lettuce', name: '白灼生菜', kcal: 38, protein: 1.3, fat: 2.2, carb: 2.6, fiber: 0.8, sodium: 260, tags: ['蔬菜', '熟食', '低脂'] },
  ]),
];
