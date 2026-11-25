"""Constants for the AirParif integration."""

from __future__ import annotations

from datetime import timedelta

from .parser import INDEX_LEVELS, POLLUTANTS

DOMAIN = "airparif"

# URL the dashboard card is served from.
CARD_URL = f"/{DOMAIN}/airparif-card.js"

CONF_API_KEY = "api_key"
CONF_INSEE = "insee"

BASE_URL = "https://api.airparif.fr"
FORECAST_PATH = "/indices/prevision/commune"
EPISODES_PATH = "/episodes/en-cours-et-prevus"
REQUEST_TIMEOUT = 20

# Shown in the config flow to help users fill in the form.
API_KEY_URL = "https://www.airparif.fr/interface-de-programmation-applicative"
INSEE_LOOKUP_URL = (
    "https://hub.huwise.com/explore/assets/correspondance-code-insee-code-postal/view/"
)

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
    "API_KEY_URL",
    "ATTRIBUTION",
    "BASE_URL",
    "CARD_URL",
    "CONF_API_KEY",
    "CONF_INSEE",
    "DOMAIN",
    "EPISODES_PATH",
    "FORECAST_PATH",
    "INDEX_LEVELS",
    "INSEE_LOOKUP_URL",
    "POLLUTANTS",
    "POLLUTANT_NAMES",
    "REQUEST_TIMEOUT",
    "SCAN_INTERVAL",
]
