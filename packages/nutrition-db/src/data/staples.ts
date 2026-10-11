/**
 * 主食与谷物（每 100 克可食部，熟食按熟重）。
 *
 * 注意：米饭/面条等**按熟重**记录，因为用户记录时看到的是碗里的量。
 * 生米的热量约为熟饭的 2.5–3 倍，搞错基准会让估算差出两三倍。
 */
import { food, foods } from '../entry.ts';
import type { FoodRecord } from '@petfocus/shared';

export const STAPLE_FOODS: ReadonlyArray<FoodRecord> = [
  ...foods([
    // ── 米饭与粥 ──
    { id: 'staple-rice-cooked', name: '米饭', aliases: ['白米饭', '大米饭', '蒸饭'], kcal: 116, protein: 2.6, fat: 0.3, carb: 25.9, fiber: 0.3, sodium: 2, tags: ['主食', '谷物'] },
    { id: 'staple-rice-raw', name: '大米（生）', aliases: ['生米', '稻米'], kcal: 346, protein: 7.4, fat: 0.8, carb: 77.9, fiber: 0.7, sodium: 4, tags: ['主食', '谷物', '生食'] },
    { id: 'staple-congee', name: '白粥', aliases: ['大米粥', '稀饭', '粥'], kcal: 46, protein: 1.1, fat: 0.2, carb: 9.9, fiber: 0.1, sodium: 2, tags: ['主食', '粥'] },
    { id: 'staple-congee-millet', name: '小米粥', kcal: 46, protein: 1.4, fat: 0.7, carb: 8.4, fiber: 0.2, sodium: 2, tags: ['主食', '粥'] },
    { id: 'staple-congee-redbean', name: '红豆粥', aliases: ['赤豆粥'], kcal: 62, protein: 2.4, fat: 0.3, carb: 12.6, fiber: 1.4, sodium: 2, tags: ['主食', '粥'] },
    { id: 'staple-congee-pumpkin', name: '南瓜粥', kcal: 32, protein: 0.8, fat: 0.2, carb: 6.9, fiber: 0.5, sodium: 2, tags: ['主食', '粥'] },
    { id: 'staple-rice-fried', name: '炒饭', aliases: ['蛋炒饭'], kcal: 154, protein: 4.6, fat: 4.4, carb: 24.3, fiber: 0.5, sodium: 420, tags: ['主食', '熟食'] },
    { id: 'staple-rice-claypot', name: '煲仔饭', kcal: 178, protein: 7.2, fat: 5.1, carb: 25.8, sodium: 480, tags: ['主食', '熟食'] },
    { id: 'staple-rice-glutinous', name: '糯米饭', aliases: ['糯米'], kcal: 152, protein: 3.1, fat: 0.4, carb: 34.0, fiber: 0.4, sodium: 2, tags: ['主食', '谷物'] },
    { id: 'staple-rice-purple', name: '紫米饭', aliases: ['黑米饭'], kcal: 122, protein: 3.2, fat: 0.5, carb: 26.4, fiber: 1.1, sodium: 2, tags: ['主食', '谷物'] },
    { id: 'staple-rice-brown', name: '糙米饭', kcal: 124, protein: 2.8, fat: 0.9, carb: 25.7, fiber: 1.6, sodium: 2, tags: ['主食', '谷物', '粗粮'] },
    { id: 'staple-rice-mixed', name: '杂粮饭', aliases: ['五谷饭', '杂粮米饭'], kcal: 128, protein: 3.2, fat: 1.1, carb: 25.6, fiber: 2.0, sodium: 2, tags: ['主食', '谷物', '粗粮'] },

    // ── 面食 ──
    { id: 'staple-noodle-cooked', name: '面条（熟）', aliases: ['面条', '挂面'], kcal: 109, protein: 3.9, fat: 0.4, carb: 22.4, fiber: 0.5, sodium: 130, tags: ['主食', '面食'] },
    { id: 'staple-noodle-raw', name: '挂面（生）', aliases: ['干面条'], kcal: 346, protein: 11.4, fat: 0.9, carb: 74.7, fiber: 0.8, sodium: 160, tags: ['主食', '面食', '生食'] },
    { id: 'staple-noodle-beef', name: '牛肉面', aliases: ['牛肉拉面'], kcal: 132, protein: 6.4, fat: 4.1, carb: 17.2, sodium: 620, tags: ['主食', '面食', '熟食'] },
    { id: 'staple-noodle-tomato-egg', name: '西红柿鸡蛋面', aliases: ['番茄鸡蛋面'], kcal: 118, protein: 5.2, fat: 3.6, carb: 16.4, sodium: 480, tags: ['主食', '面食', '熟食'] },
    { id: 'staple-noodle-cold', name: '凉面', aliases: ['拌面'], kcal: 148, protein: 4.2, fat: 4.8, carb: 22.6, sodium: 520, tags: ['主食', '面食', '熟食'] },
    { id: 'staple-noodle-instant', name: '方便面（油炸）', aliases: ['泡面', '方便面'], kcal: 472, protein: 9.5, fat: 21.1, carb: 61.6, fiber: 0.9, sodium: 1144, tags: ['主食', '面食', '速食'] },
    { id: 'staple-noodle-rice', name: '米粉（熟）', aliases: ['米线', '米粉'], kcal: 109, protein: 1.8, fat: 0.2, carb: 25.0, sodium: 30, tags: ['主食', '面食'] },
    { id: 'staple-noodle-rice-fried', name: '炒米粉', aliases: ['炒米线'], kcal: 176, protein: 4.1, fat: 6.2, carb: 25.5, sodium: 560, tags: ['主食', '面食', '熟食'] },
    { id: 'staple-noodle-rice-river', name: '河粉（熟）', aliases: ['沙河粉', '粿条'], kcal: 112, protein: 1.6, fat: 0.3, carb: 25.8, sodium: 25, tags: ['主食', '面食'] },
    { id: 'staple-vermicelli', name: '粉丝（熟）', aliases: ['粉条'], kcal: 84, protein: 0.2, fat: 0.1, carb: 20.8, sodium: 10, tags: ['主食'] },
    { id: 'staple-noodle-yellow', name: '黄面（熟）', aliases: ['碱面'], kcal: 138, protein: 4.6, fat: 0.5, carb: 28.4, sodium: 220, tags: ['主食', '面食'] },

    // ── 馒头、包子、饺子 ──
    { id: 'staple-mantou', name: '馒头', aliases: ['白馒头', '馍'], kcal: 223, protein: 7.0, fat: 1.1, carb: 47.0, fiber: 1.3, sodium: 165, tags: ['主食', '面食'] },
    { id: 'staple-mantou-wholewheat', name: '全麦馒头', kcal: 210, protein: 7.6, fat: 1.4, carb: 43.2, fiber: 3.6, sodium: 170, tags: ['主食', '面食', '粗粮'] },
    { id: 'staple-baozi-pork', name: '猪肉包子', aliases: ['肉包', '包子'], kcal: 227, protein: 8.1, fat: 8.3, carb: 29.6, sodium: 460, tags: ['主食', '面食', '熟食'] },
    { id: 'staple-baozi-veg', name: '素菜包子', aliases: ['菜包'], kcal: 191, protein: 5.6, fat: 5.2, carb: 30.4, fiber: 1.8, sodium: 430, tags: ['主食', '面食', '熟食'] },
    { id: 'staple-baozi-redbean', name: '豆沙包', kcal: 240, protein: 5.4, fat: 3.4, carb: 47.6, sodium: 210, tags: ['主食', '面食', '甜'] },
    { id: 'staple-baozi-xiaolong', name: '小笼包', aliases: ['灌汤包'], kcal: 238, protein: 8.6, fat: 9.4, carb: 28.5, sodium: 520, tags: ['主食', '面食', '熟食'] },
    { id: 'staple-dumpling-pork', name: '猪肉水饺', aliases: ['饺子', '水饺'], kcal: 240, protein: 8.9, fat: 9.8, carb: 28.6, sodium: 490, tags: ['主食', '面食', '熟食'] },
    { id: 'staple-dumpling-veg', name: '素水饺', aliases: ['素饺子'], kcal: 196, protein: 6.2, fat: 6.4, carb: 28.1, fiber: 1.9, sodium: 450, tags: ['主食', '面食', '熟食'] },
    { id: 'staple-wonton', name: '馄饨', aliases: ['云吞', '抄手'], kcal: 172, protein: 7.4, fat: 5.6, carb: 22.4, sodium: 520, tags: ['主食', '面食', '熟食'] },
    { id: 'staple-bing', name: '烙饼', aliases: ['饼', '大饼'], kcal: 255, protein: 7.5, fat: 2.3, carb: 52.9, sodium: 340, tags: ['主食', '面食'] },
    { id: 'staple-pancake-egg', name: '鸡蛋灌饼', kcal: 268, protein: 9.2, fat: 11.4, carb: 31.6, sodium: 620, tags: ['主食', '面食', '熟食'] },
    { id: 'staple-youtiao', name: '油条', kcal: 388, protein: 6.9, fat: 17.6, carb: 51.0, sodium: 585, tags: ['主食', '面食', '油炸'] },
    { id: 'staple-shaobing', name: '烧饼', kcal: 326, protein: 8.0, fat: 12.6, carb: 44.6, sodium: 520, tags: ['主食', '面食'] },
    { id: 'staple-zongzi', name: '粽子（肉）', aliases: ['肉粽'], kcal: 218, protein: 5.8, fat: 6.4, carb: 33.4, sodium: 480, tags: ['主食', '糯米'] },
    { id: 'staple-zongzi-plain', name: '粽子（白）', aliases: ['白粽'], kcal: 178, protein: 3.1, fat: 0.5, carb: 40.6, sodium: 20, tags: ['主食', '糯米'] },

    // ── 其他谷物与薯类 ──
    { id: 'staple-oat', name: '燕麦片', aliases: ['燕麦', '麦片'], kcal: 377, protein: 15.0, fat: 6.7, carb: 61.6, fiber: 5.3, sodium: 3, tags: ['主食', '粗粮'] },
    { id: 'staple-oat-cooked', name: '燕麦粥', kcal: 68, protein: 2.4, fat: 1.1, carb: 12.4, fiber: 1.2, sodium: 2, tags: ['主食', '粥', '粗粮'] },
    { id: 'staple-corn', name: '玉米（鲜）', aliases: ['甜玉米', '玉米棒'], kcal: 112, protein: 4.0, fat: 1.2, carb: 22.8, fiber: 2.9, sodium: 1, tags: ['主食', '粗粮'] },
    { id: 'staple-corn-cooked', name: '煮玉米', kcal: 110, protein: 4.0, fat: 1.2, carb: 22.5, fiber: 2.9, sodium: 1, tags: ['主食', '粗粮'] },
    { id: 'staple-sweet-potato', name: '红薯', aliases: ['地瓜', '番薯', '甘薯'], kcal: 99, protein: 1.1, fat: 0.2, carb: 24.7, fiber: 1.6, sodium: 28, tags: ['主食', '薯类'] },
    { id: 'staple-sweet-potato-baked', name: '烤红薯', aliases: ['烤地瓜'], kcal: 132, protein: 1.5, fat: 0.3, carb: 32.4, fiber: 2.0, sodium: 35, tags: ['主食', '薯类'] },
    { id: 'staple-potato', name: '土豆', aliases: ['马铃薯', '洋芋'], kcal: 77, protein: 2.0, fat: 0.2, carb: 17.2, fiber: 0.7, sodium: 3, tags: ['主食', '薯类'] },
    { id: 'staple-potato-steamed', name: '蒸土豆', kcal: 76, protein: 2.0, fat: 0.2, carb: 17.0, fiber: 0.7, sodium: 3, tags: ['主食', '薯类'] },
    { id: 'staple-purple-potato', name: '紫薯', kcal: 106, protein: 1.4, fat: 0.2, carb: 25.6, fiber: 2.2, sodium: 20, tags: ['主食', '薯类'] },
    { id: 'staple-yam', name: '山药', aliases: ['淮山'], kcal: 57, protein: 1.9, fat: 0.2, carb: 12.4, fiber: 0.8, sodium: 18, tags: ['主食', '薯类'] },
    { id: 'staple-taro', name: '芋头', kcal: 79, protein: 2.2, fat: 0.2, carb: 18.1, fiber: 1.0, sodium: 33, tags: ['主食', '薯类'] },
    { id: 'staple-cassava', name: '木薯', kcal: 119, protein: 2.1, fat: 0.3, carb: 27.8, fiber: 1.6, sodium: 5, tags: ['主食', '薯类'] },
    { id: 'staple-buckwheat-noodle', name: '荞麦面（熟）', aliases: ['荞麦面'], kcal: 118, protein: 4.4, fat: 0.6, carb: 24.2, fiber: 2.3, sodium: 120, tags: ['主食', '面食', '粗粮'] },
    { id: 'staple-quinoa', name: '藜麦（熟）', kcal: 120, protein: 4.4, fat: 1.9, carb: 21.3, fiber: 2.8, sodium: 7, tags: ['主食', '粗粮'] },
  ]),

  // 用 food() 单列的条目（需要显式指定基准，提醒"按份计"）
  food({
    id: 'staple-rice-bowl',
    name: '一碗米饭',
    aliases: ['一碗饭'],
    per: { value: 1, unit: 'SERVING' },
    kcal: 232,
    protein: 5.2,
    fat: 0.6,
    carb: 51.8,
    fiber: 0.6,
    sodium: 4,
    tags: ['主食', '份量参考'],
  }),
  food({
    id: 'staple-mantou-one',
    name: '一个馒头',
    per: { value: 1, unit: 'SERVING' },
    kcal: 223,
    protein: 7.0,
    fat: 1.1,
    carb: 47.0,
    fiber: 1.3,
    sodium: 165,
    tags: ['主食', '份量参考'],
  }),
];
