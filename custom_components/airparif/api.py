"""Async client for the AirParif API."""

from __future__ import annotations

import asyncio
from typing import Any

import aiohttp

from .const import BASE_URL, EPISODES_PATH, FORECAST_PATH, REQUEST_TIMEOUT


class AirParifApiError(Exception):
    """Generic API error."""


class AirParifConnectionError(AirParifApiError):
    """The API could not be reached."""


class AirParifAuthError(AirParifApiError):
    """The API key was rejected."""


class AirParifInvalidInseeError(AirParifApiError):
    """The INSEE code was rejected."""


class AirParifApiClient:
    """Minimal client for the commune forecast and pollution episode endpoints."""

    def __init__(self, session: aiohttp.ClientSession, api_key: str) -> None:
        """Initialize the client."""
        self._session = session
        self._api_key = api_key

    async def async_get_forecast(self, insee: str) -> Any:
        """Return the raw commune forecast payload."""
        return await self._async_get(FORECAST_PATH, {"insee": insee})

    async def async_get_episodes(self) -> Any:
        """Return the raw current and forecast pollution episodes payload."""
        return await self._async_get(EPISODES_PATH)

    async def _async_get(self, path: str, params: dict[str, str] | None = None) -> Any:
        try:
            async with asyncio.timeout(REQUEST_TIMEOUT):
                async with self._session.get(
                    f"{BASE_URL}{path}",
                    params=params,
                    headers={"X-Api-Key": self._api_key},
                ) as response:
                    if response.status in (401, 403):
                        raise AirParifAuthError("API key rejected")
                    if response.status in (400, 404, 422):
                        raise AirParifInvalidInseeError(
                            f"INSEE code rejected (HTTP {response.status})"
                        )
                    if response.status == 429:
                        raise AirParifApiError("Rate limited by AirParif")
                    response.raise_for_status()
                    return await response.json(content_type=None)
        except TimeoutError as err:
            raise AirParifConnectionError("Timeout contacting AirParif") from err
        except aiohttp.ClientError as err:
            raise AirParifConnectionError(f"Error contacting AirParif: {err}") from err
        except ValueError as err:
            raise AirParifApiError("Invalid JSON received from AirParif") from err
