import { describe, expect, it } from 'vitest';
import {
  diffSnapshots,
  REDACTED_VALUE,
  redactSnapshot,
} from '../src/modules/audit/diff.ts';

describe('审计快照脱敏', () => {
  it('隐藏敏感键、IP、用户代理与绝对路径，同时保留普通字段', () => {
    const result = redactSnapshot({
      username: 'admin',
      passwordHash: '$2b$12$secret',
      description: '普通说明，不应被误伤',
      profile: {
        ip: '203.0.113.9',
        userAgent: 'test-agent',
        filePath: 'C:\\genealogy\\data\\secret.db',
        city: '杭州',
      },
      notePath: '/home/app/data/source.txt',
      tokenCount: 3,
    });
    const value = result.value as Record<string, unknown>;
    const profile = value.profile as Record<string, unknown>;

    expect(result.redacted).toBe(true);
    expect(value.username).toBe('admin');
    expect(value.description).toBe('普通说明，不应被误伤');
    expect(value.passwordHash).toBe(REDACTED_VALUE);
    expect(value.notePath).toBe(REDACTED_VALUE);
    expect(value.tokenCount).toBe(3);
    expect(profile.ip).toBe(REDACTED_VALUE);
    expect(profile.userAgent).toBe(REDACTED_VALUE);
    expect(profile.filePath).toBe(REDACTED_VALUE);
    expect(profile.city).toBe('杭州');
  });

  it('对根字符串中的服务器绝对路径做隐藏', () => {
    expect(redactSnapshot('/var/log/genealogy.log')).toEqual({
      value: REDACTED_VALUE,
      redacted: true,
    });
    expect(redactSnapshot('/api/v1/audit-logs')).toEqual({
      value: '/api/v1/audit-logs',
      redacted: false,
    });
  });

  it('递归处理数组内对象，且不误伤普通名称', () => {
    const result = redactSnapshot({
      items: [
        { name: '张一', token: 'abc' },
        { name: '张二', description: '说明' },
      ],
      relationship: '父子',
      zipCode: '310000',
    });
    const value = result.value as Record<string, unknown>;
    const items = value.items as Array<Record<string, unknown>>;

    expect(result.redacted).toBe(true);
    expect(items[0]?.token).toBe(REDACTED_VALUE);
    expect(items[0]?.name).toBe('张一');
    expect(items[1]?.description).toBe('说明');
    expect(value.relationship).toBe('父子');
    expect(value.zipCode).toBe('310000');
  });
});

describe('审计快照差异', () => {
  it('识别新增、删除与修改并按路径稳定排序', () => {
    const changes = diffSnapshots(
      {
        name: '张一',
        role: 'EDITOR',
        tags: ['a', 'b'],
        profile: { city: '杭州', phone: null },
      },
      {
        name: '张一',
        role: 'REVIEWER',
        tags: ['a', 'c'],
        profile: { city: '杭州', email: 'x@example.com' },
      },
    );

    expect(changes).toEqual([
      {
        path: 'profile.email',
        kind: 'ADDED',
        before: null,
        after: 'x@example.com',
      },
      {
        path: 'profile.phone',
        kind: 'REMOVED',
        before: null,
        after: null,
      },
      {
        path: 'role',
        kind: 'CHANGED',
        before: 'EDITOR',
        after: 'REVIEWER',
      },
      {
        path: 'tags',
        kind: 'CHANGED',
        before: ['a', 'b'],
        after: ['a', 'c'],
      },
    ]);
  });

  it('无变化时返回空数组', () => {
    expect(
      diffSnapshots(
        { name: '张一', profile: { city: '杭州' } },
        { name: '张一', profile: { city: '杭州' } },
      ),
    ).toEqual([]);
  });

  it('处理空快照与根级字符串', () => {
    expect(diffSnapshots(null, { name: '张一' })).toEqual([
      {
        path: 'name',
        kind: 'ADDED',
        before: null,
        after: '张一',
      },
    ]);
    expect(diffSnapshots({ name: '张一' }, null)).toEqual([
      {
        path: 'name',
        kind: 'REMOVED',
        before: '张一',
        after: null,
      },
    ]);
    expect(diffSnapshots('旧值', '新值')).toEqual([
      {
        path: '$',
        kind: 'CHANGED',
        before: '旧值',
        after: '新值',
      },
    ]);
  });

  it('数组按整体比较', () => {
    const changes = diffSnapshots(
      { tags: ['a', 'b'], ids: [1, 2] },
      { tags: ['a', 'b', 'c'], ids: [1, 2] },
    );

    expect(changes).toEqual([
      {
        path: 'tags',
        kind: 'CHANGED',
        before: ['a', 'b'],
        after: ['a', 'b', 'c'],
      },
    ]);
  });

  it('对脱敏后的快照计算差异，不会通过 diff 泄露敏感值', () => {
    const before = redactSnapshot({
      role: 'EDITOR',
      passwordHash: '$2b$12$old',
    });
    const after = redactSnapshot({
      role: 'REVIEWER',
      passwordHash: '$2b$12$new',
    });
    const changes = diffSnapshots(before.value, after.value);
    const serialized = JSON.stringify(changes);

    expect(changes).toEqual([
      {
        path: 'role',
        kind: 'CHANGED',
        before: 'EDITOR',
        after: 'REVIEWER',
      },
    ]);
    expect(serialized).not.toContain('$2b$12$');
  });
});
