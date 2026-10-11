/**
 * 设备身份：匿名设备 ID + 请求签名。见 ADR-010 与 5.3.3。
 *
 * 设计要点：
 * 1. **没有账号**。身份只是首次启动时本地生成的一个 UUID，用户不可见、无需感知。
 * 2. 签名密钥是**不可导出（extractable=false）的 HMAC CryptoKey**，存于 IndexedDB。
 *    即使有人打开 DevTools 执行 JS，也无法把密钥字节读出来，只能调用它签名。
 * 3. 服务端只保存「设备 ID → 密钥的哈希」用于校验签名。
 *
 * ⚠️ 必须如实告知的限制（ADR-010 威胁模型）：
 * 这套机制能挡住「改系统时间」「改 localStorage」「清一半缓存」这类**低成本作弊**，
 * 但挡不住能完整复制浏览器 profile 的人。本产品是自律工具，不是对抗性安全系统。
 * **禁止**在任何 UI 或文档中宣称「防作弊」「无法破解」。
 *
 * 本文件不直接依赖 globalThis.crypto：WebCrypto 通过参数注入，便于测试与跨运行时。
 */

/** 可注入的 WebCrypto 子集（浏览器 crypto.subtle / Node webcrypto.subtle 都满足） */
export interface SubtleCryptoLike {
  generateKey(
    algorithm: { name: string; hash: string },
    extractable: boolean,
    keyUsages: string[],
  ): Promise<unknown>;
  importKey(
    format: string,
    keyData: ArrayBuffer | Uint8Array,
    algorithm: { name: string; hash: string },
    extractable: boolean,
    keyUsages: string[],
  ): Promise<unknown>;
  sign(algorithm: string, key: unknown, data: ArrayBuffer | Uint8Array): Promise<ArrayBuffer>;
}

export interface DeviceIdentity {
  /** 匿名设备 ID（UUID v4） */
  deviceId: string;
  /** 不可导出的 HMAC 签名密钥 */
  signingKey: unknown;
  createdAt: number;
  /** 是否已在服务端登记（登记只上传密钥哈希） */
  registered: boolean;
}

/** 身份持久化：由 data 层提供 IndexedDB 实现，测试用内存实现 */
export interface DeviceIdentityStorage {
  load(): Promise<DeviceIdentity | undefined>;
  save(identity: DeviceIdentity): Promise<void>;
  clear(): Promise<void>;
}

export interface DeviceIdentityDeps {
  subtle: SubtleCryptoLike;
  storage: DeviceIdentityStorage;
  /** 可注入，便于测试与「时间异常」处理 */
  now?: () => number;
  /** 可注入 UUID 生成器 */
  randomUuid?: () => string;
}

const HMAC_ALGORITHM = { name: 'HMAC', hash: 'SHA-256' } as const;
const SIGNING_KEY_USAGES = ['sign', 'verify'] as const;

/** 签名时间窗（服务端要求）[技术设计 6.1] */
export const SIGNATURE_WINDOW_MS = 5 * 60_000;

function defaultUuid(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  throw new Error('当前环境不支持 crypto.randomUUID，请通过 deps.randomUuid 注入');
}

function nowFn(deps: DeviceIdentityDeps): number {
  return deps.now ? deps.now() : Date.now();
}

function uuidFn(deps: DeviceIdentityDeps): () => string {
  return deps.randomUuid ?? defaultUuid;
}

/** 取出或首次创建设备身份 */
export async function initDeviceIdentity(deps: DeviceIdentityDeps): Promise<DeviceIdentity> {
  const existing = await deps.storage.load();
  if (existing) return existing;

  const signingKey = await deps.subtle.generateKey(HMAC_ALGORITHM, false, [...SIGNING_KEY_USAGES]);
  const identity: DeviceIdentity = {
    deviceId: uuidFn(deps)(),
    signingKey,
    createdAt: nowFn(deps),
    registered: false,
  };
  await deps.storage.save(identity);
  return identity;
}

/** 读取当前身份；不存在返回 undefined（不隐式创建） */
export async function loadDeviceIdentity(deps: DeviceIdentityDeps): Promise<DeviceIdentity | undefined> {
  return deps.storage.load();
}

/** 标记已完成服务端登记 */
export async function markRegistered(deps: DeviceIdentityDeps, registered: boolean): Promise<DeviceIdentity | undefined> {
  const current = await deps.storage.load();
  if (!current) return undefined;
  const next: DeviceIdentity = { ...current, registered };
  await deps.storage.save(next);
  return next;
}

/**
 * 重置身份（设置页的「重置设备 ID」）。
 * ⚠️ 后果：服务端的金币/配额账本与旧 ID 绑定，重置后从零开始。
 * UI 必须二次确认并说明这一点。
 */
export async function resetDeviceIdentity(deps: DeviceIdentityDeps): Promise<DeviceIdentity> {
  await deps.storage.clear();
  return initDeviceIdentity(deps);
}

// ─────────────────────────────────────────────────────────────
// 请求签名
// ─────────────────────────────────────────────────────────────

/** 待签名的内容：`${timestamp}.${body}`（与技术设计 5.3.3 一致） */
export function signaturePayload(timestamp: number, body: string): string {
  return `${timestamp}.${body}`;
}

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  if (typeof btoa === 'function') return btoa(binary);
  // Node 环境兜底
  const B = (globalThis as { Buffer?: { from(s: string, enc: string): { toString(enc: string): string } } }).Buffer;
  if (B) return B.from(binary, 'binary').toString('base64');
  throw new Error('当前环境缺少 base64 编码能力');
}

export interface SignedHeaders {
  'x-device-id': string;
  'x-ts': string;
  'x-device-sig': string;
}

/**
 * 为请求生成签名头。
 * @param body 实际发送的请求体**原文**（必须是同一字符串，否则服务端校验失败）
 */
export async function signRequest(
  deps: DeviceIdentityDeps,
  identity: DeviceIdentity,
  body: string,
): Promise<SignedHeaders> {
  const ts = nowFn(deps);
  const data = new TextEncoder().encode(signaturePayload(ts, body));
  const mac = await deps.subtle.sign(HMAC_ALGORITHM.name, identity.signingKey, data);
  return {
    'x-device-id': identity.deviceId,
    'x-ts': String(ts),
    'x-device-sig': toBase64(mac),
  };
}

export interface SignatureVerification {
  valid: boolean;
  reason?: 'STALE_TIMESTAMP' | 'FUTURE_TIMESTAMP' | 'MISMATCH';
}

/**
 * 校验签名。**客户端本地也用它做自检**（同一个函数，避免两侧逻辑漂移）。
 * 服务端版本还会用 devices.secret_hash 校验，此处只验证时间窗与自身一致性。
 */
export async function verifyRequestSignature(
  deps: DeviceIdentityDeps,
  identity: DeviceIdentity,
  body: string,
  headers: SignedHeaders,
  nowMs?: number,
): Promise<SignatureVerification> {
  const ts = Number(headers['x-ts']);
  if (!Number.isFinite(ts)) return { valid: false, reason: 'MISMATCH' };

  const now = nowMs ?? nowFn(deps);
  if (now - ts > SIGNATURE_WINDOW_MS) return { valid: false, reason: 'STALE_TIMESTAMP' };
  if (ts - now > SIGNATURE_WINDOW_MS) return { valid: false, reason: 'FUTURE_TIMESTAMP' };

  const expected = await signRequest(deps, identity, body);
  if (expected['x-device-sig'] !== headers['x-device-sig']) {
    return { valid: false, reason: 'MISMATCH' };
  }
  return { valid: true };
}

/**
 * 幂等键：结算与配额操作都用客户端生成的 UUID，服务端据此去重。
 * 见技术设计 5.4.2 与 4.4「幂等与并发」。
 */
export function newIdempotencyKey(randomUuid?: () => string): string {
  if (randomUuid) return randomUuid();
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  throw new Error('当前环境不支持 crypto.randomUUID，请注入 randomUuid');
}
