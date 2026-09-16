/**
 * Local storage and state management for Kalvium Attendance Assistant.
 * Wraps chrome.storage.local with fallbacks for testing environments.
 */

const KalviumStateStore = {
  async getSettings() {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      const res = await chrome.storage.local.get(window.KalviumConstants.StorageKeys.SETTINGS);
      return Object.assign({}, window.KalviumConstants.DefaultSettings, res[window.KalviumConstants.StorageKeys.SETTINGS] || {});
    }
    // Fallback for memory/mock
    return Object.assign({}, (window.KalviumConstants || {}).DefaultSettings);
  },

  async saveSettings(settings) {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      await chrome.storage.local.set({
        [window.KalviumConstants.StorageKeys.SETTINGS]: settings
      });
    }
  },

  async getCurrentState() {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      const res = await chrome.storage.local.get(window.KalviumConstants.StorageKeys.CURRENT_STATE);
      return res[window.KalviumConstants.StorageKeys.CURRENT_STATE] || {
        state: window.KalviumConstants.KalviumStates.IDLE,
        session: null,
        cameraState: window.KalviumConstants.CameraStates.UNKNOWN,
        attendanceStatus: window.KalviumConstants.AttendanceBadgeStates.UNKNOWN,
        details: 'Initialized',
        lastUpdated: Date.now()
      };
    }
    return {
      state: 'IDLE',
      session: null,
      cameraState: 'UNKNOWN',
      attendanceStatus: 'UNKNOWN',
      details: 'Initialized',
      lastUpdated: Date.now()
    };
  },

  async setCurrentState(stateData) {
    const payload = Object.assign({
      lastUpdated: Date.now()
    }, stateData);

    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      await chrome.storage.local.set({
        [window.KalviumConstants.StorageKeys.CURRENT_STATE]: payload
      });
      // Broadcast state update to runtime listeners (e.g. popup)
      try {
        chrome.runtime.sendMessage({
          action: window.KalviumConstants.ActionTypes.STATE_UPDATED,
          state: payload
        }).catch(() => {});
      } catch (_) {}
    }
    return payload;
  },

  async getTodaySessions() {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      const res = await chrome.storage.local.get(window.KalviumConstants.StorageKeys.TODAY_SESSIONS);
      return res[window.KalviumConstants.StorageKeys.TODAY_SESSIONS] || [];
    }
    return [];
  },

  async saveTodaySessions(sessions) {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      await chrome.storage.local.set({
        [window.KalviumConstants.StorageKeys.TODAY_SESSIONS]: sessions
      });
    }
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { KalviumStateStore };
} else {
  window.KalviumStateStore = KalviumStateStore;
}
