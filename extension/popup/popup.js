/**
 * Popup interactive logic for Kalvium Attendance Assistant.
 */

document.addEventListener('DOMContentLoaded', async () => {
  const { ActionTypes, KalviumStates, AttendanceBadgeStates, CameraStates } = window.KalviumConstants;
  const Store = window.KalviumStateStore;

  // DOM Elements
  const statusBadge = document.getElementById('status-badge');
  const sessionNameEl = document.getElementById('session-name');
  const sessionTimeEl = document.getElementById('session-time');
  const attendanceStatusEl = document.getElementById('attendance-status');
  const cameraStatusEl = document.getElementById('camera-status');
  const stateDetailEl = document.getElementById('state-detail');
  const sessionsListEl = document.getElementById('sessions-list');

  const btnOpenDashboard = document.getElementById('btn-open-dashboard');
  const btnToggleMonitor = document.getElementById('btn-toggle-monitor');
  const btnSettings = document.getElementById('btn-settings');

  let currentSettings = await Store.getSettings();

  /**
   * Render state to UI elements
   */
  function renderUI(stateData) {
    // 1. Monitoring Badge & Toggle button
    if (currentSettings.monitoringEnabled) {
      statusBadge.textContent = 'ACTIVE';
      statusBadge.className = 'badge badge-active';
      btnToggleMonitor.textContent = 'Pause Monitoring';
    } else {
      statusBadge.textContent = 'PAUSED';
      statusBadge.className = 'badge badge-paused';
      btnToggleMonitor.textContent = 'Resume Monitoring';
    }

    // 2. Current Session
    const session = stateData.session;
    if (session) {
      sessionNameEl.textContent = session.title || 'Current Session';
      sessionTimeEl.textContent = session.timeRange || 'Scheduled';
    } else {
      sessionNameEl.textContent = stateData.state === KalviumStates.DASHBOARD_NOT_FOUND ? 'Dashboard Not Found' : 'No Active Session';
      sessionTimeEl.textContent = '--:--';
    }

    // 3. Attendance Badge
    const att = stateData.attendanceStatus || AttendanceBadgeStates.UNKNOWN;
    attendanceStatusEl.textContent = att;
    attendanceStatusEl.className = 'meta-val val-' + att.toLowerCase();

    // 4. Camera Status
    const cam = stateData.cameraState || CameraStates.UNKNOWN;
    cameraStatusEl.textContent = cam;
    cameraStatusEl.className = 'meta-val val-' + cam.toLowerCase();

    // 5. Detail message
    stateDetailEl.textContent = stateData.details || 'Monitoring Kalvium activity...';
  }

  /**
   * Render today's schedule list
   */
  async function renderSchedule() {
    const sessions = await Store.getTodaySessions();
    if (!sessions || sessions.length === 0) {
      sessionsListEl.innerHTML = '<div class="empty-state">No scheduled sessions loaded</div>';
      return;
    }

    sessionsListEl.innerHTML = '';
    sessions.forEach(s => {
      const row = document.createElement('div');
      row.className = 'session-row';

      const tagClass = 'val-' + (s.attendanceStatus || 'unknown').toLowerCase();

      row.innerHTML = `
        <div class="session-row-info">
          <span class="session-row-title" title="${s.title}">${s.title}</span>
          <span class="session-row-time">${s.timeRange}</span>
        </div>
        <span class="session-row-tag ${tagClass}">${s.attendanceStatus || 'SCHEDULED'}</span>
      `;
      sessionsListEl.appendChild(row);
    });
  }

  // Load initial data
  const initialState = await Store.getCurrentState();
  renderUI(initialState);
  renderSchedule();

  // Listen for background/content script live broadcasts
  chrome.runtime.onMessage.addListener((request) => {
    if (request.action === ActionTypes.STATE_UPDATED) {
      renderUI(request.state);
      renderSchedule();
    }
  });

  // Controls Handlers
  btnOpenDashboard.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: ActionTypes.OPEN_DASHBOARD });
  });

  btnToggleMonitor.addEventListener('click', async () => {
    currentSettings.monitoringEnabled = !currentSettings.monitoringEnabled;
    await Store.saveSettings(currentSettings);

    // Notify service worker and active tabs
    chrome.runtime.sendMessage({
      action: ActionTypes.TOGGLE_MONITORING,
      enabled: currentSettings.monitoringEnabled
    });

    chrome.tabs.query({ url: '*://app.kalvium.community/*' }, (tabs) => {
      tabs.forEach(tab => {
        chrome.tabs.sendMessage(tab.id, {
          action: ActionTypes.TOGGLE_MONITORING,
          enabled: currentSettings.monitoringEnabled
        }).catch(() => {});
      });
    });

    renderUI(await Store.getCurrentState());
  });

  btnSettings.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });
});
