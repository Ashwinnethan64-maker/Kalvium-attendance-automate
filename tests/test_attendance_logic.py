"""Unit tests for attendance logic, state inspection, session parsing, and feedback handling."""

import logging
from unittest.mock import MagicMock
import pytest

from app.attendance import AttendanceHandler, AttendanceState, InspectionResult
from app.config import AppConfig
from app.models import FeedbackInfo, SessionInfo, WorkflowState


@pytest.fixture
def mock_config(tmp_path):
    return AppConfig(
        dashboard_url="https://app.kalvium.community/dashboard",
        browser_profile_path=tmp_path / ".test-profile",
        headless=True,
        action_timeout_ms=1000,
        log_level="INFO",
        screenshots_dir=tmp_path / "screenshots",
        feedback_sentiment="positive",
        feedback_options=("Mentor was well prepared", "Pacing was good"),
        poll_interval_sec=5,
        max_wait_minutes=30,
    )


@pytest.fixture
def mock_logger():
    return logging.getLogger("test_logger")


def test_user_confirmation_enter(mock_config, mock_logger):
    handler = AttendanceHandler(config=mock_config, logger=mock_logger)
    assert handler.request_user_confirmation(
        session_name="DSA Session",
        time_range="9:55 AM - 10:50 AM",
        prompt_func=lambda: "ENTER"
    ) is True


def test_user_confirmation_esc(mock_config, mock_logger):
    handler = AttendanceHandler(config=mock_config, logger=mock_logger)
    assert handler.request_user_confirmation(
        session_name="DSA Session",
        time_range="9:55 AM - 10:50 AM",
        prompt_func=lambda: "ESC"
    ) is False


def test_is_auth_page(mock_config, mock_logger):
    handler = AttendanceHandler(config=mock_config, logger=mock_logger)

    mock_page = MagicMock()
    mock_page.url = "https://app.kalvium.community/login"
    assert handler.is_auth_page(mock_page) is True

    mock_page.url = "https://accounts.google.com/o/oauth2/auth?..."
    assert handler.is_auth_page(mock_page) is True

    mock_page.url = "https://app.kalvium.community/dashboard"
    mock_login_btn = MagicMock()
    mock_login_btn.count.return_value = 0
    mock_page.locator.return_value = mock_login_btn
    assert handler.is_auth_page(mock_page) is False


def test_inspect_dashboard_unauthenticated(mock_config, mock_logger):
    handler = AttendanceHandler(config=mock_config, logger=mock_logger)

    mock_page = MagicMock()
    mock_page.url = "https://app.kalvium.community/auth/signin"

    result = handler.inspect_dashboard(mock_page)
    assert result.state == AttendanceState.AUTH_REQUIRED
    assert "User is not authenticated" in result.details


def test_workflow_state_enum():
    assert WorkflowState.START.value == "START"
    assert WorkflowState.OPEN_DASHBOARD.value == "OPEN_DASHBOARD"
    assert WorkflowState.AUTHENTICATION_CHECK.value == "AUTHENTICATION_CHECK"
    assert WorkflowState.READ_MY_DAY.value == "READ_MY_DAY"
    assert WorkflowState.DETERMINE_CURRENT_SESSION.value == "DETERMINE_CURRENT_SESSION"
    assert WorkflowState.WAIT_FOR_ATTENDANCE_WINDOW.value == "WAIT_FOR_ATTENDANCE_WINDOW"
    assert WorkflowState.CHECK_ATTENDANCE_STATE.value == "CHECK_ATTENDANCE_STATE"
    assert WorkflowState.ATTENDANCE_AVAILABLE.value == "ATTENDANCE_AVAILABLE"
    assert WorkflowState.OPEN_CAMERA_MODAL.value == "OPEN_CAMERA_MODAL"
    assert WorkflowState.VERIFY_LIVE_CAMERA.value == "VERIFY_LIVE_CAMERA"
    assert WorkflowState.READY_FOR_USER_CONFIRMATION.value == "READY_FOR_USER_CONFIRMATION"
    assert WorkflowState.USER_CONFIRMS.value == "USER_CONFIRMS"
    assert WorkflowState.SUBMIT_ATTENDANCE.value == "SUBMIT_ATTENDANCE"
    assert WorkflowState.VERIFY_ATTENDANCE_RESULT.value == "VERIFY_ATTENDANCE_RESULT"
    assert WorkflowState.SESSION_MONITORING.value == "SESSION_MONITORING"
    assert WorkflowState.FEEDBACK_AVAILABLE.value == "FEEDBACK_AVAILABLE"
    assert WorkflowState.FEEDBACK_REVIEW.value == "FEEDBACK_REVIEW"
    assert WorkflowState.NEXT_SESSION.value == "NEXT_SESSION"


def test_feedback_handling_approved(mock_config, mock_logger):
    handler = AttendanceHandler(config=mock_config, logger=mock_logger)
    mock_page = MagicMock()
    mock_modal = MagicMock()

    sentiment_btn = MagicMock()
    sentiment_btn.count.return_value = 1
    mock_modal.locator.return_value = sentiment_btn

    submit_btn = MagicMock()
    submit_btn.count.return_value = 1
    mock_modal.get_by_role.return_value = submit_btn

    handled = handler.handle_feedback(mock_page, mock_modal)
    assert handled is True
    submit_btn.first.click.assert_called_once()

