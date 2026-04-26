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

vi.mock('@tauri-apps/plugin-clipboard-manager', () => ({
  writeText: vi.fn(async () => undefined),
}));

vi.mock('@tauri-apps/plugin-dialog', () => ({
  message: vi.fn(async () => undefined),
}));

describe('snippetStore', () => {
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

  it('unlockPage 在密码正确时应解锁页面', async () => {
    const { useSnippetStore } = await import('./snippetStore');
    const store = useSnippetStore();
    store.pages = [{ id: 'p1', name: 'Secure', rank: 0, created_at: '', password: '1234' }];

    const ok = store.unlockPage('p1', '1234');

    expect(ok).toBe(true);
    expect(store.unlockedPages.has('p1')).toBe(true);
  });

  it('setPagePassword 应更新数据库并移除解锁状态', async () => {
    const { useSnippetStore } = await import('./snippetStore');
    const store = useSnippetStore();
    store.db = dbMock as never;
    store.unlockedPages.add('p1');
    vi.spyOn(store, 'loadPages').mockResolvedValue();

    await store.setPagePassword('p1', 'new-pass');

    expect(dbMock.execute).toHaveBeenCalledWith(
      'UPDATE snippet_pages SET password = $1 WHERE id = $2',
      ['new-pass', 'p1'],
    );
    expect(store.unlockedPages.has('p1')).toBe(false);
  });

  it('toggleHiddenCol 应在显示与隐藏间切换并持久化', async () => {
    const { useSnippetStore } = await import('./snippetStore');
    const store = useSnippetStore();

    store.toggleHiddenCol('page-1', 2);
    expect(store.hiddenCols['page-1']).toEqual([2]);
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      'clipflow_hiddenCols',
      JSON.stringify({ 'page-1': [2] }),
    );

    store.toggleHiddenCol('page-1', 2);
    expect(store.hiddenCols['page-1']).toEqual([]);
  });
});
