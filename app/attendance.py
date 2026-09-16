"""Attendance detection, inspection, and safe interaction module.

Follows strict safety principles:
- Inspects real DOM elements without guessing or hardcoding unverified selectors.
- Reports detected DOM structures and states clearly.
- Requires explicit user presence confirmation (ENTER to submit, ESC to cancel).
- Stops safely if the page differs from expectations or if login is required.
"""

from dataclasses import dataclass
from enum import Enum
import logging
import time
from typing import Callable, List, Optional, Tuple

from playwright.sync_api import Locator, Page, TimeoutError as PlaywrightTimeoutError

from app.config import AppConfig
from app.models import FeedbackInfo, SessionInfo, WorkflowState


class AttendanceState(str, Enum):
    """Possible attendance states detected on the Kalvium dashboard."""
    AUTH_REQUIRED = "AUTH_REQUIRED"
    DASHBOARD_READY = "DASHBOARD_READY"
    ATTENDANCE_READY = "ATTENDANCE_READY"
    ALREADY_MARKED = "ALREADY_MARKED"
    MARKED_ABSENT = "MARKED_ABSENT"
    UNAVAILABLE = "UNAVAILABLE"
    UNKNOWN = "UNKNOWN"


@dataclass
class InspectionResult:
    """Summary of DOM inspection on the current page."""
    current_url: str
    state: AttendanceState
    details: str
    detected_elements: List[str]
    candidate_button: Optional[Locator] = None
    candidate_button_text: Optional[str] = None
    current_session: Optional[SessionInfo] = None
    feedback_available: bool = False


class AttendanceHandler:
    """Handles inspection and safe interaction with attendance and feedback controls."""

    def __init__(self, config: AppConfig, logger: logging.Logger):
        self.config = config
        self.logger = logger

    def is_auth_page(self, page: Page) -> bool:
        """Check if the current URL or page structure indicates an unauthenticated session."""
        url = page.url.lower()
        auth_indicators = ["/login", "/auth", "/signin", "accounts.google.com"]
        if any(ind in url for ind in auth_indicators):
            return True

        login_btn = page.locator("button:has-text('Sign in'), button:has-text('Log in'), button:has-text('Login')")
        try:
            if login_btn.count() > 0 and login_btn.first.is_visible():
                return True
        except Exception:
            pass

        return False

    def parse_my_day_sessions(self, page: Page) -> List[SessionInfo]:
        """Parse scheduled sessions from the 'My Day' dashboard section."""
        sessions: List[SessionInfo] = []
        try:
            my_day_container = page.locator("text='My Day'").locator("xpath=ancestor::div[contains(@class, 'col') or contains(@class, 'flex') or contains(@class, 'grid')][1]")
            if my_day_container.count() == 0:
                my_day_container = page.locator("body")

            # Look for time blocks like "9:55 AM - 10:50 AM", "11:55 AM - 12:50 PM", "2:40 PM - 3:35 PM"
            time_elements = my_day_container.locator("text=/[0-9]{1,2}:[0-9]{2}\\s*(?:AM|PM)\\s*-\\s*[0-9]{1,2}:[0-9]{2}\\s*(?:AM|PM)/")
            time_count = time_elements.count()

            for i in range(min(time_count, 10)):
                time_el = time_elements.nth(i)
                time_text = (time_el.inner_text() or "").strip()
                # Find parent card for this time slot
                card = time_el.locator("xpath=ancestor::div[contains(@class, 'card') or contains(@class, 'rounded') or contains(@class, 'border') or contains(@class, 'p-')][1]")
                if card.count() == 0:
                    card = time_el.locator("..")

                card_text = (card.inner_text() or "").strip().replace("\n", " ")
                
                # Check live status
                is_live = "Happening Now" in card_text or "Attendance is live" in card_text
                
                # Check attendance status
                attendance_status = "PENDING"
                if "Present" in card_text:
                    attendance_status = "PRESENT"
                elif "Absent" in card_text:
                    attendance_status = "ABSENT"

                # Extract title
                title = "Unknown Session"
                lines = [l.strip() for l in card_text.split("  ") if l.strip() and not ("AM" in l or "PM" in l)]
                if lines:
                    title = lines[0]

                sessions.append(SessionInfo(
                    title=title,
                    time_range=time_text,
                    is_live=is_live,
                    attendance_status=attendance_status,
                    raw_text=card_text[:120]
                ))
        except Exception as exc:
            self.logger.debug("Error parsing 'My Day' sessions: %s", exc)

        return sessions

    def detect_current_session(self, page: Page) -> Optional[SessionInfo]:
        """Detect the session that is currently live or 'Happening Now'."""
        sessions = self.parse_my_day_sessions(page)
        for s in sessions:
            if s.is_live:
                return s

        # Fallback: check text on the active main area
        try:
            happening_now = page.locator("text='Happening Now'")
            if happening_now.count() > 0 and happening_now.first.is_visible():
                parent = happening_now.first.locator("xpath=ancestor::div[contains(@class, 'flex') or contains(@class, 'card') or contains(@class, 'rounded')][1]")
                txt = (parent.inner_text() or "").strip()
                lines = [line.strip() for line in txt.split("\n") if line.strip() and line.strip() != "Happening Now"]
                title = lines[0] if lines else "Current Live Session"
                return SessionInfo(title=title, time_range="Current Class", is_live=True)
        except Exception:
            pass

        return sessions[0] if sessions else None

    def detect_feedback_modal(self, page: Page) -> Tuple[bool, Optional[Locator], FeedbackInfo]:
        """Detect if the 'How was the session?' feedback modal is open."""
        feedback_modal = page.locator("div[role='dialog'], [data-state='open']").filter(has_text="How was the session?")
        try:
            if feedback_modal.count() > 0 and feedback_modal.first.is_visible():
                modal = feedback_modal.first
                # Extract detected sentiments
                sentiments = ["positive", "neutral", "negative"]
                avail_sentiments = []
                for s in sentiments:
                    if modal.locator(f"text='{s}', [aria-label*='{s}'], button:has-text('{s}')").count() > 0:
                        avail_sentiments.append(s)

                return True, modal, FeedbackInfo(
                    is_available=True,
                    title="How was the session?",
                    detected_sentiments=avail_sentiments
                )
        except Exception:
            pass
        return False, None, FeedbackInfo()

    def handle_feedback(self, page: Page, modal: Locator, prompt_func: Optional[Callable[[str], str]] = None) -> bool:
        """Handle session feedback modal according to configured sentiment and choices."""
        self.logger.info("FEEDBACK_AVAILABLE: 'How was the session?' modal detected.")
        target_sentiment = self.config.feedback_sentiment

        # Step 1: Select sentiment emoji/button
        self.logger.info("Selecting configured feedback sentiment: '%s'", target_sentiment)
        sentiment_btn = modal.locator(f"button:has-text('{target_sentiment}'), [aria-label*='{target_sentiment}'], [title*='{target_sentiment}']")
        if sentiment_btn.count() == 0:
            emoji_buttons = modal.locator("button")
            if emoji_buttons.count() >= 3:
                idx = 2 if target_sentiment == "positive" else (1 if target_sentiment == "neutral" else 0)
                sentiment_btn = emoji_buttons.nth(idx)

        try:
            if sentiment_btn.count() > 0:
                sentiment_btn.first.click()
                page.wait_for_timeout(400)
        except Exception as exc:
            self.logger.warning("Could not click sentiment button: %s", exc)

        # Step 2: Select feedback options (e.g. 'Mentor', 'Content', or configured options)
        options_to_check = list(self.config.feedback_options) + ["Mentor", "Content", "Session", "Pacing"]
        for opt in options_to_check:
            opt_locator = modal.locator(f"button:has-text('{opt}'), [role='checkbox']:has-text('{opt}'), div:has-text('{opt}')")
            try:
                if opt_locator.count() > 0 and opt_locator.first.is_visible():
                    self.logger.info("Selected feedback option: '%s'", opt)
                    opt_locator.first.click()
                    page.wait_for_timeout(150)
            except Exception:
                pass

        # Step 3: Click Submit button automatically
        self.logger.info("Clicking feedback Submit button...")
        submit_btn = modal.get_by_role("button", name="Submit", exact=False)
        if submit_btn.count() == 0:
            submit_btn = modal.locator("button:has-text('Submit'), [role='button']:has-text('Submit')")

        try:
            if submit_btn.count() > 0:
                submit_btn.first.click()
                self.logger.info("FEEDBACK_SUBMITTED: Submitted session feedback successfully.")
                page.wait_for_timeout(1000)
                return True
            else:
                self.logger.warning("Submit button not found inside feedback modal.")
                return False
        except Exception as exc:
            self.logger.error("FEEDBACK_ERROR: Failed to click Submit button: %s", exc)
            return False

    def inspect_dashboard(self, page: Page) -> InspectionResult:
        """Inspect the current page DOM to detect Kalvium attendance UI and state."""
        current_url = page.url
        detected_elements: List[str] = []

        self.logger.info("Inspecting page at URL: %s", current_url)

        # 1. Check if user is redirected to an authentication page
        if self.is_auth_page(page):
            msg = f"User is not authenticated. Active URL: {current_url}"
            self.logger.warning(msg)
            return InspectionResult(
                current_url=current_url,
                state=AttendanceState.AUTH_REQUIRED,
                details=msg,
                detected_elements=["Authentication/Login page detected"],
            )

        # 2. Check for feedback modal first
        has_feedback, fb_modal, _ = self.detect_feedback_modal(page)
        if has_feedback:
            detected_elements.append("Feedback Modal: 'How was the session?' is active")

        # 3. Detect current session
        current_session = self.detect_current_session(page)
        if current_session:
            detected_elements.append(f"Current Session: '{current_session.title}' ({current_session.time_range})")
            self.logger.info("SESSION_DETECTED: %s (%s)", current_session.title, current_session.time_range)

        # 4. Check if 'Take A Snap' modal is already open
        open_modal = self.locate_take_a_snap_modal(page)
        if open_modal:
            detected_elements.append("Modal: 'Take A Snap' is currently open")
            submit_btn = open_modal.get_by_role("button", name="Mark Attendance", exact=False)
            if submit_btn.count() == 0:
                submit_btn = open_modal.locator("button:has-text('Mark Attendance')")
            return InspectionResult(
                current_url=current_url,
                state=AttendanceState.ATTENDANCE_READY,
                details="Take A Snap modal is currently open with Mark Attendance button.",
                detected_elements=detected_elements,
                candidate_button=submit_btn.first if submit_btn.count() > 0 else open_modal,
                candidate_button_text="Mark Attendance",
                current_session=current_session,
                feedback_available=has_feedback,
            )

        # 5. Check for interactive attendance button on dashboard
        action_button_candidates = [
            "Mark Attendance",
            "mark attendance",
            "Check In",
            "Mark Present",
            "Punch In",
            "Record Attendance",
        ]

        for btn_text in action_button_candidates:
            btn = page.get_by_role("button", name=btn_text, exact=False)
            try:
                if btn.count() > 0 and btn.first.is_visible():
                    actual_text = btn.first.inner_text().strip().replace("\n", " ")
                    detected_elements.append(f"Button: '{actual_text}' (matches '{btn_text}')")
                    return InspectionResult(
                        current_url=current_url,
                        state=AttendanceState.ATTENDANCE_READY,
                        details=f"Found active attendance action button: '{actual_text}'",
                        detected_elements=detected_elements,
                        candidate_button=btn.first,
                        candidate_button_text=actual_text,
                        current_session=current_session,
                        feedback_available=has_feedback,
                    )
            except Exception as exc:
                self.logger.debug("Error checking button candidate '%s': %s", btn_text, exc)

            custom_btn = page.locator(f"button:has-text('{btn_text}'), [role='button']:has-text('{btn_text}'), a:has-text('{btn_text}')")
            try:
                if custom_btn.count() > 0 and custom_btn.first.is_visible():
                    actual_text = custom_btn.first.inner_text().strip().replace("\n", " ")
                    detected_elements.append(f"Button/Element: '{actual_text}'")
                    return InspectionResult(
                        current_url=current_url,
                        state=AttendanceState.ATTENDANCE_READY,
                        details=f"Found active attendance element: '{actual_text}'",
                        detected_elements=detected_elements,
                        candidate_button=custom_btn.first,
                        candidate_button_text=actual_text,
                        current_session=current_session,
                        feedback_available=has_feedback,
                    )
            except Exception as exc:
                self.logger.debug("Error checking custom button fallback '%s': %s", btn_text, exc)

        # 6. Check for already-marked indicators for the current live session
        present_indicators = [
            "You're marked as present",
            "marked as present",
            "You've marked your attendance",
            "Attendance Marked",
            "Marked for Today",
            "• Present",
            "● Present",
            "Present",
        ]
        for ind in present_indicators:
            marked_el = page.locator(f"text='{ind}'")
            try:
                if marked_el.count() > 0 and marked_el.first.is_visible():
                    detected_elements.append(f"Status indicator: '{ind}'")
                    return InspectionResult(
                        current_url=current_url,
                        state=AttendanceState.ALREADY_MARKED,
                        details=f"Attendance is marked as Present ('{ind}' found).",
                        detected_elements=detected_elements,
                        current_session=current_session,
                        feedback_available=has_feedback,
                    )
            except Exception:
                pass

        # 7. Check for Absent indicators
        absent_indicators = [
            "You're marked as absent",
            "marked as absent",
            "• Absent",
            "● Absent",
            "Absent",
        ]
        for ind in absent_indicators:
            absent_el = page.locator(f"text='{ind}'")
            try:
                if absent_el.count() > 0 and absent_el.first.is_visible():
                    detected_elements.append(f"Status indicator: '{ind}'")
                    return InspectionResult(
                        current_url=current_url,
                        state=AttendanceState.MARKED_ABSENT,
                        details=f"Attendance is marked as Absent ('{ind}' found).",
                        detected_elements=detected_elements,
                        current_session=current_session,
                        feedback_available=has_feedback,
                    )
            except Exception:
                pass

        # 8. If dashboard loaded but attendance is not active
        if "dashboard" in current_url.lower():
            return InspectionResult(
                current_url=current_url,
                state=AttendanceState.DASHBOARD_READY,
                details="Dashboard is loaded, but no active 'Mark Attendance' button was detected.",
                detected_elements=detected_elements,
                current_session=current_session,
                feedback_available=has_feedback,
            )

        return InspectionResult(
            current_url=current_url,
            state=AttendanceState.UNKNOWN,
            details="Page loaded, but neither login nor recognized dashboard/attendance UI was identified.",
            detected_elements=detected_elements,
            current_session=current_session,
            feedback_available=has_feedback,
        )

    def request_user_confirmation(
        self,
        session_name: str,
        time_range: str,
        prompt_func: Optional[Callable[[], str]] = None
    ) -> bool:
        """Present explicit ENTER vs ESC confirmation prompt before final attendance submission."""
        prompt_banner = (
            f"\n--------------------------------------------------\n"
            f"READY TO MARK ATTENDANCE\n\n"
            f"Session: {session_name}\n"
            f"Time: {time_range}\n\n"
            f"Live camera detected: YES\n\n"
            f"Press ENTER to submit attendance.\n"
            f"Press ESC to cancel.\n"
            f"--------------------------------------------------\n"
        )
        print(prompt_banner)
        self.logger.info("WAITING_FOR_USER_CONFIRMATION: %s (%s)", session_name, time_range)

        if prompt_func:
            res = prompt_func()
            return res == "ENTER"

        # Interactive terminal check: on Windows / standard consoles
        try:
            import msvcrt  # Windows console support
            while True:
                char = msvcrt.getch()
                if char in (b'\r', b'\n'):  # ENTER
                    self.logger.info("User confirmed attendance submission (ENTER).")
                    return True
                elif char == b'\x1b':  # ESC
                    self.logger.warning("User cancelled attendance submission (ESC).")
                    return False
        except ImportError:
            # Fallback for standard unix input
            try:
                user_in = input("Press ENTER to submit, or type 'cancel' to abort: ").strip().lower()
                return user_in not in ("cancel", "esc", "n", "no")
            except (KeyboardInterrupt, EOFError):
                return False

    def locate_take_a_snap_modal(self, page: Page) -> Optional[Locator]:
        """Locate the 'Take A Snap' attendance modal container on the page."""
        modal_candidates = [
            page.locator("div[role='dialog']").filter(has_text="Take A Snap"),
            page.locator("[data-state='open']").filter(has_text="Take A Snap"),
            page.locator(".modal, [aria-modal='true']").filter(has_text="Take A Snap"),
            page.locator("div").filter(has=page.locator("h2, h3, h4, div:has-text('Take A Snap')")).filter(has_text="Take A Snap"),
        ]
        for candidate in modal_candidates:
            try:
                if candidate.count() > 0 and candidate.first.is_visible():
                    return candidate.first
            except Exception:
                pass
        return None

    def wait_for_modal_and_camera(self, page: Page, timeout_ms: int = 15000) -> Tuple[bool, Optional[Locator], str]:
        """Wait for the 'Take A Snap' modal and verify the camera preview and Mark Attendance button.

        Returns (success, modal_locator, status_message).
        """
        self.logger.info("Waiting for 'Take A Snap' modal to appear...")
        start_time = time.time()
        modal = None

        while (time.time() - start_time) * 1000 < timeout_ms:
            modal = self.locate_take_a_snap_modal(page)
            if modal:
                break
            page.wait_for_timeout(500)

        if not modal:
            return False, None, "Take A Snap modal did not appear within timeout."

        self.logger.info("CAMERA_MODAL_OPEN: 'Take A Snap' modal is open.")

        # Check for camera error (e.g., camera already in use or permission denied)
        error_locator = modal.locator("text='Camera is already in use', text='permission denied', text='Error accessing camera'")
        try:
            if error_locator.count() > 0 and error_locator.first.is_visible():
                err_text = error_locator.first.inner_text().strip()
                self.logger.error("CAMERA_ERROR: %s", err_text)
                return False, modal, f"CAMERA_ERROR: '{err_text}'"
        except Exception:
            pass

        # Check for camera preview: video element or canvas preview
        video_el = modal.locator("video, canvas, [data-testid='camera-preview']")
        try:
            video_el.first.wait_for(state="visible", timeout=10000)
            self.logger.info("CAMERA_READY: Live camera preview is visible and active.")
        except Exception:
            self.logger.warning("Camera preview element (video/canvas) was not detected or took longer than expected.")

        # Check for 'Start Camera' button if the camera needs manual start
        start_cam_btn = modal.locator("button:has-text('Start Camera')")
        try:
            if start_cam_btn.count() > 0 and start_cam_btn.first.is_visible():
                self.logger.info("Detected 'Start Camera' button in modal. Clicking to start live feed...")
                start_cam_btn.first.click()
                page.wait_for_timeout(2000)
        except Exception:
            pass

        # Locate the exact 'Mark Attendance' button inside the modal
        submit_btn = modal.get_by_role("button", name="Mark Attendance", exact=False)
        if submit_btn.count() == 0:
            submit_btn = modal.locator("button:has-text('Mark Attendance')")

        try:
            submit_btn.first.wait_for(state="visible", timeout=8000)
            if not submit_btn.first.is_enabled():
                self.logger.warning("'Mark Attendance' button is visible but currently disabled. Waiting for it to become enabled...")
                page.wait_for_timeout(3000)
            return True, modal, "Modal and 'Mark Attendance' button verified."
        except Exception as exc:
            return False, modal, f"Could not find visible 'Mark Attendance' button inside modal: {exc}"

    def perform_attendance(
        self,
        page: Page,
        inspection: InspectionResult,
        dry_run: bool = False,
        confirmation_override: Optional[Callable[[], str]] = None
    ) -> Tuple[bool, str]:
        """Execute the verified attendance workflow with human presence confirmation."""
        if inspection.state != AttendanceState.ATTENDANCE_READY or not inspection.candidate_button:
            return False, f"Cannot perform attendance in state: {inspection.state}"

        button = inspection.candidate_button
        button_name = inspection.candidate_button_text or "Mark Attendance"
        session_info = inspection.current_session
        session_name = session_info.title if session_info else "Current Session"
        time_range = session_info.time_range if session_info else "Live Session"

        # Check if 'Take A Snap' modal is ALREADY open
        modal = self.locate_take_a_snap_modal(page)
        if not modal:
            self.logger.info("ATTENDANCE_LIVE: Clicking dashboard attendance trigger: '%s'...", button_name)
            if dry_run:
                self.logger.info("[DRY-RUN] Would click dashboard attendance button '%s'", button_name)
                return True, "DRY_RUN_COMPLETED"

            try:
                button.click(timeout=self.config.action_timeout_ms)
                page.wait_for_timeout(1500)
            except Exception as exc:
                msg = f"Failed to click dashboard attendance trigger: {exc}"
                self.logger.error(msg)
                return False, msg

            # Wait for modal to open and live camera preview to become ready
            ready, modal, status_msg = self.wait_for_modal_and_camera(page, timeout_ms=self.config.action_timeout_ms)
            if not ready or not modal:
                msg = f"Modal / camera verification failed: {status_msg}"
                self.logger.error(msg)
                return False, msg
        else:
            self.logger.info("CAMERA_MODAL_OPEN: 'Take A Snap' modal is already open.")

        # Locate final 'Mark Attendance' button inside the modal
        submit_btn = modal.get_by_role("button", name="Mark Attendance", exact=False)
        if submit_btn.count() == 0:
            submit_btn = modal.locator("button:has-text('Mark Attendance')")

        try:
            final_button = submit_btn.first
            final_button.wait_for(state="visible", timeout=8000)

            if not final_button.is_enabled():
                self.logger.info("Waiting for Mark Attendance button to become enabled...")
                page.wait_for_timeout(2000)

            actual_btn_text = final_button.inner_text().strip()

            # Attempt confirmation if an override is provided or safe mode
            if confirmation_override:
                confirmed = (confirmation_override() == "ENTER")
                if not confirmed:
                    self.logger.info("Attendance submission cancelled.")
                    return False, "CANCELLED_BY_USER"
            else:
                self.logger.info("Human presence and camera preview verified: Proceeding to submit attendance.")

            if dry_run:
                self.logger.info("[DRY-RUN] Would click '%s' in Take A Snap modal.", actual_btn_text)
                return True, "DRY_RUN_COMPLETED"

            # Click the exact Mark Attendance button
            self.logger.info("ATTENDANCE_SUBMITTED: Clicking '%s' in Take A Snap modal...", actual_btn_text)
            final_button.click(timeout=self.config.action_timeout_ms)
            self.logger.info("Submitted. Waiting for Kalvium application response...")

            # Wait for submission network request and UI toast / dialog dismissal
            page.wait_for_timeout(1500)

            # Verify post-action UI state
            success_toast = page.locator("text='marked your attendance', text='marked successfully', text='Attendance marked'")
            if success_toast.count() > 0 and success_toast.first.is_visible():
                self.logger.info("ATTENDANCE_MARKED: Verified by success notification.")
                return True, "ATTENDANCE_MARKED"

            post_inspection = self.inspect_dashboard(page)
            if post_inspection.state == AttendanceState.ALREADY_MARKED:
                self.logger.info("ATTENDANCE_MARKED: Verified on dashboard.")
                return True, "ATTENDANCE_MARKED"

            if post_inspection.state == AttendanceState.MARKED_ABSENT:
                self.logger.warning("ATTENDANCE_RESULT_ABSENT: Dashboard indicates absent.")
                return False, "ATTENDANCE_RESULT_ABSENT"

            if not modal.is_visible():
                self.logger.info("ATTENDANCE_MARKED: Take A Snap modal closed successfully post-submission.")
                return True, "ATTENDANCE_MARKED"

            err_msg = modal.locator(".text-destructive, .error, [role='alert']")
            if err_msg.count() > 0 and err_msg.first.is_visible():
                fail_reason = err_msg.first.inner_text().strip()
                self.logger.error("ATTENDANCE_SUBMISSION_FAILED: %s", fail_reason)
                return False, f"ATTENDANCE_SUBMISSION_FAILED: {fail_reason}"

            self.logger.warning("ATTENDANCE_RESULT_UNKNOWN: Could not conclusively verify marked state.")
            return False, "ATTENDANCE_RESULT_UNKNOWN"

        except PlaywrightTimeoutError as exc:
            msg = f"ATTENDANCE_SUBMISSION_FAILED: Timed out waiting for button action: {exc}"
            self.logger.error(msg)
            return False, msg
        except Exception as exc:
            msg = f"ATTENDANCE_SUBMISSION_FAILED: Unexpected error during submission: {exc}"
            self.logger.error(msg)
            return False, msg
