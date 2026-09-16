# Kalvium Attendance Assistant - Chrome Extension (Manifest V3)

A safe, reliable Manifest V3 Chrome Extension designed for students on [Kalvium Community Dashboard](https://app.kalvium.community/*).

This extension eliminates the need to run the CLI-based Python script (`python main.py`) by running directly inside Google Chrome, monitoring session changes, camera status, attendance windows, and feedback prompts with strict human-in-the-loop safeguards.

---

## Features

- **Manifest V3 Architecture**: Lightweight background service worker + scoped content scripts on `https://app.kalvium.community/*`.
- **Accurate DOM Detection**: Preserves the time-pattern parsing, "Happening Now", "Take A Snap" modal detection, and "How was the session?" feedback handlers from the reference Python implementation.
- **Physical Webcam Integration**: Works seamlessly with your laptop's native webcam via Chrome's media permissions. No OBS Virtual Camera, fake feeds, or video injection required.
- **Safety First**: Mandatory pre-submission confirmation banners appear directly on the webpage before any Attendance or Feedback action is performed.
- **Polished Popup & Options UI**:
  - Live session name, timing, attendance badge, and camera indicator.
  - List of today's classes from "My Day".
  - Quick action to open/focus dashboard.
  - Pause / Resume monitoring toggle.
  - User-configurable polling intervals and feedback preferences.

---

## Installation Instructions

1. Open **Google Chrome** on your computer.
2. Navigate to: `chrome://extensions`
3. Enable **Developer mode** using the toggle in the top-right corner.
4. Click the **Load unpacked** button in the top-left corner.
5. In the file picker, select the `extension` folder located inside this project:
   ```
   Z:\kalvium-attendance-assistant\extension
   ```
6. The **Kalvium Attendance Assistant** extension will appear in your extensions list.
7. Click the Chrome **Extensions icon** (puzzle piece) in your browser toolbar and **Pin** Kalvium Attendance Assistant.

---

## How to Run & Use

1. Open your Kalvium dashboard:
   ```
   https://app.kalvium.community/dashboard
   ```
2. If not already signed in, log in with your credentials/Google account manually.
3. Click the **Kalvium Assistant** icon in your toolbar.
4. Ensure monitoring is **ACTIVE** (shows `ON` badge on the extension icon).
5. Keep your Kalvium dashboard tab open while attending your classes.
6. When attendance opens:
   - The extension detects the live session and clicks the dashboard trigger.
   - The "Take A Snap" camera modal opens, displaying your live camera feed.
   - An in-page **Confirmation Banner** appears asking:
     > *"Live camera is ready. You are about to submit attendance for: [Class Name]. Press Confirm to continue."*
   - Review your live video feed in the modal and click **Confirm & Submit**.
   - The extension marks attendance and confirms the Present status.
7. When class ends and feedback pops up:
   - The extension detects "How was the session?".
   - Pre-selects your configured sentiment and tags.
   - Prompts you with a confirmation banner before submitting.

---

## Troubleshooting & Diagnostics

- **Badge shows "PAUSED"**:
  - Click the extension icon and click **Resume Monitoring**, or toggle it back on in the Settings page (`chrome-extension://<id>/options/options.html`).
- **"Camera permission is required"**:
  - Click the padlock/site settings icon in Chrome's address bar next to `https://app.kalvium.community` and ensure **Camera** is set to **Allow**.
- **Dashboard Not Detected**:
  - Make sure you are on `https://app.kalvium.community/dashboard` and not on an external Google accounts page. Complete login first.
- **Inspect Extension Logs**:
  1. Go to `chrome://extensions`.
  2. Under Kalvium Attendance Assistant, click `Inspect views: service worker` to inspect background messages.
  3. On the Kalvium dashboard tab, open Chrome DevTools (`F12` or `Ctrl+Shift+I`) -> Console to view real-time `[KalviumAssistant]` logs.
