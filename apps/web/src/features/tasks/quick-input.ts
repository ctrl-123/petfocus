/**
 * 自然语言速记解析（PRD AC-2.2.6）。
 *
 * 输入「9点 写实验报告 1小时」→ 时间 09:00、标题「写实验报告」、时长 60 分钟。
 * 只做**确定性的规则解析**，不调用任何 AI：用户输入的待办必须可预期，
 * 解析失败就退回「整串当标题」，绝不猜错还悄悄填进去。
 *
 * 设计取舍：
 * - 支持中文口语（9点 / 9点半 / 下午3点 / 9:30）与时长（1小时 / 半小时 / 90分钟）
 * - 不支持的表述保持原样，由用户手动调整（UI 会提示「已尝试解析，可修改」）
 */
import type { Priority } from '@petfocus/shared';

export interface ParsedQuickInput {
  title: string;
  /** 解析出的开始时间所在「小时」；未识别为 undefined */
  hour?: number;
  minute?: number;
  /** 解析出的时长（毫秒）；未识别为 undefined */
  plannedMs?: number;
  /** 解析出的优先级；未识别为 undefined */
  priority?: Priority;
  /** 是否发生了任何解析（用于 UI 提示「可修改」） */
  parsed: boolean;
  /** 采用的原始输入 */
  raw: string;
}

const HALF_HOUR_MS = 30 * 60_000;
const HOUR_MS = 60 * 60_000;

/** 中文数字 → 阿拉伯数字（只覆盖 0–59 的常见写法） */
const CN_DIGITS: Record<string, number> = {
  零: 0,
  一: 1,
  二: 2,
  两: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
  十: 10,
};

/**
 * 解析 0–59 的中文或阿拉伯数字。
 * 按「最具体 → 最笼统」的顺序判断，避免分支重叠（重叠会产生不可达代码）。
 */
export function parseSmallNumber(text: string): number | undefined {
  const trimmed = text.trim();
  if (trimmed.length === 0) return undefined;

  // 阿拉伯数字
  const ascii = /^\d{1,2}$/.exec(trimmed);
  if (ascii) return Number(ascii[0]);

  // 恰好「十」= 10
  if (trimmed === '十') return 10;

  // X十Y = XY，如 十五 = 15、二十三 = 23
  const tensOnes = /^(.)十(.)$/.exec(trimmed);
  if (tensOnes) {
    const tens = CN_DIGITS[tensOnes[1] ?? ''];
    const ones = CN_DIGITS[tensOnes[2] ?? ''];
    if (tens !== undefined && ones !== undefined) return tens * 10 + ones;
    return undefined;
  }

  // X十 = X0，如 二十 = 20
  const tensOnly = /^(.)十$/.exec(trimmed);
  if (tensOnly) {
    const tens = CN_DIGITS[tensOnly[1] ?? ''];
    return tens === undefined ? undefined : tens * 10;
  }

  // 十Y = 1Y，如 十五 已在上方处理；这里处理 十 = 10（已处理）与「十Y」的兜底
  const rest = /^十(.)$/.exec(trimmed);
  if (rest) {
    const ones = CN_DIGITS[rest[1] ?? ''];
    return ones === undefined ? undefined : 10 + ones;
  }

  // 单个中文数字
  const single = CN_DIGITS[trimmed];
  return single;
}

interface TimeMatch {
  hour: number;
  minute: number;
  matchedText: string;
}

/** 从文本中抽取时间表达，返回首个命中项 */
function extractTime(text: string): TimeMatch | undefined {
  // 1) 09:30 / 9：30（允许全角冒号）
  const colon = /(\d{1,2})\s*[:：]\s*(\d{1,2})/.exec(text);
  if (colon) {
    const hour = Number(colon[1]);
    const minute = Number(colon[2]);
    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
      return { hour, minute, matchedText: colon[0] };
    }
  }

  // 2) 下午3点 / 晚上8点 / 上午9点 / 中午12点
  const period = /(凌晨|早上|上午|中午|下午|傍晚|晚上)?\s*([\d一二两三四五六七八九十]{1,3})\s*[点時时](\s*(半|[\d一二两三四五六七八九十]{1,3})\s*分?)?/.exec(
    text,
  );
  if (period) {
    const rawHour = parseSmallNumber(period[2] ?? '');
    if (rawHour !== undefined && rawHour >= 0 && rawHour <= 24) {
      const marker = period[1] ?? '';
      let hour = rawHour;
      if ((marker === '下午' || marker === '傍晚' || marker === '晚上') && hour < 12) hour += 12;
      if (marker === '中午' && hour < 12) hour += 12;
      if (hour >= 24) hour = 0;

      let minute = 0;
      const minuteText = (period[3] ?? '').trim();
      if (minuteText === '半') minute = 30;
      else {
        const parsedMinute = parseSmallNumber(minuteText.replace('分', '').trim());
        if (parsedMinute !== undefined && parsedMinute < 60) minute = parsedMinute;
      }
      return { hour, minute, matchedText: period[0] };
    }
  }

  return undefined;
}

/** 从文本中抽取时长表达，返回毫秒 */
function extractDuration(text: string): { plannedMs: number; matchedText: string } | undefined {
  // ⚠️ 顺序重要：必须**先**检查更具体的表达。
  // 「一个半小时」包含子串「半小时」，若先检查「半小时」会误判为 30 分钟。
  if (/一(个)?半小时/.test(text)) {
    return { plannedMs: HOUR_MS + HALF_HOUR_MS, matchedText: /一(个)?半小时/.exec(text)?.[0] ?? '一个半小时' };
  }
  // 半小时
  if (/半小时|半个小时/.test(text)) {
    return { plannedMs: HALF_HOUR_MS, matchedText: /半小时|半个小时/.exec(text)?.[0] ?? '半小时' };
  }
  // 1小时 / 2 小时 / 一小时 / 两小时
  const hours = /([\d一二两三四五六七八九十]{1,2})\s*(个)?\s*(小时|钟头|h|H)/.exec(text);
  if (hours) {
    const n = parseSmallNumber(hours[1] ?? '');
    if (n !== undefined && n > 0) {
      return { plannedMs: n * HOUR_MS, matchedText: hours[0] };
    }
  }
  // 90分钟 / 25分 / 四十五分钟
  const minutes = /([\d一二两三四五六七八九十]{1,3})\s*(分钟|分|min|m)/.exec(text);
  if (minutes) {
    const n = parseSmallNumber(minutes[1] ?? '');
    if (n !== undefined && n > 0) {
      return { plannedMs: n * 60_000, matchedText: minutes[0] };
    }
  }
  return undefined;
}

/** 从文本中抽取优先级表达 */
function extractPriority(text: string): { priority: Priority; matchedText: string } | undefined {
  if (/高优先|重要|紧急|!!/.test(text)) {
    const m = /高优先|重要|紧急|!!/.exec(text);
    return { priority: 'HIGH', matchedText: m?.[0] ?? '重要' };
  }
  if (/低优先|不急|随便/.test(text)) {
    const m = /低优先|不急|随便/.exec(text);
    return { priority: 'LOW', matchedText: m?.[0] ?? '不急' };
  }
  return undefined;
}

/**
 * 解析速记输入。
 * 解析出的片段会从标题中移除，避免标题变成「写实验报告 1小时」。
 */
export function parseQuickInput(raw: string): ParsedQuickInput {
  const text = raw.normalize('NFKC').trim();
  const result: ParsedQuickInput = { title: text, parsed: false, raw };

  if (text.length === 0) return result;

  let remaining = text;

  const time = extractTime(remaining);
  if (time) {
    result.hour = time.hour;
    result.minute = time.minute;
    remaining = remaining.replace(time.matchedText, ' ');
    result.parsed = true;
  }

  const duration = extractDuration(remaining);
  if (duration) {
    result.plannedMs = duration.plannedMs;
    remaining = remaining.replace(duration.matchedText, ' ');
    result.parsed = true;
  }

  const priority = extractPriority(remaining);
  if (priority) {
    result.priority = priority.priority;
    remaining = remaining.replace(priority.matchedText, ' ');
    result.parsed = true;
  }

  const title = remaining.replace(/\s+/g, ' ').trim();
  // 如果解析后标题为空（用户只输了「9点」），退回原始输入，避免产生空待办
  result.title = title.length > 0 ? title : text;
  if (title.length === 0) result.parsed = false;

  return result;
}

/**
 * 把解析出的小时/分钟落到具体时间戳。
 * @param dayStartTs 归属日的起始时刻（即 04:00 边界那一刻）
 * @param boundaryHour 自然日边界小时（config 的 DAY_BOUNDARY_HOUR）
 *
 * 规则：若目标小时 ≥ 边界小时，视为当天；否则视为同一归属日内的「次日凌晨」
 * ——这与 04:00 边界的语义一致（凌晨 2 点属于前一天，所以它落在 dayStart + 22 小时）。
 */
export function resolveStartAt(
  dayStartTs: number,
  hour: number,
  minute: number,
  boundaryHour: number,
): number {
  const d = new Date(dayStartTs);
  d.setHours(hour, minute, 0, 0);
  if (hour < boundaryHour) {
    // 归属日内的凌晨时刻 → 实际是起始日期的次日
    d.setDate(d.getDate() + 1);
  }
  return d.getTime();
}
