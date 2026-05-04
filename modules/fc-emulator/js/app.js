'use strict';

import { StorageManager } from './storage.js';
import { CoreManager } from './core-manager.js';
import { InputHandler } from './input-handler.js';
import { UI } from './ui.js';
import { ROMLoader } from './rom-loader.js';
import { BUTTON_NAMES, codeToLabel } from './config.js';
import { initConsoleTranslator } from './console-i18n.js';

/**
 * Main application entry point.
 * Wires all modules together, replaces all inline JS and onclick handlers.
 */
class App {
    #storage;
    #coreManager;
    #input;
    #ui;
    #romLoader;

    constructor() {
        this.#storage = new StorageManager();
        this.#coreManager = new CoreManager(this.#storage);
        this.#input = new InputHandler();
        this.#ui = new UI();
        this.#romLoader = new ROMLoader();

        this.#wireCallbacks();
        this.#bindEvents();
    }

    // ────────── Wire Module Callbacks ──────────

    #wireCallbacks() {
        // CoreManager → UI
        this.#coreManager.onShowLoading = (text, sub) => this.#ui.showLoading(text, sub);
        this.#coreManager.onHideLoading = () => this.#ui.hideLoading();
        this.#coreManager.onShowLoadingError = (text, sub) => this.#ui.showLoadingError(text, sub);
        this.#coreManager.onShowCorePicker = (returnTo) => this.#ui.showCorePickerModal(returnTo, this.#coreManager);
        this.#coreManager.onActivate = (core, romData, romName) => {
            this.#ui.switchCanvasDisplay(core);
            this.#ui.updateCoreIndicator(core);
            this.#ui.showGameScreen();
            this.#ui.updateScale();
            this.#ui.hideResumeButton();
            this.#syncCoreTurbo(core);
        };

        // Input → CoreManager
        this.#input.onButton = (port, btn, down) => {
            if (down) this.#coreManager.buttonDown(port, btn);
            else this.#coreManager.buttonUp(port, btn);
        };

        // Input keymap change → re-render keymap panel
        this.#input.onKeymapChange = () => {
            if (this.#ui.isKeymapPanelVisible) this.#renderKeymapPanel();
        };

        // UI keymap panel render callback
        this.#ui.onRenderKeymapPanel = () => this.#renderKeymapPanel();
    }

    // ────────── Sync Turbo State to JsnesCore ──────────

    #syncCoreTurbo(core) {
        if (core?.type === 'jsnes') {
            core.setTurboState(this.#input.turboMode);
            core.setTurboKeyHeld({ A: this.#input.turboKeyHeld['Turbo A'], B: this.#input.turboKeyHeld['Turbo B'] });
            core.setTurboRate(this.#input.turboRate);
        }
    }

    // ────────── Event Binding (replaces all onclick) ──────────

    #bindEvents() {
        const $ = (id) => document.getElementById(id);

        // ROM picker
        $('rom-pick-btn').addEventListener('click', (e) => { e.preventDefault(); this.#romLoader.pick(); });
        this.#romLoader.onROMLoaded = (data, name) => this.#startGame(data, name);

        // Resume
        $('resume-btn').addEventListener('click', () => this.#resumeGame());

        // Toolbar buttons
        $('back-btn').addEventListener('click', () => this.#stopGame());
        $('fullscreen-btn').addEventListener('click', () => this.#ui.toggleFullScreen());
        $('core-badge').addEventListener('click', () => this.#ui.showCoreSwitcher(this.#coreManager));

        // Scale
        document.querySelector('.scale-controls').addEventListener('click', (e) => {
            const btn = e.target.closest('.scale-btn');
            if (!btn) return;
            const delta = btn.textContent.trim() === '+' ? 0.5 : -0.5;
            this.#ui.changeScale(delta);
        });

        // Keymap panel toggle
        $('keymap-btn').addEventListener('click', () => this.#ui.toggleKeymapPanel());
        document.querySelector('.keymap-close').addEventListener('click', () => this.#ui.toggleKeymapPanel());

        // Core picker cancel
        document.querySelector('.core-picker-cancel').addEventListener('click', () => this.#ui.cancelCorePicker());

        // Loading overlay buttons
        const loadingBtns = $('loading-core-btn');
        loadingBtns.querySelector('button:first-child').addEventListener('click', () => {
            this.#ui.hideLoading();
            this.#ui.showCorePickerModal('loading', this.#coreManager);
        });
        loadingBtns.querySelector('button:last-child').addEventListener('click', () => this.#returnToLauncher());

        // Turbo rate buttons (mobile toolbar)
        document.querySelectorAll('.t-rate-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.#input.turboRate = parseInt(btn.textContent);
                document.querySelectorAll('.t-rate-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.#syncCoreTurbo(this.#coreManager.core);
            });
        });

        // Mobile turbo toggle buttons
        document.querySelectorAll('.turbo-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const active = this.#input.toggleTurbo(btn.dataset.type);
                btn.classList.toggle('active', active);
                this.#syncCoreTurbo(this.#coreManager.core);
            });
        });

        // Window resize
        window.addEventListener('resize', () => this.#ui.handleResize());

        // Init input
        this.#input.init();
    }

    // ────────── Game Lifecycle ──────────

    async #startGame(romData, romName) {
        this.#ui.showGameAndLoading('正在检测最佳核心...', '自动选择中');
        const success = await this.#coreManager.startGameWithROM(romData, romName);
        if (!success) {
            // Core picker will be shown by CoreManager
        }
    }

    async #resumeGame() {
        const success = await this.#coreManager.resumeGame();
        if (!success) {
            this.#ui.showSelectorScreen();
        }
    }

    #stopGame() {
        this.#coreManager.stopGame();
        this.#ui.showSelectorScreen();
        this.#ui.resetFullScreen();
        this.#ui.hideKeymapPanel();

        // Show resume button if there's a saved game
        if (this.#storage.hasSavedGame) {
            this.#ui.showResumeButton(this.#storage.savedRomName);
        } else {
            this.#ui.hideResumeButton();
        }
    }

    #returnToLauncher() {
        this.#coreManager.returnToLauncher();
        this.#ui.showSelectorScreen();
    }

    // ────────── Keymap Panel Rendering ──────────

    #renderKeymapPanel() {
        const list = document.getElementById('keymap-list');
        list.innerHTML = '';

        const { keymap, turboKeymap, listeningBtn, listeningTurbo } = this.#input;

        // Game buttons
        for (const btn of BUTTON_NAMES) {
            const row = document.createElement('div');
            row.className = 'keymap-row';
            const label = document.createElement('span');
            label.className = 'keymap-label';
            label.textContent = btn;
            const key = document.createElement('span');
            key.className = 'keymap-key';
            key.textContent = codeToLabel(keymap[btn]);
            if (listeningBtn === btn && !listeningTurbo) key.classList.add('listening');
            key.addEventListener('click', () => {
                this.#input.listeningBtn = btn;
                this.#input.listeningTurbo = false;
                this.#renderKeymapPanel();
            });
            row.appendChild(label);
            row.appendChild(key);
            list.appendChild(row);
        }

        // Turbo buttons section
        const sep = document.createElement('div');
        sep.style.cssText = 'border-top:1px solid rgba(0,240,255,0.2);padding:8px 0 2px;margin-top:4px;';
        const sepLabel = document.createElement('span');
        sepLabel.style.cssText = 'color:#00f0ff;font-size:0.8rem;';
        sepLabel.textContent = '连发按键';
        sep.appendChild(sepLabel);
        list.appendChild(sep);

        for (const name of Object.keys(turboKeymap)) {
            const row = document.createElement('div');
            row.className = 'keymap-row';
            const label = document.createElement('span');
            label.className = 'keymap-label';
            label.style.color = '#ff9944';
            label.textContent = name;
            const key = document.createElement('span');
            key.className = 'keymap-key';
            key.textContent = codeToLabel(turboKeymap[name]);
            if (listeningBtn === name && listeningTurbo) key.classList.add('listening');
            key.addEventListener('click', () => {
                this.#input.listeningBtn = name;
                this.#input.listeningTurbo = true;
                this.#renderKeymapPanel();
            });
            row.appendChild(label);
            row.appendChild(key);
            list.appendChild(row);
        }

        // Turbo rate selector
        const rateSep = document.createElement('div');
        rateSep.style.cssText = 'border-top:1px solid rgba(0,240,255,0.2);padding:8px 0 2px;margin-top:8px;';
        const rateLabel = document.createElement('span');
        rateLabel.style.cssText = 'color:#00f0ff;font-size:0.8rem;';
        rateLabel.textContent = '连发速率';
        rateSep.appendChild(rateLabel);
        list.appendChild(rateSep);

        const rateRow = document.createElement('div');
        rateRow.className = 'keymap-row';
        rateRow.style.cssText = 'flex-wrap:wrap;gap:4px;';
        for (const r of [5, 10, 15, 20, 30]) {
            const btn = document.createElement('button');
            btn.className = 'keymap-key t-rate-btn' + (r === this.#input.turboRate ? ' active' : '');
            btn.style.cssText = 'padding:2px 8px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);border-radius:8px;color:#ccc;font-size:0.75rem;cursor:pointer;';
            btn.textContent = r + '/s';
            const rate = r;
            btn.addEventListener('click', () => {
                this.#input.turboRate = rate;
                this.#syncCoreTurbo(this.#coreManager.core);
                this.#renderKeymapPanel();
            });
            rateRow.appendChild(btn);
        }
        list.appendChild(rateRow);
    }

    // ────────── Initialize ──────────

    init() {
        this.#ui.renderCoreSelector();

        // Check for saved game
        const saved = this.#storage.tryRestore();
        if (saved) {
            this.#ui.showResumeButton(saved.romName);
        }
    }
}

// ── Bootstrap ──
document.addEventListener('DOMContentLoaded', () => {
    initConsoleFilter();
    const app = new App();
    app.init();
});
