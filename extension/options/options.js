/**
 * Options page handler for Kalvium Assistant.
 */

document.addEventListener('DOMContentLoaded', async () => {
  const Store = window.KalviumStateStore;

  const toggleMonitoring = document.getElementById('toggle-monitoring');
  const pollInterval = document.getElementById('poll-interval');
  const toggleNotifications = document.getElementById('toggle-notifications');
  const feedbackSentiment = document.getElementById('feedback-sentiment');
  const tagsContainer = document.getElementById('tags-container');
  const btnSave = document.getElementById('btn-save');
  const saveStatus = document.getElementById('save-status');

  // Load existing settings
  const settings = await Store.getSettings();

  toggleMonitoring.checked = settings.monitoringEnabled;
  pollInterval.value = settings.pollIntervalSec || 15;
  toggleNotifications.checked = settings.notificationsEnabled;
  feedbackSentiment.value = settings.feedbackSentiment || 'positive';

  // Check matching tags
  const activeTags = new Set(settings.feedbackOptions || ['Mentor', 'Content']);
  const checkboxes = tagsContainer.querySelectorAll('input[type="checkbox"]');
  checkboxes.forEach(cb => {
    cb.checked = activeTags.has(cb.value);
  });

  // Save settings handler
  btnSave.addEventListener('click', async () => {
    const selectedTags = [];
    checkboxes.forEach(cb => {
      if (cb.checked) selectedTags.push(cb.value);
    });

    const updated = {
      monitoringEnabled: toggleMonitoring.checked,
      pollIntervalSec: Math.max(5, parseInt(pollInterval.value, 10) || 15),
      notificationsEnabled: toggleNotifications.checked,
      attendanceConfirmationRequired: true, // Immutable safety invariant
      feedbackConfirmationRequired: true,   // Immutable safety invariant
      feedbackSentiment: feedbackSentiment.value,
      feedbackOptions: selectedTags
    };

    await Store.saveSettings(updated);

    // Notify service worker of monitoring badge status
    chrome.runtime.sendMessage({
      action: window.KalviumConstants.ActionTypes.TOGGLE_MONITORING,
      enabled: updated.monitoringEnabled
    });

    saveStatus.textContent = 'Settings saved successfully!';
    setTimeout(() => {
      saveStatus.textContent = '';
    }, 2500);
  });
});
