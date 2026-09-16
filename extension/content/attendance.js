/**
 * Attendance DOM inspection, modal detection, camera verification,
 * and user confirmation modal injection.
 * Preserves the exact DOM detection logic from Python app/attendance.py.
 */

const KalviumAttendanceHandler = {
  // Selectors mapped from Python implementation
  ACTION_BUTTON_CANDIDATES: [
    'Mark Attendance',
    'mark attendance',
    'Check In',
    'Mark Present',
    'Punch In',
    'Record Attendance'
  ],

  PRESENT_INDICATORS: [
    "You're marked as present",
    "marked as present",
    "You've marked your attendance",
    "Attendance Marked",
    "Marked for Today",
    "• Present",
    "● Present",
    "Present"
  ],

  ABSENT_INDICATORS: [
    "You're marked as absent",
    "marked as absent",
    "• Absent",
    "● Absent",
    "Absent"
  ],

  /**
   * Find Take A Snap modal container if open
   */
  locateTakeASnapModal() {
    const dialogs = document.querySelectorAll('div[role="dialog"], [data-state="open"], .modal, [aria-modal="true"]');
    for (const dialog of dialogs) {
      if (dialog.innerText && dialog.innerText.includes('Take A Snap')) {
        return dialog;
      }
    }
    return null;
  },

  /**
   * Verify camera preview element inside Take A Snap modal
   */
  checkCameraStatus(modal) {
    if (!modal) return window.KalviumConstants.CameraStates.UNKNOWN;

    // Check for explicit camera error
    const text = modal.innerText || '';
    if (text.includes('Camera is already in use') || 
        text.includes('permission denied') || 
        text.includes('Error accessing camera')) {
      return window.KalviumConstants.CameraStates.UNAVAILABLE;
    }

    const videoOrCanvas = modal.querySelector('video, canvas, [data-testid="camera-preview"]');
    if (videoOrCanvas) {
      // Check if video is receiving stream / dimensions
      if (videoOrCanvas.tagName.toLowerCase() === 'video') {
        if (videoOrCanvas.readyState >= 2 || videoOrCanvas.videoWidth > 0) {
          return window.KalviumConstants.CameraStates.AVAILABLE;
        }
      }
      return window.KalviumConstants.CameraStates.AVAILABLE;
    }

    return window.KalviumConstants.CameraStates.UNKNOWN;
  },

  /**
   * Locate the trigger button on dashboard
   */
  findDashboardAttendanceButton() {
    const buttons = Array.from(document.querySelectorAll('button, [role="button"], a'));
    for (const text of this.ACTION_BUTTON_CANDIDATES) {
      for (const btn of buttons) {
        if (btn.offsetParent !== null) { // visible
          const btnText = (btn.innerText || '').trim();
          if (btnText.toLowerCase().includes(text.toLowerCase())) {
            // Ensure not a dialog submit button if dialog isn't open
            return btn;
          }
        }
      }
    }
    return null;
  },

  /**
   * Locate final Mark Attendance submit button inside modal
   */
  findModalSubmitButton(modal) {
    if (!modal) return null;
    const buttons = Array.from(modal.querySelectorAll('button, [role="button"]'));
    for (const btn of buttons) {
      const text = (btn.innerText || '').trim();
      if (text.toLowerCase().includes('mark attendance')) {
        return btn;
      }
    }
    return null;
  },

  /**
   * Check for status indicators (Present/Absent) on dashboard or active card
   */
  checkMarkedStatus() {
    const bodyText = document.body ? document.body.innerText : '';
    
    // Check Present first
    for (const ind of this.PRESENT_INDICATORS) {
      if (bodyText.includes(ind)) {
        return window.KalviumConstants.AttendanceBadgeStates.PRESENT;
      }
    }

    // Check Absent
    for (const ind of this.ABSENT_INDICATORS) {
      if (bodyText.includes(ind)) {
        return window.KalviumConstants.AttendanceBadgeStates.ABSENT;
      }
    }

    return window.KalviumConstants.AttendanceBadgeStates.UNKNOWN;
  },

  /**
   * Injects an in-page modal / banner requiring explicit user confirmation before attendance submission.
   */
  showConfirmationBanner(sessionName, timeRange) {
    return new Promise((resolve) => {
      // Remove any existing confirmation banner
      const existing = document.getElementById('kalvium-attendance-confirmation-banner');
      if (existing) existing.remove();

      const banner = document.createElement('div');
      banner.id = 'kalvium-attendance-confirmation-banner';
      banner.setAttribute('style', `
        position: fixed !important;
        top: 20px !important;
        right: 20px !important;
        width: 380px !important;
        z-index: 9999999 !important;
        background: #0f172a !important;
        color: #ffffff !important;
        border: 2px solid #3b82f6 !important;
        border-radius: 12px !important;
        box-shadow: 0 20px 25px -5px rgba(0,0,0,0.5), 0 10px 10px -5px rgba(0,0,0,0.3) !important;
        padding: 20px !important;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
        font-size: 14px !important;
        line-height: 1.5 !important;
        animation: kalviumSlideIn 0.3s ease-out !important;
      `);

      banner.innerHTML = `
        <style>
          @keyframes kalviumSlideIn {
            from { transform: translateX(100px); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
          }
          .k-btn {
            padding: 9px 16px;
            border-radius: 6px;
            font-weight: 600;
            cursor: pointer;
            border: none;
            transition: all 0.2s;
            font-size: 13px;
          }
          .k-btn-confirm {
            background: #2563eb;
            color: #ffffff;
          }
          .k-btn-confirm:hover {
            background: #1d4ed8;
          }
          .k-btn-cancel {
            background: #334155;
            color: #e2e8f0;
            margin-right: 10px;
          }
          .k-btn-cancel:hover {
            background: #475569;
          }
        </style>
        <div style="display:flex; align-items:center; margin-bottom: 12px;">
          <div style="background:#2563eb; width:10px; height:10px; border-radius:50%; margin-right:10px;"></div>
          <strong style="font-size: 15px; letter-spacing: 0.5px;">KALVIUM ATTENDANCE CONFIRMATION</strong>
        </div>
        <p style="margin: 0 0 10px 0; color: #94a3b8;">Live camera is ready. You are about to submit attendance for:</p>
        <div style="background:#1e293b; padding: 10px 12px; border-radius: 8px; margin-bottom: 14px;">
          <div style="font-weight: 600; color: #f8fafc;">${sessionName || 'Current Session'}</div>
          <div style="font-size: 12px; color: #38bdf8;">${timeRange || 'Live Window'}</div>
        </div>
        <div style="font-size: 12px; color: #cbd5e1; margin-bottom: 16px;">
          Press <b>Confirm</b> to complete submission or <b>Cancel</b> to abort.
        </div>
        <div style="display: flex; justify-content: flex-end;">
          <button id="k-cancel-btn" class="k-btn k-btn-cancel">Cancel</button>
          <button id="k-confirm-btn" class="k-btn k-btn-confirm">Confirm & Submit</button>
        </div>
      `;

      document.body.appendChild(banner);

      const confirmBtn = banner.querySelector('#k-confirm-btn');
      const cancelBtn = banner.querySelector('#k-cancel-btn');

      const cleanup = (result) => {
        banner.remove();
        resolve(result);
      };

      confirmBtn.addEventListener('click', () => cleanup(true));
      cancelBtn.addEventListener('click', () => cleanup(false));
    });
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { KalviumAttendanceHandler };
} else {
  window.KalviumAttendanceHandler = KalviumAttendanceHandler;
}
