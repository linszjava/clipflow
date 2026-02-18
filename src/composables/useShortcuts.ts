import { ref } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { register, unregisterAll } from '@tauri-apps/plugin-global-shortcut';
import { getCurrentWindow, Window } from '@tauri-apps/api/window';

// 全局状态 — 不限于组件生命周期
const shortcuts = ref({
    capture: localStorage.getItem('quicksnap-shortcut-capture') || 'CommandOrControl+Shift+C',
    toggle: localStorage.getItem('quicksnap-shortcut-toggle') || 'CommandOrControl+Shift+V',
});
const autoCapture = ref(true);
const recordingTarget = ref<'capture' | 'toggle' | null>(null);
let registered = false;

/** 将 Tauri shortcut 格式转为人类可读格式 */
export function formatShortcut(shortcut: string): string {
    return shortcut
        .replace(/CommandOrControl/g, '⌘')
        .replace(/Shift/g, '⇧')
        .replace(/Alt/g, '⌥')
        .replace(/\+/g, ' ');
}

function startRecording(target: 'capture' | 'toggle') {
    recordingTarget.value = target;
}

function onShortcutKeyDown(e: KeyboardEvent, target: 'capture' | 'toggle') {
    if (recordingTarget.value !== target) return;

    // ESC 取消
    if (e.code === 'Escape') {
        cancelRecording();
        e.preventDefault();
        return;
    }

    e.preventDefault();
    e.stopPropagation();

    // 忽略单独的修饰键
    if (['Meta', 'Control', 'Alt', 'Shift'].includes(e.key)) return;

    const parts: string[] = [];
    if (e.metaKey || e.ctrlKey) parts.push('CommandOrControl');
    if (e.altKey) parts.push('Alt');
    if (e.shiftKey) parts.push('Shift');

    // 映射常用键名到 Tauri 格式
    // 使用 code 属性更可靠，例如 KeyP -> P, Digit1 -> 1, Slash -> Slash
    const specialMap: Record<string, string> = {
        'Space': 'Space', 'Escape': 'Escape', 'Enter': 'Enter', 'Backspace': 'Backspace',
        'Delete': 'Delete', 'Tab': 'Tab',
        'ArrowUp': 'Up', 'ArrowDown': 'Down', 'ArrowLeft': 'Left', 'ArrowRight': 'Right',
        'Minus': 'Minus', 'Equal': 'Equal', 'BracketLeft': 'BracketLeft', 'BracketRight': 'BracketRight',
        'Semicolon': 'Semicolon', 'Quote': 'Quote', 'Backquote': 'Backquote',
        'Backslash': 'Backslash', 'Comma': 'Comma', 'Period': 'Period', 'Slash': 'Slash'
    };

    let key = '';
    if (e.code in specialMap) {
        key = specialMap[e.code];
    } else if (e.code.startsWith('Key')) {
        key = e.code.slice(3);
    } else if (e.code.startsWith('Digit')) {
        key = e.code.slice(5);
    } else {
        key = e.key.toUpperCase();
    }
    parts.push(key);

    const shortcutStr = parts.join('+');
    shortcuts.value[target] = shortcutStr;
    localStorage.setItem(`quicksnap-shortcut-${target}`, shortcutStr);
    recordingTarget.value = null;

    // 重新注册快捷键
    registerShortcuts();
}

async function toggleMonitorState() {
    try {
        const isActive = await invoke<boolean>('toggle_monitor');
        autoCapture.value = isActive;
        console.log('[Shortcut] Auto-capture:', isActive ? 'ON' : 'OFF');
        return isActive;
    } catch (err) {
        console.error('[Shortcut] Failed to toggle monitor:', err);
        return autoCapture.value;
    }
}

async function registerShortcuts() {
    try {
        await unregisterAll();

        // 注册开关自动捕获快捷键
        await register(shortcuts.value.capture, async (event: any) => {
            if (event.state === 'Released') return;
            await toggleMonitorState();
        });

        // 注册窗口切换快捷键
        await register(shortcuts.value.toggle, async (event: any) => {
            if (event.state === 'Released') return;
            console.log('[Shortcut] Toggle triggered');

            try {
                // 尝试获取主窗口
                const win = (await Window.getByLabel('main')) || getCurrentWindow();
                if (!win) {
                    console.error('[Shortcut] Main window not found');
                    return;
                }

                const visible = await win.isVisible();
                console.log(`[Shortcut] Window visible: ${visible}`);

                if (visible) {
                    await win.hide();
                } else {
                    await win.show();
                    await win.setFocus();
                }
            } catch (err) {
                console.error('[Shortcut] Failed to toggle window:', err);
            }
        });

        registered = true;
        console.log('[Shortcuts] Registered:', shortcuts.value);
    } catch (e) {
        console.error('[Shortcuts] Failed to register:', e);
    }
}

async function loadMonitorState() {
    try {
        const paused = await invoke<boolean>('is_monitor_paused');
        console.log('[Shortcut] Initial State: Monitor paused =', paused);
        autoCapture.value = !paused;
    } catch (err) {
        console.error('[Shortcut] Failed to load monitor state:', err);
    }
}

/** 应用启动时调用 */
export async function initShortcuts() {
    if (registered) return;
    await loadMonitorState();
    await registerShortcuts();
}

function cancelRecording() {
    recordingTarget.value = null;
}

export function useShortcuts() {
    return {
        shortcuts,
        autoCapture,
        recordingTarget,
        formatShortcut,
        startRecording,
        cancelRecording,
        toggleMonitorState,
        onShortcutKeyDown,
        registerShortcuts,
    };
}
