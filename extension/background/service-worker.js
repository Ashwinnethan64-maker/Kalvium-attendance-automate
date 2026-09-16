/**
 * Manifest V3 Service Worker for Kalvium Attendance Assistant.
 * In Manifest V3 service workers, we inline the constants to avoid importScripts caching issues.
 */

// Global state definitions
self.KalviumStates = {
  IDLE: 'IDLE',
  DASHBOARD_NOT_FOUND: 'DASHBOARD_NOT_FOUND',
  DASHBOARD_READY: 'DASHBOARD_READY',
  SESSION_UPCOMING: 'SESSION_UPCOMING',
  SESSION_LIVE: 'SESSION_LIVE',
  ATTENDANCE_AVAILABLE: 'ATTENDANCE_AVAILABLE',
  CAMERA_MODAL: 'CAMERA_MODAL',
  CAMERA_READY: 'CAMERA_READY',
  WAITING_FOR_USER_CONFIRMATION: 'WAITING_FOR_USER_CONFIRMATION',
  SUBMITTING_ATTENDANCE: 'SUBMITTING_ATTENDANCE',
  ATTENDANCE_PRESENT: 'ATTENDANCE_PRESENT',
  ATTENDANCE_ABSENT: 'ATTENDANCE_ABSENT',
  ATTENDANCE_UNKNOWN: 'ATTENDANCE_UNKNOWN',
  SESSION_COMPLETE: 'SESSION_COMPLETE',
  FEEDBACK_AVAILABLE: 'FEEDBACK_AVAILABLE',
  FEEDBACK_READY: 'FEEDBACK_READY',
  WAITING_FOR_FEEDBACK_CONFIRMATION: 'WAITING_FOR_FEEDBACK_CONFIRMATION',
  FEEDBACK_SUBMITTED: 'FEEDBACK_SUBMITTED',
  ERROR: 'ERROR'
};

self.ActionTypes = {
  STATE_UPDATED: 'STATE_UPDATED',
  GET_STATE: 'GET_STATE',
  TOGGLE_MONITORING: 'TOGGLE_MONITORING',
  SHOW_NOTIFICATION: 'SHOW_NOTIFICATION',
  OPEN_DASHBOARD: 'OPEN_DASHBOARD',
  CONFIRM_ATTENDANCE: 'CONFIRM_ATTENDANCE',
  CANCEL_ATTENDANCE: 'CANCEL_ATTENDANCE',
  CONFIRM_FEEDBACK: 'CONFIRM_FEEDBACK',
  CANCEL_FEEDBACK: 'CANCEL_FEEDBACK'
};

self.DefaultSettings = {
  monitoringEnabled: true,
  notificationsEnabled: true,
  attendanceConfirmationRequired: true,
  feedbackConfirmationRequired: true,
  pollIntervalSec: 15,
  feedbackSentiment: 'positive',
  feedbackOptions: ['Mentor', 'Content']
};

self.StorageKeys = {
  SETTINGS: 'kalvium_settings',
  CURRENT_STATE: 'kalvium_current_state',
  TODAY_SESSIONS: 'kalvium_today_sessions',
  SESSION_HISTORY: 'kalvium_session_history',
  LAST_LOGS: 'kalvium_last_logs'
};

// Set initial badge and install defaults
chrome.runtime.onInstalled.addListener(async () => {
  console.log('[KalviumAssistant] Service worker installed/updated.');

  const existing = await chrome.storage.local.get(self.StorageKeys.SETTINGS);
  if (!existing[self.StorageKeys.SETTINGS]) {
    await chrome.storage.local.set({
      [self.StorageKeys.SETTINGS]: self.DefaultSettings
    });
  }

  updateBadge(true);
});

/**
 * Update the extension icon badge according to monitoring status
 */
function updateBadge(enabled) {
  if (enabled) {
    chrome.action.setBadgeText({ text: 'ON' });
    chrome.action.setBadgeBackgroundColor({ color: '#2563eb' }); // Royal Blue
  } else {
    chrome.action.setBadgeText({ text: 'PAUSE' });
    chrome.action.setBadgeBackgroundColor({ color: '#64748b' }); // Slate Grey
  }
}

/**
 * Show rich Chrome notification with rate-limit protection
 */
let lastNotificationTime = 0;
let lastNotificationTitle = '';

function showNotification(title, message) {
  const now = Date.now();
  // Prevent duplicate spam within 4 seconds
  if (title === lastNotificationTitle && now - lastNotificationTime < 4000) {
    return;
  }
  lastNotificationTime = now;
  lastNotificationTitle = title;

  chrome.storage.local.get(self.StorageKeys.SETTINGS).then((res) => {
    const settings = res[self.StorageKeys.SETTINGS] || self.DefaultSettings;
    if (!settings.notificationsEnabled) return;

    chrome.notifications.create({
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/icon128.png'),
      title: title || 'Kalvium Attendance Assistant',
      message: message || '',
      priority: 2
    });
  });
}

/**
 * Message dispatcher
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === self.ActionTypes.SHOW_NOTIFICATION) {
    showNotification(request.title, request.message);
    sendResponse({ success: true });
  } else if (request.action === self.ActionTypes.OPEN_DASHBOARD) {
    const dashboardUrl = 'https://app.kalvium.community/dashboard';
    chrome.tabs.query({ url: '*://app.kalvium.community/*' }, (tabs) => {
      if (tabs && tabs.length > 0) {
        chrome.tabs.update(tabs[0].id, { active: true });
        chrome.windows.update(tabs[0].windowId, { focused: true });
      } else {
        chrome.tabs.create({ url: dashboardUrl });
      }
      sendResponse({ success: true });
    });
    return true; // async sendResponse
  } else if (request.action === self.ActionTypes.TOGGLE_MONITORING) {
    updateBadge(request.enabled);
    sendResponse({ success: true });
  }
});
