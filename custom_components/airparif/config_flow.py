"""Config flow for AirParif."""

from __future__ import annotations

import logging
import re
from collections.abc import Mapping
from typing import Any

import voluptuous as vol

from homeassistant.config_entries import ConfigFlow, ConfigFlowResult
from homeassistant.helpers.aiohttp_client import async_get_clientsession

from .api import (
    AirParifApiClient,
    AirParifApiError,
    AirParifAuthError,
    AirParifConnectionError,
    AirParifInvalidInseeError,
)
from .const import CONF_API_KEY, CONF_INSEE, DOMAIN
from .parser import normalize_forecast

_LOGGER = logging.getLogger(__name__)

_INSEE_RE = re.compile(r"^(\d{5}|2[AB]\d{3})$", re.IGNORECASE)


class AirParifConfigFlow(ConfigFlow, domain=DOMAIN):
    """Handle a config flow for AirParif."""

    VERSION = 1

    async def _async_validate(self, api_key: str, insee: str) -> str | None:
        """Return an error key, or None if the credentials and INSEE work."""
        client = AirParifApiClient(async_get_clientsession(self.hass), api_key)
        try:
            payload = await client.async_get_forecast(insee)
        except AirParifAuthError:
            return "invalid_auth"
        except AirParifInvalidInseeError:
            return "invalid_insee"
        except AirParifConnectionError:
            return "cannot_connect"
        except AirParifApiError:
            return "cannot_connect"
        except Exception:  # noqa: BLE001
            _LOGGER.exception("Unexpected error validating AirParif settings")
            return "unknown"
        if not normalize_forecast(payload, insee):
            return "no_data"
        return None

    async def async_step_user(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Handle the initial step."""
        errors: dict[str, str] = {}
        if user_input is not None:
            api_key = user_input[CONF_API_KEY].strip()
            insee = user_input[CONF_INSEE].strip().upper()
            if not _INSEE_RE.match(insee):
                errors[CONF_INSEE] = "invalid_insee"
            else:
                await self.async_set_unique_id(insee)
                self._abort_if_unique_id_configured()
                error = await self._async_validate(api_key, insee)
                if error is None:
                    return self.async_create_entry(
                        title=f"AirParif {insee}",
                        data={CONF_API_KEY: api_key, CONF_INSEE: insee},
                    )
                errors["base"] = error

        defaults = user_input or {}
        return self.async_show_form(
            step_id="user",
            data_schema=vol.Schema(
                {
                    vol.Required(CONF_API_KEY, default=defaults.get(CONF_API_KEY, "")): str,
                    vol.Required(CONF_INSEE, default=defaults.get(CONF_INSEE, "")): str,
                }
            ),
            errors=errors,
        )

    async def async_step_reauth(
        self, entry_data: Mapping[str, Any]
    ) -> ConfigFlowResult:
        """Start reauthentication when the API key stops working."""
        return await self.async_step_reauth_confirm()

    async def async_step_reauth_confirm(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Ask for a new API key."""
        errors: dict[str, str] = {}
        entry = self._get_reauth_entry()
        if user_input is not None:
            api_key = user_input[CONF_API_KEY].strip()
            error = await self._async_validate(api_key, entry.data[CONF_INSEE])
            if error is None:
                return self.async_update_reload_and_abort(
                    entry, data_updates={CONF_API_KEY: api_key}
                )
            errors["base"] = error

        return self.async_show_form(
            step_id="reauth_confirm",
            data_schema=vol.Schema({vol.Required(CONF_API_KEY): str}),
            description_placeholders={CONF_INSEE: entry.data[CONF_INSEE]},
            errors=errors,
        )
