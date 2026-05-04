'use strict';

export class ROMLoader {
    /** @type {((data: Uint8Array, name: string) => void) | null} */
    onROMLoaded = null;

    /** Open a file picker for .nes / .zip files */
    async pick() {
        if ('showOpenFilePicker' in window) {
            let file;
            try {
                [file] = await window.showOpenFilePicker({
                    id: 'fc-rom-picker',
                    types: [{ description: 'NES ROM', accept: { 'application/octet-stream': ['.nes', '.zip'] } }],
                });
            } catch { return; }
            if (file) await this.#load(await file.getFile());
        } else {
            // Fallback for browsers without File System Access API
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.nes,.zip';
            input.onchange = async () => {
                if (input.files[0]) await this.#load(input.files[0]);
            };
            input.click();
        }
    }

    async #load(file) {
        console.log('[ROMLoader] Loading file:', file.name, 'size:', file.size);
        let romName = file.name.replace(/\.(nes|zip)$/i, '');
        if (file.name.toLowerCase().endsWith('.zip')) {
            const JSZip = window.JSZip;
            if (!JSZip) { alert('JSZip 未加载'); return; }
            const zip = await JSZip.loadAsync(file);
            const nesFile = Object.values(zip.files).find(f => f.name.toLowerCase().endsWith('.nes'));
            if (nesFile) {
                romName = nesFile.name.replace(/\.nes$/i, '');
                const uint8 = await nesFile.async('uint8array');
                console.log('[ROMLoader] ZIP: NES file loaded, size:', uint8.length);
                this.onROMLoaded?.(uint8, romName);
            } else {
                alert('未找到 .nes 文件');
            }
        } else {
            const uint8 = new Uint8Array(await file.arrayBuffer());
            console.log('[ROMLoader] File read complete, uint8 size:', uint8.length, 'first bytes:', Array.from(uint8.slice(0, 4)));
            this.onROMLoaded?.(uint8, romName);
        }
    }
}
