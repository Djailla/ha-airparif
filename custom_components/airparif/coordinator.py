"""Data update coordinator for AirParif."""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from datetime import date
from typing import Any

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import ConfigEntryAuthFailed
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed

from .api import AirParifApiClient, AirParifApiError, AirParifAuthError
from .const import CONF_API_KEY, CONF_INSEE, DOMAIN, SCAN_INTERVAL
from .parser import normalize_episodes, normalize_forecast

_LOGGER = logging.getLogger(__name__)

type AirParifConfigEntry = ConfigEntry[AirParifCoordinator]


@dataclass(frozen=True)
class AirParifData:
    """Forecast indexed by date, plus the region-wide pollution episodes."""

    forecast: dict[date, dict[str, Any]]
    episodes: dict[str, Any] | None


class AirParifCoordinator(DataUpdateCoordinator[AirParifData]):
    """Fetch the commune forecast and the pollution episodes."""

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

    async def _async_update_data(self) -> AirParifData:
        forecast_result, episodes_result = await asyncio.gather(
            self.client.async_get_forecast(self.insee),
            self.client.async_get_episodes(),
            return_exceptions=True,
        )
        for result in (forecast_result, episodes_result):
            if isinstance(result, AirParifAuthError):
                raise ConfigEntryAuthFailed(str(result)) from result

        if isinstance(forecast_result, AirParifApiError):
            raise UpdateFailed(str(forecast_result)) from forecast_result
        if isinstance(forecast_result, BaseException):
            raise forecast_result
        entries = normalize_forecast(forecast_result, self.insee)
        if not entries:
            raise UpdateFailed("AirParif returned no usable forecast data")

        # Episodes are secondary: a failure only makes the episode sensors
        # unavailable instead of failing the whole update.
        episodes: dict[str, Any] | None = None
        if isinstance(episodes_result, AirParifApiError):
            _LOGGER.warning("Could not fetch AirParif episodes: %s", episodes_result)
        elif isinstance(episodes_result, BaseException):
            raise episodes_result
        else:
            episodes = normalize_episodes(episodes_result)
            if episodes is None:
                _LOGGER.warning("AirParif returned an unexpected episodes payload")

        return AirParifData(
            forecast={entry["date"]: entry for entry in entries},
            episodes=episodes,
        )
