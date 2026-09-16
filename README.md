# Kalvium Attendance Assistant

A safe, robust, session-aware local Python automation assistant for the Kalvium student dashboard at `https://app.kalvium.community/dashboard`.

This tool assists with navigating the normal session schedule, detecting live attendance windows, verifying your live OBS Virtual Camera preview in the "Take A Snap" modal, prompting for human presence confirmation, and handling end-of-class feedback modals according to your configured preferences.

---

## 1. Safety Principles & Limitations

> [!IMPORTANT]
> **Strict Operational Boundaries:**
> - **Zero Spoofing / Zero Bypass:** No fake webcam frames, prerecorded media, face spoofing, or liveness bypass. Uses legitimate OBS Virtual Camera with you physically present.
> - **Human Confirmation Required:** Before submitting attendance, the assistant displays:
>   ```
>   --------------------------------------------------
>   READY TO MARK ATTENDANCE
>
>   Session: <detected session>
>   Time: <detected time>
>
>   Live camera detected: YES
>
>   Press ENTER to submit attendance.
>   Press ESC to cancel.
>   --------------------------------------------------
>   ```
> - **Feedback Review:** If the "How was the session?" end-of-class modal appears, configured options are selected and the user is explicitly prompted `Feedback is ready. Submit it? [Y/N]` before submission.
> - **Manual Authentication:** The assistant will **never** ask for, harvest, or store passwords, cookies, or OAuth tokens. Login is completed manually by you in the visible browser session.
> - **Safe DOM Locators:** Uses scoped semantic locators inside modals and cards—never blind screen coordinate clicks.

---

## 2. State Machine Architecture

```
START
  ↓
OPEN_DASHBOARD
  ↓
AUTHENTICATION_CHECK
  ↓
READ_MY_DAY
  ↓
DETERMINE_CURRENT_SESSION
  ↓
WAIT_FOR_ATTENDANCE_WINDOW
  ↓
CHECK_ATTENDANCE_STATE
  ↓
ATTENDANCE_AVAILABLE
  ↓
OPEN_CAMERA_MODAL
  ↓
VERIFY_LIVE_CAMERA
  ↓
READY_FOR_USER_CONFIRMATION
  ↓
USER_CONFIRMS (ENTER / ESC)
  ↓
SUBMIT_ATTENDANCE
  ↓
VERIFY_ATTENDANCE_RESULT
  ↓
SESSION_MONITORING
  ↓
FEEDBACK_AVAILABLE -> FEEDBACK_REVIEW
  ↓
NEXT_SESSION
```

---

## 3. Setup & Installation

### Step 1: Clone or Navigate to the Repository
```powershell
cd z:\kalvium-attendance-assistant
```

### Step 2: Install Dependencies & Chromium
```powershell
pip install -r requirements.txt
playwright install chromium
```

---

## 4. OBS Studio Setup (Virtual Camera)

1. Open **OBS Studio**.
2. Ensure your Scene has a **Video Capture Device** configured for your physical webcam.
3. Click **Start Virtual Camera** in the bottom-right Controls panel.
4. Keep OBS running while using the assistant.

---

## 5. Configuration (.env)

Edit `.env` (or copy from `.env.example`):
```ini
KALVIUM_DASHBOARD_URL=https://app.kalvium.community/dashboard
BROWSER_PROFILE_PATH=./.browser-profile
BROWSER_HEADLESS=false
ACTION_TIMEOUT_MS=15000
LOG_LEVEL=INFO
SCREENSHOTS_DIR=./screenshots

# Feedback Automation Settings
FEEDBACK_SENTIMENT=positive
FEEDBACK_OPTIONS=Mentor was well prepared,Pacing was good,Concepts were clearly explained

# Polling Interval & Timing
POLL_INTERVAL_SEC=5
MAX_WAIT_MINUTES=30
```

---

## 6. Execution Modes

### 1. Dry Run Mode (`--dry-run`)
Simulates the entire workflow, DOM inspections, camera checks, and prompt flow without clicking the final submit buttons:
```powershell
python main.py --dry-run
```

### 2. Inspect Only (`--inspect-only`)
Inspects the current dashboard state, "My Day" sessions, and modal statuses without any actions:
```powershell
python main.py --inspect-only
```

### 3. Single Session Execution (`--once`)
Processes the active session (or exits if attendance is already marked / absent) and automatically closes the browser when complete:
```powershell
python main.py --once
```

### 4. Watch Mode (`--watch`)
Continuously monitors your dashboard schedule throughout the day, automatically transitioning through sessions and handling attendance and feedback:
```powershell
python main.py --watch
```

---

## 7. Running Unit Tests

Run the test suite with pytest:
```powershell
pytest -v
```
All tests run with mocked browser contexts and do not touch external services.
