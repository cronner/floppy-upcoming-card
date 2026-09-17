"""Config flow for the Floppy integration."""

from __future__ import annotations

from typing import Any

import aiohttp
import voluptuous as vol
from homeassistant import config_entries
from homeassistant.core import callback
from homeassistant.data_entry_flow import FlowResult
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers import selector
from homeassistant.helpers.aiohttp_client import async_get_clientsession

from .const import (
    API_CALENDAR,
    CONF_API_KEY,
    CONF_SCAN_INTERVAL,
    CONF_URL,
    DEFAULT_SCAN_INTERVAL,
    DOMAIN,
    MAX_SCAN_INTERVAL,
    MIN_SCAN_INTERVAL,
)

_TIME_BASE = selector.NumberSelectorConfig(
    min=MIN_SCAN_INTERVAL,
    max=MAX_SCAN_INTERVAL,
    unit_of_measurement="min",
    mode=selector.NumberSelectorMode.BOX,
)


class CannotConnect(HomeAssistantError):
    """Raised when the Floppy server cannot be reached."""


class InvalidAuth(HomeAssistantError):
    """Raised when the API key is rejected."""


class FloppyFlowHandler(config_entries.ConfigFlow, domain=DOMAIN):
    """Handle the Floppy config flow."""

    VERSION = 1

    async def async_step_user(
        self, user_input: dict[str, Any] | None = None
    ) -> FlowResult:
        """Handle the initial step."""
        errors: dict[str, str] = {}
        if user_input is not None:
            try:
                await self._test_connection(
                    user_input[CONF_URL], user_input[CONF_API_KEY]
                )
            except InvalidAuth as exception:
                errors["base"] = "invalid_auth"
            except CannotConnect as exception:
                errors["base"] = "cannot_connect"
            except Exception as exception:  # noqa: BLE001
                errors["base"] = "cannot_connect"
            else:
                return self.async_create_entry(
                    title=f"Floppy ({user_input[CONF_URL]})",
                    data=user_input,
                )

        return self.async_show_form(
            step_id="user",
            data_schema=vol.Schema(
                {
                    vol.Required(CONF_URL): selector.TextSelector(
                        selector.TextSelectorConfig(
                            type=selector.TextSelectorType.URL,
                            autocomplete="off",
                        ),
                    ),
                    vol.Required(CONF_API_KEY): selector.TextSelector(
                        selector.TextSelectorConfig(
                            type=selector.TextSelectorType.PASSWORD,
                        ),
                    ),
                    vol.Optional(
                        CONF_SCAN_INTERVAL, default=DEFAULT_SCAN_INTERVAL
                    ): selector.NumberSelector(_TIME_BASE),
                }
            ),
            errors=errors,
        )

    async def _test_connection(self, url: str, api_key: str) -> None:
        """Validate the URL and API key against the Floppy API."""
        session = async_get_clientsession(self.hass)
        normalized = url.rstrip("/")
        try:
            resp = await session.get(
                normalized + API_CALENDAR,
                params={"limit": 1},
                headers={"X-API-Key": api_key},
                timeout=aiohttp.ClientTimeout(total=10),
            )
        except aiohttp.ClientError as exception:
            raise CannotConnect() from exception
        if resp.status in (401, 403):
            raise InvalidAuth() from None
        if resp.status != 200:
            raise CannotConnect() from None

    @staticmethod
    @callback
    def async_get_options_flow(
        config_entry: config_entries.ConfigEntry,
    ) -> config_entries.OptionsFlow:
        """Return the options flow."""
        return FloppyOptionsFlowHandler(config_entry)


class FloppyOptionsFlowHandler(config_entries.OptionsFlow):
    """Handle Floppy options."""

    def __init__(self, config_entry: config_entries.ConfigEntry) -> None:
        """Initialize the options flow."""
        self._entry = config_entry

    async def async_step_init(
        self, user_input: dict[str, Any] | None = None
    ) -> FlowResult:
        """Manage the options."""
        if user_input is not None:
            new_data = {
                **self._entry.data,
                CONF_URL: user_input[CONF_URL],
                CONF_API_KEY: user_input[CONF_API_KEY],
            }
            self.hass.config_entries.async_update_entry(self._entry, data=new_data)
            return self.async_create_entry(title="", data=user_input)

        return self.async_show_form(
            step_id="init",
            data_schema=vol.Schema(
                {
                    vol.Required(
                        CONF_URL, default=self._entry.data.get(CONF_URL)
                    ): selector.TextSelector(
                        selector.TextSelectorConfig(
                            type=selector.TextSelectorType.URL,
                        ),
                    ),
                    vol.Required(
                        CONF_API_KEY, default=self._entry.data.get(CONF_API_KEY)
                    ): selector.TextSelector(
                        selector.TextSelectorConfig(
                            type=selector.TextSelectorType.PASSWORD,
                        ),
                    ),
                    vol.Optional(
                        CONF_SCAN_INTERVAL,
                        default=self._entry.options.get(
                            CONF_SCAN_INTERVAL,
                            self._entry.data.get(
                                CONF_SCAN_INTERVAL, DEFAULT_SCAN_INTERVAL
                            ),
                        ),
                    ): selector.NumberSelector(_TIME_BASE),
                }
            ),
        )