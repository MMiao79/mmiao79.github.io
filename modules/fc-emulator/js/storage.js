'use strict';

import { STORAGE_KEYS } from './config.js';

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
                this.#romData   = rom;
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
            this.#gameState = typeof state === 'string' ? state : JSON.stringify(state);
            this.#romData   = romData;
            this.#romName   = romName;
            localStorage.setItem(STORAGE_KEYS.ROM,   romData);
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

    /** Look up previously saved core preference for a ROM */
    getCorePref(romName) {
        try {
            return (JSON.parse(localStorage.getItem(STORAGE_KEYS.CORE_PREF) || '{}'))[romName] || null;
        } catch { return null; }
    }

    /** Get the core id of the last saved session */
    getSavedCoreId() { return localStorage.getItem(STORAGE_KEYS.CORE) || null; }
}
