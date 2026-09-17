"""The Floppy integration for Home Assistant."""

from __future__ import annotations

import os
from pathlib import Path
from typing import TYPE_CHECKING, Any

from homeassistant.const import Platform
from homeassistant.core import HomeAssistant, callback

from .const import DOMAIN, LOGGER, URL_CARD
from .coordinator import FloppyUpdateCoordinator

if TYPE_CHECKING:
    from .coordinator import FloppyConfigEntry

PLATFORMS: list[Platform] = [Platform.SENSOR]

_CARD_SERVED = False


@callback
def async_serve_card(hass: HomeAssistant) -> None:
    """Serve the bundled card JavaScript as a static HA route."""
    global _CARD_SERVED  # noqa: PLW0603
    if _CARD_SERVED:
        return
    card_file = os.path.join(os.path.dirname(__file__), "frontend", "floppy-upcoming-card.js")
    if not os.path.isfile(card_file):
        LOGGER.warning("Floppy-kortet mangler: %s", card_file)
        return
    hass.http.register_static_path(URL_CARD, Path(card_file), cache_headers=True)
    _CARD_SERVED = True


async def async_setup(_hass: HomeAssistant, _config: dict[str, Any]) -> bool:
    """Set up the integration from YAML (unused, config-flow only)."""
    return True


async def async_setup_entry(hass: HomeAssistant, entry: FloppyConfigEntry) -> bool:
    """Set up Floppy from a config entry."""
    coordinator = FloppyUpdateCoordinator(hass, entry)
    await coordinator.async_config_entry_first_refresh()
    entry.runtime_data = coordinator
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    entry.async_on_unload(entry.add_update_listener(async_reload_entry))
    async_serve_card(hass)
    return True


async def async_unload_entry(hass: HomeAssistant, entry: FloppyConfigEntry) -> bool:
    """Unload Floppy."""
    return await hass.config_entries.async_unload_platforms(entry, PLATFORMS)


async def async_reload_entry(hass: HomeAssistant, entry: FloppyConfigEntry) -> None:
    """Reload the Floppy config entry."""
    await hass.config_entries.async_reload(entry.entry_id)