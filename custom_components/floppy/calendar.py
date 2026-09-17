"""Calendar platform for the Floppy integration."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from homeassistant.components.calendar import CalendarEntity, CalendarEvent
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity import DeviceInfo
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import DOMAIN
from .coordinator import FloppyConfigEntry, FloppyUpdateCoordinator


async def async_setup_entry(
    hass: HomeAssistant,
    entry: FloppyConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up the Floppy calendar."""
    coordinator: FloppyUpdateCoordinator = entry.runtime_data
    async_add_entities([FloppyCalendar(coordinator)])


class FloppyCalendar(CoordinatorEntity[FloppyUpdateCoordinator], CalendarEntity):
    """Calendar showing upcoming episodes from Floppy."""

    _attr_has_entity_name = True
    _attr_name = "Floppy Calendar"
    _attr_icon = "mdi:calendar-star"

    def __init__(self, coordinator: FloppyUpdateCoordinator) -> None:
        """Initialize the calendar."""
        super().__init__(coordinator)
        self._attr_unique_id = f"{coordinator.config_entry.entry_id}_calendar"

    @property
    def device_info(self) -> DeviceInfo:
        """Return the device info for Floppy."""
        return DeviceInfo(
            identifiers={(DOMAIN, self.coordinator.url)},
            name="Floppy",
            manufacturer="Floppy",
            model="Media server",
            configuration_url=self.coordinator.url,
        )

    @property
    def event(self) -> CalendarEvent | None:
        """Return the next upcoming episode as a calendar event."""
        data = self.coordinator.data
        if not data:
            return None
        all_results = data.get("results", {}).get("all", {}).get("results", [])
        if not all_results:
            return None
        # Find the next episode
        now = datetime.now().astimezone()
        for ep in all_results:
            try:
                event_dt = datetime.fromisoformat(ep["datetime"])
            except (TypeError, ValueError, KeyError):
                continue
            if event_dt > now:
                return CalendarEvent(
                    start=event_dt,
                    end=event_dt,
                    summary=f"{ep['title']} - S{ep['season']}E{ep['episode']}",
                    description=ep.get("synopsis", ""),
                )
        return None

    async def async_get_events(
        self,
        hass: HomeAssistant,
        start_date: datetime,
        end_date: datetime,
    ) -> list[CalendarEvent]:
        """Return calendar events within a datetime range."""
        data = self.coordinator.data
        if not data:
            return []
        all_results = data.get("results", {}).get("all", {}).get("results", [])
        events = []
        for ep in all_results:
            try:
                event_dt = datetime.fromisoformat(ep["datetime"])
            except (TypeError, ValueError, KeyError):
                continue
            if start_date <= event_dt <= end_date:
                events.append(
                    CalendarEvent(
                        start=event_dt,
                        end=event_dt,
                        summary=f"{ep['title']} - S{ep['season']}E{ep['episode']}",
                        description=ep.get("synopsis", ""),
                    )
                )
        return events
