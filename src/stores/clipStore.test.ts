import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

interface MockDb {
  select: ReturnType<typeof vi.fn>;
  execute: ReturnType<typeof vi.fn>;
}

const createLocalStorageMock = () => {
  const store = new Map<string, string>();
  return {
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      store.delete(key);
    }),
    clear: vi.fn(() => {
      store.clear();
    }),
  };
};

const dbMock: MockDb = {
  select: vi.fn(),
  execute: vi.fn(),
};

vi.mock('@tauri-apps/plugin-sql', () => ({
  default: {
    load: vi.fn(async () => dbMock),
  },
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async () => vi.fn()),
}));

vi.mock('@tauri-apps/plugin-clipboard-manager', () => ({
  writeText: vi.fn(async () => undefined),
}));

describe('clipStore', () => {
  let localStorageMock: ReturnType<typeof createLocalStorageMock>;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock = createLocalStorageMock();
    Object.defineProperty(globalThis, 'localStorage', {
      value: localStorageMock,
      configurable: true,
      writable: true,
    });
    setActivePinia(createPinia());
    dbMock.select.mockResolvedValue([]);
    dbMock.execute.mockResolvedValue({ rowsAffected: 1 });
  });

  it('formatLocalDate 应返回标准本地时间格式', async () => {
    const { useClipStore } = await import('./clipStore');
    const store = useClipStore();

    const result = store.formatLocalDate(new Date('2026-01-02T03:04:05'));
    expect(result).toBe('2026-01-02 03:04:05');
  });

  it('applyHistoryRetention 在 forever 模式下跳过清理', async () => {
    const { useClipStore } = await import('./clipStore');
    const store = useClipStore();
    localStorageMock.setItem('quicksnap-keep-history', '36500');

    const deleteSpy = vi.spyOn(store, 'deleteClipsBefore');
    await store.applyHistoryRetention();

    expect(deleteSpy).not.toHaveBeenCalled();
  });

  it('addClip 应执行数据库去重检查并在首次插入后刷新', async () => {
    const { useClipStore } = await import('./clipStore');
    const store = useClipStore();
    store.db = dbMock as never;
    store.capturePageId = 'inbox';

    dbMock.select.mockResolvedValueOnce([]);
    dbMock.execute.mockResolvedValue({ rowsAffected: 1 });
    const refreshSpy = vi.spyOn(store, 'refreshClips').mockResolvedValue();
    const retentionSpy = vi.spyOn(store, 'applyHistoryRetention').mockResolvedValue();

    await store.addClip('text', 'hello clip');

    expect(dbMock.select).toHaveBeenCalledWith(
      'SELECT id FROM clips WHERE content = $1 AND type = $2 ORDER BY created_at DESC LIMIT 1',
      ['hello clip', 'text'],
    );
    expect(dbMock.execute).toHaveBeenCalledTimes(1);
    expect(refreshSpy).toHaveBeenCalledTimes(1);
    expect(retentionSpy).toHaveBeenCalledTimes(1);
  });

  it('setCapturePageId 应更新状态并持久化', async () => {
    const { useClipStore } = await import('./clipStore');
    const store = useClipStore();

    store.setCapturePageId('custom-page');

    expect(store.capturePageId).toBe('custom-page');
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      'quicksnap-capture-page',
      'custom-page',
    );
  });
});
