/**
 * Formatted logging utility for Kalvium Attendance Assistant.
 */

const _loggerRoot = typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : window);

_loggerRoot.KalviumLogger = {
  _format(level, msg, ...args) {
    const timestamp = new Date().toLocaleTimeString();
    return [`[KalviumAssistant][${timestamp}][${level}]`, msg, ...args];
  },

  info(msg, ...args) {
    console.log(...this._format('INFO', msg, ...args));
  },

  warn(msg, ...args) {
    console.warn(...this._format('WARN', msg, ...args));
  },

  error(msg, ...args) {
    console.error(...this._format('ERROR', msg, ...args));
  },

  debug(msg, ...args) {
    console.debug(...this._format('DEBUG', msg, ...args));
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { KalviumLogger: _loggerRoot.KalviumLogger };
}
