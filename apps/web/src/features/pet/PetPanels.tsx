import {
  MAX_LEVEL,
  MOOD_LABELS,
  activePartIds,
  findShopItem,
  wiltingExplanation,
  type Equipment,
  type PetMood,
  type PetVitals,
  type ShopItemDef,
} from '@petfocus/shared';
import { PetStage } from './PetStage.tsx';

interface PetPanelProps {
  vitals: PetVitals;
  name: string;
  mood: PetMood;
  level: number;
  expToNext: number;
  balance: number;
  /** 当前穿着的装扮：首页也要显示，否则用户会以为换装没生效 */
  equipped: Equipment;
  feedback: string | undefined;
  onPet: () => void;
  onOpenShop: () => void;
}

function Meter({ label, value, tone }: { label: string; value: number; tone: string }): JSX.Element {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div>
      <div className="flex justify-between text-xs text-ink-500">
        <span>{label}</span>
        <span className="tabular-nums">{Math.round(clamped)}</span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-ink-200">
        {/* 无障碍：用 aria 表达数值，不只靠颜色（NFR-5.2） */}
        <div
          className={`h-full rounded-full ${tone}`}
          style={{ width: `${clamped}%` }}
          role="progressbar"
          aria-label={label}
          aria-valuenow={Math.round(clamped)}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>
    </div>
  );
}

/**
 * 宠物面板（首页用）。
 *
 * ⚠️ 商城不在这里——商城在 `ShopPanel.tsx`。
 * 首页静态引用本文件，而商城是按需加载的；若两者同文件，
 * Vite 会把整个模块算作静态依赖，动态 import 无法拆块，体积预算会失守。
 */
export function PetPanel({
  vitals,
  name,
  mood,
  level,
  expToNext,
  balance,
  equipped,
  feedback,
  onPet,
  onOpenShop,
}: PetPanelProps): JSX.Element {
  const wilting = mood === 'WILTING';
  const worn = activePartIds(equipped)
    .map((id) => findShopItem(id))
    .filter((item): item is ShopItemDef => item !== undefined);

  return (
    <section className="rounded-card bg-white/70 p-4 ring-1 ring-ink-200">
      <div className="flex flex-wrap items-center gap-4">
        <PetStage
          vitals={vitals}
          name={name}
          equipped={equipped}
          onPet={onPet}
          onOpenShop={onOpenShop}
        />

        <div className="min-w-[10rem] flex-1 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-ink-600">{MOOD_LABELS[mood]}</span>
            <span className="text-xs text-ink-400">
              Lv.{level} · 距下一级还需 {expToNext} 分
            </span>
          </div>
          <Meter label="心情" value={vitals.mood} tone="bg-amber-base" />
          <Meter label="饱食度" value={vitals.satiety} tone="bg-moss-base" />
          <Meter label="精力" value={vitals.energy} tone="bg-ink-400" />
          <div className="flex items-center justify-between pt-1">
            <span className="text-xs text-ink-500">金币</span>
            <span className="text-sm font-semibold tabular-nums text-amber-deep">{balance}</span>
          </div>
          {worn.length > 0 ? (
            <p className="text-xs text-ink-500">
              正在穿：
              {worn.map((item) => (
                <span key={item.id} className="ml-1">
                  {item.icon}
                  {item.name}
                </span>
              ))}
            </p>
          ) : null}
        </div>
      </div>

      {wilting ? (
        <p className="mt-3 rounded-lg bg-clay-soft/25 p-3 text-xs text-clay-deep">
          {wiltingExplanation()}
        </p>
      ) : null}

      {feedback ? (
        <p aria-live="polite" className="mt-3 rounded-lg bg-amber-soft/25 p-3 text-sm text-ink-700">
          {feedback}
        </p>
      ) : null}

      <p className="mt-3 text-[11px] text-ink-400">
        点一下它试试。等级上限 {MAX_LEVEL} 级；无论多久不来，它只会「蔫」，不会离开。
      </p>
    </section>
  );
}
