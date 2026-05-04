'use strict';

import { BUTTON_NAMES, DEFAULT_KEYMAP, DEFAULT_TURBO_KEYMAP, codeToLabel } from './config.js';

/**
 * Manages all input: keyboard events, virtual joystick, and touch action buttons.
 * Notifies a callback on button down/up events.
 */
export class InputHandler {
    /** @type {(port: number, btn: string, down: boolean) => void} */
    onButton = null;

    // Key mappings
    #keymap = { ...DEFAULT_KEYMAP };
    #turboKeymap = { ...DEFAULT_TURBO_KEYMAP };
    #turboKeyHeld = { 'Turbo A': false, 'Turbo B': false };
    get turboKeyHeld() { return this.#turboKeyHeld; }

    // Turbo mode (mobile toggle)
    #turboMode = { A: false, B: false };
    get turboMode() { return this.#turboMode; }

    // Turbo rate
    #turboRate = 10;
    get turboRate() { return this.#turboRate; }
    set turboRate(v) { this.#turboRate = v; }

    // Keymap panel listening state
    #listeningBtn = null;
    #listeningTurbo = false;
    get listeningBtn() { return this.#listeningBtn; }
    set listeningBtn(v) { this.#listeningBtn = v; }
    get listeningTurbo() { return this.#listeningTurbo; }
    set listeningTurbo(v) { this.#listeningTurbo = v; }

    // Joystick state
    #joystickTouch = null;
    #joystickDir = { up: false, down: false, left: false, right: false };
    #JOYSTICK_RADIUS = 38;
    #JOYSTICK_DEADZONE = 0.25;
    #joystickThumb = null;
    #joystickZone = null;

    // Touch button tracking
    #touchBtns = new Map();

    // Bound handlers (for cleanup)
    #boundKeydown;
    #boundKeyup;

    constructor() {
        this.#boundKeydown = this.#onKeyDown.bind(this);
        this.#boundKeyup = this.#onKeyUp.bind(this);
    }

    // ────────── Keymap Queries ──────────

    get keymap() { return this.#keymap; }
    get turboKeymap() { return this.#turboKeymap; }

    codeToBtn(code) {
        for (const [btn, c] of Object.entries(this.#keymap)) { if (c === code) return btn; }
        return null;
    }

    turboCodeToName(code) {
        for (const [name, c] of Object.entries(this.#turboKeymap)) { if (c === code) return name; }
        return null;
    }

    // ────────── Init / Destroy ──────────

    init() {
        document.addEventListener('keydown', this.#boundKeydown);
        document.addEventListener('keyup', this.#boundKeyup);
        this.#initJoystick();
        this.#initTouchButtons();
    }

    destroy() {
        document.removeEventListener('keydown', this.#boundKeydown);
        document.removeEventListener('keyup', this.#boundKeyup);
    }

    // ────────── Keyboard ──────────

    #onKeyDown(e) {
        if (this.#listeningBtn) {
            e.preventDefault();
            if (this.#listeningTurbo) {
                this.#turboKeymap[this.#listeningBtn] = e.code;
            } else {
                this.#keymap[this.#listeningBtn] = e.code;
            }
            this.#listeningBtn = null;
            this.#listeningTurbo = false;
            this.onKeymapChange?.();
            return;
        }
        const turboName = this.turboCodeToName(e.code);
        if (turboName) { e.preventDefault(); this.#turboKeyHeld[turboName] = true; return; }
        const btn = this.codeToBtn(e.code);
        if (btn) { e.preventDefault(); this.onButton?.(1, btn, true); }
    }

    #onKeyUp(e) {
        const turboName = this.turboCodeToName(e.code);
        if (turboName) { this.#turboKeyHeld[turboName] = false; return; }
        const btn = this.codeToBtn(e.code);
        if (btn) { this.onButton?.(1, btn, false); }
    }

    // ────────── Joystick ──────────

    #initJoystick() {
        this.#joystickZone = document.getElementById('joystick-zone');
        this.#joystickThumb = document.getElementById('joystick-thumb');
        if (!this.#joystickZone || !this.#joystickThumb) return;

        this.#joystickZone.addEventListener('touchstart', (e) => {
            e.preventDefault();
            if (this.#joystickTouch === null && e.changedTouches.length > 0) {
                this.#joystickTouch = e.changedTouches[0].identifier;
                this.#updateJoystick(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
            }
        }, { passive: false });

        this.#joystickZone.addEventListener('touchmove', (e) => {
            e.preventDefault();
            for (const t of e.changedTouches) {
                if (t.identifier === this.#joystickTouch) this.#updateJoystick(t.clientX, t.clientY);
            }
        }, { passive: false });

        const resetIfMatch = (e) => {
            for (const t of e.changedTouches) {
                if (t.identifier === this.#joystickTouch) { this.#joystickTouch = null; this.#resetJoystick(); }
            }
        };
        this.#joystickZone.addEventListener('touchend', resetIfMatch);
        this.#joystickZone.addEventListener('touchcancel', resetIfMatch);
    }

    #updateJoystick(cx, cy) {
        const rect = this.#joystickZone.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2, centerY = rect.top + rect.height / 2;
        let dx = cx - centerX, dy = cy - centerY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > this.#JOYSTICK_RADIUS) { dx = dx / dist * this.#JOYSTICK_RADIUS; dy = dy / dist * this.#JOYSTICK_RADIUS; }

        this.#joystickThumb.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
        this.#joystickThumb.classList.add('active');

        const newDir = {
            up: dy < -this.#JOYSTICK_RADIUS * this.#JOYSTICK_DEADZONE,
            down: dy > this.#JOYSTICK_RADIUS * this.#JOYSTICK_DEADZONE,
            left: dx < -this.#JOYSTICK_RADIUS * this.#JOYSTICK_DEADZONE,
            right: dx > this.#JOYSTICK_RADIUS * this.#JOYSTICK_DEADZONE,
        };

        for (const d of ['up', 'down', 'left', 'right']) {
            if (newDir[d] !== this.#joystickDir[d]) {
                this.#joystickDir[d] = newDir[d];
                this.onButton?.(1, d.toUpperCase(), newDir[d]);
            }
        }
    }

    #resetJoystick() {
        this.#joystickThumb.style.transform = 'translate(-50%, -50%)';
        this.#joystickThumb.classList.remove('active');
        for (const d of ['up', 'down', 'left', 'right']) {
            if (this.#joystickDir[d]) {
                this.#joystickDir[d] = false;
                this.onButton?.(1, d.toUpperCase(), false);
            }
        }
    }

    // ────────── Touch Action Buttons ──────────

    #initTouchButtons() {
        const btnElements = document.querySelectorAll('.a-btn, .b-btn, .m-btn, .turbo-btn');
        btnElements.forEach(el => {
            el.addEventListener('touchstart', (e) => {
                e.preventDefault();
                for (const t of e.changedTouches) {
                    if (el.classList.contains('turbo-btn')) {
                        const type = el.dataset.type;
                        this.#turboMode[type] = !this.#turboMode[type];
                        el.classList.toggle('active');
                        this.onTurboChange?.();
                    } else {
                        const btnName = el.dataset.btn || el.dataset.type;
                        this.onButton?.(1, btnName, true);
                        this.#touchBtns.set(t.identifier + '_' + btnName, { el, btnName });
                        el.classList.add('active');
                    }
                }
            }, { passive: false });

            el.addEventListener('touchend', (e) => {
                e.preventDefault();
                for (const t of e.changedTouches) {
                    for (const [key, info] of this.#touchBtns.entries()) {
                        if (info.btnName && (t.clientX !== 0 || t.clientY !== 0)) {
                            const rect = info.el.getBoundingClientRect();
                            if (t.clientX >= rect.left && t.clientX <= rect.right && t.clientY >= rect.top && t.clientY <= rect.bottom) {
                                this.onButton?.(1, info.btnName, false);
                                info.el.classList.remove('active');
                                this.#touchBtns.delete(key);
                            }
                        }
                    }
                }
            }, { passive: false });

            el.addEventListener('touchcancel', (e) => {
                for (const t of e.changedTouches) {
                    for (const [key, info] of this.#touchBtns.entries()) {
                        if (info.btnName) {
                            this.onButton?.(1, info.btnName, false);
                            info.el.classList.remove('active');
                            this.#touchBtns.delete(key);
                        }
                    }
                }
            });
        });

        // Multi-touch A+B support
        document.addEventListener('touchstart', (e) => {
            for (const t of e.changedTouches) {
                const el = document.elementFromPoint(t.clientX, t.clientY);
                if (el && (el.classList.contains('a-btn') || el.classList.contains('b-btn'))) {
                    const btnName = el.dataset.btn;
                    this.onButton?.(1, btnName, true);
                    this.#touchBtns.set('ab_' + t.identifier, { el, btnName });
                    el.classList.add('active');
                }
            }
        }, { passive: true });

        const clearAbTouch = (e) => {
            for (const t of e.changedTouches) {
                const info = this.#touchBtns.get('ab_' + t.identifier);
                if (info) {
                    this.onButton?.(1, info.btnName, false);
                    info.el.classList.remove('active');
                    this.#touchBtns.delete('ab_' + t.identifier);
                }
            }
        };
        document.addEventListener('touchend', clearAbTouch, { passive: true });
        document.addEventListener('touchcancel', clearAbTouch, { passive: true });
    }

    // ────────── Mobile Turbo Toggle (public) ──────────

    toggleTurbo(type) {
        this.#turboMode[type] = !this.#turboMode[type];
        return this.#turboMode[type];
    }

    // ────────── Callbacks ──────────
    onKeymapChange = null;
    onTurboChange = null;
}
