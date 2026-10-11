/**
 * 中式菜肴（熟食，每 100 克）。
 *
 * ⚠️ 中餐"一份"的量差异极大（各家做法不同），因此本类全部以 **100 克**为基准，
 * 让用户按重量记录。只有标准化程度高的（如一只鸡腿、一碗汤）才给"份"条目。
 *
 * 数值为**家常做法的典型值**，用油量按每 100 克菜约 8–12 克估算。
 * 餐馆做法用油通常更多，实际可能高出 30% 以上。
 */
import { food, foods } from '../entry.ts';
import type { FoodRecord } from '@petfocus/shared';

export const DISH_FOODS: ReadonlyArray<FoodRecord> = [
  ...foods([
    // ── 荤菜 ──
    { id: 'dish-gongbao-chicken', name: '宫保鸡丁', kcal: 217, protein: 14.6, fat: 13.4, carb: 8.6, sodium: 720, tags: ['菜肴', '荤菜', '川菜'] },
    { id: 'dish-kungpao-shrimp', name: '宫保虾球', kcal: 198, protein: 15.2, fat: 11.8, carb: 7.4, sodium: 680, tags: ['菜肴', '荤菜'] },
    { id: 'dish-mapo-tofu', name: '麻婆豆腐', kcal: 152, protein: 9.4, fat: 11.2, carb: 4.6, fiber: 0.6, sodium: 760, tags: ['菜肴', '素菜', '川菜'] },
    { id: 'dish-hui-guo-rou', name: '回锅肉', kcal: 386, protein: 12.8, fat: 34.2, carb: 6.4, sodium: 720, tags: ['菜肴', '荤菜', '川菜', '高脂'] },
    { id: 'dish-shui-zhu-yu', name: '水煮鱼', kcal: 186, protein: 15.4, fat: 12.4, carb: 3.2, sodium: 880, tags: ['菜肴', '荤菜', '川菜'] },
    { id: 'dish-yu-xiang-rou-si', name: '鱼香肉丝', kcal: 214, protein: 11.4, fat: 14.2, carb: 10.6, sodium: 780, tags: ['菜肴', '荤菜', '川菜'] },
    { id: 'dish-twice-cooked-pork', name: '农家小炒肉', aliases: ['小炒肉'], kcal: 268, protein: 13.6, fat: 21.4, carb: 5.2, sodium: 720, tags: ['菜肴', '荤菜', '湘菜'] },
    { id: 'dish-braised-pork', name: '红烧肉', kcal: 478, protein: 10.2, fat: 45.6, carb: 6.8, sodium: 620, tags: ['菜肴', '荤菜', '高脂'] },
    { id: 'dish-braised-pork-rib', name: '红烧排骨', kcal: 296, protein: 15.4, fat: 23.2, carb: 6.4, sodium: 640, tags: ['菜肴', '荤菜'] },
    { id: 'dish-braised-pork-trotter', name: '红烧猪蹄', kcal: 318, protein: 20.4, fat: 24.6, carb: 2.8, sodium: 680, tags: ['菜肴', '荤菜', '高脂'] },
    { id: 'dish-sweet-sour-pork', name: '糖醋里脊', aliases: ['糖醋排骨'], kcal: 268, protein: 12.6, fat: 14.4, carb: 22.6, sodium: 560, tags: ['菜肴', '荤菜'] },
    { id: 'dish-braised-beef', name: '红烧牛肉', kcal: 224, protein: 18.6, fat: 14.2, carb: 4.6, sodium: 720, tags: ['菜肴', '荤菜'] },
    { id: 'dish-pepper-beef', name: '青椒炒牛肉', aliases: ['小炒黄牛肉'], kcal: 178, protein: 16.2, fat: 10.4, carb: 4.8, fiber: 0.8, sodium: 660, tags: ['菜肴', '荤菜'] },
    { id: 'dish-cola-chicken-wing', name: '可乐鸡翅', kcal: 232, protein: 16.8, fat: 13.2, carb: 11.4, sodium: 560, tags: ['菜肴', '荤菜'] },
    { id: 'dish-braised-chicken', name: '黄焖鸡', kcal: 176, protein: 15.4, fat: 10.2, carb: 5.6, sodium: 680, tags: ['菜肴', '荤菜'] },
    { id: 'dish-three-cup-chicken', name: '三杯鸡', kcal: 224, protein: 17.2, fat: 14.6, carb: 5.2, sodium: 720, tags: ['菜肴', '荤菜', '台式'] },
    { id: 'dish-bai-qie-ji', name: '白切鸡', aliases: ['白斩鸡'], kcal: 198, protein: 20.4, fat: 12.4, carb: 0.8, sodium: 420, tags: ['菜肴', '荤菜', '粤菜'] },
    { id: 'dish-roast-duck', name: '烤鸭', aliases: ['北京烤鸭'], kcal: 436, protein: 16.6, fat: 38.4, carb: 6.0, sodium: 620, tags: ['菜肴', '荤菜', '高脂'] },
    { id: 'dish-braised-fish', name: '红烧鱼', kcal: 152, protein: 16.4, fat: 8.2, carb: 3.6, sodium: 680, tags: ['菜肴', '水产'] },
    { id: 'dish-steamed-fish', name: '清蒸鱼', kcal: 116, protein: 17.6, fat: 4.2, carb: 1.8, sodium: 520, tags: ['菜肴', '水产', '低脂'] },
    { id: 'dish-sour-fish', name: '酸菜鱼', kcal: 142, protein: 14.2, fat: 7.6, carb: 3.4, sodium: 880, tags: ['菜肴', '水产', '川菜'] },
    { id: 'dish-fish-fragrant-pork', name: '锅包肉', kcal: 312, protein: 13.4, fat: 18.6, carb: 24.2, sodium: 580, tags: ['菜肴', '荤菜', '东北菜'] },
    { id: 'dish-pork-slices-garlic', name: '蒜泥白肉', kcal: 296, protein: 14.6, fat: 25.2, carb: 3.4, sodium: 720, tags: ['菜肴', '荤菜', '川菜'] },
    { id: 'dish-braised-lion-head', name: '狮子头', aliases: ['四喜丸子'], kcal: 268, protein: 13.2, fat: 20.6, carb: 7.4, sodium: 680, tags: ['菜肴', '荤菜'] },

    // ── 素菜与豆制品菜 ──
    { id: 'dish-dry-green-bean', name: '干煸豆角', kcal: 148, protein: 3.6, fat: 11.4, carb: 8.2, fiber: 2.8, sodium: 620, tags: ['菜肴', '素菜', '川菜'] },
    { id: 'dish-tofu-home-style', name: '家常豆腐', kcal: 176, protein: 10.4, fat: 12.6, carb: 5.8, sodium: 680, tags: ['菜肴', '素菜'] },
    { id: 'dish-sauteed-greens', name: '蒜蓉炒青菜', aliases: ['炒时蔬'], kcal: 88, protein: 1.8, fat: 7.2, carb: 3.6, fiber: 1.4, sodium: 340, tags: ['菜肴', '素菜'] },
    { id: 'dish-stirfry-lotus', name: '清炒藕片', kcal: 108, protein: 2.0, fat: 7.4, carb: 9.6, fiber: 1.2, sodium: 320, tags: ['菜肴', '素菜'] },
    { id: 'dish-braised-eggplant', name: '红烧茄子', kcal: 168, protein: 2.4, fat: 12.6, carb: 11.4, fiber: 1.8, sodium: 620, tags: ['菜肴', '素菜'] },
    { id: 'dish-potato-stew', name: '土豆炖牛肉', kcal: 156, protein: 11.4, fat: 8.6, carb: 8.4, fiber: 0.9, sodium: 640, tags: ['菜肴', '荤菜', '炖菜'] },
    { id: 'dish-tomato-beef-brisket', name: '番茄牛腩', kcal: 168, protein: 13.2, fat: 10.4, carb: 5.6, sodium: 660, tags: ['菜肴', '荤菜', '炖菜'] },

    // ── 汤 ──
    { id: 'dish-tomato-egg-soup', name: '西红柿鸡蛋汤', kcal: 42, protein: 2.6, fat: 2.2, carb: 3.0, sodium: 520, tags: ['汤'] },
    { id: 'dish-seaweed-egg-soup', name: '紫菜蛋花汤', kcal: 32, protein: 2.4, fat: 1.6, carb: 2.0, sodium: 580, tags: ['汤'] },
    { id: 'dish-winter-melon-soup', name: '冬瓜排骨汤', kcal: 46, protein: 3.6, fat: 2.6, carb: 2.2, sodium: 480, tags: ['汤'] },
    { id: 'dish-corn-rib-soup', name: '玉米排骨汤', kcal: 68, protein: 4.2, fat: 3.4, carb: 5.2, fiber: 0.6, sodium: 460, tags: ['汤'] },
    { id: 'dish-tofu-soup', name: '豆腐汤', kcal: 38, protein: 3.2, fat: 2.0, carb: 1.8, sodium: 480, tags: ['汤'] },
    { id: 'dish-miso-soup', name: '味噌汤', kcal: 34, protein: 2.4, fat: 1.4, carb: 3.0, sodium: 780, tags: ['汤', '日式'] },
    { id: 'dish-chicken-soup', name: '鸡汤', kcal: 52, protein: 4.2, fat: 3.2, carb: 1.2, sodium: 460, tags: ['汤'] },
    { id: 'dish-hot-sour-soup', name: '酸辣汤', kcal: 62, protein: 3.6, fat: 2.8, carb: 6.0, sodium: 820, tags: ['汤', '川菜'] },
    { id: 'dish-wonton-soup', name: '馄饨汤', kcal: 78, protein: 4.6, fat: 2.8, carb: 8.6, sodium: 620, tags: ['汤'] },
    { id: 'dish-beef-soup', name: '牛肉汤', aliases: ['牛肉粉丝汤'], kcal: 62, protein: 5.4, fat: 2.8, carb: 4.0, sodium: 680, tags: ['汤'] },

    // ── 凉菜与小吃 ──
    { id: 'dish-cold-noodle', name: '凉皮', aliases: ['陕西凉皮'], kcal: 128, protein: 3.4, fat: 3.6, carb: 21.4, sodium: 620, tags: ['小吃', '凉菜', '主食'] },
    { id: 'dish-liangfen', name: '凉粉', kcal: 58, protein: 0.2, fat: 3.4, carb: 6.8, sodium: 580, tags: ['小吃', '凉菜'] },
    { id: 'dish-cold-bean-curd', name: '凉拌豆腐皮', aliases: ['凉拌千张'], kcal: 186, protein: 12.4, fat: 12.2, carb: 7.4, sodium: 680, tags: ['小吃', '凉菜'] },
    { id: 'dish-marinated-egg', name: '卤蛋', kcal: 156, protein: 12.6, fat: 10.4, carb: 2.8, sodium: 720, tags: ['小吃', '蛋类'] },
    { id: 'dish-braised-tofu-dry', name: '卤豆腐干', kcal: 168, protein: 14.6, fat: 8.4, carb: 9.2, sodium: 880, tags: ['小吃', '豆制品'] },
    { id: 'dish-braised-chicken-feet', name: '卤鸡爪', kcal: 232, protein: 20.4, fat: 15.2, carb: 3.6, sodium: 880, tags: ['小吃'] },
    { id: 'dish-braised-pork-ear', name: '卤猪耳', kcal: 216, protein: 19.4, fat: 14.8, carb: 1.8, sodium: 920, tags: ['小吃'] },
    { id: 'dish-braised-beef-slices', name: '卤牛肉', kcal: 168, protein: 23.4, fat: 7.2, carb: 2.4, sodium: 860, tags: ['小吃'] },
    { id: 'dish-grilled-cold-noodle', name: '烤冷面', kcal: 216, protein: 6.4, fat: 8.6, carb: 28.4, sodium: 720, tags: ['小吃', '东北菜'] },
    { id: 'dish-jianbing', name: '煎饼果子', kcal: 228, protein: 7.4, fat: 9.6, carb: 28.6, sodium: 680, tags: ['小吃', '早餐'] },
    { id: 'dish-roujiamo', name: '肉夹馍', aliases: ['腊汁肉夹馍'], kcal: 268, protein: 10.2, fat: 12.4, carb: 29.6, sodium: 720, tags: ['小吃', '主食'] },
    { id: 'dish-chuanchuan', name: '串串香', aliases: ['冷锅串串'], kcal: 186, protein: 9.6, fat: 12.4, carb: 6.8, sodium: 880, tags: ['小吃', '川菜'] },
    { id: 'dish-malatang', name: '麻辣烫', kcal: 138, protein: 6.4, fat: 7.6, carb: 11.4, sodium: 820, tags: ['小吃', '川菜'] },
    { id: 'dish-yangrou-paomo', name: '羊肉泡馍', kcal: 196, protein: 8.4, fat: 8.6, carb: 22.4, sodium: 680, tags: ['小吃', '主食'] },
    { id: 'dish-lu-wei', name: '卤味拼盘', kcal: 208, protein: 16.4, fat: 14.2, carb: 3.8, sodium: 920, tags: ['小吃'] },
    { id: 'dish-braised-quail-egg', name: '卤鹌鹑蛋', kcal: 168, protein: 12.4, fat: 11.6, carb: 2.6, sodium: 780, tags: ['小吃', '蛋类'] },

    // ── 早餐 ──
    { id: 'dish-youtiao-soymilk', name: '油条豆浆组合', aliases: ['油条加豆浆'], per: { value: 1, unit: 'SERVING' }, kcal: 336, protein: 8.4, fat: 17.8, carb: 38.6, sodium: 320, tags: ['早餐', '份量参考'] },
    { id: 'dish-chinese-breakfast', name: '中式早餐套餐', per: { value: 1, unit: 'SERVING' }, kcal: 520, protein: 18.0, fat: 16.0, carb: 74.0, sodium: 1200, tags: ['早餐', '份量参考'] },
    { id: 'dish-scrambled-egg-rice', name: '蛋炒饭', per: { value: 1, unit: 'SERVING' }, kcal: 462, protein: 13.8, fat: 13.2, carb: 72.9, sodium: 1260, tags: ['主食', '份量参考'] },

    // ── 火锅（按涮煮后计） ──
    { id: 'dish-hotpot-base-spicy', name: '麻辣火锅（含油）', kcal: 186, protein: 4.6, fat: 16.4, carb: 4.2, sodium: 920, tags: ['火锅', '川菜', '高脂'] },
    { id: 'dish-hotpot-base-clear', name: '清汤火锅', kcal: 46, protein: 3.8, fat: 2.2, carb: 1.6, sodium: 480, tags: ['火锅', '低脂'] },
    { id: 'dish-hotpot-beef-slice', name: '肥牛片', kcal: 268, protein: 14.6, fat: 22.4, carb: 1.2, sodium: 260, tags: ['火锅', '肉类'] },
    { id: 'dish-hotpot-lamb-slice', name: '羊肉片', kcal: 224, protein: 17.4, fat: 16.2, carb: 0.8, sodium: 280, tags: ['火锅', '肉类'] },
    { id: 'dish-hotpot-sesame-sauce', name: '麻酱蘸料', aliases: ['芝麻酱蘸料'], kcal: 426, protein: 12.4, fat: 36.4, carb: 12.6, sodium: 880, tags: ['火锅', '调料', '高脂'] },
    { id: 'dish-hotpot-oil-sauce', name: '香油蒜泥蘸料', kcal: 386, protein: 1.2, fat: 41.6, carb: 2.4, sodium: 620, tags: ['火锅', '调料', '高脂'] },
    { id: 'dish-hotpot-tripe', name: '毛肚', kcal: 78, protein: 14.8, fat: 1.6, carb: 1.8, sodium: 280, tags: ['火锅', '内脏'] },
    { id: 'dish-hotpot-shrimp-paste', name: '虾滑', kcal: 128, protein: 12.4, fat: 3.6, carb: 11.2, sodium: 620, tags: ['火锅', '水产'] },
    { id: 'dish-hotpot-fish-tofu', name: '鱼豆腐', kcal: 168, protein: 8.4, fat: 7.6, carb: 16.4, sodium: 720, tags: ['火锅', '加工'] },

    // ── 其他常见熟食 ──
    { id: 'dish-sausage-fried-rice', name: '香肠炒饭', kcal: 186, protein: 6.2, fat: 6.8, carb: 25.4, sodium: 620, tags: ['主食', '熟食'] },
    { id: 'dish-curry-chicken', name: '咖喱鸡', aliases: ['咖喱鸡饭'], kcal: 142, protein: 10.4, fat: 7.6, carb: 8.4, sodium: 680, tags: ['菜肴', '荤菜'] },
    { id: 'dish-curry-beef', name: '咖喱牛肉', kcal: 156, protein: 11.2, fat: 9.4, carb: 7.2, sodium: 700, tags: ['菜肴', '荤菜'] },
    { id: 'dish-tomato-pasta', name: '番茄意面', aliases: ['番茄意大利面'], kcal: 148, protein: 5.2, fat: 4.6, carb: 21.6, sodium: 480, tags: ['主食', '西式'] },
    { id: 'dish-cream-pasta', name: '奶油意面', aliases: ['白酱意面'], kcal: 218, protein: 6.4, fat: 11.4, carb: 23.2, sodium: 520, tags: ['主食', '西式', '高脂'] },
    { id: 'dish-beef-stew', name: '罗宋汤', aliases: ['红菜汤'], kcal: 62, protein: 4.2, fat: 2.8, carb: 5.4, sodium: 560, tags: ['汤', '西式'] },
    { id: 'dish-caesar-salad', name: '凯撒沙拉', kcal: 168, protein: 6.4, fat: 13.2, carb: 6.8, fiber: 1.6, sodium: 480, tags: ['沙拉', '西式'] },
    { id: 'dish-greek-salad', name: '希腊沙拉', kcal: 128, protein: 3.6, fat: 10.4, carb: 5.6, fiber: 1.8, sodium: 420, tags: ['沙拉', '西式'] },
    { id: 'dish-potato-salad', name: '土豆沙拉', kcal: 148, protein: 2.6, fat: 8.4, carb: 15.6, fiber: 1.2, sodium: 380, tags: ['沙拉'] },
    { id: 'dish-egg-salad', name: '鸡蛋沙拉', kcal: 176, protein: 8.4, fat: 13.6, carb: 4.2, sodium: 420, tags: ['沙拉'] },
  ]),

  // 标准化程度较高的按"份"条目
  food({
    id: 'dish-chicken-leg-one',
    name: '一只鸡腿',
    aliases: ['一个鸡腿'],
    per: { value: 1, unit: 'SERVING' },
    kcal: 181,
    protein: 16.0,
    fat: 13.0,
    carb: 0.0,
    sodium: 64,
    tags: ['菜肴', '份量参考'],
  }),
  food({
    id: 'dish-bowl-soup',
    name: '一碗汤',
    per: { value: 1, unit: 'SERVING' },
    kcal: 120,
    protein: 6.0,
    fat: 6.0,
    carb: 10.0,
    sodium: 900,
    tags: ['汤', '份量参考'],
  }),
];
