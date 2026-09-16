"""Browser management module using Playwright.

Launches a visible Chromium instance with a persistent profile directory,
allowing manual authentication, cookie persistence, failure screenshots,
and camera permission management.
"""

from contextlib import contextmanager
from datetime import datetime
import logging
from pathlib import Path
from typing import Generator, Optional, Tuple

from playwright.sync_api import (
    BrowserContext,
    Page,
    Playwright,
    sync_playwright,
    TimeoutError as PlaywrightTimeoutError,
)

from app.config import AppConfig


class BrowserManager:
    """Manages the persistent browser context and page lifecycle."""

    def __init__(self, config: AppConfig, logger: logging.Logger):
        self.config = config
        self.logger = logger
        self.config.browser_profile_path.mkdir(parents=True, exist_ok=True)
        self.config.screenshots_dir.mkdir(parents=True, exist_ok=True)

    def capture_screenshot(self, page: Optional[Page], reason: str = "failure") -> Optional[Path]:
        """Capture a timestamped screenshot on unexpected states or failures."""
        if not page:
            self.logger.warning("Cannot capture screenshot: page is not available.")
            return None

        try:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
            clean_reason = "".join(c if c.isalnum() or c in "-_" else "_" for c in reason)
            filename = f"{timestamp}_{clean_reason}.png"
            target_path = self.config.screenshots_dir / filename
            page.screenshot(path=str(target_path), full_page=True)
            self.logger.info("Screenshot saved: %s", target_path)
            return target_path
        except Exception as exc:
            self.logger.error("Failed to capture screenshot (%s): %s", reason, exc)
            return None

    @contextmanager
    def launch_session(self) -> Generator[Tuple[BrowserContext, Page], None, None]:
        """Launch a persistent Chromium context in a context manager."""
        self.logger.info("Launching Playwright persistent Chromium context...")
        self.logger.info("Profile path: %s", self.config.browser_profile_path)
        self.logger.info("Headless: %s", self.config.headless)

        with sync_playwright() as pw:
            # Grant camera permissions by default for Kalvium domain to allow webcam/OBS camera
            context = pw.chromium.launch_persistent_context(
                user_data_dir=str(self.config.browser_profile_path),
                headless=self.config.headless,
                permissions=["camera"],
                viewport={"width": 1280, "height": 800},
                args=[
                    "--disable-blink-features=AutomationControlled",
                    "--use-fake-ui-for-media-stream",  # Automatically accept browser camera prompt (uses default system/OBS camera)
                ],
            )

            # Set default action and navigation timeouts
            context.set_default_timeout(self.config.action_timeout_ms)
            context.set_default_navigation_timeout(self.config.action_timeout_ms)

            # Retrieve or create initial page
            page = context.pages[0] if context.pages else context.new_page()

            try:
                yield context, page
            finally:
                self.logger.info("Closing browser session cleanly...")
                try:
                    context.close()
                except Exception as exc:
                    self.logger.debug("Error while closing context: %s", exc)
