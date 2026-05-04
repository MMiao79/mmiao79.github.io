'use strict';

/**
 * Abstract interface for emulator cores.
 * Every core must implement: loadROM, start, stop, buttonDown, buttonUp, saveState, loadState.
 */
export class EmulatorCore {
    /** Unique core identifier */
    id;
    /** Human-readable name */
    name;
    /** 'jsnes' or 'retroarch' */
    type;

    /** Load a ROM and prepare for execution */
    async loadROM(_data) { throw new Error('Not implemented'); }

    /** Begin the emulation loop */
    start() { throw new Error('Not implemented'); }

    /** Stop the emulation loop */
    stop() { throw new Error('Not implemented'); }

    /** Press a button */
    buttonDown(_port, _btn) {}

    /** Release a button */
    buttonUp(_port, _btn) {}

    /** Serialize game state */
    saveState() { return null; }

    /** Restore game state */
    loadState(_state) {}

    /** Clean up resources (canvas, audio, etc.) */
    destroy(_removeCanvas = false) {}
}
