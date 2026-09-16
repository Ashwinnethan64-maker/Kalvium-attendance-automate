"""Explicit State Machine and Models for Kalvium Attendance Assistant.

Defines:
- WorkflowState enumeration
- SessionInfo data model
- FeedbackState data model
- StateMachine orchestration interface
"""

from dataclasses import dataclass, field
from enum import Enum
from typing import List, Optional


class WorkflowState(str, Enum):
    """Core state machine states for the Kalvium session workflow."""
    START = "START"
    OPEN_DASHBOARD = "OPEN_DASHBOARD"
    AUTHENTICATION_CHECK = "AUTHENTICATION_CHECK"
    READ_MY_DAY = "READ_MY_DAY"
    DETERMINE_CURRENT_SESSION = "DETERMINE_CURRENT_SESSION"
    WAIT_FOR_ATTENDANCE_WINDOW = "WAIT_FOR_ATTENDANCE_WINDOW"
    CHECK_ATTENDANCE_STATE = "CHECK_ATTENDANCE_STATE"
    ATTENDANCE_AVAILABLE = "ATTENDANCE_AVAILABLE"
    OPEN_CAMERA_MODAL = "OPEN_CAMERA_MODAL"
    VERIFY_LIVE_CAMERA = "VERIFY_LIVE_CAMERA"
    READY_FOR_USER_CONFIRMATION = "READY_FOR_USER_CONFIRMATION"
    USER_CONFIRMS = "USER_CONFIRMS"
    SUBMIT_ATTENDANCE = "SUBMIT_ATTENDANCE"
    VERIFY_ATTENDANCE_RESULT = "VERIFY_ATTENDANCE_RESULT"
    SESSION_MONITORING = "SESSION_MONITORING"
    FEEDBACK_AVAILABLE = "FEEDBACK_AVAILABLE"
    FEEDBACK_REVIEW = "FEEDBACK_REVIEW"
    NEXT_SESSION = "NEXT_SESSION"
    STOPPED = "STOPPED"
    ERROR = "ERROR"


@dataclass
class SessionInfo:
    """Represents a scheduled session parsed from 'My Day'."""
    title: str
    time_range: str
    is_live: bool = False
    attendance_status: str = "PENDING"  # PRESENT, ABSENT, PENDING, UNKNOWN
    mentor: str = ""
    raw_text: str = ""


@dataclass
class FeedbackInfo:
    """Represents a detected 'How was the session?' feedback modal."""
    is_available: bool = False
    title: str = ""
    detected_sentiments: List[str] = field(default_factory=list)
    available_options: List[str] = field(default_factory=list)
