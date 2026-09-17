"""DataUpdateCoordinator for the Floppy integration."""

from __future__ import annotations

import asyncio
import json
import os
from datetime import datetime, timedelta
from typing import TYPE_CHECKING, Any

from homeassistant.config_entries import ConfigEntry
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.update_coordinator import (
    DataUpdateCoordinator,
    UpdateFailed,
)

from .const import (
    API_CALENDAR,
    API_MEDIA_TV,
    CONF_API_KEY,
    CONF_SCAN_INTERVAL,
    CONF_URL,
    DEFAULT_SCAN_INTERVAL,
    DOMAIN,
    LOGGER,
    MODE_ALL,
    MODE_NOT_CAUGHT_UP,
    STATUS_MODES,
)

if TYPE_CHECKING:
    from homeassistant.core import HomeAssistant


_PAGE_LIMIT = 200
_MAX_PAGES_PER_STATUS = 5
_TIMEOUT = 15


class FloppyUpdateCoordinator(DataUpdateCoordinator[dict[str, Any]]):
    """Fetch upcoming episodes and library statuses from Floppy."""

    config_entry: FloppyConfigEntry

    def __init__(self, hass: HomeAssistant, config_entry: FloppyConfigEntry) -> None:
        """Initialize the coordinator."""
        interval = int(
            config_entry.options.get(
                CONF_SCAN_INTERVAL,
                config_entry.data.get(CONF_SCAN_INTERVAL, DEFAULT_SCAN_INTERVAL),
            )
        )
        super().__init__(
            hass=hass,
            logger=LOGGER,
            name=DOMAIN,
            update_interval=timedelta(minutes=interval),
        )
        self.config_entry = config_entry
        self.url = config_entry.data[CONF_URL].rstrip("/")
        self.api_key = config_entry.data[CONF_API_KEY]
        self._session = None
        self._cache_file = os.path.join(
            hass.config.path(DOMAIN), "last_good.json"
        )

    @property
    def base_url(self) -> str:
        """Normalized base URL without trailing slash."""
        return self.url

    async def _get(self, path: str, params: dict[str, Any] | None = None) -> Any:
        """Perform an authenticated GET request against the Floppy API."""
        if self._session is None:
            self._session = async_get_clientsession(self.hass)
        resp = await self._session.get(
            self.url + path,
            params=params,
            headers={"X-API-Key": self.api_key},
            timeout=_TIMEOUT,
        )
        if resp.status == 401 or resp.status == 403:
            resp.raise_for_status()
        if resp.status != 200:
            raise UpdateFailed(f"Floppy API returned HTTP {resp.status}")
        return await resp.json()

    async def _fetch_status_media_ids(self, status: int) -> set[str]:
        """Return the media_ids that have the given library status."""
        ids: set[str] = set()
        offset = 0
        for _page in range(_MAX_PAGES_PER_STATUS):
            page = await self._get(
                API_MEDIA_TV,
                {"status": status, "limit": _PAGE_LIMIT, "offset": offset},
            )
            for entry in page.get("results", []):
                media_id = (entry.get("item") or {}).get("media_id")
                if media_id:
                    ids.add(str(media_id))
            pagination = page.get("pagination") or {}
            nxt = pagination.get("next")
            if nxt is None:
                break
            offset += _PAGE_LIMIT
        return ids

    async def _fetch_not_caught_up_media_ids(self) -> set[str]:
        """Return the media_ids that are on a not-caught-up list."""
        ids: set[str] = set()
        offset = 0
        for _page in range(_MAX_PAGES_PER_STATUS):
            page = await self._get(
                API_MEDIA_TV,
                {"progress": "not_caught_up", "limit": _PAGE_LIMIT, "offset": offset},
            )
            for entry in page.get("results", []):
                media_id = (entry.get("item") or {}).get("media_id")
                if media_id:
                    ids.add(str(media_id))
            pagination = page.get("pagination") or {}
            nxt = pagination.get("next")
            if nxt is None:
                break
            offset += _PAGE_LIMIT
        return ids

    async def _fetch_history_media_ids(self) -> set[str]:
        """Return the media_ids of recently watched episodes."""
        ids: set[str] = set()
        # Get recent history (last 7 days, limit 500)
        try:
            history = await self._get("/api/v1/history/", {"limit": 500})
            for day_entry in history.get("results", []):
                for entry in day_entry.get("entries", []):
                    item = entry.get("item") or {}
                    media_id = item.get("media_id")
                    if media_id:
                        ids.add(str(media_id))
        except Exception as exception:
            LOGGER.warning("Kunne ikke hente watch history: %s", exception)
        return ids

    def _build_episodes(self, calendar_results: list[dict[str, Any]], include_past: bool = False) -> list[dict[str, Any]]:
        """Project calendar events to compact episode dicts."""
        now = datetime.now().astimezone()
        episodes: list[dict[str, Any]] = []
        for event in calendar_results:
            item = event.get("item") or {}
            try:
                event_dt = datetime.fromisoformat(str(event.get("datetime")))
            except (TypeError, ValueError):
                continue
            if not include_past and event_dt < now:
                continue
            media_id = str(item.get("media_id") or "")
            title = item.get("title") or item.get("localized_title") or "Ukendt"
            image = item.get("image") or ""
            season = item.get("season_number")
            episode = item.get("episode_number")
            episode_url = item.get("url") or ""
            synopsis = item.get("synopsis") or ""
            episodes.append(
                {
                    "media_id": media_id,
                    "title": title,
                    "season": season,
                    "episode": episode,
                    "datetime": event_dt.isoformat(timespec="seconds"),
                    "date": event_dt.date().isoformat(),
                    "image": image,
                    "synopsis": synopsis,
                    "url": f"{self.url}{episode_url}" if episode_url else "",
                }
            )
        return sorted(episodes, key=lambda e: e["datetime"])

    def _filter_episodes(
        self,
        episodes: list[dict[str, Any]],
        mode: str,
        status_sets: dict[str, set[str]],
    ) -> list[dict[str, Any]]:
        """Filter upcoming episodes by a card mode."""
        if mode == MODE_ALL:
            return episodes
        if mode == MODE_NOT_CAUGHT_UP:
            allowed = status_sets.get(MODE_NOT_CAUGHT_UP, set())
            return [e for e in episodes if e["media_id"] in allowed]
        status = STATUS_MODES.get(mode)
        if status is None:
            return []
        allowed = status_sets.get(mode, set())
        return [e for e in episodes if e["media_id"] in allowed]

    def _load_cache(self) -> dict[str, Any] | None:
        """Load the last-good payload from disk."""
        try:
            with open(self._cache_file, encoding="utf-8") as f:
                return json.load(f)
        except (OSError, ValueError):
            return None

    def _save_cache(self, data: dict[str, Any]) -> None:
        """Persist the last-good payload to disk."""
        try:
            os.makedirs(os.path.dirname(self._cache_file), exist_ok=True)
            tmp = f"{self._cache_file}.tmp"
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=True)
            os.replace(tmp, self._cache_file)
        except OSError as exception:
            LOGGER.warning("Kunne ikke skrive Floppy-cache: %s", exception)

    async def _async_update_data(self) -> dict[str, Any]:
        """Fetch data from Floppy."""
        try:
            calendar_result = await self._get(API_CALENDAR, {"limit": 200})
            # Future episodes
            episodes = self._build_episodes(calendar_result.get("results", []), include_past=False)
            # All episodes (including past) for unwatched detection
            all_episodes = self._build_episodes(calendar_result.get("results", []), include_past=True)

            status_sets: dict[str, set[str]] = {}
            status_tasks = {
                mode: self._fetch_status_media_ids(status)
                for mode, status in STATUS_MODES.items()
            }
            status_tasks[MODE_NOT_CAUGHT_UP] = self._fetch_not_caught_up_media_ids()
            # Fetch watched history
            status_tasks["unwatched_aired"] = self._fetch_history_media_ids()
            results = await asyncio.gather(
                *status_tasks.values(), return_exceptions=True
            )
            for mode, result in zip(status_tasks, results, strict=False):
                if isinstance(result, Exception):
                    LOGGER.warning(
                        "Kunne ikke hente status '%s' fra Floppy: %s", mode, result
                    )
                    continue
                status_sets[mode] = result

            results_by_mode: dict[str, dict[str, Any]] = {
                mode: {
                    "count": 0,
                    "results": [],
                }
                for mode in self._all_modes()
            }
            # Add unwatched_aired mode
            results_by_mode["unwatched_aired"] = {"count": 0, "results": []}

            for mode, entry in results_by_mode.items():
                if mode == "unwatched_aired":
                    # Filter: past episodes not in watched history
                    watched = status_sets.get("unwatched_aired", set())
                    now = datetime.now().astimezone()
                    filtered = [
                        e for e in all_episodes
                        if e["media_id"] not in watched
                        and datetime.fromisoformat(e["datetime"]) < now
                    ]
                else:
                    filtered = self._filter_episodes(episodes, mode, status_sets)
                entry["results"] = filtered
                entry["count"] = len(filtered)

            data: dict[str, Any] = {
                "results": results_by_mode,
                "base_url": self.url,
                "updated": datetime.now().astimezone().isoformat(timespec="seconds"),
                "source": "live",
            }
            self._save_cache(data)
            return data
        except UpdateFailed:
            raise
        except Exception as exception:  # noqa: BLE001
            LOGGER.exception("Floppy-opdatering fejlede")
            cached = self._load_cache()
            if cached is None:
                raise UpdateFailed(f"Error communicating with Floppy: {exception}") from exception
            cached["source"] = "cache"
            return cached

    def _all_modes(self) -> tuple[str, ...]:
        """Return the modes exposed by this integration."""
        from .const import MODES

        return MODES

class FloppyConfigEntry(ConfigEntry[FloppyUpdateCoordinator]):
    """Typed config entry whose runtime_data is the data coordinator."""