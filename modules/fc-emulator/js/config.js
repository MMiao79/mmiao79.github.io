'use strict';

// ==================== Constants ====================
export const SCREEN_WIDTH = 256;
export const SCREEN_HEIGHT = 240;
export const FPS = 60;
export const FRAME_TIME = 1000 / FPS;
export const BUTTON_NAMES = ['A', 'B', 'SELECT', 'START', 'UP', 'DOWN', 'LEFT', 'RIGHT'];

// ==================== Storage Keys ====================
export const STORAGE_KEYS = Object.freeze({
    ROM: 'fc_emulator_rom',
    STATE: 'fc_emulator_state',
    NAME: 'fc_emulator_rom_name',
    CORE: 'fc_emulator_core',
    CORE_PREF: 'fc_emulator_core_pref',
});

// ==================== Default Keymaps ====================
export const DEFAULT_KEYMAP = Object.freeze({
    A: 'KeyX', B: 'KeyZ', SELECT: 'ShiftRight', START: 'Enter',
    UP: 'ArrowUp', DOWN: 'ArrowDown', LEFT: 'ArrowLeft', RIGHT: 'ArrowRight',
});

export const DEFAULT_TURBO_KEYMAP = Object.freeze({
    'Turbo A': 'KeyS',
    'Turbo B': 'KeyA',
});

// ==================== Code-to-Label Mapping ====================
const CODE_LABELS = Object.freeze({
    KeyX: 'X', KeyZ: 'Z', Enter: 'Enter', ShiftRight: 'R-Shift',
    ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
    Space: 'Space', KeyC: 'C', KeyV: 'V', KeyA: 'A', KeyS: 'S',
    KeyD: 'D', KeyW: 'W', KeyQ: 'Q', KeyE: 'E', KeyR: 'R', KeyF: 'F',
    Tab: 'Tab', Backspace: 'Back', ShiftLeft: 'L-Shift',
    ControlLeft: 'L-Ctrl', ControlRight: 'R-Ctrl', AltLeft: 'L-Alt',
    AltRight: 'R-Alt', KeyN: 'N', KeyM: 'M',
});

export function codeToLabel(code) {
    return CODE_LABELS[code] || code.replace('Key', '').replace('Digit', '');
}

// ==================== Core Definitions ====================
export const CORE_DEFS = Object.freeze([
    { id: 'jsnes',    name: 'JSNES',    desc: '快速启动 · 纯JS实现',    type: 'jsnes',     priority: 0 },
    { id: 'fceumm',   name: 'FCEUMM',   desc: '兼容性最强 · Mapper丰富', type: 'retroarch', coreName: 'fceumm',   jsPath: 'lib/fceumm_libretro.js',   wasmPath: 'lib/fceumm_libretro.wasm',   priority: 1 },
    { id: 'nestopia', name: 'Nestopia', desc: '高精度模拟 · Cycle准确', type: 'retroarch', coreName: 'nestopia', jsPath: 'lib/nestopia_libretro.js', wasmPath: 'lib/nestopia_libretro.wasm', priority: 2 },
    { id: 'quicknes', name: 'QuickNES', desc: '极速运行 · 轻量核心',    type: 'retroarch', coreName: 'quicknes', jsPath: 'lib/quicknes_libretro.js', wasmPath: 'lib/quicknes_libretro.wasm', priority: 3 },
].filter(c => c.type !== 'retroarch' || typeof WebAssembly === 'object'));
