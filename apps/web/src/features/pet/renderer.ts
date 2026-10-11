/**
 * 宠物渲染器接口与降级实现。
 *
 * 设计动机（ADR-006 与 PRD 15.1 的许可约束）：
 * Live2D 模型选型存在**外部依赖**（许可允许修改 + 有可切换部件 + 体积 ≤8MB），
 * 在模型确定之前不应该让宠物功能整体停摆。因此把「渲染」抽象成接口：
 *
 * - `PixiLive2DRenderer`（计划中）：真实的 Live2D 渲染，需要模型资源
 * - `CssPetRenderer`（本文件的默认实现）：零依赖的 SVG/CSS 表现，
 *   完整支持抚摸、状态映射、**装扮叠加与试穿预览**
 *
 * ⚠️ 诚实说明：默认实现是 SVG 表现，不是 Live2D。UI 上不得声称是 Live2D。
 * （AGENTS.md 原则 1 的同类约束：不假装有自己没有的能力。）
 *
 * ── 为什么用 SVG 而不是 CSS 拼形状 ──────────────────────────
 * 装扮必须与身体**严格对齐**（例如蝴蝶结要在两只耳朵正中间）。
 * CSS 拼形状只能靠反复试坐标；SVG 有确定坐标系，坐标可以推导：
 * 每个 SVG 单位 = 0.01rem，身体盒在 130×130 的 viewBox 里居中。
 * 于是「身体盒 = x 32.5–97.5, y 35–95」「两耳中点 = (65, 46)」都是算得出来的。
 * 改任何一个配件的形状时，请沿用这套坐标系。
 */
import type { AccessoryTrait, EquipSlot, PetAnimation, PetMood } from '@petfocus/shared';

/** 渲染器需要知道的、关于一件装扮的全部信息 */
export interface AccessoryVisual {
  id: string;
  slot: EquipSlot;
  trait: AccessoryTrait;
}

/** 由 UI 层注入：把装扮 id 解析成可绘制信息 */
export type AccessoryResolver = (itemId: string) => AccessoryVisual | undefined;

export interface PetRendererCapabilities {
  kind: 'css' | 'live2d';
  supportsGaze: boolean;
  supportsAccessoryOverlay: boolean;
  requiresAssets: boolean;
}

export interface PlayOptions {
  animation: PetAnimation;
  durationMs?: number;
}

export interface PetRenderer {
  capabilities(): PetRendererCapabilities;
  mount(container: HTMLElement): () => void;
  play(options: PlayOptions): void;
  setMood(mood: PetMood): void;
  setAccessories(items: ReadonlyArray<AccessoryVisual>): void;
  isReady(): boolean;
}

export const ANIMATION_DURATION_MS: Record<PetAnimation, number> = {
  IDLE: 1200,
  BLINK: 200,
  LOOK_AROUND: 1600,
  YAWN: 1400,
  TAIL_WAG: 1000,
  PET_REACTION: 900,
  CHEER: 1200,
  EAT: 1600,
  WILT: 2000,
  DRESS_CHANGE: 800,
};

export const ANIMATION_CLASS: Record<PetAnimation, string> = {
  IDLE: 'animate-pet-idle',
  BLINK: 'animate-pet-blink',
  LOOK_AROUND: 'animate-pet-look',
  YAWN: 'animate-pet-yawn',
  TAIL_WAG: 'animate-pet-wag',
  PET_REACTION: 'animate-pet-reaction',
  CHEER: 'animate-pet-cheer',
  EAT: 'animate-pet-eat',
  WILT: 'animate-pet-wilt',
  DRESS_CHANGE: 'animate-pet-dress',
};

/**
 * 配件的 DOM 层级：背景在最下，头饰在最上。
 * 注意「背影」与「前景」由 `BACKGROUND` 一个槽位区分，其余都盖在身体之上。
 */
const SLOT_LAYER: Record<EquipSlot, number> = {
  BACKGROUND: 0,
  BODY: 2,
  HAND: 3,
  FACE: 4,
  HEAD: 5,
};

/** 每个 trait 对应的 CSS 类名（形状定义在 pet-renderer.css 里，以 SVG 元素为单位） */
function traitClass(trait: AccessoryTrait): string {
  return `acc acc-${trait.toLowerCase().replace(/_/g, '-')}`;
}

/**
 * 各配件的 SVG 形状。
 *
 * 坐标系：130×130，每个单位 = 0.01rem；身体盒（65×60 单位）居中于 (65, 65)。
 * 关键锚点（改动时请对照）：
 * - 身体盒：x 32.5–97.5，y 35–95
 * - 左耳圆心 (39, 46)，右耳圆心 (91, 46)，半径 9.5
 * - 两耳中点（蝴蝶结位置）(65, 46)
 * - 面部中心 (65, 60)，身体底部 y = 95
 */
const ACCESSORY_SHAPES: Record<AccessoryTrait, string> = {
  /** 蝴蝶结：结心落在两耳正中间 (65, 46) */
  BOW: `
    <path class="bow-loop" d="M63 46 L44 37 Q40 46 44 55 Z" />
    <path class="bow-loop" d="M67 46 L86 37 Q90 46 86 55 Z" />
    <rect class="bow-knot" x="60.5" y="40.5" width="9" height="11" rx="3" />
  `,

  /** 草帽：帽檐盖住头顶，帽顶向上鼓出（会略超出身体盒，靠 viewBox 容纳） */
  HAT_STRAW: `
    <ellipse class="hat-brim" cx="65" cy="26" rx="38" ry="8" />
    <path class="hat-dome" d="M47 26 Q48 3 65 3 Q82 3 83 26 Z" />
    <ellipse class="hat-band" cx="65" cy="25" rx="18" ry="4.5" />
  `,

  /** 发光皇冠：三尖造型 + 光晕 */
  CROWN: `
    <path class="crown-body" d="M49 32 L53 12 L59 23 L65 8 L71 23 L77 12 L81 32 Z" />
    <circle class="crown-gem" cx="65" cy="26" r="2.6" />
    <circle class="crown-gem" cx="55" cy="27" r="1.8" />
    <circle class="crown-gem" cx="75" cy="27" r="1.8" />
  `,

  /** 小手套：身体两侧各一只手 */
  GLOVES: `
    <circle class="glove" cx="27" cy="72" r="9" />
    <circle class="glove" cx="103" cy="72" r="9" />
  `,

  /** 气球：飘在右侧上方，一根线牵到身体边缘 */
  BALLOON: `
    <circle class="balloon-body" cx="105" cy="26" r="14" />
    <ellipse class="balloon-shine" cx="100" cy="20" rx="4" ry="3" />
    <path class="balloon-string" d="M105 40 Q92 55 88 70" />
  `,

  /** 提灯：挂在身体左侧，带暖光 */
  LANTERN: `
    <rect class="lantern-glow" x="14" y="56" width="24" height="30" rx="8" />
    <rect class="lantern-frame" x="18" y="60" width="16" height="22" rx="3" />
    <path class="lantern-handle" d="M22 60 Q26 50 30 60" />
  `,

  /** 暖色房间：默认场景（由背景层 CSS 负责，这里返回空 */
  SCENE_ROOM: '',
};

/**
 * 纯 SVG 宠物渲染器：零依赖、离线可用、无许可约束。
 *
 * 身体与配件都在 **同一个 SVG 坐标系**里，因此：
 * - 装扮位置是推导出来的，不是试出来的
 * - 配件天然跟随身体的动画与心情姿态（同属一个变换树）
 */
export function createCssPetRenderer(): PetRenderer {
  let mood: PetMood = 'CALM';
  let ready = false;
  let root: HTMLElement | undefined;
  /** 配件挂载点：背景（铺满舞台） */
  let backHost: HTMLElement | undefined;
  /** 配件挂载点：身体之上（与身体同坐标系） */
  let frontHost: HTMLElement | undefined;
  const mounted = new Map<string, HTMLElement>();

  const applyMood = (node: HTMLElement): void => {
    if (mood === 'HAPPY') {
      node.style.filter = 'none';
      node.style.opacity = '1';
      node.dataset.mood = 'happy';
    } else if (mood === 'CALM') {
      node.style.filter = 'saturate(0.92)';
      node.style.opacity = '0.97';
      node.dataset.mood = 'calm';
    } else {
      node.style.filter = 'saturate(0.55) brightness(0.94)';
      node.style.opacity = '0.85';
      node.dataset.mood = 'wilting';
    }
  };

  const removeAccessory = (id: string): void => {
    const node = mounted.get(id);
    if (!node) return;
    node.remove();
    mounted.delete(id);
  };

  const renderAccessory = (visual: AccessoryVisual): void => {
    const isBackground = visual.slot === 'BACKGROUND';
    const host = isBackground ? backHost : frontHost;
    if (!host) return;
    removeAccessory(visual.id);

    const shape = ACCESSORY_SHAPES[visual.trait];
    const node = document.createElement('div');
    node.dataset.trait = visual.trait;
    node.dataset.slot = visual.slot;
    node.style.zIndex = String(SLOT_LAYER[visual.slot]);
    node.style.position = 'absolute';
    node.style.pointerEvents = 'none';

    if (isBackground) {
      node.className = `acc-background ${traitClass(visual.trait)}`;
      node.style.inset = '0';
      node.style.borderRadius = '1rem';
    } else {
      node.className = traitClass(visual.trait);
      // 与身体同坐标系：撑满身体盒，viewBox 更大以便容纳超出身体的配件（帽子、气球）
      node.style.inset = '-50%';
      node.innerHTML = `<svg viewBox="0 0 130 130" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${shape}</svg>`;
    }

    host.appendChild(node);
    mounted.set(visual.id, node);
  };

  return {
    capabilities: () => ({
      kind: 'css',
      supportsGaze: false,
      supportsAccessoryOverlay: true,
      requiresAssets: false,
    }),
    isReady: () => ready,

    mount(target: HTMLElement): () => void {
      const node = document.createElement('div');
      node.className = 'pet-stage';
      node.setAttribute('aria-hidden', 'true');
      // 身体：与 SVG 坐标系 1:1 对应（65 单位宽 × 60 单位高 = 6.5rem × 6rem）
      node.innerHTML = `
        <div class="pet-accessories-back" data-host="back"></div>
        <div class="pet-body">
          <div class="pet-ear pet-ear-left"></div>
          <div class="pet-ear pet-ear-right"></div>
          <div class="pet-face">
            <span class="pet-eye pet-eye-left"></span>
            <span class="pet-eye pet-eye-right"></span>
            <span class="pet-mouth"></span>
          </div>
          <div class="pet-accessories-front" data-host="front"></div>
        </div>
      `;
      applyMood(node);
      target.appendChild(node);
      root = node;
      backHost = node.querySelector<HTMLElement>('[data-host="back"]') ?? undefined;
      frontHost = node.querySelector<HTMLElement>('[data-host="front"]') ?? undefined;
      ready = true;

      return () => {
        node.remove();
        root = undefined;
        backHost = undefined;
        frontHost = undefined;
        mounted.clear();
        ready = false;
      };
    },

    play({ animation, durationMs }: PlayOptions): void {
      if (!root) return;
      const cls = ANIMATION_CLASS[animation];
      const duration = durationMs ?? ANIMATION_DURATION_MS[animation];
      root.classList.remove(cls);
      // 强制重排以重启动画（否则连续播放同一动作不会重新触发）
      void root.offsetWidth;
      root.classList.add(cls);
      window.setTimeout(() => root?.classList.remove(cls), duration);
    },

    setMood(next: PetMood): void {
      mood = next;
      if (root) applyMood(root);
    },

    setAccessories(items: ReadonlyArray<AccessoryVisual>): void {
      const keep = new Set(items.map((i) => i.id));
      for (const id of [...mounted.keys()]) {
        if (!keep.has(id)) removeAccessory(id);
      }
      const sorted = [...items].sort((a, b) => SLOT_LAYER[a.slot] - SLOT_LAYER[b.slot]);
      for (const item of sorted) renderAccessory(item);
    },
  };
}

/** 把装扮 id 列表解析成视觉信息（供 UI 传给渲染器） */
export function resolveAccessories(
  itemIds: ReadonlyArray<string>,
  resolver: AccessoryResolver,
): AccessoryVisual[] {
  const out: AccessoryVisual[] = [];
  for (const id of itemIds) {
    const visual = resolver(id);
    if (visual) out.push(visual);
  }
  return out;
}

/** 各 trait 是否需要在身体坐标系里绘制 SVG（背景类不需要） */
export function traitNeedsSvg(trait: AccessoryTrait): boolean {
  return ACCESSORY_SHAPES[trait] !== '';
}

/** 渲染器能力的如实说明（用于「关于」页与调试面板） */
export function describeRenderer(capabilities: PetRendererCapabilities): string {
  if (capabilities.kind === 'live2d') {
    return capabilities.supportsAccessoryOverlay
      ? 'Live2D 渲染，装扮通过模型部件或叠加层实现。'
      : 'Live2D 渲染。';
  }
  return '当前使用内置的 SVG 宠物表现（非 Live2D），装扮以同坐标系叠加绘制，支持试穿预览。';
}
