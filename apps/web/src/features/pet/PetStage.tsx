import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  activePartIds,
  findShopItem,
  moodLevelOf,
  resolvePetAction,
  type Equipment,
  type PetAnimation,
  type PetMood,
  type PetVitals,
} from '@petfocus/shared';
import {
  createCssPetRenderer,
  describeRenderer,
  resolveAccessories,
  type AccessoryVisual,
  type PetRenderer,
} from './renderer.ts';

/** 装扮 id → 渲染器可绘制的视觉信息 */
function resolveAccessoryVisual(itemId: string): AccessoryVisual | undefined {
  const item = findShopItem(itemId);
  if (!item || !item.slot || !item.visual) return undefined;
  return { id: item.id, slot: item.slot, trait: item.visual };
}

interface PetStageProps {
  vitals: PetVitals;
  name: string;
  /** 真实穿着的装扮 */
  equipped?: Equipment;
  /**
   * 试穿预览的装扮（覆盖在真实装备之上展示）。
   * 预览**不影响任何数据**，纯粹是显示层的事情。
   */
  preview?: Equipment;
  /** 是否正在播放某个事件动作（如完成待办时欢呼） */
  eventAnimation?: PetAnimation;
  onPet: () => void;
  /** 点击商城；不传则不显示商城按钮（例如在预览弹窗里） */
  onOpenShop?: () => void;
  size?: 'sm' | 'lg';
}

/**
 * 宠物舞台：渲染 + 交互。
 *
 * 交互规则（PRD AC-6.2.4 / AC-6.2.5）：
 * - 点击身体 → 抚摸回应动作 + 爱心粒子
 * - 同一区域连点有冷却，防止过度触发（冷却值取自 config）
 * - 空闲时随机播放待机动作
 * - 蔫状态下动作被压制成 WILT（不欢呼）
 */
export function PetStage({
  vitals,
  name,
  equipped,
  preview,
  eventAnimation,
  onPet,
  onOpenShop,
  size = 'lg',
}: PetStageProps): JSX.Element {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<PetRenderer | undefined>(undefined);
  const lastPetAtRef = useRef(0);
  // 随机源固定为一次创建，避免每次渲染变化导致动画抖动
  const randomRef = useRef<() => number>(Math.random);
  const [hearts, setHearts] = useState<number[]>([]);

  const mood: PetMood = useMemo(() => moodLevelOf(vitals), [vitals]);

  /**
   * 实际要绘制的装扮 = 真实装备 + 试穿覆盖（试穿优先）。
   * 这里不修改任何持久化数据，因此预览是绝对安全的。
   */
  const visibleParts = useMemo(() => {
    const merged: Equipment = { ...(equipped ?? {}), ...(preview ?? {}) };
    return activePartIds(merged);
  }, [equipped, preview]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const renderer = createCssPetRenderer();
    rendererRef.current = renderer;
    const unmount = renderer.mount(host);
    renderer.setMood(mood);
    return () => {
      unmount();
      rendererRef.current = undefined;
    };
  }, []); // 只挂载一次

  /** 心情变化时更新渲染器 */
  useEffect(() => {
    rendererRef.current?.setMood(mood);
  }, [mood]);

  /** 装扮变化时更新叠加层（含试穿） */
  useEffect(() => {
    const visuals = resolveAccessories(visibleParts, resolveAccessoryVisual);
    rendererRef.current?.setAccessories(visuals);
  }, [visibleParts]);

  /** 事件动作（完成待办 → 欢呼等） */
  useEffect(() => {
    if (!eventAnimation) return;
    rendererRef.current?.play({ animation: eventAnimation });
  }, [eventAnimation]);

  /** 空闲随机动作：8–20 秒一次（PRD AC-6.2.5 ①） */
  useEffect(() => {
    let timer = 0;
    const schedule = (): void => {
      const delay = 8000 + Math.floor(randomRef.current() * 12_000);
      timer = window.setTimeout(() => {
        const animation = resolvePetAction(
          vitals,
          { animation: 'IDLE', priority: 0 },
          Date.now(),
          randomRef.current,
        );
        rendererRef.current?.play({ animation });
        schedule();
      }, delay);
    };
    schedule();
    return () => window.clearTimeout(timer);
  }, [vitals]);

  const handleClick = useCallback((): void => {
    const now = Date.now();
    if (now - lastPetAtRef.current < 2000) return; // 冷却中（与 config 的抚摸冷却一致）
    lastPetAtRef.current = now;

    const animation = resolvePetAction(
      vitals,
      { animation: 'PET_REACTION', priority: 2 },
      now,
      randomRef.current,
    );
    rendererRef.current?.play({ animation });

    const id = now;
    setHearts((prev) => [...prev, id]);
    window.setTimeout(() => setHearts((prev) => prev.filter((h) => h !== id)), 900);

    onPet();
  }, [vitals, onPet]);

  const dimension = size === 'lg' ? 'w-36 h-36' : 'w-28 h-28';

  return (
    <div className="flex flex-col items-center">
      <div className="relative">
        {/* 交互元素必须是 button（NFR-5.1），因此用真实按钮承载抚摸 */}
        <button
          type="button"
          onClick={handleClick}
          aria-label={`抚摸${name}`}
          className={[
            'relative rounded-full transition',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-deep focus-visible:ring-offset-2',
            'hover:brightness-105 active:scale-[0.98]',
            dimension,
          ].join(' ')}
        >
          <div ref={hostRef} className="pointer-events-none absolute inset-0 flex items-end justify-center" />
        </button>

        {hearts.map((id) => (
          <span
            key={id}
            aria-hidden="true"
            className="pointer-events-none absolute -top-2 left-1/2 -translate-x-1/2 animate-heart-float text-lg"
          >
            💛
          </span>
        ))}
      </div>

      <div className="mt-2 flex items-center gap-2">
        <span className="text-sm font-medium text-ink-800">{name}</span>
        {onOpenShop ? (
          <button
            type="button"
            onClick={onOpenShop}
            className="rounded-lg border border-ink-300 px-2 py-0.5 text-xs text-ink-600 transition hover:bg-ink-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-deep"
          >
            商城
          </button>
        ) : null}
      </div>
    </div>
  );
}

/** 渲染器技术实现的如实说明（供「关于」页与设置项使用） */
export function rendererDisclosure(renderer: PetRenderer | undefined): string {
  if (!renderer) return '宠物渲染器尚未就绪。';
  return describeRenderer(renderer.capabilities());
}

export { resolveAccessoryVisual };
