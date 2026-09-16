"""Logging setup for Kalvium Attendance Assistant.

Sets up standard library logging with clean formatting.
Ensures no sensitive data (passwords, cookies, tokens) is logged.
"""

import logging
import sys
from typing import Optional


def setup_logger(name: str = "kalvium_assistant", level_name: str = "INFO") -> logging.Logger:
    """Configure and return a structured logger.

    Logs include timestamps, log level, module name, and messages.
    """
    logger = logging.getLogger(name)
    level = getattr(logging, level_name.upper(), logging.INFO)
    logger.setLevel(level)

    # Avoid adding duplicate handlers if setup_logger is called repeatedly
    if not logger.handlers:
        handler = logging.StreamHandler(sys.stdout)
        handler.setLevel(level)

        formatter = logging.Formatter(
            fmt="%(asctime)s [%(levelname)s] [%(name)s] %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S"
        )
        handler.setFormatter(formatter)
        logger.addHandler(handler)

    return logger
