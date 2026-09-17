"""Sensor platform for the Floppy integration."""

from __future__ import annotations

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
        FloppyUpcomingSensor(coordinator, mode) for mode in MODES
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
        }