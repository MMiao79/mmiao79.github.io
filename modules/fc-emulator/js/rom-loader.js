'use strict';

export class ROMLoader {
    /** @type {((data: string, name: string) => void) | null} */
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
            if (file) this.#load(await file.getFile());
        } else {
            // Fallback for browsers without File System Access API
            return new Promise((resolve) => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = '.nes,.zip';
                input.onchange = () => { if (input.files[0]) this.#load(input.files[0]); resolve(); };
                input.click();
            });
        }
    }

    async #load(file) {
        let romName = file.name.replace(/\.(nes|zip)$/i, '');
        if (file.name.endsWith('.zip')) {
            const zip = await JSZip.loadAsync(file);
            const nesFile = Object.values(zip.files).find(f => f.name.toLowerCase().endsWith('.nes'));
            if (nesFile) {
                romName = nesFile.name.replace(/\.nes$/i, '');
                this.onROMLoaded?.(await nesFile.async('binarystring'), romName);
            } else {
                alert('未找到 .nes 文件');
            }
        } else {
            const reader = new FileReader();
            reader.onload = (ev) => this.onROMLoaded?.(ev.target.result, romName);
            reader.readAsBinaryString(file);
        }
    }
}
