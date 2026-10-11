/**
 * 多标签页选主（leader election）—— 技术设计异常清单 E19。
 *
 * 为什么必需：如果用户开了两个标签页，两边都会跑计时与结算，
 * 结果是**重复入账**（同一个会话被结算两次）。因此同一时刻只允许一个标签页
 * 承担「计时 + 落盘 + 结算」，其余标签页只做只读镜像。
 *
 * 本文件只实现**纯状态机**（可确定性测试）；真正的跨标签页通信
 * （BroadcastChannel / navigator.locks）由 apps/web 的适配器提供。
 *
 * 状态机规则：
 * - 每个标签页周期性发送心跳，并记录「最后一个主标签页的心跳时间」
 * - 若超过 LEADER_TIMEOUT_MS 没收到心跳 → 认为主标签页已崩溃，自己竞选
 * - 竞选时用单调递增的 term 打破平局（term 大者为主；相同则 deviceId/实例 ID 字典序大者为主）
 */
export const LEADER_POLICY = {
  /** 心跳间隔 */
  heartbeatMs: 2_000,
  /** 超过此时长没收到主心跳即认为主已失联 */
  leaderTimeoutMs: 5_000,
} as const;

export interface LeaderState {
  /** 本实例 ID（每个标签页一个） */
  selfId: string;
  /** 当前已知的主实例 ID；undefined 表示无主 */
  leaderId?: string;
  /** 最后一次收到主心跳的时间 */
  lastLeaderHeartbeatAt: number;
  /** 竞选届数：每次发起竞选自增，用于打破平局 */
  term: number;
}

export interface PeerHeartbeat {
  instanceId: string;
  term: number;
  at: number;
  /** 发送者自认为的主实例 */
  believesLeaderId?: string;
}

export function createLeaderState(selfId: string, now: number): LeaderState {
  return { selfId, lastLeaderHeartbeatAt: now, term: 0 };
}

export function isLeader(state: LeaderState): boolean {
  return state.leaderId === state.selfId;
}

/**
 * 处理收到的心跳，返回新状态。
 * 采用「term 大者优先，term 相同则实例 ID 字典序大者优先」的确定性规则，
 * 保证两个标签页同时竞选时不会僵持。
 */
export function onHeartbeat(state: LeaderState, hb: PeerHeartbeat, now: number): LeaderState {
  if (hb.instanceId === state.selfId) return state;

  const currentLeader = state.leaderId;
  const challengerWins = (): boolean => {
    if (currentLeader === undefined) return true;
    if (hb.term > state.term) return true;
    if (hb.term < state.term) return false;
    // term 相同：按实例 ID 字典序决定，双方会得到一致结论
    return hb.instanceId > currentLeader;
  };

  if (challengerWins()) {
    return {
      ...state,
      leaderId: hb.instanceId,
      lastLeaderHeartbeatAt: now,
      term: Math.max(state.term, hb.term),
    };
  }

  // 对方承认我为主，或对方 term 更低：只需刷新心跳时间
  if (hb.instanceId === currentLeader) {
    return { ...state, lastLeaderHeartbeatAt: now };
  }
  return state;
}

/**
 * 周期性评估（每个心跳周期调用一次）。
 * - 主心跳超时 → 无主，可发起竞选
 * - 自己就是主 → 保持
 */
export function evaluateLeadership(state: LeaderState, now: number): LeaderState {
  if (state.leaderId === undefined) return state;
  if (now - state.lastLeaderHeartbeatAt <= LEADER_POLICY.leaderTimeoutMs) return state;
  // 主已失联：**移除** leaderId 字段而不是赋 undefined
  // （exactOptionalPropertyTypes 下 `leaderId: undefined` 与「可选属性缺失」不等价）
  const { leaderId, ...rest } = state;
  void leaderId;
  return { ...rest, lastLeaderHeartbeatAt: now };
}

/** 发起竞选：term 自增并把自己设为主（其他标签页会用心跳消解冲突） */
export function campaign(state: LeaderState, now: number): LeaderState {
  return {
    ...state,
    leaderId: state.selfId,
    term: state.term + 1,
    lastLeaderHeartbeatAt: now,
  };
}

/** 生成要广播的心跳 */
export function makeHeartbeat(state: LeaderState, now: number): PeerHeartbeat {
  const hb: PeerHeartbeat = {
    instanceId: state.selfId,
    term: state.term,
    at: now,
  };
  if (state.leaderId !== undefined) hb.believesLeaderId = state.leaderId;
  return hb;
}

/** 只有主标签页才应该执行的动作（计时、落盘、结算） */
export function canAct(state: LeaderState): boolean {
  return isLeader(state);
}
