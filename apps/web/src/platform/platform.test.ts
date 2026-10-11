/**
 * 平台适配层单测。
 *
 * 这层最容易出的问题是「假装有能力」——所以测试重点不是功能，而是
 * **降级路径必须如实上报**：不支持时返回 false/UNSUPPORTED，绝不抛异常、绝不谎称成功。
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  createNoopFullscreen,
  createNoopNotification,
  createNoopProcessGuard,
  createNoopVisibility,
  createNoopWakeLock,
} from './adapters.ts';
import { buildCapabilityReport, createNoopPlatform, describeRestraint } from './index.ts';

describe('Noop 适配器：降级时必须安静且如实', () => {
  it('全屏：不支持、请求失败、无异常', async () => {
    const fs = createNoopFullscreen();
    assert.equal(fs.supported, false);
    assert.equal(fs.isActive(), false);
    assert.equal(await fs.request({} as HTMLElement), false);
    await fs.exit();
    const off = fs.onChange(() => undefined);
    assert.equal(typeof off, 'function');
    off();
  });

  it('可见性：恒为可见（不误报用户已离开）', () => {
    const vis = createNoopVisibility();
    assert.equal(vis.supported, false);
    assert.equal(vis.isVisible(), true);
    assert.equal(vis.hasFocus(), true);
  });

  it('通知：权限为 UNSUPPORTED，show 不抛错', async () => {
    const n = createNoopNotification();
    assert.equal(n.permission(), 'UNSUPPORTED');
    assert.equal(await n.request(), 'UNSUPPORTED');
    n.show('标题', '正文');
  });

  it('防息屏：不支持且申请失败', async () => {
    const w = createNoopWakeLock();
    assert.equal(w.supported, false);
    assert.equal(await w.acquire(), false);
    assert.equal(w.isHeld(), false);
    await w.release();
  });

  it('进程拦截：如实上报浏览器不支持（关键：绝不谎称已拦截）', async () => {
    const guard = createNoopProcessGuard();
    assert.equal(await guard.report(), 'UNSUPPORTED_BROWSER');
    assert.equal(await guard.capabilities(), undefined);
    // 这些操作必须是"无效但不报错"，否则调用方会以为拦截生效了
    await guard.pushAllowlist(['chrome.exe']);
    await guard.startSession('FOCUS');
    await guard.stopSession();
    const off = guard.onViolation(() => undefined);
    off();
  });
});

describe('buildCapabilityReport：约束等级判定', () => {
  it('增强包未连接 → 软约束', () => {
    const report = buildCapabilityReport(createNoopPlatform(), { nativeGuard: 'DISCONNECTED' });
    assert.equal(report.restraint, 'soft');
    assert.equal(report.nativeGuard, 'DISCONNECTED');
  });

  it('浏览器不支持 → 软约束', () => {
    const report = buildCapabilityReport(createNoopPlatform(), { nativeGuard: 'UNSUPPORTED_BROWSER' });
    assert.equal(report.restraint, 'soft');
  });

  it('只有增强包 CONNECTED 才算硬约束', () => {
    const report = buildCapabilityReport(createNoopPlatform(), { nativeGuard: 'CONNECTED' });
    assert.equal(report.restraint, 'hard');
  });

  it('Noop 平台下各能力如实为不支持/未授权', () => {
    const report = buildCapabilityReport(createNoopPlatform(), { nativeGuard: 'UNSUPPORTED_BROWSER' });
    assert.equal(report.fullscreen, false);
    assert.equal(report.visibility, false);
    assert.equal(report.wakeLock, false);
    assert.equal(report.notification, 'UNSUPPORTED');
    assert.ok(report.description.length > 0);
  });
});

describe('describeRestraint：文案必须如实且不含违禁表述 [AGENTS.md 原则 1 / ADR-010]', () => {
  const cases: Array<[Parameters<typeof describeRestraint>[0], Parameters<typeof describeRestraint>[1]]> = [
    ['soft', 'UNSUPPORTED_BROWSER'],
    ['soft', 'DISCONNECTED'],
    ['hard', 'CONNECTED'],
  ];

  it('硬约束明确说"已生效"', () => {
    assert.match(describeRestraint('hard', 'CONNECTED'), /硬约束已生效/);
  });

  it('软约束不得声称已拦截/已阻止', () => {
    for (const [restraint, guard] of cases) {
      const text = describeRestraint(restraint, guard);
      if (restraint === 'soft') {
        assert.ok(!/已拦截|已阻止|已屏蔽/.test(text), `软约束文案不得声称拦截：${text}`);
        assert.match(text, /软约束/);
      }
    }
  });

  it('软约束必须说清"无法阻止其他程序"', () => {
    const text = describeRestraint('soft', 'UNSUPPORTED_BROWSER');
    assert.match(text, /无法阻止/);
  });

  it('全部文案不含「防作弊」「无法破解」等承诺 [ADR-010]', () => {
    for (const [restraint, guard] of cases) {
      const text = describeRestraint(restraint, guard);
      for (const bad of ['防作弊', '无法破解', '绝对安全']) {
        assert.ok(!text.includes(bad), `文案不得含「${bad}」：${text}`);
      }
    }
  });
});
