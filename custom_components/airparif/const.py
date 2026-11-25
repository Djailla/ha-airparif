"""Constants for the AirParif integration."""

from __future__ import annotations

from datetime import timedelta

from .parser import INDEX_LEVELS, POLLUTANTS

DOMAIN = "airparif"

CONF_API_KEY = "api_key"
CONF_INSEE = "insee"

BASE_URL = "https://api.airparif.fr"
FORECAST_PATH = "/indices/prevision/commune"
REQUEST_TIMEOUT = 20

# The forecast is published once a day; an hourly poll is plenty.
SCAN_INTERVAL = timedelta(hours=1)

ATTRIBUTION = "Data provided by AirParif"

POLLUTANT_NAMES: dict[str, str] = {
    "no2": "NO₂",
    "o3": "O₃",
    "pm10": "PM10",
    "pm25": "PM2.5",
    "so2": "SO₂",
}

__all__ = [
    "ATTRIBUTION",
    "BASE_URL",
    "CONF_API_KEY",
    "CONF_INSEE",
    "DOMAIN",
    "FORECAST_PATH",
    "INDEX_LEVELS",
    "POLLUTANTS",
    "POLLUTANT_NAMES",
    "REQUEST_TIMEOUT",
    "SCAN_INTERVAL",
]
