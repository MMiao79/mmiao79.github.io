'use strict';

import { STORAGE_KEYS } from './config.js';

/** Convert Uint8Array to base64 string for localStorage */
function uint8ToBase64(arr) {
    let binary = '';
    for (let i = 0; i < arr.length; i++) binary += String.fromCharCode(arr[i]);
    return btoa(binary);
}

/** Convert base64 string back to Uint8Array */
function base64ToUint8(b64) {
    const binary = atob(b64);
    const arr = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
    return arr;
}

/** Normalise ROM data to Uint8Array */
function normaliseRom(data) {
    if (data instanceof Uint8Array) return data;
    if (data instanceof ArrayBuffer) return new Uint8Array(data);
    if (typeof data === 'string') {
        const arr = new Uint8Array(data.length);
        for (let i = 0; i < data.length; i++) arr[i] = data.charCodeAt(i) & 0xff;
        return arr;
    }
    return null;
}

export class StorageManager {
    #romData = null;
    #romName = null;
    #gameState = null;

    get hasSavedGame() { return !!(this.#romData && this.#gameState && this.#romName); }
    get savedRomData()  { return this.#romData; }
    get savedRomName()  { return this.#romName; }
    get savedGameState(){ return this.#gameState; }

    /**
     * Check localStorage for a previously saved game session.
     * @returns {{ romName: string } | null}
     */
    tryRestore() {
        try {
            const rom   = localStorage.getItem(STORAGE_KEYS.ROM);
            const state = localStorage.getItem(STORAGE_KEYS.STATE);
            const name  = localStorage.getItem(STORAGE_KEYS.NAME);
            if (rom && state && name) {
                // rom stored as base64 string -> Uint8Array
                this.#romData   = base64ToUint8(rom);
                this.#gameState = state;
                this.#romName   = name;
                return { romName: name };
            }
        } catch (e) { console.error('Restore failed:', e); }
        return null;
    }

    /** Save current game state + ROM data to localStorage */
    saveGameState(core, romData, romName) {
        if (!core || !romData || !romName) return;
        try {
            const state = core.saveState();
            if (!state) return;
            const romBytes = normaliseRom(romData);
            if (!romBytes) return;
            this.#gameState = typeof state === 'string' ? state : JSON.stringify(state);
            this.#romData   = romBytes;
            this.#romName   = romName;
            // Store ROM as base64 to survive localStorage round-trip
            localStorage.setItem(STORAGE_KEYS.ROM,   uint8ToBase64(romBytes));
            localStorage.setItem(STORAGE_KEYS.STATE, this.#gameState);
            localStorage.setItem(STORAGE_KEYS.NAME,  romName);
            localStorage.setItem(STORAGE_KEYS.CORE,  core.id);
        } catch (e) {
            if (e.name === 'QuotaExceededError') this.clearAll();
        }
    }

    /** Remove all saved emulator data from localStorage */
    clearAll() {
        for (const key of Object.values(STORAGE_KEYS)) localStorage.removeItem(key);
        this.#romData   = null;
        this.#gameState = null;
        this.#romName   = null;
    }

    /** Remember which core worked for a given ROM name */
    saveCorePref(romName, coreId) {
        try {
            const prefs = JSON.parse(localStorage.getItem(STORAGE_KEYS.CORE_PREF) || '{}');
            prefs[romName] = coreId;
            localStorage.setItem(STORAGE_KEYS.CORE_PREF, JSON.stringify(prefs));
        } catch (e) { console.error('Save core pref failed:', e); }
    }

    /** Look up previously saved core preference for a ROM name */
    getCorePref(romName) {
        try {
            return (JSON.parse(localStorage.getItem(STORAGE_KEYS.CORE_PREF) || '{}'))[romName] || null;
        } catch { return null; }
    }

    /** Get the core id of the last saved session */
    getSavedCoreId() { return localStorage.getItem(STORAGE_KEYS.CORE) || null; }
}
