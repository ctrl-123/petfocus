/**
 * 肉类、禽类、水产与蛋类（每 100 克可食部，生重）。
 *
 * 注意：这里记录的是**生重**。烹调后因失水，同样 100 克的熟肉营养密度更高
 * （约 1.2–1.4 倍），因此熟食条目单列。
 */
import { foods } from '../entry.ts';
import type { FoodRecord } from '@petfocus/shared';

export const MEAT_FOODS: ReadonlyArray<FoodRecord> = [
  ...foods([
    // ── 猪 ──
    { id: 'meat-pork-lean', name: '猪瘦肉', aliases: ['瘦猪肉', '里脊'], kcal: 143, protein: 20.3, fat: 6.2, carb: 1.5, sodium: 57, tags: ['肉类', '猪'] },
    { id: 'meat-pork-belly', name: '五花肉', aliases: ['猪五花', '带皮猪肉'], kcal: 395, protein: 13.6, fat: 37.0, carb: 2.4, sodium: 59, tags: ['肉类', '猪', '高脂'] },
    { id: 'meat-pork-rib', name: '猪排骨', aliases: ['排骨'], kcal: 278, protein: 16.7, fat: 23.1, carb: 0.7, sodium: 62, tags: ['肉类', '猪'] },
    { id: 'meat-pork-liver', name: '猪肝', kcal: 129, protein: 19.3, fat: 3.5, carb: 5.0, sodium: 68, tags: ['肉类', '猪', '内脏'] },
    { id: 'meat-pork-trotter', name: '猪蹄', kcal: 260, protein: 22.6, fat: 18.8, carb: 0.0, sodium: 101, tags: ['肉类', '猪', '高脂'] },
    { id: 'meat-pork-minced', name: '猪肉馅', aliases: ['肉馅', '猪肉末'], kcal: 275, protein: 15.1, fat: 23.3, carb: 1.2, sodium: 66, tags: ['肉类', '猪'] },
    { id: 'meat-pork-sausage', name: '香肠', aliases: ['腊肠'], kcal: 508, protein: 24.1, fat: 40.7, carb: 11.2, sodium: 2309, tags: ['肉类', '猪', '加工肉'] },
    { id: 'meat-bacon', name: '培根', kcal: 181, protein: 22.3, fat: 9.2, carb: 2.6, sodium: 1180, tags: ['肉类', '猪', '加工肉'] },
    { id: 'meat-ham', name: '火腿', kcal: 330, protein: 16.4, fat: 27.4, carb: 4.9, sodium: 1086, tags: ['肉类', '猪', '加工肉'] },
    { id: 'meat-pork-intestine', name: '猪大肠', kcal: 191, protein: 6.9, fat: 18.7, carb: 0.0, sodium: 116, tags: ['肉类', '猪', '内脏'] },

    // ── 牛 ──
    { id: 'meat-beef-lean', name: '牛瘦肉', aliases: ['瘦牛肉', '牛里脊'], kcal: 106, protein: 20.2, fat: 2.3, carb: 1.2, sodium: 53, tags: ['肉类', '牛'] },
    { id: 'meat-beef-brisket', name: '牛腩', aliases: ['牛胸肉'], kcal: 332, protein: 17.1, fat: 29.3, carb: 0.0, sodium: 60, tags: ['肉类', '牛', '高脂'] },
    { id: 'meat-beef-ribeye', name: '牛排', aliases: ['西冷', '牛扒'], kcal: 226, protein: 22.2, fat: 15.1, carb: 0.5, sodium: 55, tags: ['肉类', '牛'] },
    { id: 'meat-beef-minced', name: '牛肉馅', aliases: ['牛肉末'], kcal: 190, protein: 18.6, fat: 12.4, carb: 0.5, sodium: 58, tags: ['肉类', '牛'] },
    { id: 'meat-beef-tripe', name: '牛肚', aliases: ['毛肚'], kcal: 72, protein: 14.5, fat: 1.6, carb: 1.6, sodium: 60, tags: ['肉类', '牛', '内脏'] },
    { id: 'meat-beef-tongue', name: '牛舌', kcal: 222, protein: 17.0, fat: 16.6, carb: 0.0, sodium: 68, tags: ['肉类', '牛', '内脏'] },

    // ── 羊 ──
    { id: 'meat-lamb-lean', name: '羊肉（瘦）', aliases: ['瘦羊肉'], kcal: 118, protein: 20.5, fat: 3.9, carb: 0.2, sodium: 69, tags: ['肉类', '羊'] },
    { id: 'meat-lamb-fat', name: '羊肉（肥瘦）', aliases: ['羊肉'], kcal: 203, protein: 19.0, fat: 14.1, carb: 0.0, sodium: 81, tags: ['肉类', '羊'] },
    { id: 'meat-lamb-chop', name: '羊排', kcal: 215, protein: 18.3, fat: 15.6, carb: 0.0, sodium: 74, tags: ['肉类', '羊'] },

    // ── 禽 ──
    { id: 'meat-chicken-breast', name: '鸡胸肉', aliases: ['鸡胸', '鸡脯肉'], kcal: 133, protein: 19.4, fat: 5.0, carb: 2.5, sodium: 34, tags: ['肉类', '禽'] },
    { id: 'meat-chicken-thigh', name: '鸡腿肉', aliases: ['鸡腿'], kcal: 181, protein: 16.0, fat: 13.0, carb: 0.0, sodium: 64, tags: ['肉类', '禽'] },
    { id: 'meat-chicken-wing', name: '鸡翅', aliases: ['鸡翅膀'], kcal: 194, protein: 17.4, fat: 11.8, carb: 4.6, sodium: 50, tags: ['肉类', '禽'] },
    { id: 'meat-chicken-feet', name: '鸡爪', aliases: ['凤爪'], kcal: 254, protein: 23.9, fat: 16.4, carb: 2.7, sodium: 169, tags: ['肉类', '禽'] },
    { id: 'meat-chicken-liver', name: '鸡肝', kcal: 121, protein: 16.6, fat: 4.8, carb: 2.8, sodium: 92, tags: ['肉类', '禽', '内脏'] },
    { id: 'meat-chicken-heart', name: '鸡心', kcal: 172, protein: 15.9, fat: 11.8, carb: 0.6, sodium: 54, tags: ['肉类', '禽', '内脏'] },
    { id: 'meat-duck', name: '鸭肉', kcal: 240, protein: 15.5, fat: 19.7, carb: 0.2, sodium: 69, tags: ['肉类', '禽'] },
    { id: 'meat-duck-breast', name: '鸭胸肉', kcal: 138, protein: 15.0, fat: 8.0, carb: 0.5, sodium: 60, tags: ['肉类', '禽'] },
    { id: 'meat-goose', name: '鹅肉', kcal: 251, protein: 17.9, fat: 19.9, carb: 0.0, sodium: 58, tags: ['肉类', '禽'] },
    { id: 'meat-pigeon', name: '鸽子肉', aliases: ['乳鸽'], kcal: 201, protein: 16.5, fat: 14.2, carb: 1.7, sodium: 63, tags: ['肉类', '禽'] },

    // ── 蛋 ──
    { id: 'egg-chicken', name: '鸡蛋', aliases: ['蛋', '鸡子'], kcal: 144, protein: 13.3, fat: 8.8, carb: 2.8, sodium: 132, tags: ['蛋类'] },
    { id: 'egg-chicken-one', name: '一个鸡蛋', aliases: ['一只鸡蛋'], per: { value: 1, unit: 'SERVING' }, kcal: 72, protein: 6.7, fat: 4.4, carb: 1.4, sodium: 66, tags: ['蛋类', '份量参考'] },
    { id: 'egg-white', name: '蛋清', aliases: ['蛋白'], kcal: 60, protein: 11.6, fat: 0.1, carb: 3.1, sodium: 166, tags: ['蛋类'] },
    { id: 'egg-yolk', name: '蛋黄', kcal: 328, protein: 15.2, fat: 28.2, carb: 3.4, sodium: 54, tags: ['蛋类'] },
    { id: 'egg-boiled', name: '水煮蛋', aliases: ['煮鸡蛋', '白煮蛋'], kcal: 147, protein: 13.1, fat: 9.0, carb: 2.4, sodium: 134, tags: ['蛋类', '熟食'] },
    { id: 'egg-fried', name: '煎蛋', aliases: ['荷包蛋', '煎鸡蛋'], kcal: 216, protein: 12.6, fat: 17.0, carb: 2.6, sodium: 210, tags: ['蛋类', '熟食'] },
    { id: 'egg-scrambled', name: '炒鸡蛋', aliases: ['摊鸡蛋'], kcal: 199, protein: 11.9, fat: 15.6, carb: 2.5, sodium: 240, tags: ['蛋类', '熟食'] },
    { id: 'egg-tea', name: '茶叶蛋', kcal: 158, protein: 12.8, fat: 10.2, carb: 3.1, sodium: 640, tags: ['蛋类', '熟食'] },
    { id: 'egg-duck', name: '鸭蛋', kcal: 180, protein: 12.6, fat: 13.0, carb: 3.1, sodium: 106, tags: ['蛋类'] },
    { id: 'egg-quail', name: '鹌鹑蛋', kcal: 160, protein: 12.8, fat: 11.1, carb: 2.1, sodium: 106, tags: ['蛋类'] },
    { id: 'egg-century', name: '皮蛋', aliases: ['松花蛋'], kcal: 171, protein: 14.2, fat: 10.7, carb: 4.5, sodium: 542, tags: ['蛋类', '加工'] },

    // ── 鱼 ──
    { id: 'fish-crucian', name: '鲫鱼', kcal: 108, protein: 17.1, fat: 2.7, carb: 3.8, sodium: 41, tags: ['水产', '鱼'] },
    { id: 'fish-grass-carp', name: '草鱼', kcal: 113, protein: 16.6, fat: 5.2, carb: 0.0, sodium: 46, tags: ['水产', '鱼'] },
    { id: 'fish-carp', name: '鲤鱼', kcal: 109, protein: 17.6, fat: 4.1, carb: 0.5, sodium: 53, tags: ['水产', '鱼'] },
    { id: 'fish-salmon', name: '三文鱼', aliases: ['鲑鱼'], kcal: 139, protein: 17.2, fat: 7.8, carb: 0.0, sodium: 63, tags: ['水产', '鱼', '深海'] },
    { id: 'fish-tuna', name: '金枪鱼', aliases: ['吞拿鱼'], kcal: 189, protein: 24.3, fat: 9.9, carb: 0.0, sodium: 46, tags: ['水产', '鱼', '深海'] },
    { id: 'fish-cod', name: '鳕鱼', kcal: 88, protein: 20.4, fat: 0.5, carb: 0.5, sodium: 130, tags: ['水产', '鱼', '深海'] },
    { id: 'fish-hairtail', name: '带鱼', aliases: ['刀鱼'], kcal: 127, protein: 17.7, fat: 4.9, carb: 3.1, sodium: 150, tags: ['水产', '鱼'] },
    { id: 'fish-yellow-croaker', name: '黄鱼', aliases: ['黄花鱼'], kcal: 97, protein: 17.7, fat: 2.5, carb: 0.8, sodium: 120, tags: ['水产', '鱼'] },
    { id: 'fish-bass', name: '鲈鱼', kcal: 105, protein: 18.6, fat: 3.4, carb: 0.0, sodium: 144, tags: ['水产', '鱼'] },
    { id: 'fish-eel', name: '鳗鱼', kcal: 181, protein: 18.6, fat: 10.8, carb: 2.3, sodium: 58, tags: ['水产', '鱼'] },
    { id: 'fish-tilapia', name: '罗非鱼', aliases: ['非洲鲫鱼'], kcal: 98, protein: 18.4, fat: 2.0, carb: 0.0, sodium: 52, tags: ['水产', '鱼'] },
    { id: 'fish-dry-small', name: '小鱼干', aliases: ['银鱼干'], kcal: 296, protein: 48.3, fat: 7.2, carb: 6.2, sodium: 1860, tags: ['水产', '鱼', '干货'] },

    // ── 虾蟹贝 ──
    { id: 'seafood-shrimp', name: '虾', aliases: ['河虾', '鲜虾'], kcal: 87, protein: 16.4, fat: 2.4, carb: 0.0, sodium: 133, tags: ['水产', '虾'] },
    { id: 'seafood-shrimp-prawn', name: '大虾', aliases: ['对虾', '明虾'], kcal: 93, protein: 18.6, fat: 0.8, carb: 2.8, sodium: 165, tags: ['水产', '虾'] },
    { id: 'seafood-shrimp-dried', name: '虾米', aliases: ['海米', '虾仁干'], kcal: 198, protein: 43.7, fat: 2.6, carb: 0.0, sodium: 4891, tags: ['水产', '虾', '干货'] },
    { id: 'seafood-crab', name: '螃蟹', aliases: ['河蟹', '大闸蟹'], kcal: 103, protein: 17.5, fat: 2.6, carb: 2.3, sodium: 260, tags: ['水产', '蟹'] },
    { id: 'seafood-crab-meat', name: '蟹肉', kcal: 62, protein: 13.8, fat: 0.5, carb: 1.0, sodium: 260, tags: ['水产', '蟹'] },
    { id: 'seafood-oyster', name: '生蚝', aliases: ['牡蛎', '海蛎子'], kcal: 73, protein: 5.3, fat: 2.1, carb: 8.2, sodium: 462, tags: ['水产', '贝'] },
    { id: 'seafood-clam', name: '蛤蜊', aliases: ['花甲', '蚬子'], kcal: 62, protein: 10.1, fat: 1.1, carb: 2.8, sodium: 425, tags: ['水产', '贝'] },
    { id: 'seafood-scallop', name: '扇贝', kcal: 60, protein: 11.1, fat: 0.6, carb: 2.6, sodium: 339, tags: ['水产', '贝'] },
    { id: 'seafood-squid', name: '鱿鱼', aliases: ['枪乌贼'], kcal: 84, protein: 17.4, fat: 1.6, carb: 0.0, sodium: 134, tags: ['水产', '软体'] },
    { id: 'seafood-octopus', name: '章鱼', aliases: ['八爪鱼'], kcal: 82, protein: 18.9, fat: 0.4, carb: 0.0, sodium: 230, tags: ['水产', '软体'] },
    { id: 'seafood-mussel', name: '青口', aliases: ['海虹', '淡菜'], kcal: 80, protein: 11.4, fat: 1.7, carb: 4.7, sodium: 452, tags: ['水产', '贝'] },
    { id: 'seafood-sea-cucumber', name: '海参', kcal: 78, protein: 16.5, fat: 0.2, carb: 2.5, sodium: 502, tags: ['水产', '干货'] },
    { id: 'seafood-jellyfish', name: '海蜇', kcal: 36, protein: 6.0, fat: 0.3, carb: 1.7, sodium: 4675, tags: ['水产', '凉菜'] },

    // ── 加工肉制品 ──
    { id: 'meat-sausage-ham', name: '火腿肠', kcal: 212, protein: 10.4, fat: 15.6, carb: 8.6, sodium: 950, tags: ['肉类', '加工肉'] },
    { id: 'meat-meatball', name: '牛肉丸', aliases: ['牛丸'], kcal: 187, protein: 14.2, fat: 11.3, carb: 7.5, sodium: 820, tags: ['肉类', '加工肉'] },
    { id: 'meat-fishball', name: '鱼丸', kcal: 107, protein: 10.1, fat: 1.3, carb: 12.7, sodium: 620, tags: ['水产', '加工'] },
  ]),
];
