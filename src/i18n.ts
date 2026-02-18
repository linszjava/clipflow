import { ref } from 'vue';

// 语言类型
export type Lang = 'zh' | 'en';

// 全局语言状态
const currentLang = ref<Lang>((localStorage.getItem('quicksnap-lang') as Lang) || 'zh');

// 翻译字典
const messages: Record<Lang, Record<string, string>> = {
    zh: {
        // 侧栏
        pages: '页面',
        settings: '设置',

        // 类型过滤器
        all: '全部',
        text: '文本',
        image: '图片',
        file: '文件',

        // 搜索
        search: '搜索...',

        // 空状态
        noClips: '暂无剪贴内容',
        noClipsHint: '复制文本、图片或文件后将自动出现在这里。',

        // 右键菜单
        copy: '复制',
        pin: '置顶',
        unpin: '取消置顶',
        delete: '删除',

        // 新建页面弹窗
        newPage: '新建页面',
        pageName: '页面名称...',
        cancel: '取消',
        create: '创建',

        // 重命名弹窗
        renamePage: '重命名页面',
        newName: '新名称...',
        save: '保存',

        // 设置页
        settingsTitle: '设置',
        generalTab: '通用',
        aboutTab: '关于',
        language: '语言 / Language',
        keepHistory: '历史保留',
        days7: '7 天',
        days30: '30 天',
        customDate: '自定义日期',
        forever: '永不删除',
        clearAll: '立刻清除所有记录',
        deleteBeforeDate: '删除此日期之前的记录',
        storagePath: '存储位置',
        change: '更改...',
        reset: '重置',
        openInFinder: '📂 在 Finder 中打开',

        // 清除确认
        clearConfirmTitle: '确认清除',
        clearConfirmMsg: '此操作将永久删除所有剪贴板记录（已置顶的除外），且不可恢复。',
        confirmDelete: '确认删除',

        // 关于
        version: '版本',
        description: '一款优雅的剪贴板管理工具',
        builtWith: 'Built with Tauri + Vue 3',

        // Clip 卡片
        textLabel: '文本',
        imageLabel: '图片',
        fileLabel: '文件',
    },
    en: {
        // Sidebar
        pages: 'Pages',
        settings: 'Settings',

        // Type Filters
        all: 'All',
        text: 'Text',
        image: 'Image',
        file: 'File',

        // Search
        search: 'Search...',

        // Empty State
        noClips: 'No clips yet',
        noClipsHint: 'Copy text, images, or files to see them here.',

        // Context Menu
        copy: 'Copy',
        pin: 'Pin',
        unpin: 'Unpin',
        delete: 'Delete',

        // New Page Dialog
        newPage: 'New Page',
        pageName: 'Page name...',
        cancel: 'Cancel',
        create: 'Create',

        // Rename Dialog
        renamePage: 'Rename Page',
        newName: 'New name...',
        save: 'Save',

        // Settings
        settingsTitle: 'Settings',
        generalTab: 'General',
        aboutTab: 'About',
        language: 'Language',
        keepHistory: 'Keep History',
        days7: '7 Days',
        days30: '30 Days',
        customDate: 'Custom Date',
        forever: 'Forever',
        clearAll: 'Clear All Records Now',
        deleteBeforeDate: 'Delete records before this date',
        storagePath: 'Storage Location',
        change: 'Change...',
        reset: 'Reset',
        openInFinder: '📂 Open in Finder',

        // Clear Confirm
        clearConfirmTitle: 'Confirm Clear',
        clearConfirmMsg: 'This will permanently delete all clipboard records (except pinned ones). This action cannot be undone.',
        confirmDelete: 'Confirm Delete',

        // About
        version: 'Version',
        description: 'An elegant clipboard management tool',
        builtWith: 'Built with Tauri + Vue 3',

        // Clip card
        textLabel: 'TEXT',
        imageLabel: 'IMAGE',
        fileLabel: 'FILE',
    },
};

// Composable
export function useI18n() {
    const t = (key: string): string => {
        return messages[currentLang.value]?.[key] || messages['zh']?.[key] || key;
    };

    const setLang = (lang: Lang) => {
        currentLang.value = lang;
        localStorage.setItem('quicksnap-lang', lang);
    };

    return {
        lang: currentLang,
        t,
        setLang,
    };
}
