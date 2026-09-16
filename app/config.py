"""Configuration management for Kalvium Attendance Assistant.

Loads settings from environment variables and provides structured access.
Never stores passwords, tokens, or credentials in source code.
"""

from dataclasses import dataclass
import os
from pathlib import Path
from dotenv import load_dotenv

# Load .env if present
load_dotenv()


@dataclass(frozen=True)
class AppConfig:
    """Immutable application configuration."""
    dashboard_url: str
    browser_profile_path: Path
    headless: bool
    action_timeout_ms: int
    log_level: str
    screenshots_dir: Path
    feedback_sentiment: str
    feedback_options: tuple  # Tuple of option strings
    poll_interval_sec: int
    max_wait_minutes: int

    @classmethod
    def load(cls) -> "AppConfig":
        """Load configuration from environment variables with safe defaults."""
        dashboard_url = os.getenv(
            "KALVIUM_DASHBOARD_URL",
            "https://app.kalvium.community/dashboard"
        ).strip()

        profile_str = os.getenv("BROWSER_PROFILE_PATH", "./.browser-profile")
        browser_profile_path = Path(profile_str).resolve()

        headless_str = os.getenv("BROWSER_HEADLESS", "false").strip().lower()
        headless = headless_str in ("1", "true", "yes")

        timeout_str = os.getenv("ACTION_TIMEOUT_MS", "15000").strip()
        try:
            action_timeout_ms = max(1000, int(timeout_str))
        except ValueError:
            action_timeout_ms = 15000

        log_level = os.getenv("LOG_LEVEL", "INFO").strip().upper()
        valid_log_levels = {"DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"}
        if log_level not in valid_log_levels:
            log_level = "INFO"

        screenshots_str = os.getenv("SCREENSHOTS_DIR", "./screenshots")
        screenshots_dir = Path(screenshots_str).resolve()

        feedback_sentiment = os.getenv("FEEDBACK_SENTIMENT", "positive").strip().lower()
        feedback_options_str = os.getenv(
            "FEEDBACK_OPTIONS",
            "Mentor was well prepared,Mentor resolved my doubts,Session was engaging,Content was well-structured"
        ).strip()
        feedback_options = tuple(opt.strip() for opt in feedback_options_str.split(",") if opt.strip())

        try:
            poll_interval_sec = max(1, int(os.getenv("POLL_INTERVAL_SEC", "3").strip()))
        except ValueError:
            poll_interval_sec = 3

        try:
            max_wait_minutes = max(1, int(os.getenv("MAX_WAIT_MINUTES", "60").strip()))
        except ValueError:
            max_wait_minutes = 60

        return cls(
            dashboard_url=dashboard_url,
            browser_profile_path=browser_profile_path,
            headless=headless,
            action_timeout_ms=action_timeout_ms,
            log_level=log_level,
            screenshots_dir=screenshots_dir,
            feedback_sentiment=feedback_sentiment,
            feedback_options=feedback_options,
            poll_interval_sec=poll_interval_sec,
            max_wait_minutes=max_wait_minutes,
        )

