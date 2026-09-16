/**
 * Feedback DOM detection and user-confirmed submission handler.
 * Preserves logic from app/attendance.py:detect_feedback_modal & handle_feedback.
 */

const KalviumFeedbackHandler = {
  /**
   * Locate the 'How was the session?' modal
   */
  locateFeedbackModal() {
    const dialogs = document.querySelectorAll('div[role="dialog"], [data-state="open"], .modal, [aria-modal="true"]');
    for (const dialog of dialogs) {
      if (dialog.innerText && dialog.innerText.includes('How was the session?')) {
        return dialog;
      }
    }
    return null;
  },

  /**
   * Pre-fill sentiment and options according to user configuration
   */
  configureFeedbackChoices(modal, settings) {
    if (!modal) return;

    const targetSentiment = (settings.feedbackSentiment || 'positive').toLowerCase();
    
    // Select sentiment emoji/button
    const buttons = Array.from(modal.querySelectorAll('button, [role="button"]'));
    let matchedSentiment = false;

    for (const btn of buttons) {
      const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
      const title = (btn.getAttribute('title') || '').toLowerCase();
      const txt = (btn.innerText || '').toLowerCase();
      if (ariaLabel.includes(targetSentiment) || title.includes(targetSentiment) || txt.includes(targetSentiment)) {
        btn.click();
        matchedSentiment = true;
        break;
      }
    }

    if (!matchedSentiment && buttons.length >= 3) {
      // Fallback index: 2 for positive, 1 for neutral, 0 for negative
      const idx = targetSentiment === 'positive' ? 2 : (targetSentiment === 'neutral' ? 1 : 0);
      if (buttons[idx]) buttons[idx].click();
    }

    // Select configured options / tags (e.g. Mentor, Content)
    const optionsToCheck = settings.feedbackOptions || ['Mentor', 'Content'];
    const optionElements = Array.from(modal.querySelectorAll('button, [role="checkbox"], div'));
    for (const opt of optionsToCheck) {
      for (const el of optionElements) {
        if ((el.innerText || '').trim() === opt && el.offsetParent !== null) {
          el.click();
          break;
        }
      }
    }
  },

  /**
   * Find the Submit button inside feedback modal
   */
  findSubmitButton(modal) {
    if (!modal) return null;
    const buttons = Array.from(modal.querySelectorAll('button, [role="button"]'));
    for (const btn of buttons) {
      const txt = (btn.innerText || '').trim();
      if (txt.toLowerCase() === 'submit' || txt.toLowerCase().includes('submit')) {
        return btn;
      }
    }
    return null;
  },

  /**
   * Injects an in-page modal / banner asking for explicit confirmation to submit feedback.
   */
  showFeedbackConfirmationBanner() {
    return new Promise((resolve) => {
      const existing = document.getElementById('kalvium-feedback-confirmation-banner');
      if (existing) existing.remove();

      const banner = document.createElement('div');
      banner.id = 'kalvium-feedback-confirmation-banner';
      banner.setAttribute('style', `
        position: fixed !important;
        top: 20px !important;
        right: 20px !important;
        width: 360px !important;
        z-index: 9999999 !important;
        background: #0f172a !important;
        color: #ffffff !important;
        border: 2px solid #10b981 !important;
        border-radius: 12px !important;
        box-shadow: 0 20px 25px -5px rgba(0,0,0,0.5) !important;
        padding: 20px !important;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
        font-size: 14px !important;
        line-height: 1.5 !important;
      `);

      banner.innerHTML = `
        <div style="display:flex; align-items:center; margin-bottom: 10px;">
          <div style="background:#10b981; width:10px; height:10px; border-radius:50%; margin-right:10px;"></div>
          <strong style="font-size: 15px;">SESSION FEEDBACK READY</strong>
        </div>
        <p style="margin: 0 0 14px 0; color: #94a3b8;">Feedback selections have been applied. Submit feedback now?</p>
        <div style="display: flex; justify-content: flex-end;">
          <button id="k-feedback-cancel-btn" style="padding: 8px 14px; border-radius:6px; background:#334155; color:#fff; border:none; margin-right:10px; cursor:pointer;">Cancel</button>
          <button id="k-feedback-confirm-btn" style="padding: 8px 14px; border-radius:6px; background:#10b981; color:#fff; border:none; cursor:pointer; font-weight:600;">Confirm & Submit</button>
        </div>
      `;

      document.body.appendChild(banner);

      const confirmBtn = banner.querySelector('#k-feedback-confirm-btn');
      const cancelBtn = banner.querySelector('#k-feedback-cancel-btn');

      const cleanup = (res) => {
        banner.remove();
        resolve(res);
      };

      confirmBtn.addEventListener('click', () => cleanup(true));
      cancelBtn.addEventListener('click', () => cleanup(false));
    });
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { KalviumFeedbackHandler };
} else {
  window.KalviumFeedbackHandler = KalviumFeedbackHandler;
}
