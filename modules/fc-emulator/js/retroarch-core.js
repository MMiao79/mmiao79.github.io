'use strict';

import { EmulatorCore } from './core-base.js';

/**
 * RetroArch core adapter via Nostalgist.js.
 * Lazy-loads nostalgist.js on first use.
 */
export class RetroArchCore extends EmulatorCore {
    /** @type {import('./types').NostalgistInstance | null} */
    #nostalgist = null;
    /** @type {import('./types').NostalgistConstructor | null} */
    #Nostalgist = null;
    /** @type {ReturnType<typeof import>} */
    coreDef;
    /** ROM data for re-launch */
    #romData = null;
    #romName = null;

    /** Callbacks set by CoreManager */
    onRunningChange = null;
    #running = false;

    /** Shared Nostalgist module cache (static) */
    static #cachedNostalgist = null;

    constructor(coreDef) {
        super();
        this.id = coreDef.id;
        this.name = coreDef.name;
        this.type = 'retroarch';
        this.coreDef = coreDef;
    }

    async loadROM(data) {
        // Lazy load Nostalgist.js
        if (!RetroArchCore.#cachedNostalgist) {
            const module = await import('../lib/nostalgist.js');
            RetroArchCore.#cachedNostalgist = module.Nostalgist;
        }
        this.#Nostalgist = RetroArchCore.#cachedNostalgist;

        this.#romData = data;
        this.#romName = null; // set externally

        // Setup RA canvas container
        const container = document.getElementById('retroarch-canvas-container');
        container.innerHTML = '';

        const romBytes = data instanceof Uint8Array ? data
            : typeof data === 'string'
                ? (() => { const b = new Uint8Array(data.length); for (let i = 0; i < data.length; i++) b[i] = data.charCodeAt(i) & 0xff; return b; })()
                : new Uint8Array(data);
        const romFile = { fileName: 'game.nes', fileContent: romBytes };

        this.#nostalgist = await this.#Nostalgist.launch({
            core: {
                name: this.coreDef.coreName,
                js: this.coreDef.jsPath,
                wasm: this.coreDef.wasmPath,
            },
            rom: romFile,
            element: container,
        });
    }

    setRomName(name) { this.#romName = name; }

    start() {
        this.#running = true;
        this.onRunningChange?.(true);
    }

    stop() {
        this.#running = false;
        this.onRunningChange?.(false);
    }

    buttonDown(port, btn) {
        this.#nostalgist?.pressDown(port || 1, btn.toLowerCase());
    }

    buttonUp(port, btn) {
        this.#nostalgist?.pressUp(port || 1, btn.toLowerCase());
    }

    saveState() {
        return this.#nostalgist ? this.#nostalgist.saveState() : null;
    }

    loadState(state) {
        if (this.#nostalgist && state) this.#nostalgist.loadState(state);
    }

    destroy(removeCanvas = false) {
        this.stop();
        if (this.#nostalgist) {
            try { this.#nostalgist.exit({ removeCanvas }); } catch {}
            this.#nostalgist = null;
        }
    }
}
