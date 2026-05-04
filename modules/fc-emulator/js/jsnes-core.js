'use strict';

import { EmulatorCore } from './core-base.js';
import { SCREEN_WIDTH, SCREEN_HEIGHT, FPS, FRAME_TIME, BUTTON_NAMES } from './config.js';
import { AudioFIFO } from './audio.js';

/**
 * JSNES-based emulator core.
 * Uses jsnes.NES (loaded via global <script>) for pure-JS emulation.
 */
export class JsnesCore extends EmulatorCore {
    /** @type {jsnes.NES | null} */
    #nes = null;
    /** @type {HTMLCanvasElement | null} */
    #canvas = null;
    /** @type {CanvasRenderingContext2D | null} */
    #ctx = null;
    /** @type {ImageData | null} */
    #image = null;
    /** @type {Uint32Array | null} */
    #fb32 = null;
    /** @type {AudioContext | null} */
    #audioCtx = null;
    /** @type {ScriptProcessorNode | null} */
    #scriptProcessor = null;
    #animId = null;

    /** Shared audio ring buffer */
    audioFifo = new AudioFIFO();

    /** Callbacks set by CoreManager */
    onRunningChange = null; // (running: boolean) => void
    #turboState = { A: false, B: false };
    #turboKeyHeld = { A: false, B: false };
    #turboRate = 10;
    #frameCount = 0;
    #lastTime = 0;
    #lag = 0;
    #running = false;

    constructor() {
        super();
        this.id = 'jsnes';
        this.name = 'JSNES';
        this.type = 'jsnes';
    }

    setTurboState(mode) { this.#turboState = mode; }
    setTurboKeyHeld(held) { this.#turboKeyHeld = held; }
    setTurboRate(rate) { this.#turboRate = rate; }

    async loadROM(data) {
        console.log('[JsnesCore] loadROM called, data type:', typeof data, 'is Uint8Array:', data instanceof Uint8Array, 'length:', data?.length);
        
        this.#canvas = document.getElementById('screen');
        this.#ctx = this.#canvas.getContext('2d');
        this.#image = this.#ctx.createImageData(SCREEN_WIDTH, SCREEN_HEIGHT);
        this.#fb32 = new Uint32Array(this.#image.data.buffer);

        this.audioFifo.reset();

        const NesCtor = window.jsnes?.NES;
        if (!NesCtor) {
            console.error('[JsnesCore] jsnes.NES not found! window.jsnes:', window.jsnes);
            throw new Error('jsnes not loaded');
        }
        console.log('[JsnesCore] jsnes.NES constructor found');

        // Normalise: ensure Uint8Array (avoids UTF-16 surrogate-pair issues with binary strings)
        let romBytes;
        if (data instanceof Uint8Array) {
            romBytes = data;
        } else if (data instanceof ArrayBuffer) {
            romBytes = new Uint8Array(data);
        } else if (typeof data === 'string') {
            romBytes = new Uint8Array(data.length);
            for (let i = 0; i < data.length; i++) romBytes[i] = data.charCodeAt(i) & 0xff;
        } else {
            throw new Error('Unsupported ROM data format');
        }
        console.log('[JsnesCore] romBytes length:', romBytes.length, 'first bytes:', Array.from(romBytes.slice(0, 16)));

        this.#nes = new NesCtor({
            onFrame: (buf) => {
                for (let i = 0; i < buf.length; i++) this.#fb32[i] = 0xFF000000 | buf[i];
            },
            onAudioSample: (l, r) => this.audioFifo.write(l, r),
        });

        // Audio
        this.#audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        this.#scriptProcessor = this.#audioCtx.createScriptProcessor(2048, 0, 2);
        const fifo = this.audioFifo;
        this.#scriptProcessor.onaudioprocess = (e) => {
            fifo.read(e.outputBuffer.getChannelData(0), e.outputBuffer.getChannelData(1), e.outputBuffer.length);
        };
        this.#scriptProcessor.connect(this.#audioCtx.destination);

        // jsnes.loadROM expects a string (base64 or URL) or Array of numbers
        // Convert to base64 string for compatibility
        let binary = '';
        for (let i = 0; i < romBytes.length; i++) {
            binary += String.fromCharCode(romBytes[i]);
        }
        const base64 = btoa(binary);
        console.log('[JsnesCore] Base64 length:', base64.length);
        this.#nes.loadROM(base64);
        console.log('[JsnesCore] ROM loaded into NES, ready to run');
    }

    start() {
        this.#resumeAudio();
        this.#running = true;
        this.#lastTime = 0;
        this.#lag = 0;
        this.#frameCount = 0;
        this.onRunningChange?.(true);
        this.#loop = this.#loop.bind(this);
        requestAnimationFrame(this.#loop);
    }

    #loop(timestamp) {
        if (!this.#running) return;
        this.#animId = requestAnimationFrame(this.#loop);

        if (this.#lastTime === 0) this.#lastTime = timestamp;
        const elapsed = timestamp - this.#lastTime;
        this.#lastTime = timestamp;
        this.#lag += elapsed;

        let framesToRun = 0;
        while (this.#lag >= FRAME_TIME && framesToRun < 3) {
            this.#nes.frame();
            this.#lag -= FRAME_TIME;
            framesToRun++;
        }
        if (this.#lag > FRAME_TIME * 3) this.#lag = FRAME_TIME;

        this.#ctx.putImageData(this.#image, 0, 0);

        // Turbo buttons
        this.#frameCount++;
        if (this.#frameCount % Math.floor(FPS / this.#turboRate) === 0) {
            const turboA = this.#turboState.A || this.#turboKeyHeld.A;
            const turboB = this.#turboState.B || this.#turboKeyHeld.B;
            if (turboA) { this.#nes.buttonDown(1, 0); setTimeout(() => this.#nes.buttonUp(1, 0), 40); }
            if (turboB) { this.#nes.buttonDown(1, 1); setTimeout(() => this.#nes.buttonUp(1, 1), 40); }
        }
    }

    #resumeAudio() {
        if (this.#audioCtx?.state === 'suspended') this.#audioCtx.resume();
    }

    stop() {
        this.#running = false;
        this.onRunningChange?.(false);
        if (this.#animId) { cancelAnimationFrame(this.#animId); this.#animId = null; }
    }

    buttonDown(port, btn) {
        const idx = BUTTON_NAMES.indexOf(btn);
        if (idx >= 0 && this.#nes) this.#nes.buttonDown(port || 1, idx);
    }

    buttonUp(port, btn) {
        const idx = BUTTON_NAMES.indexOf(btn);
        if (idx >= 0 && this.#nes) this.#nes.buttonUp(port || 1, idx);
    }

    saveState() { return this.#nes ? this.#nes.saveState() : null; }
    loadState(state) { if (this.#nes && state) this.#nes.loadState(state); }

    /** Run N frames without audio output, for auto-detection verification */
    runVerificationFrames(count) {
        const nes = this.#nes;
        if (!nes) return;
        for (let i = 0; i < count; i++) nes.frame();
        if (this.#ctx && this.#image) this.#ctx.putImageData(this.#image, 0, 0);
    }

    destroy() {
        this.stop();
        if (this.#scriptProcessor) {
            this.#scriptProcessor.disconnect();
            this.#scriptProcessor = null;
        }
        if (this.#audioCtx) {
            this.#audioCtx.close().catch(() => {});
            this.#audioCtx = null;
        }
        this.#nes = null;
    }
}
