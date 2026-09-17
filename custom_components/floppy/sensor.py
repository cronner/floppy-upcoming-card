"""Sensor platform for the Floppy integration."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from homeassistant.components.sensor import SensorEntity, SensorStateClass
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity import DeviceInfo
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import DOMAIN, MODE_LABELS, MODES
from .coordinator import FloppyConfigEntry, FloppyUpdateCoordinator


async def async_setup_entry(
    hass: HomeAssistant,
    entry: FloppyConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up the Floppy sensors."""
    coordinator: FloppyUpdateCoordinator = entry.runtime_data
    async_add_entities(
        [FloppyUpcomingSensor(coordinator, mode) for mode in MODES]
        + [FloppyNextEpisodeSensor(coordinator)]
    )


class FloppyUpcomingSensor(CoordinatorEntity[FloppyUpdateCoordinator], SensorEntity):
    """Sensor exposing upcoming episodes for a given filter mode."""

    _attr_has_entity_name = True
    _attr_icon = "mdi:calendar-clock"
    _attr_state_class = SensorStateClass.MEASUREMENT

    def __init__(
        self,
        coordinator: FloppyUpdateCoordinator,
        mode: str,
    ) -> None:
        """Initialize the sensor."""
        super().__init__(coordinator)
        self._mode = mode
        self._attr_unique_id = f"{coordinator.config_entry.entry_id}_{mode}"
        self._attr_name = MODE_LABELS[mode]

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
    def native_value(self) -> int:
        """Return the number of upcoming episodes."""
        results = self.coordinator.data.get("results", {})
        return int(results.get(self._mode, {}).get("count", 0))

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        """Return rich attributes for the card."""
        data = self.coordinator.data
        mode_data = data.get("results", {}).get(self._mode, {})
        return {
            "mode": self._mode,
            "count": int(mode_data.get("count", 0)),
            "results": mode_data.get("results", []),
            "updated": data.get("updated"),
            "source": data.get("source", "live"),
            "base_url": data.get("base_url", ""),
            "connection_status": data.get("source", "live"),
        }


class FloppyNextEpisodeSensor(CoordinatorEntity[FloppyUpdateCoordinator], SensorEntity):
    """Sensor showing the next upcoming episode."""

    _attr_has_entity_name = True
    _attr_name = "Next Episode"
    _attr_icon = "mdi:play-circle-outline"

    def __init__(self, coordinator: FloppyUpdateCoordinator) -> None:
        """Initialize the sensor."""
        super().__init__(coordinator)
        self._attr_unique_id = f"{coordinator.config_entry.entry_id}_next_episode"

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
    def native_value(self) -> str | None:
        """Return the next episode title."""
        data = self.coordinator.data
        if not data:
            return None
        all_results = data.get("results", {}).get("all", {}).get("results", [])
        if not all_results:
            return None
        return f"{all_results[0]['title']} - S{all_results[0]['season']}E{all_results[0]['episode']}"

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        """Return next episode details."""
        data = self.coordinator.data
        if not data:
            return {}
        all_results = data.get("results", {}).get("all", {}).get("results", [])
        if not all_results:
            return {}
        ep = all_results[0]
        return {
            "title": ep.get("title", ""),
            "season": ep.get("season"),
            "episode": ep.get("episode"),
            "datetime": ep.get("datetime"),
            "date": ep.get("date"),
            "image": ep.get("image", ""),
            "synopsis": ep.get("synopsis", ""),
            "url": ep.get("url", ""),
            "media_id": ep.get("media_id", ""),
        }
