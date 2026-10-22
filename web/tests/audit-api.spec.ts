import MockAdapter from 'axios-mock-adapter';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';
import { AUDIT_PAGE_SIZE_DEFAULT } from '@shared/constants/audit.ts';
import { fetchAuditLogs } from '@/api/audit';
import {
  ApiError,
  apiClient,
  resetApiClient,
} from '@/api/client';

let mock: MockAdapter;

function okEnvelope<T>(data: T) {
  return {
    code: 'OK',
    message: 'OK',
    data,
  };
}

function emptyPage(page = 1, pageSize = AUDIT_PAGE_SIZE_DEFAULT) {
  return {
    items: [],
    total: 0,
    page,
    pageSize,
  };
}

beforeEach(() => {
  resetApiClient();
  mock = new MockAdapter(apiClient);
});

afterEach(() => {
  mock.restore();
  resetApiClient();
});

describe('审计查询 API 客户端', () => {
  it('序列化全部筛选条件与分页参数', async () => {
    let receivedParams: unknown;

    mock.onGet('/audit-logs').reply((config) => {
      receivedParams = config.params;

      return [200, okEnvelope(emptyPage(2, 50))];
    });

    const page = await fetchAuditLogs({
      action: 'PERSON_UPDATE',
      entityType: 'Person',
      entityId: 'person-1',
      actor: 'admin',
      from: '2026-10-01T00:00:00.000Z',
      to: '2026-10-31T23:59:59.999Z',
      page: 2,
      pageSize: 50,
    });

    expect(receivedParams).toEqual({
      action: 'PERSON_UPDATE',
      entityType: 'Person',
      entityId: 'person-1',
      actor: 'admin',
      from: '2026-10-01T00:00:00.000Z',
      to: '2026-10-31T23:59:59.999Z',
      page: 2,
      pageSize: 50,
    });
    expect(page).toEqual(emptyPage(2, 50));
    expect(mock.history.get[0]?.method).toBe('get');
  });

  it('省略未设置的筛选条件并发送默认分页', async () => {
    let receivedParams: unknown;

    mock.onGet('/audit-logs').reply((config) => {
      receivedParams = config.params;

      return [200, okEnvelope(emptyPage())];
    });

    await fetchAuditLogs();

    expect(receivedParams).toEqual({
      page: 1,
      pageSize: AUDIT_PAGE_SIZE_DEFAULT,
    });
  });

  it('将无权限响应映射为带错误码的 ApiError', async () => {
    mock.onGet('/audit-logs').reply(403, {
      code: 'FORBIDDEN',
      message: '当前角色无权执行该操作。',
      data: null,
      requestId: 'req-audit-403',
    });

    const error = await fetchAuditLogs().catch(
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      code: 'FORBIDDEN',
      status: 403,
      requestId: 'req-audit-403',
      message: '当前角色无权执行该操作。',
    });
  });
});
