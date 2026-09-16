"""CLI Entrypoint for Kalvium Attendance Assistant.

Session-aware attendance workflow state machine:
START -> OPEN_DASHBOARD -> AUTHENTICATION_CHECK -> READ_MY_DAY
-> DETERMINE_CURRENT_SESSION -> WAIT_FOR_ATTENDANCE_WINDOW
-> CHECK_ATTENDANCE_STATE -> ATTENDANCE_AVAILABLE -> OPEN_CAMERA_MODAL
-> VERIFY_LIVE_CAMERA -> READY_FOR_USER_CONFIRMATION -> USER_CONFIRMS
-> SUBMIT_ATTENDANCE -> VERIFY_ATTENDANCE_RESULT -> SESSION_MONITORING
-> FEEDBACK_AVAILABLE -> FEEDBACK_REVIEW -> NEXT_SESSION
"""

import argparse
import sys
import time

from app.attendance import AttendanceHandler, AttendanceState
from app.browser import BrowserManager
from app.config import AppConfig
from app.logger import setup_logger
from app.models import WorkflowState


def parse_args():
    parser = argparse.ArgumentParser(
        description="Kalvium Attendance Assistant - Safe, verified dashboard automation helper."
    )
    parser.add_argument(
        "--inspect-only",
        action="store_true",
        help="Launch browser, inspect the Kalvium dashboard DOM and state without taking any actions.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Simulate the workflow end-to-end without submitting attendance or feedback.",
    )
    parser.add_argument(
        "--safe",
        action="store_true",
        help="Enforce interactive verification step before final submission (default behavior).",
    )
    parser.add_argument(
        "--once",
        action="store_true",
        help="Run only once for the current active session and exit immediately.",
    )
    parser.add_argument(
        "--watch",
        action="store_true",
        help="Continuously monitor scheduled sessions throughout the day.",
    )
    return parser.parse_args()


def main():
    args = parse_args()
    config = AppConfig.load()
    logger = setup_logger(name="KalviumAttendance", level_name=config.log_level)

    logger.info("==================================================")
    logger.info("Starting Kalvium Attendance Assistant")
    logger.info("Dashboard URL: %s", config.dashboard_url)
    if args.dry_run:
        logger.info("MODE: DRY-RUN (No actions will be submitted)")
    elif args.once:
        logger.info("MODE: ONCE (Single session execution)")
    elif args.watch:
        logger.info("MODE: WATCH (Continuous session monitoring)")
    logger.info("==================================================")

    browser_mgr = BrowserManager(config=config, logger=logger)
    attendance_handler = AttendanceHandler(config=config, logger=logger)

    current_workflow_state = WorkflowState.START
    last_processed_session = None

    try:
        current_workflow_state = WorkflowState.OPEN_DASHBOARD
        with browser_mgr.launch_session() as (context, page):
            logger.info("Navigating to Kalvium dashboard...")
            try:
                page.goto(config.dashboard_url, wait_until="domcontentloaded", timeout=config.action_timeout_ms)
            except Exception as exc:
                logger.error("Failed to load dashboard URL (%s): %s", config.dashboard_url, exc)
                browser_mgr.capture_screenshot(page, reason="nav_failure")
                sys.exit(1)

            # Wait for SPA hydration / initial redirection
            logger.info("Waiting for page hydration...")
            page.wait_for_timeout(1500)

            # State: AUTHENTICATION_CHECK
            current_workflow_state = WorkflowState.AUTHENTICATION_CHECK
            inspection = attendance_handler.inspect_dashboard(page)

            if inspection.state == AttendanceState.AUTH_REQUIRED:
                logger.warning("Authentication required. The browser is not logged into Kalvium.")
                logger.info("\n>>> Please click 'Login with Google' and sign in with your Kalvium account in the browser window. <<<")
                logger.info("Press Enter here in the terminal once you have completed login and the student dashboard is visible...")
                input()
                logger.info("Re-inspecting page after manual login...")
                page.wait_for_timeout(2000)
                inspection = attendance_handler.inspect_dashboard(page)

            # Handle inspect-only flag
            if args.inspect_only:
                logger.info("Inspect-only mode selected. No actions will be performed.")
                print("\n[INSPECTION SUMMARY]")
                print(f"Current URL: {inspection.current_url}")
                print(f"State: {inspection.state.value}")
                print(f"Details: {inspection.details}")
                if inspection.current_session:
                    print(f"Current Session: {inspection.current_session.title} ({inspection.current_session.time_range})")
                print("Elements found:")
                for elem in inspection.detected_elements:
                    print(f"  * {elem}")
                return

            # Main Session Monitoring Loop
            logger.info("Entering session monitoring loop (poll interval: %ds)...", config.poll_interval_sec)

            while True:
                # 1. Check for feedback modal
                has_feedback, fb_modal, fb_info = attendance_handler.detect_feedback_modal(page)
                if has_feedback and fb_modal:
                    current_workflow_state = WorkflowState.FEEDBACK_AVAILABLE
                    if args.dry_run:
                        logger.info("[DRY-RUN] Feedback modal detected. Simulating feedback handling without submitting.")
                    else:
                        current_workflow_state = WorkflowState.FEEDBACK_REVIEW
                        attendance_handler.handle_feedback(page, fb_modal)
                        page.wait_for_timeout(1000)

                # 2. Read My Day and Determine Current Session
                current_workflow_state = WorkflowState.READ_MY_DAY
                sessions = attendance_handler.parse_my_day_sessions(page)

                current_workflow_state = WorkflowState.DETERMINE_CURRENT_SESSION
                current_session = attendance_handler.detect_current_session(page)
                if current_session:
                    session_key = f"{current_session.title}_{current_session.time_range}"
                else:
                    session_key = None

                # 3. Check attendance state
                current_workflow_state = WorkflowState.CHECK_ATTENDANCE_STATE
                inspection = attendance_handler.inspect_dashboard(page)

                # If already marked
                if inspection.state == AttendanceState.ALREADY_MARKED:
                    logger.info("ALREADY_MARKED: Attendance is already marked as PRESENT! Work is done. Closing browser automatically.")
                    print("\n[STATUS: PRESENT] Attendance is already marked as PRESENT. Closing browser.")
                    return

                elif inspection.state == AttendanceState.MARKED_ABSENT:
                    logger.warning("ATTENDANCE_RESULT_ABSENT: Status is ABSENT ('%s'). Closing browser and terminating.", inspection.details)
                    print("\n[STATUS: ABSENT] You are marked as absent for this session. Exiting now.")
                    return

                elif inspection.state == AttendanceState.ATTENDANCE_READY:
                    current_workflow_state = WorkflowState.ATTENDANCE_AVAILABLE
                    logger.info("ATTENDANCE_LIVE: Active attendance trigger found: '%s'", inspection.candidate_button_text)

                    # Execute attendance workflow
                    success, result_msg = attendance_handler.perform_attendance(
                        page=page,
                        inspection=inspection,
                        dry_run=args.dry_run
                    )

                    if success:
                        current_workflow_state = WorkflowState.VERIFY_ATTENDANCE_RESULT
                        logger.info("ATTENDANCE_MARKED: %s", result_msg)
                        logger.info("Attendance successfully marked! Closing browser automatically.")
                        print("\n[SUCCESS] Attendance marked successfully! Closing browser.")
                        page.wait_for_timeout(2000)
                        return
                    else:
                        logger.error("ATTENDANCE_SUBMISSION_FAILED: %s", result_msg)
                        browser_mgr.capture_screenshot(page, reason="action_failed")
                        if args.once:
                            return

                    current_workflow_state = WorkflowState.SESSION_MONITORING

                elif inspection.state == AttendanceState.DASHBOARD_READY:
                    current_workflow_state = WorkflowState.WAIT_FOR_ATTENDANCE_WINDOW
                    if args.once and not args.watch:
                        logger.info("No active attendance trigger at this moment and --watch is not enabled. Exiting.")
                        return

                    # Reload page periodically while waiting for mentor to activate attendance
                    poll_count = getattr(main, "_wait_poll_count", 0) + 1
                    main._wait_poll_count = poll_count
                    if poll_count % 3 == 0:  # Refresh every ~6-9 seconds
                        logger.info("Reloading dashboard to check if mentor started attendance...")
                        try:
                            page.reload(wait_until="domcontentloaded", timeout=config.action_timeout_ms)
                            page.wait_for_timeout(1500)
                        except Exception as exc:
                            logger.debug("Page reload error: %s", exc)

                if not args.watch and not args.dry_run and not (args.once is False and args.watch is False):
                    # Exit condition if neither looping requested
                    pass

                # If single-run mode without --watch, break if action taken or waiting
                if args.once:
                    break

                # Sleep until next poll interval
                time.sleep(config.poll_interval_sec)

    except KeyboardInterrupt:
        logger.info("\nExecution interrupted by user.")
    except Exception as exc:
        logger.exception("An unhandled exception occurred during execution: %s", exc)
        sys.exit(1)


if __name__ == "__main__":
    main()
