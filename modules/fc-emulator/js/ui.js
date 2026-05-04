'use strict';

import { SCREEN_WIDTH, SCREEN_HEIGHT, BUTTON_NAMES, CORE_DEFS, codeToLabel } from './config.js';

/**
 * All DOM manipulation, overlays, toolbars, panels.
 * Caches element references and provides clean methods.
 */
export class UI {
    // ── Cached DOM elements ──
    #els = {};

    constructor() {
        this.#cacheElements();
    }

    #$(id) { return document.getElementById(id); }
    #cacheElements() {
        const ids = [
            'loading-overlay', 'loading-text', 'loading-sub', 'loading-spinner', 'loading-core-btn',
            'core-picker-modal', 'picker-title', 'picker-sub', 'core-picker-list',
            'selector-ui', 'core-selector', 'resume-btn', 'rom-pick-btn',
            'game-screen', 'screen', 'retroarch-canvas-container', 'canvas-container',
            'core-label-text', 'core-badge', 'scale-display', 'fullscreen-btn',
            'keymap-panel', 'keymap-list', 'top-toolbar',
        ];
        for (const id of ids) this.#els[id] = this.#$(id);
    }

    // ═══════════════ Loading Overlay ═══════════════

    showLoading(text, sub) {
        this.#els['loading-text'].textContent = text || '正在加载...';
        this.#els['loading-sub'].textContent = sub || '';
        this.#els['loading-spinner'].style.display = 'block';
        this.#els['loading-overlay'].classList.remove('hidden');
        this.#els['loading-core-btn'].classList.add('hidden');
    }

    hideLoading() {
        this.#els['loading-overlay'].classList.add('hidden');
        this.#els['loading-core-btn'].classList.add('hidden');
    }

    showLoadingError(text, sub) {
        this.#els['loading-spinner'].style.display = 'none';
        this.#els['loading-text'].textContent = text;
        this.#els['loading-sub'].textContent = sub;
        this.#els['loading-core-btn'].classList.remove('hidden');
    }

    showLoadingCoreBtn() {
        this.#els['loading-core-btn'].classList.remove('hidden');
    }

    // ═══════════════ Screen Switching ═══════════════

    showGameScreen() {
        this.#els['selector-ui'].classList.add('hidden');
        this.#els['game-screen'].classList.remove('hidden');
    }

    showSelectorScreen() {
        this.#els['game-screen'].classList.add('hidden');
        this.#els['selector-ui'].classList.remove('hidden');
    }

    showGameAndLoading(text, sub) {
        this.showGameScreen();
        this.showLoading(text, sub);
    }

    // ═══════════════ Resume Button ═══════════════

    showResumeButton(text) {
        this.#els['resume-btn'].textContent = '▶️ 继续: ' + text;
        this.#els['resume-btn'].classList.remove('hidden');
    }

    hideResumeButton() {
        this.#els['resume-btn'].classList.add('hidden');
    }

    // ═══════════════ Core Indicator & Canvas ═══════════════

    updateCoreIndicator(core) {
        this.#els['core-label-text'].textContent = core.name;
    }

    switchCanvasDisplay(core) {
        if (core.type === 'jsnes') {
            this.#els['screen'].style.display = 'block';
            this.#els['retroarch-canvas-container'].style.display = 'none';
        } else {
            this.#els['screen'].style.display = 'none';
            this.#els['retroarch-canvas-container'].style.display = 'block';
        }
    }

    // ═══════════════ Scale ═══════════════

    #currentScale = 1.5;

    get scale() { return this.#currentScale; }

    changeScale(d) {
        this.#currentScale = Math.max(0.5, Math.min(5, this.#currentScale + d));
        this.updateScale();
    }

    updateScale() {
        const isFs = this.#els['game-screen'].classList.contains('game-fullscreen');
        const container = this.#els['canvas-container'];
        if (isFs) {
            // Fullscreen: let CSS max-width/max-height handle sizing
            container.style.width = '';
            container.style.height = '';
        } else {
            // Normal mode: scale by multiplying base 512px
            const baseW = 512;
            const baseH = 384; // 4:3
            container.style.width = Math.round(baseW * this.#currentScale) + 'px';
            container.style.height = Math.round(baseH * this.#currentScale) + 'px';
        }
        this.#els['scale-display'].textContent = this.#currentScale + 'x';
    }

    // ═══════════════ Fullscreen ═══════════════

    toggleFullScreen() {
        const screen = this.#els['game-screen'];
        const btn = this.#els['fullscreen-btn'];
        const entering = !screen.classList.contains('game-fullscreen');
        screen.classList.toggle('game-fullscreen');
        btn.textContent = entering ? '📺 退出' : '📺 全屏';

        if (entering) {
            try { screen.orientation?.lock?.('landscape'); } catch {}
        } else {
            try { screen.orientation?.unlock?.(); } catch {}
        }
        this.updateScale();
    }

    resetFullScreen() {
        this.#els['game-screen'].classList.remove('game-fullscreen');
        this.#els['fullscreen-btn'].textContent = '📺 全屏';
    }

    // ═══════════════ Keymap Panel ═══════════════

    #keymapPanelVisible = false;

    get isKeymapPanelVisible() { return this.#keymapPanelVisible; }

    toggleKeymapPanel() {
        this.#keymapPanelVisible = !this.#keymapPanelVisible;
        this.#els['keymap-panel'].classList.toggle('show', this.#keymapPanelVisible);
        if (this.#keymapPanelVisible) this.onRenderKeymapPanel?.();
    }

    hideKeymapPanel() {
        this.#keymapPanelVisible = false;
        this.#els['keymap-panel'].classList.remove('show');
    }

    // ═══════════════ Core Selector (launcher page) ═══════════════

    #selectedCoreId = 'auto';

    get selectedCoreId() { return this.#selectedCoreId; }

    renderCoreSelector() {
        const container = this.#els['core-selector'];
        container.innerHTML = '';
        container.appendChild(this.#createCoreOption('auto', '🤖 自动检测', '按优先级依次尝试所有核心', true));
        for (const c of CORE_DEFS) {
            container.appendChild(this.#createCoreOption(c.id, c.name, c.desc, false));
        }
    }

    #createCoreOption(id, name, desc, isSelected) {
        const div = document.createElement('div');
        div.className = 'core-option' + (isSelected ? ' selected' : '');
        div.dataset.coreId = id;
        div.innerHTML = `<div class="core-radio"></div><div class="core-info"><div class="core-name">${name}</div><div class="core-desc">${desc}</div></div>`;
        div.addEventListener('click', () => {
            this.#els['core-selector'].querySelectorAll('.core-option').forEach(el => el.classList.remove('selected'));
            div.classList.add('selected');
            this.#selectedCoreId = id;
        });
        return div;
    }

    // ═══════════════ Core Picker Modal ═══════════════

    #pickerReturnTo = 'game';

    showCorePickerModal(returnTo, coreManager) {
        this.#pickerReturnTo = returnTo || 'game';
        const modal = this.#els['core-picker-modal'];
        const list = this.#els['core-picker-list'];

        const isFromLoading = this.#pickerReturnTo === 'loading';
        this.#els['picker-title'].textContent = isFromLoading ? '选择模拟核心' : '切换模拟核心';
        this.#els['picker-sub'].textContent = isFromLoading
            ? '自动检测失败，请选择一个核心尝试'
            : '选择一个核心替换当前运行的核心';

        list.innerHTML = '';
        for (const c of CORE_DEFS) {
            const opt = document.createElement('div');
            opt.className = 'core-picker-option';
            opt.innerHTML = `<div class="core-radio"></div><div class="core-info"><div class="core-name">${c.name}</div><div class="core-desc">${c.desc}</div></div>`;
            opt.addEventListener('click', async () => {
                modal.classList.add('hidden');
                this.showLoading('正在加载核心...', c.name);
                try {
                    if (isFromLoading) await coreManager.retryWithCore(c);
                    else await coreManager.switchCore(c);
                } catch (e) {
                    console.error(`Core ${c.name} failed:`, e);
                    if (isFromLoading) {
                        this.showCorePickerModal(returnTo, coreManager);
                    } else {
                        this.showLoadingCoreBtn();
                    }
                }
            });
            list.appendChild(opt);
        }
        modal.classList.remove('hidden');
    }

    cancelCorePicker() {
        this.#els['core-picker-modal'].classList.add('hidden');
        if (this.#pickerReturnTo === 'loading') {
            this.#els['loading-overlay'].classList.remove('hidden');
            this.#els['loading-core-btn'].classList.remove('hidden');
        }
    }

    showCoreSwitcher(coreManager) {
        if (coreManager.isRunning) coreManager.core?.stop();
        this.showCorePickerModal('game', coreManager);
    }

    // ═══════════════ Callbacks ═══════════════
    onRenderKeymapPanel = null;

    // ═══════════════ Window Resize ═══════════════

    handleResize() {
        if (this.#els['game-screen'].classList.contains('game-fullscreen')) this.updateScale();
    }
}
