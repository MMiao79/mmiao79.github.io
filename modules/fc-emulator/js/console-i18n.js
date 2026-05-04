'use strict';

/**
 * Console filter for third-party library output.
 *
 * Known library warnings/infos are downgraded to console.debug (hidden by
 * default in browser DevTools).  Developers who need them can toggle the
 * "Verbose" level filter in the console panel.
 *
 * Our own warn/error messages, and any unrecognized messages, pass through
 * unchanged — nothing is suppressed.
 */
export function initConsoleFilter() {
    // Patterns that come from third-party libraries and are noise for users.
    // Matched against the joined text of all console arguments.
    const LIB_PATTERNS = [
        /The ScriptProcessorNode is deprecated/i,
        /Canvas size should be set using CSS properties/i,
        /Setting real canvas size:\s*\d+\s*x\s*\d+/i,
    ];

    function isLibraryNoise(args) {
        const text = Array.from(args).map(String).join(' ');
        return LIB_PATTERNS.some(p => p.test(text));
    }

    // Only intercept warn (info/warn from libs).  Errors always pass through.
    const origWarn = console.warn;

    console.warn = function (...args) {
        if (isLibraryNoise(args)) {
            // Downgrade to debug — hidden by default, visible under "Verbose"
            console.debug('[lib]', ...args);
        } else {
            origWarn.apply(console, args);
        }
    };
}
