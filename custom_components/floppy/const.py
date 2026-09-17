"""Constants for the Floppy integration."""

from __future__ import annotations

from logging import Logger, getLogger

LOGGER: Logger = getLogger(__package__)

DOMAIN = "floppy"

CONF_URL = "url"
CONF_API_KEY = "api_key"
CONF_SCAN_INTERVAL = "scan_interval"

DEFAULT_SCAN_INTERVAL = 30
MIN_SCAN_INTERVAL = 5
MAX_SCAN_INTERVAL = 1440

URL_CARD = "/floppy/static/floppy-upcoming-card.js"

MODE_ALL = "all"
MODE_IN_PROGRESS = "in_progress"
MODE_NOT_CAUGHT_UP = "not_caught_up"
MODE_PLANNING = "planning"
MODE_PAUSED = "paused"
MODE_COMPLETED = "completed"
MODE_DROPPED = "dropped"

MODES = (
    MODE_ALL,
    MODE_IN_PROGRESS,
    MODE_NOT_CAUGHT_UP,
    MODE_PLANNING,
    MODE_COMPLETED,
    MODE_PAUSED,
    MODE_DROPPED,
)

MODE_LABELS = {
    MODE_ALL: "Upcoming episodes",
    MODE_IN_PROGRESS: "Upcoming in progress",
    MODE_NOT_CAUGHT_UP: "Upcoming not caught up",
    MODE_PLANNING: "Upcoming planning",
    MODE_COMPLETED: "Upcoming completed",
    MODE_PAUSED: "Upcoming paused",
    MODE_DROPPED: "Upcoming dropped",
}

# Floppy media status codes: 0=Planning, 1=In progress, 2=Paused,
# 3=Completed, 4=Dropped.
STATUS_MODES = {
    MODE_PLANNING: 0,
    MODE_IN_PROGRESS: 1,
    MODE_PAUSED: 2,
    MODE_COMPLETED: 3,
    MODE_DROPPED: 4,
}

API_CALENDAR = "/api/v1/calendar/"
API_MEDIA_TV = "/api/v1/media/tv/"