"""Tests for application configuration."""

import os
from pathlib import Path
from unittest import mock

import pytest
from app.config import AppConfig


def test_default_config():
    with mock.patch.dict(os.environ, {}, clear=True):
        cfg = AppConfig.load()
        assert cfg.dashboard_url == "https://app.kalvium.community/dashboard"
        assert cfg.headless is False
        assert cfg.action_timeout_ms == 15000
        assert cfg.log_level == "INFO"
        assert cfg.browser_profile_path.name == ".browser-profile"


def test_custom_env_config():
    env_vars = {
        "KALVIUM_DASHBOARD_URL": "https://example.com/custom-dash",
        "BROWSER_HEADLESS": "true",
        "ACTION_TIMEOUT_MS": "25000",
        "LOG_LEVEL": "DEBUG",
        "BROWSER_PROFILE_PATH": "./custom-profile",
        "SCREENSHOTS_DIR": "./custom-screenshots",
    }
    with mock.patch.dict(os.environ, env_vars, clear=True):
        cfg = AppConfig.load()
        assert cfg.dashboard_url == "https://example.com/custom-dash"
        assert cfg.headless is True
        assert cfg.action_timeout_ms == 25000
        assert cfg.log_level == "DEBUG"
        assert cfg.browser_profile_path.name == "custom-profile"
        assert cfg.screenshots_dir.name == "custom-screenshots"


def test_invalid_timeout_fallback():
    env_vars = {
        "ACTION_TIMEOUT_MS": "not-a-number",
        "LOG_LEVEL": "INVALID_LEVEL",
    }
    with mock.patch.dict(os.environ, env_vars, clear=True):
        cfg = AppConfig.load()
        assert cfg.action_timeout_ms == 15000
        assert cfg.log_level == "INFO"
