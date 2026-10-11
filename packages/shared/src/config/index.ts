/**
 * 全局数值配置 —— 唯一真相源。
 *
 * ⚠️ AGENTS.md 第 3.2 节：以下数值**只能**出现在本文件里。
 * 组件或领域函数中出现这些数字的字面量，一律视为缺陷（ESLint 会检查 domain 层）。
 *
 * 来源标注：[PRD 17.x] = docs/02-PRD-产品需求文档.md 第 17 章；
 *           [PRD AC-x.x.x] = 对应验收标准；[技术设计 x.x] = docs/03-技术设计文档.md。
 */

// ─────────────────────────────────────────────────────────────
// 时间与日历
// ─────────────────────────────────────────────────────────────

/** 自然日边界：本地时间 04:00（凌晨 4 点前算前一天）[PRD 4.1] */
export const DAY_BOUNDARY_HOUR = 4;

/** 到点后宽限期 3 分钟 [PRD AC-1.4.8] */
export const GRACE_PERIOD_MS = 3 * 60_000;

/** 到点前提前提醒的时长：5 分钟 [PRD FR-1.2] */
export const REMINDER_LEAD_MS = 5 * 60_000;

/**
 * 「准时开始」的判定容差：±2 分钟 [PRD 17.1 准时加成]。
 * 之所以给容差而不是要求秒级精确：用户可能提前一点坐下、
 * 或点开始按钮时慢了十几秒，不该因此丢掉准时奖励。
 */
export const PUNCTUAL_TOLERANCE_MS = 2 * 60_000;

/** 切走累计超过此值才计为「违规」[PRD AC-1.4.1 ③] */
export const VIOLATION_THRESHOLD_MS = 30_000;

/** 会话状态心跳落盘间隔（不是计时依据，仅兜底）[技术设计 5.1.4] */
export const SESSION_HEARTBEAT_MS = 15_000;

/** 每日首次填写待办的生效时刻：早于此点打开不弹[PRD AC-2.2.2] */
export const DAILY_FORM_START_HOUR = 7;

/** 时间单位换算基准（避免 3_600_000 / 60_000 这类数字散落在领域函数里） */
export const TIME_UNITS = {
  MS_PER_SECOND: 1_000,
  SECONDS_PER_MINUTE: 60,
  MINUTES_PER_HOUR: 60,
  MS_PER_MINUTE: 60_000,
  MS_PER_HOUR: 3_600_000,
  HOURS_PER_DAY: 24,
} as const;

/** 一天最多多少小时桶（时段分布图用） */
export const HOUR_BUCKETS = TIME_UNITS.HOURS_PER_DAY;

/**
 * 待办表单的输入上限 [PRD AC-2.2.5]。
 * 单条待办最长 8 小时：超过这个长度基本说明任务没拆开，
 * 与其让用户排出「12 小时写论文」，不如在录入时就拦住并提示拆分。
 * 注意必须定义在 TIME_UNITS 之后，否则会触发 TDZ 错误。
 */
export const TASK_LIMITS = {
  titleMaxLength: 60,
  plannedMsMax: 8 * TIME_UNITS.MS_PER_HOUR,
} as const;

/**
 * 数值显示精度：领域层算出的小数统一保留 1 位。
 * 属于「计算精度」而非业务参数，但同样不该以字面量形式出现在领域函数里。
 */
export const PRECISION = {
  DECIMALS: 1,
  SCALE: 10,
} as const;

// ─────────────────────────────────────────────────────────────
// 配额 [PRD AC-1.4.5 / AC-1.4.6 / AC-3.2.4]
// ─────────────────────────────────────────────────────────────

export const QUOTA = {
  /** 专注：每日退出机会 1 次（无常量名冲突） */
  focusDaily: 1,
  /** 专注：每月累计上限 5 次 */
  focusMonthly: 5,
  /** 锁机：仅每月 5 次，与专注配额完全独立 */
  lockMonthly: 5,
  /** 「本次跳过」每日上限 2 次（不消耗月配额） */
  skipDaily: 2,
} as const;

// ─────────────────────────────────────────────────────────────
// 惩罚 [PRD AC-1.4.7 / AC-3.2.5 / 技术设计 5.4.1]
// ─────────────────────────────────────────────────────────────

export const PENALTY = {
  /** 配额用尽后强行退出专注：扣币 */
  breachCoin: 50,
  /** 配额用尽后强行退出锁机：扣币（低于专注，因锁机是主动行为） */
  breachLockCoin: 30,
  /** 越界后宠物「蔫」的时长（毫秒）——只会蔫，永不死亡 [原则 3] */
  wiltingMs: 30 * 60_000,
  /** 「本次跳过」扣币 */
  skipCoin: 10,
} as const;

// ─────────────────────────────────────────────────────────────
// 经济：产出 [PRD 17.1]
// ─────────────────────────────────────────────────────────────

export const ECONOMY = {
  /** 完成待办的基础金币 */
  baseCoin: 20,
  /** 自由专注（未关联待办）的折扣系数 */
  unlinkedTaskFactor: 0.8,
  /** 准时开始（计划时间 ±2 分钟内）的加成 */
  punctualBonus: 10,
  /** 每日产出硬上限（兜底防刷） */
  dailyCoinCap: 400,
  /** 锁机每金币/小时 */
  lockCoinPerHour: 12,
  /**
   * 锁机最小结算单位（毫秒）：不足 5 分钟不计 */
  lockMinSettleMs: 5 * 60_000,
  /**
   * 同日连续锁机加成（单位：金币）。
   * 索引语义 = **当日第几段锁机**（从 1 开始，索引 0 占位不用）：
   *   第 1 段 0、第 2 段 +10、第 3 段 +20、第 4 段起 +20 [PRD AC-3.2.7]
   */
  lockStreakBonus: [0, 0, 10, 20] as readonly number[],
  /** 连续锁机加成的每日上限次数 */
  lockStreakBonusMaxTimes: 3,
} as const;

/**
 * 时长系数（按计划时长分档）[PRD 17.1]
 * 落档规则：取第一个满足 `plannedMs <= maxMs` 的档；**都超过时由调用方兜底取最高档**。
 * 注意：这里**不写 `Number.POSITIVE_INFINITY` 档**——实测在 Node 的类型剥离下该字面量
 * 会退化为不可用值（JSON 序列化为 null），导致分档判断出错。
 */
export const DURATION_FACTORS: ReadonlyArray<{ maxMs: number; factor: number }> = [
  { maxMs: 15 * 60_000, factor: 0.6 },
  { maxMs: 30 * 60_000, factor: 1.0 },
  { maxMs: 60 * 60_000, factor: 1.5 },
  { maxMs: 120 * 60_000, factor: 2.0 },
  { maxMs: 121 * 60_000, factor: 2.3 },
];

/** 质量系数阈值 [PRD 17.1] */
export const QUALITY_FACTORS = {
  /** 完成度 ≥ 1 且零违规 */
  perfect: 1.2,
  /** 完成度 ≥ 0.8 且违规占比 < 0.1 */
  good: 1.0,
  /** 完成度 ≥ 0.5 */
  half: 0.7,
  /** 完成度 < 0.5 */
  low: 0.4,
  /** 主动放弃（未消耗配额） */
  abandoned: 0.2,
  /** 违规占比 > 0.2 时的额外折减 */
  violationPenalty: 0.5,
  goodCompletion: 0.8,
  goodViolationRatio: 0.1,
  halfCompletion: 0.5,
  violationRatioThreshold: 0.2,
} as const;

/** 专注日历热力图分档上限（分钟）[PRD AC-4.2.3] */
export const HEAT_LEVEL_THRESHOLDS_MINUTES = [30, 60, 120] as const;

/**
 * 三大营养素供能系数（kcal/g）[PRD AC-5.2.5 环图口径]
 * 用供能比而非克数比，才是营养学上的正确口径。
 */
export const MACRO_KCAL_PER_GRAM = {
  protein: 4,
  fat: 9,
  carb: 4,
} as const;

/**
 * 营养值的合理区间 [min, max]，用于校验 AI 兜底返回值（PRD AC-5.2.4）。
 * 超出区间的结果视为非法，前端应回退到手动录入而不是照单全收。
 */
export const NUTRIENT_LIMITS = {
  kcal: [0, 2_000],
  proteinG: [0, 200],
  fatG: [0, 200],
  carbG: [0, 300],
  fiberG: [0, 100],
  sodiumMg: [0, 10_000],
} as const satisfies Record<string, readonly [number, number]>;

// ─────────────────────────────────────────────────────────────
// 宠物 [PRD AC-6.2.6]
// ─────────────────────────────────────────────────────────────

export const PET = {
  /** 初始三维 */
  initialMood: 70,
  initialSatiety: 80,
  initialEnergy: 80,
  /** 自然衰减速率（每小时） */
  satietyDecayPerHour: 1,
  energyDecayPerHour: 0.5,
  /** 饱食度低于此值时心情开始下降 */
  hungrySatietyThreshold: 30,
  /** 饥饿导致的心情衰减（每小时） */
  hungryMoodDecayPerHour: 2,
  /** 心情分档阈值：≥ happy 活泼，≥ calm 平静，< calm 蔫 */
  moodHappyThreshold: 70,
  moodCalmThreshold: 30,
  /** 饱食度低于此值显示饥饿气泡 */
  hungerBubbleSatiety: 20,
  /** 抚摸的互动冷却（毫秒） */
  petReactionCooldownMs: 2_000,
  /** 抚摸回补心情（每分钟最多计分次数由 COOLDOWN 约束） */
  petReactionMoodGain: 1,
  /** 完成待办回补心情 */
  cheerMoodGain: 6,
  /** 锁机结束回补饱食度 */
  lockSatietyGain: 5,
  /** 亲密度等级上限 */
  maxLevel: 10,
  /**
   * 待机动作的权重分档（配合 random() 使用，见技术设计 5.5.2）。
   * 心情越好越活泼：蔫状态几乎只眨眼，活泼时更可能甩尾/张望。
   */
  idleWeights: {
    /** 蔫：random < wiltBlink 则眨眼，否则静止 */
    wiltBlink: 0.7,
    /** 平静：眨眼 / 静止 / 张望 的累计边界 */
    calmBlink: 0.35,
    calmIdle: 0.6,
    calmLookAround: 0.8,
  },
  /** 亲密度计分：每 accumulatedScorePerLevel 分升一级；完成待办权重为 interacted 的 taskWeight 倍 */
  leveling: {
    accumulatedScorePerLevel: 20,
    taskWeight: 2,
  },
  /**
   * 「一键随机造型」时每个部位被换上的概率（0–1）。
   * 取 0.5 是刻意的：太高会让每次点都全换（失去"随机"的味道），
   * 太低则看起来没反应。
   */
  randomOutfitSwapChance: 0.5,
} as const;

// ─────────────────────────────────────────────────────────────
// 健康/饮食/记账 [PRD 9.1 / 9.2 / 9.3]
// ─────────────────────────────────────────────────────────────

export const MODULE_COIN = {
  fitnessCheckin: 10,
  fitnessRecordPerItem: 5,
  fitnessRecordDailyMax: 3,
  dietFirstRecord: 5,
  dietAllThreeMeals: 10,
  financePerEntry: 2,
  financeDailyMax: 5,
  /** 里程碑：连续打卡 3/7/14/30 天 */
  milestones: [
    { days: 3, coin: 15 },
    { days: 7, coin: 40 },
    { days: 14, coin: 80 },
    { days: 30, coin: 200 },
  ] as ReadonlyArray<{ days: number; coin: number }>,
} as const;

// ─────────────────────────────────────────────────────────────
// 金额 [AGENTS.md 3.1：一律用整数「分」]
// ─────────────────────────────────────────────────────────────

export const MONEY = {
  /** 1 元 = 100 分。金额的存储与计算全用分，只在展示时换算 */
  centsPerYuan: 100,
  /** 金额最多允许两位小数（分） */
  fractionDigits: 2,
} as const;

// ─────────────────────────────────────────────────────────────
// 时钟异常检测 [技术设计 7 · E4]
// ─────────────────────────────────────────────────────────────

/** 墙钟与单调时钟偏差超过此值即视为「系统时间被改动」 */
export const CLOCK_SKEW_TOLERANCE_MS = 60_000;
