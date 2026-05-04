'use strict';

/**
 * Thread-safe ring buffer for JSNES audio output.
 * Written by the emulation thread, read by the Web Audio callback.
 */
export class AudioFIFO {
    #size;
    #bufferL;
    #bufferR;
    #head = 0;
    #count = 0;

    constructor(size = 16384) {
        this.#size = size;
        this.#bufferL = new Float32Array(size);
        this.#bufferR = new Float32Array(size);
    }

    reset() {
        this.#head = 0;
        this.#count = 0;
    }

    /** Write one stereo sample (called from emulation thread) */
    write(l, r) {
        this.#bufferL[this.#head] = l;
        this.#bufferR[this.#head] = r;
        this.#head = (this.#head + 1) % this.#size;
        if (this.#count < this.#size) this.#count++;
    }

    /** Read `count` stereo samples into output buffers (called from audio callback) */
    read(outL, outR, count) {
        for (let i = 0; i < count; i++) {
            if (this.#count > 0) {
                const idx = (this.#head - this.#count + this.#size) % this.#size;
                outL[i] = this.#bufferL[idx];
                outR[i] = this.#bufferR[idx];
                this.#count--;
            } else {
                outL[i] = 0;
                outR[i] = 0;
            }
        }
    }
}
