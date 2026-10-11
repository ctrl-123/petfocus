/**
 * 奖励话术库 [PRD FR-1.5]。
 *
 * ⚠️ 硬性约束（AGENTS.md 产品原则 2：惩罚不羞辱）：
 * - 所有文案指向**方法与事实**，绝不指向人格
 * - **禁止**出现「你真懒」「又失败了」「对不起宠物」等羞辱性表达
 * - D 档（中途放弃/违规严重）尤其要温和：用户已经挫败了，不能再补一刀
 * - 不说教、不道德绑架、不承诺「明天会更好」这种空话
 *
 * 每档至少 8 条，避免重复感（PRD 要求）。选取用可注入的随机源，便于测试。
 */

export type RewardTier = 'S' | 'A' | 'B' | 'C' | 'D';

/** 通用奖励话术（完成待办/专注后展示） */
export const FOCUS_REWARD_COPY: Record<RewardTier, ReadonlyArray<string>> = {
  S: [
    '全程零走神，这专注力拿去考试都够用了。',
    '你刚刚的样子，值得被截图。',
    '一次没离开，这就是最难做到的那种完整。',
    '这段专注干净得挑不出毛病。',
    '连你自己都没发现，你其实能坐这么久。',
    '零中断完成，今天的默认状态就是「在状态」。',
    '这种完成度，值得给它单独记一笔。',
    '全程在线，收工。',
  ],
  A: [
    '稳稳当当，宠物在你脚边转了三圈。',
    '这一段做得踏实，没有虚的。',
    '节奏很好，中间那点小波动没影响你。',
    '完成度很漂亮，继续保持这个手感。',
    '你把该做的做完了，这就够了。',
    '看得出来你是有在认真做的。',
    '稳定发挥，值得记一次好账。',
    '今天这一段，质量在线。',
  ],
  B: [
    '今天先到这，明天的你会感谢现在的你。',
    '做了一半也是做了，不是零。',
    '有开场也有收尾，中间丢了一点，不影响整体。',
    '这一段的产出是实打实的。',
    '不算完美，但绝对不算白坐。',
    '你推进了它，哪怕没推到终点。',
    '完成度放在这，明天可以更顺。',
    '记一笔，这次是「有进展」。',
  ],
  C: [
    '完成了一半也是完成，至少你坐下来过。',
    '起步比什么都难，你已经迈过去了。',
    '这次没做满，但记录是真实的。',
    '有开头就有下次，不亏。',
    '今天进度不多，但方向没错。',
    '能坐下来本身就是一步。',
    '这半小时不算浪费，它让你知道难在哪。',
    '先记下来，不用急着评价它。',
  ],
  D: [
    '没关系，先喝口水。要不要把任务切小一点？',
    '这次不太顺，但记录不会因此变少。',
    '中断很正常。下次把时长设短一些试试。',
    '不用现在复盘，先离开椅子走两步。',
    '今天状态不在这里，明天再来就行。',
    '任务本身可能太大了，拆成两半会容易些。',
    '这次先这样，它不说明你是什么样的人。',
    '休息是允许的。想继续时再回来。',
  ],
};

/** 锁机结束话术（强调「你主动约束了自己」） */
export const LOCK_REWARD_COPY: ReadonlyArray<string> = [
  '主动把自己关起来，这件事本身就不容易。',
  '这段时间你没刷视频，宠物有饭吃了。',
  '锁机结束，解封。刚才那段是纯赚的。',
  '没有待办也能坐下来，这比按计划做事更难。',
  '清醒的一段时间，收下。',
  '没人逼你，你还是坐住了。',
  '这段时间是你的，不是推荐算法的。',
  '开了锁机还坐满，值得记一笔。',
];

/** 待办完成话术（比专注结算更轻量） */
export const TASK_DONE_COPY: ReadonlyArray<string> = [
  '搞定一件，划掉它。',
  '完成。宠物抬头看了你一眼。',
  '又清掉一项，列表短了一点。',
  '做完了，记上。',
  '这件事不再占你的脑子了。',
  '打完收工，下一件待命。',
  '完成度 +1，金币到账。',
  '划掉它的手感不错吧。',
];

// ─────────────────────────────────────────────────────────────
// 选取与档位判定
// ─────────────────────────────────────────────────────────────

/** 由结算数据判定档位（与 PRD 17.1 的质量系数口径一致） */
export function rewardTierOf(input: {
  exitKind: string;
  completion: number;
  violationRatio: number;
}): RewardTier {
  if (input.exitKind === 'BREACH') return 'D';
  if (input.exitKind === 'SKIP') return 'D';
  if (input.completion >= 1 && input.violationRatio === 0) return 'S';
  if (input.completion >= 0.8 && input.violationRatio < 0.1) return 'A';
  if (input.completion >= 0.5) return 'B';
  if (input.completion > 0) return 'C';
  return 'D';
}

/**
 * 从一组文案里选一条。
 * `random` 可注入，便于测试；默认使用 Math.random。
 */
export function pickCopy(
  pool: ReadonlyArray<string>,
  random: () => number = Math.random,
): string {
  if (pool.length === 0) return '';
  const index = Math.min(pool.length - 1, Math.max(0, Math.floor(random() * pool.length)));
  return pool[index] ?? pool[0] ?? '';
}

/** 按档位选取专注结算话术 */
export function pickFocusRewardCopy(
  tier: RewardTier,
  random: () => number = Math.random,
): string {
  return pickCopy(FOCUS_REWARD_COPY[tier], random);
}

/** 文案红线自检：供测试与评审使用，返回违规文案列表（应为空） */
export const FORBIDDEN_COPY_PATTERNS: ReadonlyArray<RegExp> = [
  /你真懒|太懒了|懒/,
  /又失败|失败者/,
  /对不起宠物|宠物失望/,
  /没救了|无药可救|废/,
  /不许|必须|应该早|早就该/,
  /防作弊|无法破解/,
];

export function findForbiddenCopy(pools: ReadonlyArray<ReadonlyArray<string>>): string[] {
  const offenders: string[] = [];
  for (const pool of pools) {
    for (const line of pool) {
      if (FORBIDDEN_COPY_PATTERNS.some((re) => re.test(line))) offenders.push(line);
    }
  }
  return offenders;
}

/** 所有话术池的集合（供自检与统计） */
export const ALL_COPY_POOLS: ReadonlyArray<ReadonlyArray<string>> = [
  ...Object.values(FOCUS_REWARD_COPY),
  LOCK_REWARD_COPY,
  TASK_DONE_COPY,
];
