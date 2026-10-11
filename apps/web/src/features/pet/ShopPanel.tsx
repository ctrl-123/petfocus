import { useState } from 'react';
import {
  CATEGORY_LABELS,
  SLOT_LABELS,
  activePartIds,
  isEquippable,
  itemsByCategory,
  mergeEquipment,
  previewEquip,
  type Equipment,
  type InventoryLike,
  type PetMood,
  type PetVitals,
  type ShopCategory,
  type ShopItemDef,
} from '@petfocus/shared';
import { Button } from '../../components/Button.tsx';
import { PetStage } from './PetStage.tsx';
import { purchaseDecisionFor } from './usecases.ts';

/** 装扮分类排在最前：它是商城里最有吸引力的一类 */
const CATEGORY_ORDER: ShopCategory[] = ['OUTFIT', 'FOOD', 'ITEM', 'FURNITURE'];

interface ShopPanelProps {
  balance: number;
  inventory: ReadonlyArray<InventoryLike>;
  equipped: Equipment;
  vitals: PetVitals;
  petName: string;
  mood: PetMood;
  feedback: string | undefined;
  onPurchase: (itemId: string) => Promise<boolean>;
  onFeed: (itemId: string) => Promise<void>;
  onEquip: (itemId: string) => Promise<{ ok: boolean; message: string }>;
  onClose: () => void;
}

/**
 * 商城面板（AC-6.3.2–6.3.4）。
 *
 * ⚠️ 这个文件**必须独立于 PetPanels.tsx**：
 * 首页静态引用 PetPanel，而商城是按需加载的。若两者在同一文件里，
 * Vite 会把整个模块算作静态依赖，动态 import 就无法拆块（体积预算会失守）。
 *
 * 关键设计：**装扮可试穿预览**。预览是纯显示层的覆盖
 * （`previewEquip` + `mergeEquipment`），不消耗金币、不写入背包、不改变拥有状态。
 */
export function ShopPanel({
  balance,
  inventory,
  equipped,
  vitals,
  petName,
  mood,
  feedback,
  onPurchase,
  onFeed,
  onEquip,
  onClose,
}: ShopPanelProps): JSX.Element {
  const [category, setCategory] = useState<ShopCategory>('OUTFIT');
  const [confirming, setConfirming] = useState<ShopItemDef | undefined>(undefined);
  const [trying, setTrying] = useState<ShopItemDef | undefined>(undefined);
  const [equipHint, setEquipHint] = useState<string | undefined>(undefined);

  const items = itemsByCategory(category);
  const ownedCount = (itemId: string): number =>
    inventory.find((i) => i.itemId === itemId)?.quantity ?? 0;

  const previewEquipment: Equipment | undefined = trying ? previewEquip(trying) : undefined;
  const mergedPreview = mergeEquipment(equipped, previewEquipment);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-16 pt-6">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-ink-900">宠物商城</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-ink-500">
            金币 <span className="font-semibold tabular-nums text-amber-deep">{balance}</span>
          </span>
          <Button variant="ghost" size="sm" onClick={onClose}>
            返回
          </Button>
        </div>
      </header>

      <div role="tablist" aria-label="商品分类" className="mb-4 flex flex-wrap gap-2">
        {CATEGORY_ORDER.map((item) => (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={category === item}
            onClick={() => setCategory(item)}
            className={[
              'rounded-lg px-3 py-1.5 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-deep',
              category === item
                ? 'bg-amber-base text-ink-900'
                : 'border border-ink-300 text-ink-600 hover:bg-ink-100',
            ].join(' ')}
          >
            {CATEGORY_LABELS[item]}
          </button>
        ))}
      </div>

      {category === 'OUTFIT' ? (
        <p className="mb-3 rounded-lg bg-amber-soft/20 px-3 py-2 text-xs text-ink-600">
          想看效果就点「试穿」——预览不会花掉任何金币，也不会记入你的拥有列表。
        </p>
      ) : null}

      {feedback ? (
        <p aria-live="polite" className="mb-3 rounded-lg bg-amber-soft/25 p-3 text-sm text-ink-700">
          {feedback}
        </p>
      ) : null}

      {equipHint ? (
        <p aria-live="polite" className="mb-3 rounded-lg bg-moss-soft/30 p-3 text-sm text-moss-deep">
          {equipHint}
        </p>
      ) : null}

      <ul className="space-y-2">
        {items.map((item) => {
          const decision = purchaseDecisionFor(item, balance, inventory);
          const owned = ownedCount(item.id);
          const isEquipped = activePartIds(equipped).includes(item.id);
          const isConsumable = item.category === 'FOOD' || item.category === 'ITEM';
          const canTry = isEquippable(item) && item.modelCompat !== 'NONE';
          const isTrying = trying?.id === item.id;

          return (
            <li key={item.id} className="rounded-card bg-white/80 p-3 ring-1 ring-ink-200">
              <div className="flex items-start gap-3">
                <span aria-hidden="true" className="text-2xl">
                  {item.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-ink-900">{item.name}</span>
                    {item.slot ? (
                      <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[11px] text-ink-500">
                        {SLOT_LABELS[item.slot]}
                      </span>
                    ) : null}
                    {item.modelCompat === 'PARTIAL' ? (
                      <span className="rounded-full bg-amber-soft/30 px-2 py-0.5 text-[11px] text-amber-deep">
                        通过叠加层适配
                      </span>
                    ) : null}
                    {item.modelCompat === 'NONE' ? (
                      <span className="rounded-full bg-clay-soft/30 px-2 py-0.5 text-[11px] text-clay-deep">
                        暂不适配当前模型
                      </span>
                    ) : null}
                    {owned > 0 ? (
                      <span className="rounded-full bg-moss-soft/40 px-2 py-0.5 text-[11px] text-moss-deep">
                        已拥有 ×{owned}
                      </span>
                    ) : null}
                    {isEquipped ? (
                      <span className="rounded-full bg-amber-base/30 px-2 py-0.5 text-[11px] text-amber-deep">
                        使用中
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm text-ink-500">{item.description}</p>
                </div>

                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="text-sm font-semibold tabular-nums text-amber-deep">
                    {item.price === 0 ? '默认拥有' : `${item.price} 币`}
                  </span>
                  {canTry ? (
                    <Button
                      variant="outline"
                      size="sm"
                      aria-pressed={isTrying}
                      onClick={() => setTrying(isTrying ? undefined : item)}
                    >
                      {isTrying ? '结束试穿' : '试穿'}
                    </Button>
                  ) : null}
                  {item.price > 0 ? (
                    <Button size="sm" disabled={!decision.allowed} onClick={() => setConfirming(item)}>
                      {decision.allowed
                        ? '购买'
                        : decision.rejection === 'INSUFFICIENT_COIN'
                          ? '金币不足'
                          : '不可购买'}
                    </Button>
                  ) : null}
                  {isConsumable && owned > 0 ? (
                    <Button variant="outline" size="sm" onClick={() => void onFeed(item.id)}>
                      使用
                    </Button>
                  ) : null}
                  {item.slot !== undefined && owned > 0 && !isEquipped ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        void (async () => {
                          const result = await onEquip(item.id);
                          setEquipHint(result.message);
                          window.setTimeout(() => setEquipHint(undefined), 4000);
                        })();
                      }}
                    >
                      穿上
                    </Button>
                  ) : null}
                </div>
              </div>

              {!decision.allowed && decision.rejection === 'INSUFFICIENT_COIN' ? (
                <p className="mt-2 text-xs text-clay-deep">{decision.message}</p>
              ) : null}
            </li>
          );
        })}
      </ul>

      {trying ? (
        <TrialPanel
          item={trying}
          petName={petName}
          vitals={vitals}
          mood={mood}
          mergedEquipment={mergedPreview}
          decision={purchaseDecisionFor(trying, balance, inventory)}
          ownedCount={ownedCount(trying.id)}
          balance={balance}
          onBuy={() => setConfirming(trying)}
          onEquipNow={() => {
            void (async () => {
              const result = await onEquip(trying.id);
              setEquipHint(result.message);
              if (result.ok) setTrying(undefined);
            })();
          }}
          onClose={() => setTrying(undefined)}
        />
      ) : null}

      {confirming ? (
        <PurchaseConfirm
          item={confirming}
          balance={balance}
          inventory={inventory}
          onCancel={() => setConfirming(undefined)}
          onConfirm={() => {
            void (async () => {
              await onPurchase(confirming.id);
              setConfirming(undefined);
            })();
          }}
        />
      ) : null}
    </div>
  );
}

interface TrialPanelProps {
  item: ShopItemDef;
  petName: string;
  vitals: PetVitals;
  mood: PetMood;
  mergedEquipment: Equipment;
  decision: ReturnType<typeof purchaseDecisionFor>;
  ownedCount: number;
  balance: number;
  onBuy: () => void;
  onEquipNow: () => void;
  onClose: () => void;
}

/** 试穿预览面板：固定在页面底部，换装即时生效 */
function TrialPanel({
  item,
  petName,
  vitals,
  mood,
  mergedEquipment,
  decision,
  ownedCount,
  balance,
  onBuy,
  onEquipNow,
  onClose,
}: TrialPanelProps): JSX.Element {
  const owned = ownedCount > 0;
  return (
    <div
      role="region"
      aria-label={`试穿预览：${item.name}`}
      className="fixed inset-x-0 bottom-0 z-40 animate-fade-up border-t border-ink-200 bg-white/95 backdrop-blur"
    >
      <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-4 px-4 py-3">
        <div className="shrink-0">
          <PetStage
            vitals={vitals}
            name={petName}
            equipped={mergedEquipment}
            onPet={() => undefined}
            size="sm"
          />
        </div>

        <div className="min-w-[12rem] flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium text-ink-900">正在试穿：{item.name}</span>
            <span className="rounded-full bg-amber-base/30 px-2 py-0.5 text-[11px] text-amber-deep">
              仅预览
            </span>
          </div>
          <p className="mt-1 text-xs text-ink-500">
            {owned
              ? '你已拥有这件，可以直接穿上。'
              : `预览不会花掉金币。买下它需要 ${item.price} 币（当前 ${balance}）。`}
          </p>
          {mood === 'WILTING' ? (
            <p className="mt-1 text-xs text-clay-deep">它现在有点蔫，装扮效果会打折扣。</p>
          ) : null}
          {!owned && !decision.allowed ? (
            <p className="mt-1 text-xs text-clay-deep">{decision.message}</p>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          {owned ? (
            <Button size="sm" onClick={onEquipNow}>
              穿上它
            </Button>
          ) : (
            <Button size="sm" disabled={!decision.allowed} onClick={onBuy}>
              {decision.allowed ? `买下（${item.price} 币）` : '金币不足'}
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={onClose}>
            结束试穿
          </Button>
        </div>
      </div>
    </div>
  );
}

interface PurchaseConfirmProps {
  item: ShopItemDef;
  balance: number;
  inventory: ReadonlyArray<InventoryLike>;
  onCancel: () => void;
  onConfirm: () => void;
}

/** 购买二次确认：必须显示"花费 X，余额将变为 Y"（AC-6.3.4） */
function PurchaseConfirm({
  item,
  balance,
  inventory,
  onCancel,
  onConfirm,
}: PurchaseConfirmProps): JSX.Element {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="purchase-title"
        className="w-full max-w-sm rounded-card bg-white p-5 shadow-xl"
      >
        <h2 id="purchase-title" className="text-base font-semibold text-ink-900">
          买下「{item.name}」？
        </h2>
        <p className="mt-2 text-sm text-ink-600">
          {purchaseDecisionFor(item, balance, inventory).message}
        </p>
        <p className="mt-2 text-xs text-ink-400">购买后不支持退款，请确认。</p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel}>
            再想想
          </Button>
          <Button onClick={onConfirm}>确认购买</Button>
        </div>
      </div>
    </div>
  );
}
