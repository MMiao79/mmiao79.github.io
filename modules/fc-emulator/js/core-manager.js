'use strict';

import { CORE_DEFS, SCREEN_WIDTH, SCREEN_HEIGHT } from './config.js';
import { StorageManager } from './storage.js';
import { JsnesCore } from './jsnes-core.js';
import { RetroArchCore } from './retroarch-core.js';

/**
 * Manages core lifecycle: creation, auto-detection, switching, state save/restore.
 * Eliminates duplicated activate-switch logic between startGameWithROM and loadWithCore.
 */
export class CoreManager {
    /** @type {EmulatorCore | null} */
    #core = null;
    #storage;
    /** @type {{ romData: any, romName: string | null }} */
    #pendingRom = { romData: null, romName: null };
    /** @type {{ romData: any, romName: string | null }} */
    #currentRom = { romData: null, romName: null };

    /** UI callbacks — set by App during initialization */
    onShowLoading = null;       // (text: string, sub?: string) => void
    onHideLoading = null;
    onShowLoadingError = null;  // (text: string, sub: string) => void
    onShowCorePicker = null;    // (returnTo: 'loading' | 'game') => void
    onActivate = null;          // (core: EmulatorCore, romData, romName) => void

    get core() { return this.#core; }
    get currentRomData() { return this.#currentRom.romData; }
    get currentRomName() { return this.#currentRom.romName; }
    get isRunning() { return this.#core !== null; }

    constructor(storage) {
        this.#storage = storage;
    }

    /** Create a core instance from a core definition */
    #createCore(coreDef) {
        return coreDef.type === 'jsnes'
            ? new JsnesCore()
            : new RetroArchCore(coreDef);
    }

    /** Core definition array (filtered) */
    get coreDefs() { return CORE_DEFS; }

    /** Find core def by id */
    findCoreDef(id) { return CORE_DEFS.find(c => c.id === id) || null; }

    // ────────── Auto Detection ──────────

    async tryAutoLoad(romData, romName) {
        for (const coreDef of CORE_DEFS) {
            this.onShowLoading?.('正在尝试核心...', coreDef.name);
            try {
                const core = this.#createCore(coreDef);
                await core.loadROM(romData);

                if (coreDef.type === 'jsnes') {
                    const success = await this.#verifyJsnesFrames(core, 30);
                    if (!success) {
                        core.destroy();
                        continue;
                    }
                }

                return core;
            } catch (e) {
                console.warn(`[AutoDetect] ${coreDef.name} failed:`, e.message);
            }
        }
        return null;
    }

    async #verifyJsnesFrames(core, frameCount) {
        return new Promise((resolve) => {
            setTimeout(() => {
                core.runVerificationFrames(frameCount);
                const canvas = document.getElementById('screen');
                const ctx = canvas.getContext('2d');
                const imageData = ctx.getImageData(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
                const data = imageData.data;
                let nonBlack = 0;
                for (let i = 0; i < data.length; i += 4) {
                    if (data[i] > 0 || data[i + 1] > 0 || data[i + 2] > 0) {
                        nonBlack++;
                        if (nonBlack > 100) break;
                    }
                }
                resolve(nonBlack > 100);
            }, 100); // Increased timeout for rendering
        });
    }

    // ────────── Core Activation (unified) ──────────

    /**
     * Activate a core instance: switch UI, save state, start emulation.
     * This is the single source of truth for "make this core the active one".
     */
    async #activateCore(core, romData, romName) {
        // Stop and cleanup existing core
        if (this.#core) {
            this.#core.stop();
            this.#core.destroy(false); // don't remove canvas, new core reuses container
        }

        this.#core = core;
        this.#currentRom = { romData, romName };

        // Save core preference
        this.#storage.saveCorePref(romName, core.id);

        // Notify UI
        this.onActivate?.(core, romData, romName);
        this.onHideLoading?.();

        core.start();
    }

    // ────────── Load with specific core ──────────

    async loadWithCore(coreDef, romData, romName) {
        this.onShowLoading?.('正在加载核心...', coreDef.name);

        const core = this.#createCore(coreDef);
        try {
            await core.loadROM(romData);
        } catch (e) {
            console.error(`Failed to load ROM with ${coreDef.name}:`, e);
            this.onShowLoadingError?.('核心加载失败', `无法使用 ${coreDef.name} 加载此 ROM`);
            throw e;
        }

        await this.#activateCore(core, romData, romName);
    }

    // ────────── Start Game (entry point) ──────────

    async startGameWithROM(romData, romName) {
        this.#pendingRom = { romData, romName };

        this.onShowLoading?.('正在检测最佳核心...', '自动选择中');

        // Step 1: Auto detect
        const autoCore = await this.tryAutoLoad(romData, romName);
        if (autoCore) {
            await this.#activateCore(autoCore, romData, romName);
            return true;
        }

        this.onHideLoading?.();

        // Step 2: Try historical preference
        const pref = this.#storage.getCorePref(romName);
        if (pref) {
            const prefDef = CORE_DEFS.find(c => c.id === pref);
            if (prefDef) {
                this.onShowLoading?.('正在尝试历史偏好核心...', prefDef.name);
                try {
                    const core = this.#createCore(prefDef);
                    await core.loadROM(romData);
                    await this.#activateCore(core, romData, romName);
                    return true;
                } catch (e) {
                    console.warn(`[HistoryPref] ${prefDef.name} failed:`, e.message);
                    this.onHideLoading?.();
                }
            }
        }

        // Step 3: Show picker
        this.onShowLoading?.('自动检测失败', '请选择核心');
        this.onShowCorePicker?.('loading');
        return false;
    }

    // ────────── Resume Saved Game ──────────

    async resumeGame() {
        if (!this.#storage.hasSavedGame) return false;

        const romData = this.#storage.savedRomData;
        const romName = this.#storage.savedRomName;
        const savedCoreId = this.#storage.getSavedCoreId();
        const coreDef = CORE_DEFS.find(c => c.id === savedCoreId) || CORE_DEFS[0];

        this.onShowLoading?.('正在恢复游戏...', coreDef.name);
        try {
            await this.loadWithCore(coreDef, romData, romName);
            // Restore game state
            const gameState = this.#storage.savedGameState;
            if (gameState && this.#core) {
                try {
                    this.#core.loadState(JSON.parse(gameState));
                } catch {
                    try { this.#core.loadState(gameState); } catch (e2) {
                        console.error('State restore failed:', e2);
                    }
                }
            }
            return true;
        } catch (e) {
            console.error('Resume failed:', e);
            this.onHideLoading?.();
            return false;
        }
    }

    // ────────── Stop & Return ──────────

    stopGame() {
        if (this.#core) {
            try {
                this.#storage.saveGameState(this.#core, this.#currentRom.romData, this.#currentRom.romName);
                this.#core.stop();
                this.#core.destroy(false);
            } catch (e) { console.error('Stop failed:', e); }
        }
        this.#core = null;
    }

    returnToLauncher() {
        if (this.#core) {
            this.#core.stop();
            this.#core.destroy(true);
            this.#core = null;
        }
        this.#currentRom = { romData: null, romName: null };
        this.onHideLoading?.();
    }

    // ────────── Switch Core (while running) ──────────

    async switchCore(coreDef) {
        if (this.#core) this.#core.stop();
        await this.loadWithCore(coreDef, this.#currentRom.romData, this.#currentRom.romName);
    }

    /** Re-launch auto-detect for the pending ROM (called from core picker) */
    async retryWithCore(coreDef) {
        return this.loadWithCore(coreDef, this.#pendingRom.romData, this.#pendingRom.romName);
    }

    /** Send button input to active core */
    buttonDown(port, btn) { this.#core?.buttonDown(port, btn); }
    buttonUp(port, btn) { this.#core?.buttonUp(port, btn); }
}
