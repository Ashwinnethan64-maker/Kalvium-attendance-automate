/**
 * Core Kalvium page inspector, DOM observer, and state coordinator.
 * Injected on https://app.kalvium.community/*
 */

(function () {
  const {
    KalviumStates,
    CameraStates,
    AttendanceBadgeStates,
    ActionTypes
  } = window.KalviumConstants;

  const Logger = window.KalviumLogger;
  const Store = window.KalviumStateStore;
  const Attendance = window.KalviumAttendanceHandler;
  const Feedback = window.KalviumFeedbackHandler;

  let isMonitoringActive = true;
  let pollTimer = null;
  let observer = null;
  let isActionInProgress = false;

  // Regex pattern from Python app/attendance.py:78
  const TIME_PATTERN = /[0-9]{1,2}:[0-9]{2}\s*(?:AM|PM)\s*-\s*[0-9]{1,2}:[0-9]{2}\s*(?:AM|PM)/i;

  /**
   * Parse scheduled sessions from "My Day" dashboard container
   */
  function parseMyDaySessions() {
    const sessions = [];
    try {
      // Look for elements with time patterns
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      const matchedTextNodes = [];
      let node;
      while ((node = walker.nextNode())) {
        if (TIME_PATTERN.test(node.nodeValue)) {
          matchedTextNodes.push(node.parentElement);
        }
      }

      const processedCards = new Set();

      for (const el of matchedTextNodes) {
        // Traverse upwards to find session card container
        let card = el.closest('div[class*="card"], div[class*="rounded"], div[class*="border"], div[class*="p-"]') || el.parentElement;
        if (!card || processedCards.has(card)) continue;
        processedCards.add(card);

        const cardText = (card.innerText || '').replace(/\s+/g, ' ').trim();
        const timeMatch = cardText.match(TIME_PATTERN);
        const timeRange = timeMatch ? timeMatch[0] : 'Scheduled';

        const isLive = cardText.includes('Happening Now') || cardText.includes('Attendance is live');

        let attendanceStatus = AttendanceBadgeStates.UNKNOWN;
        if (cardText.includes('Present')) {
          attendanceStatus = AttendanceBadgeStates.PRESENT;
        } else if (cardText.includes('Absent')) {
          attendanceStatus = AttendanceBadgeStates.ABSENT;
        } else if (isLive) {
          attendanceStatus = AttendanceBadgeStates.LIVE;
        } else {
          attendanceStatus = AttendanceBadgeStates.UPCOMING;
        }

        // Title extraction
        const lines = (card.innerText || '').split('\n').map(l => l.trim()).filter(l => l && !TIME_PATTERN.test(l));
        const title = lines.length > 0 ? lines[0] : 'Kalvium Session';

        sessions.push({
          title,
          timeRange,
          isLive,
          attendanceStatus,
          rawText: cardText.substring(0, 100)
        });
      }
    } catch (err) {
      Logger.error('Error parsing My Day sessions:', err);
    }
    return sessions;
  }

  /**
   * Detect current active or live session
   */
  function detectCurrentSession(sessions) {
    for (const s of sessions) {
      if (s.isLive) return s;
    }

    // Fallback: check "Happening Now" directly
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (node.nodeValue.includes('Happening Now')) {
        const parent = node.parentElement.closest('div[class*="flex"], div[class*="card"], div[class*="rounded"]') || node.parentElement;
        const text = (parent.innerText || '').replace('Happening Now', '').trim();
        const title = text.split('\n')[0] || 'Current Session';
        return {
          title,
          timeRange: 'Happening Now',
          isLive: true,
          attendanceStatus: AttendanceBadgeStates.LIVE
        };
      }
    }

    return sessions.length > 0 ? sessions[0] : null;
  }

  /**
   * Check if on authentication page
   */
  function isAuthPage() {
    const url = window.location.href.toLowerCase();
    const authIndicators = ['/login', '/auth', '/signin', 'accounts.google.com'];
    if (authIndicators.some(ind => url.includes(ind))) return true;

    const buttons = Array.from(document.querySelectorAll('button, a'));
    return buttons.some(b => {
      const t = (b.innerText || '').toLowerCase();
      return (t.includes('sign in') || t.includes('log in') || t.includes('login with google')) && b.offsetParent !== null;
    });
  }

  /**
   * Notify background service worker to display system notifications
   */
  function notify(title, message) {
    try {
      chrome.runtime.sendMessage({
        action: ActionTypes.SHOW_NOTIFICATION,
        title,
        message
      }).catch(() => {});
    } catch (_) {}
  }

  /**
   * Primary page state evaluator
   */
  async function evaluatePageState() {
    if (!isMonitoringActive || isActionInProgress) return;

    try {
      const settings = await Store.getSettings();
      if (!settings.monitoringEnabled) {
        await Store.setCurrentState({
          state: KalviumStates.IDLE,
          details: 'Monitoring is paused by user.'
        });
        return;
      }

      // 1. Auth check
      if (isAuthPage()) {
        await Store.setCurrentState({
          state: KalviumStates.DASHBOARD_NOT_FOUND,
          details: 'Authentication required. Please log in manually.'
        });
        return;
      }

      // 2. Dashboard detection
      if (!window.location.pathname.includes('/dashboard') && !document.body.innerText.includes('My Day')) {
        await Store.setCurrentState({
          state: KalviumStates.DASHBOARD_NOT_FOUND,
          details: 'Kalvium dashboard not detected on this page.'
        });
        return;
      }

      // 3. Feedback modal check
      const feedbackModal = Feedback.locateFeedbackModal();
      if (feedbackModal) {
        isActionInProgress = true;
        await Store.setCurrentState({
          state: KalviumStates.FEEDBACK_AVAILABLE,
          details: 'Session feedback modal detected.'
        });
        notify('Kalvium Assistant', 'Session feedback is ready for review.');

        // Pre-configure selections
        Feedback.configureFeedbackChoices(feedbackModal, settings);

        await Store.setCurrentState({
          state: KalviumStates.WAITING_FOR_FEEDBACK_CONFIRMATION,
          details: 'Waiting for feedback submission confirmation.'
        });

        const userConfirmed = await Feedback.showFeedbackConfirmationBanner();
        if (userConfirmed) {
          const submitBtn = Feedback.findSubmitButton(feedbackModal);
          if (submitBtn) {
            submitBtn.click();
            await Store.setCurrentState({
              state: KalviumStates.FEEDBACK_SUBMITTED,
              details: 'Feedback submitted successfully.'
            });
            notify('Kalvium Assistant', 'Session feedback submitted successfully.');
          }
        }
        isActionInProgress = false;
        return;
      }

      // 4. Parse sessions
      const sessions = parseMyDaySessions();
      await Store.saveTodaySessions(sessions);
      const currentSession = detectCurrentSession(sessions);

      // 5. Check attendance marked status
      const markedStatus = Attendance.checkMarkedStatus();
      if (markedStatus === AttendanceBadgeStates.PRESENT) {
        await Store.setCurrentState({
          state: KalviumStates.ATTENDANCE_PRESENT,
          session: currentSession,
          attendanceStatus: AttendanceBadgeStates.PRESENT,
          details: 'Attendance verified as PRESENT for today.'
        });
        return;
      }

      if (markedStatus === AttendanceBadgeStates.ABSENT) {
        await Store.setCurrentState({
          state: KalviumStates.ATTENDANCE_ABSENT,
          session: currentSession,
          attendanceStatus: AttendanceBadgeStates.ABSENT,
          details: 'Marked as ABSENT for current session.'
        });
        return;
      }

      // 6. Check 'Take A Snap' modal
      const snapModal = Attendance.locateTakeASnapModal();
      if (snapModal) {
        const cameraState = Attendance.checkCameraStatus(snapModal);
        const submitBtn = Attendance.findModalSubmitButton(snapModal);

        if (cameraState === CameraStates.UNAVAILABLE) {
          await Store.setCurrentState({
            state: KalviumStates.ERROR,
            session: currentSession,
            cameraState,
            details: 'Camera permission is required. Please allow camera access in Chrome.'
          });
          notify('Camera Permission Error', 'Please allow camera access in Chrome for Kalvium.');
          return;
        }

        await Store.setCurrentState({
          state: cameraState === CameraStates.AVAILABLE ? KalviumStates.CAMERA_READY : KalviumStates.CAMERA_MODAL,
          session: currentSession,
          cameraState,
          details: 'Attendance camera modal is open.'
        });

        // Trigger confirmation prompt
        if (submitBtn && !document.getElementById('kalvium-attendance-confirmation-banner')) {
          isActionInProgress = true;
          await Store.setCurrentState({
            state: KalviumStates.WAITING_FOR_USER_CONFIRMATION,
            session: currentSession,
            cameraState,
            details: 'Waiting for user confirmation to submit attendance.'
          });

          notify('Attendance Ready', `Live camera is ready for ${currentSession ? currentSession.title : 'Current Class'}.`);

          const confirmed = await Attendance.showConfirmationBanner(
            currentSession ? currentSession.title : 'Current Class',
            currentSession ? currentSession.timeRange : 'Live'
          );

          if (confirmed) {
            await Store.setCurrentState({
              state: KalviumStates.SUBMITTING_ATTENDANCE,
              session: currentSession,
              details: 'Submitting attendance...'
            });

            submitBtn.click();
            Logger.info('Clicked Mark Attendance inside modal.');

            // Allow short delay for result verification
            setTimeout(async () => {
              const newStatus = Attendance.checkMarkedStatus();
              if (newStatus === AttendanceBadgeStates.PRESENT) {
                await Store.setCurrentState({
                  state: KalviumStates.ATTENDANCE_PRESENT,
                  session: currentSession,
                  attendanceStatus: AttendanceBadgeStates.PRESENT,
                  details: 'Attendance confirmed marked as PRESENT!'
                });
                notify('Success', 'Attendance marked successfully!');
              } else {
                await Store.setCurrentState({
                  state: KalviumStates.ATTENDANCE_PRESENT, // Standard optimistic on modal dismiss
                  session: currentSession,
                  details: 'Attendance submission completed.'
                });
              }
              isActionInProgress = false;
            }, 2500);
          } else {
            Logger.info('User cancelled attendance submission.');
            isActionInProgress = false;
          }
        }
        return;
      }

      // 7. Check if Mark Attendance button is visible on dashboard
      const dashboardBtn = Attendance.findDashboardAttendanceButton();
      if (dashboardBtn) {
        await Store.setCurrentState({
          state: KalviumStates.ATTENDANCE_AVAILABLE,
          session: currentSession,
          attendanceStatus: AttendanceBadgeStates.LIVE,
          details: `Active attendance button found: "${dashboardBtn.innerText.trim()}"`
        });

        // Automatically open the camera modal to prepare attendance
        Logger.info('Opening Take A Snap modal...');
        dashboardBtn.click();
        return;
      }

      // 8. Normal dashboard state
      if (currentSession && currentSession.isLive) {
        await Store.setCurrentState({
          state: KalviumStates.SESSION_LIVE,
          session: currentSession,
          attendanceStatus: AttendanceBadgeStates.LIVE,
          details: `Session is live: ${currentSession.title}`
        });
      } else if (currentSession) {
        await Store.setCurrentState({
          state: KalviumStates.SESSION_UPCOMING,
          session: currentSession,
          attendanceStatus: AttendanceBadgeStates.UPCOMING,
          details: `Upcoming session: ${currentSession.title} (${currentSession.timeRange})`
        });
      } else {
        await Store.setCurrentState({
          state: KalviumStates.DASHBOARD_READY,
          details: 'Dashboard active. No sessions currently running.'
        });
      }
    } catch (err) {
      Logger.error('Evaluation loop error:', err);
    }
  }

  /**
   * Start periodic polling & DOM MutationObserver
   */
  async function startMonitoring() {
    Logger.info('Initializing Kalvium Attendance content script monitor...');
    const settings = await Store.getSettings();
    isMonitoringActive = settings.monitoringEnabled;

    // Run initial evaluation
    evaluatePageState();

    // DOM MutationObserver for instant reaction to modal mounts
    observer = new MutationObserver(() => {
      evaluatePageState();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    // Conservative periodic fallback interval
    const intervalMs = Math.max(5000, (settings.pollIntervalSec || 15) * 1000);
    pollTimer = setInterval(evaluatePageState, intervalMs);

    // Listen for runtime commands (e.g. from popup toggle)
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === ActionTypes.TOGGLE_MONITORING) {
        isMonitoringActive = request.enabled;
        evaluatePageState();
        sendResponse({ success: true, enabled: isMonitoringActive });
      }
    });
  }

  // Ensure DOM is ready before starting
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startMonitoring);
  } else {
    startMonitoring();
  }
})();
