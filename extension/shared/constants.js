/**
 * Shared constants, state definitions, and action types for Kalvium Attendance Assistant.
 */

// Use global scope (globalThis) safely across Window, Worker, and Node.js environments
const _root = typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : window);

_root.KalviumStates = {
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

_root.CameraStates = {
  AVAILABLE: 'AVAILABLE',
  UNAVAILABLE: 'UNAVAILABLE',
  UNKNOWN: 'UNKNOWN'
};

_root.AttendanceBadgeStates = {
  UPCOMING: 'UPCOMING',
  LIVE: 'LIVE',
  PRESENT: 'PRESENT',
  ABSENT: 'ABSENT',
  UNKNOWN: 'UNKNOWN'
};

_root.ActionTypes = {
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

_root.DefaultSettings = {
  monitoringEnabled: true,
  notificationsEnabled: true,
  attendanceConfirmationRequired: true, // Immutable safety constraint
  feedbackConfirmationRequired: true,   // Immutable safety constraint
  pollIntervalSec: 15,
  feedbackSentiment: 'positive',        // 'positive' | 'neutral' | 'negative'
  feedbackOptions: ['Mentor', 'Content'] // Pre-configured tags
};

_root.StorageKeys = {
  SETTINGS: 'kalvium_settings',
  CURRENT_STATE: 'kalvium_current_state',
  TODAY_SESSIONS: 'kalvium_today_sessions',
  SESSION_HISTORY: 'kalvium_session_history',
  LAST_LOGS: 'kalvium_last_logs'
};

_root.KalviumConstants = {
  KalviumStates: _root.KalviumStates,
  CameraStates: _root.CameraStates,
  AttendanceBadgeStates: _root.AttendanceBadgeStates,
  ActionTypes: _root.ActionTypes,
  DefaultSettings: _root.DefaultSettings,
  StorageKeys: _root.StorageKeys
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = _root.KalviumConstants;
}
