"""Data update coordinator for AirParif."""

from __future__ import annotations

from datetime import date
import logging
from typing import Any

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import ConfigEntryAuthFailed
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed

from .api import AirParifApiClient, AirParifApiError, AirParifAuthError
from .const import CONF_API_KEY, CONF_INSEE, DOMAIN, SCAN_INTERVAL
from .parser import normalize_forecast

_LOGGER = logging.getLogger(__name__)

type AirParifConfigEntry = ConfigEntry[AirParifCoordinator]


class AirParifCoordinator(DataUpdateCoordinator[dict[date, dict[str, Any]]]):
    """Fetch the commune forecast and index it by date."""

    config_entry: AirParifConfigEntry

    def __init__(self, hass: HomeAssistant, entry: AirParifConfigEntry) -> None:
        """Initialize the coordinator."""
        super().__init__(
            hass,
            _LOGGER,
            config_entry=entry,
            name=DOMAIN,
            update_interval=SCAN_INTERVAL,
        )
        self.insee: str = entry.data[CONF_INSEE]
        self.client = AirParifApiClient(
            async_get_clientsession(hass), entry.data[CONF_API_KEY]
        )

    async def _async_update_data(self) -> dict[date, dict[str, Any]]:
        try:
            payload = await self.client.async_get_forecast(self.insee)
        except AirParifAuthError as err:
            raise ConfigEntryAuthFailed(str(err)) from err
        except AirParifApiError as err:
            raise UpdateFailed(str(err)) from err

        entries = normalize_forecast(payload, self.insee)
        if not entries:
            raise UpdateFailed("AirParif returned no usable forecast data")
        return {entry["date"]: entry for entry in entries}
