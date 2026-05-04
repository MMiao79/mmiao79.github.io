'use strict';

/**
 * Intercepts console.warn / console.error from third-party libraries
 * and translates known messages into Chinese.
 * Only re-logs after translation; unknown messages pass through unchanged.
 */
export function initConsoleTranslator() {
    const TRANSLATIONS = [
        {
            pattern: /The ScriptProcessorNode is deprecated/i,
            translate: () => '[JSNES 音频] 使用了已弃用的 ScriptProcessorNode（功能正常，未来可能需要升级到 AudioWorklet）',
        },
        {
            pattern: /Canvas size should be set using CSS properties/i,
            translate: () => '[RetroArch 核心] Canvas 尺寸已通过 JS 设置（不影响显示）',
        },
        {
            pattern: /Setting real canvas size:\s*(\d+)\s*x\s*(\d+)/i,
            translate: (m) => `[RetroArch 核心] 实际画布尺寸: ${m[1]} × ${m[2]}`,
        },
    ];

    function tryTranslate(args) {
        const text = Array.from(args).map(String).join(' ');
        for (const rule of TRANSLATIONS) {
            const m = text.match(rule.pattern);
            if (m) return rule.translate(m);
        }
        return null;
    }

    const origWarn = console.warn;
    const origError = console.error;

    console.warn = function (...args) {
        const translated = tryTranslate(args);
        if (translated) {
            origWarn.call(console, translated);
        } else {
            origWarn.apply(console, args);
        }
    };

    console.error = function (...args) {
        const translated = tryTranslate(args);
        if (translated) {
            origError.call(console, translated);
        } else {
            origError.apply(console, args);
        }
    };
}
