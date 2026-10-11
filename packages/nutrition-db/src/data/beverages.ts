/**
 * 饮品（每 100 毫升）。
 *
 * ⚠️ 含糖饮料按**每 100 毫升**记录，但用户常按"一瓶"喝。
 * 因此常见规格都单列了"一瓶"条目——否则一瓶 500 毫升可乐会被记成 100 毫升。
 */
import { foods } from '../entry.ts';
import type { FoodRecord } from '@petfocus/shared';

export const BEVERAGE_FOODS: ReadonlyArray<FoodRecord> = [
  ...foods([
    // ── 水与无糖 ──
    { id: 'bev-water', name: '白开水', aliases: ['水', '矿泉水'], per: { value: 100, unit: 'ML' }, kcal: 0, protein: 0, fat: 0, carb: 0, sodium: 1, tags: ['饮品', '无糖'] },
    { id: 'bev-sparkling', name: '苏打水', aliases: ['气泡水'], per: { value: 100, unit: 'ML' }, kcal: 0, protein: 0, fat: 0, carb: 0, sodium: 40, tags: ['饮品', '无糖'] },
    { id: 'bev-tea-plain', name: '茶（无糖）', aliases: ['茶水', '绿茶'], per: { value: 100, unit: 'ML' }, kcal: 1, protein: 0.1, fat: 0, carb: 0.2, sodium: 1, tags: ['饮品', '无糖'] },
    { id: 'bev-coffee-black', name: '黑咖啡', aliases: ['美式咖啡', '美式'], per: { value: 100, unit: 'ML' }, kcal: 2, protein: 0.1, fat: 0, carb: 0.3, sodium: 5, tags: ['饮品', '无糖', '咖啡'] },
    { id: 'bev-espresso', name: '浓缩咖啡', aliases: ['意式浓缩'], per: { value: 100, unit: 'ML' }, kcal: 9, protein: 0.6, fat: 0.2, carb: 1.2, sodium: 14, tags: ['饮品', '咖啡'] },

    // ── 含糖饮料 ──
    { id: 'bev-cola', name: '可乐', aliases: ['可口可乐', '百事可乐'], per: { value: 100, unit: 'ML' }, kcal: 43, protein: 0, fat: 0, carb: 10.8, sodium: 4, tags: ['饮品', '含糖', '碳酸'] },
    { id: 'bev-cola-bottle', name: '一瓶可乐', aliases: ['一罐可乐'], per: { value: 1, unit: 'SERVING' }, kcal: 215, protein: 0, fat: 0, carb: 54.0, sodium: 20, tags: ['饮品', '含糖', '份量参考'] },
    { id: 'bev-cola-zero', name: '零度可乐', aliases: ['无糖可乐', '零糖可乐'], per: { value: 100, unit: 'ML' }, kcal: 0, protein: 0, fat: 0, carb: 0, sodium: 12, tags: ['饮品', '无糖'] },
    { id: 'bev-sprite', name: '雪碧', aliases: ['汽水'], per: { value: 100, unit: 'ML' }, kcal: 40, protein: 0, fat: 0, carb: 10.0, sodium: 10, tags: ['饮品', '含糖', '碳酸'] },
    { id: 'bev-fanta', name: '芬达', aliases: ['橙汁汽水'], per: { value: 100, unit: 'ML' }, kcal: 46, protein: 0, fat: 0, carb: 11.6, sodium: 8, tags: ['饮品', '含糖', '碳酸'] },
    { id: 'bev-iced-tea', name: '冰红茶', per: { value: 100, unit: 'ML' }, kcal: 32, protein: 0, fat: 0, carb: 8.0, sodium: 20, tags: ['饮品', '含糖'] },
    { id: 'bev-juice-orange', name: '橙汁', per: { value: 100, unit: 'ML' }, kcal: 45, protein: 0.7, fat: 0.2, carb: 10.4, sodium: 1, tags: ['饮品', '果汁'] },
    { id: 'bev-juice-apple', name: '苹果汁', per: { value: 100, unit: 'ML' }, kcal: 46, protein: 0.1, fat: 0.1, carb: 11.3, sodium: 4, tags: ['饮品', '果汁'] },
    { id: 'bev-juice-grape', name: '葡萄汁', per: { value: 100, unit: 'ML' }, kcal: 60, protein: 0.4, fat: 0.1, carb: 14.8, sodium: 5, tags: ['饮品', '果汁'] },
    { id: 'bev-juice-tomato', name: '番茄汁', per: { value: 100, unit: 'ML' }, kcal: 17, protein: 0.8, fat: 0.1, carb: 3.5, sodium: 210, tags: ['饮品', '果汁'] },
    { id: 'bev-sports-drink', name: '运动饮料', aliases: ['宝矿力', '电解质水'], per: { value: 100, unit: 'ML' }, kcal: 26, protein: 0, fat: 0, carb: 6.4, sodium: 45, tags: ['饮品', '含糖'] },
    { id: 'bev-energy-drink', name: '能量饮料', aliases: ['红牛'], per: { value: 100, unit: 'ML' }, kcal: 45, protein: 0, fat: 0, carb: 11.0, sodium: 100, tags: ['饮品', '含糖', '咖啡因'] },
    { id: 'bev-vitamin-water', name: '维他命水', per: { value: 100, unit: 'ML' }, kcal: 24, protein: 0, fat: 0, carb: 6.0, sodium: 12, tags: ['饮品', '含糖'] },
    { id: 'bev-milk-tea', name: '奶茶', aliases: ['珍珠奶茶'], per: { value: 100, unit: 'ML' }, kcal: 84, protein: 1.4, fat: 2.6, carb: 13.6, sodium: 45, tags: ['饮品', '含糖', '奶茶'] },
    { id: 'bev-milk-tea-cup', name: '一杯奶茶', aliases: ['中杯奶茶', '500ml奶茶'], per: { value: 1, unit: 'SERVING' }, kcal: 420, protein: 7.0, fat: 13.0, carb: 68.0, sodium: 225, tags: ['饮品', '含糖', '份量参考'] },
    { id: 'bev-bubble-tea-pearl', name: '珍珠（木薯球）', aliases: ['波霸'], kcal: 165, protein: 0.5, fat: 0.2, carb: 40.5, sodium: 10, tags: ['饮品', '配料'] },
    { id: 'bev-latte', name: '拿铁', aliases: ['牛奶咖啡'], per: { value: 100, unit: 'ML' }, kcal: 45, protein: 2.4, fat: 2.4, carb: 3.5, sodium: 35, tags: ['饮品', '咖啡'] },
    { id: 'bev-cappuccino', name: '卡布奇诺', per: { value: 100, unit: 'ML' }, kcal: 40, protein: 2.2, fat: 2.0, carb: 3.4, sodium: 32, tags: ['饮品', '咖啡'] },
    { id: 'bev-latte-cup', name: '一杯拿铁', per: { value: 1, unit: 'SERVING' }, kcal: 135, protein: 7.2, fat: 7.2, carb: 10.5, sodium: 105, tags: ['饮品', '咖啡', '份量参考'] },
    { id: 'bev-frappe', name: '星冰乐', aliases: ['冰沙咖啡'], per: { value: 100, unit: 'ML' }, kcal: 96, protein: 2.0, fat: 3.4, carb: 14.4, sodium: 40, tags: ['饮品', '咖啡', '含糖'] },
    { id: 'bev-soy-latte', name: '豆乳拿铁', per: { value: 100, unit: 'ML' }, kcal: 42, protein: 2.6, fat: 1.9, carb: 3.4, sodium: 40, tags: ['饮品', '咖啡'] },

    // ── 酒精 ──
    { id: 'bev-beer', name: '啤酒', per: { value: 100, unit: 'ML' }, kcal: 32, protein: 0.4, fat: 0, carb: 3.1, sodium: 11, tags: ['饮品', '酒精'] },
    { id: 'bev-beer-can', name: '一罐啤酒', per: { value: 1, unit: 'SERVING' }, kcal: 105, protein: 1.3, fat: 0, carb: 10.2, sodium: 36, tags: ['饮品', '酒精', '份量参考'] },
    { id: 'bev-beer-draft', name: '一杯生啤', per: { value: 1, unit: 'SERVING' }, kcal: 160, protein: 2.0, fat: 0, carb: 15.5, sodium: 55, tags: ['饮品', '酒精', '份量参考'] },
    { id: 'bev-wine-red', name: '红葡萄酒', aliases: ['红酒'], per: { value: 100, unit: 'ML' }, kcal: 85, protein: 0.1, fat: 0, carb: 2.6, sodium: 4, tags: ['饮品', '酒精'] },
    { id: 'bev-wine-white', name: '白葡萄酒', aliases: ['白酒（葡萄酒）'], per: { value: 100, unit: 'ML' }, kcal: 82, protein: 0.1, fat: 0, carb: 2.6, sodium: 5, tags: ['饮品', '酒精'] },
    { id: 'bev-baijiu', name: '白酒（蒸馏酒）', aliases: ['二锅头'], per: { value: 100, unit: 'ML' }, kcal: 298, protein: 0, fat: 0, carb: 0.1, sodium: 1, tags: ['饮品', '酒精', '高度'] },
    { id: 'bev-baijiu-liang', name: '一两白酒', per: { value: 1, unit: 'SERVING' }, kcal: 149, protein: 0, fat: 0, carb: 0.05, sodium: 1, tags: ['饮品', '酒精', '份量参考'] },
    { id: 'bev-whisky', name: '威士忌', per: { value: 100, unit: 'ML' }, kcal: 250, protein: 0, fat: 0, carb: 0.1, sodium: 1, tags: ['饮品', '酒精', '高度'] },
    { id: 'bev-cocktail', name: '鸡尾酒', aliases: ['调制酒'], per: { value: 100, unit: 'ML' }, kcal: 130, protein: 0.1, fat: 0, carb: 12.0, sodium: 8, tags: ['饮品', '酒精', '含糖'] },
    { id: 'bev-rice-wine', name: '米酒', aliases: ['酒酿'], per: { value: 100, unit: 'ML' }, kcal: 91, protein: 1.6, fat: 0, carb: 19.0, sodium: 5, tags: ['饮品', '酒精'] },
  ]),
];
