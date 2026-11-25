"""Tolerant parser for the AirParif commune forecast payload.

Stdlib only, so it can be unit-tested without Home Assistant. The live response
format could not be verified when this was written, so the parser accepts several
plausible layouts (list of days, mapping keyed by INSEE code, mapping keyed by
date, pollutants as keys / nested mapping / list) and numeric or textual levels.
"""

from __future__ import annotations

import re
import unicodedata
from datetime import date, datetime
from typing import Any

# ATMO index scale (1..6).
INDEX_LEVELS: tuple[str, ...] = (
    "bon",
    "moyen",
    "degrade",
    "mauvais",
    "tres_mauvais",
    "extremement_mauvais",
)
LABEL_TO_INDEX: dict[str, int] = {label: i + 1 for i, label in enumerate(INDEX_LEVELS)}

POLLUTANTS: tuple[str, ...] = ("no2", "o3", "pm10", "pm25", "so2")

_GLOBAL_KEYS = ("indice", "indice_global", "global", "index", "qualificatif")
_DATE_KEYS = ("date", "jour", "day", "date_prevision")
_POLLUTANT_CONTAINER_KEYS = ("polluants", "pollutants", "sous_indices")
_LEVEL_VALUE_KEYS = ("indice", "valeur", "value", "index", "qualificatif", "label")
_WRAPPER_KEYS = ("data", "previsions", "prevision", "results", "items")


def _slug(value: str) -> str:
    text = unicodedata.normalize("NFKD", value)
    text = "".join(c for c in text if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", "_", text.lower()).strip("_")


def _pollutant_code(key: str) -> str | None:
    code = re.sub(r"[^a-z0-9]", "", key.lower())
    return code if code in POLLUTANTS else None


def parse_date(value: Any) -> date | None:
    """Parse a date from ISO or DD/MM/YYYY text."""
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if not isinstance(value, str):
        return None
    text = value.strip()
    try:
        return date.fromisoformat(text[:10])
    except ValueError:
        pass
    try:
        return datetime.strptime(text[:10], "%d/%m/%Y").date()
    except ValueError:
        return None


def parse_level(value: Any) -> dict[str, Any] | None:
    """Convert a raw level (int, numeric text, label, or mapping) to a level dict."""
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, dict):
        for key in _LEVEL_VALUE_KEYS:
            if key in value:
                level = parse_level(value[key])
                if level is not None:
                    return level
        return None
    if isinstance(value, (int, float)):
        idx = int(value)
        if 1 <= idx <= len(INDEX_LEVELS):
            return {"index": idx, "label": INDEX_LEVELS[idx - 1], "raw": value}
        return {"index": None, "label": None, "raw": value}
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return None
        if text.isdigit():
            return parse_level(int(text))
        slug = _slug(text)
        idx = LABEL_TO_INDEX.get(slug)
        if idx is not None:
            return {"index": idx, "label": slug, "raw": value}
        return {"index": None, "label": None, "raw": value}
    return None


def _unwrap(data: Any, insee: str) -> Any:
    """Peel wrapper layers (INSEE-keyed mapping, 'data' keys...) off the payload."""
    for _ in range(4):
        if not isinstance(data, dict):
            return data
        for key in (insee, insee.lstrip("0")):
            if key in data:
                data = data[key]
                break
        else:
            for key in _WRAPPER_KEYS:
                if key in data:
                    data = data[key]
                    break
            else:
                return data
    return data


def _extract_entries(payload: Any, insee: str) -> list[dict[str, Any]]:
    data = _unwrap(payload, insee)
    if isinstance(data, dict):
        if any(parse_date(k) for k in data):
            # Mapping keyed by date.
            entries = []
            for key, val in data.items():
                if parse_date(key) is None:
                    continue
                if isinstance(val, dict):
                    entries.append({**val, "date": key})
                else:
                    entries.append({"date": key, "indice": val})
            return entries
        return [data]
    if isinstance(data, list):
        return [item for item in data if isinstance(item, dict)]
    return []


def _parse_pollutants(entry: dict[str, Any]) -> dict[str, dict[str, Any]]:
    pollutants: dict[str, dict[str, Any]] = {}

    def add(code_raw: Any, raw_level: Any) -> None:
        if not isinstance(code_raw, str):
            return
        code = _pollutant_code(code_raw)
        level = parse_level(raw_level)
        if code and level is not None:
            pollutants[code] = level

    # Pollutants as top-level keys.
    for key, val in entry.items():
        add(key, val)

    # Pollutants in a nested container (mapping or list).
    for ckey in _POLLUTANT_CONTAINER_KEYS:
        container = entry.get(ckey)
        if isinstance(container, dict):
            for key, val in container.items():
                add(key, val)
        elif isinstance(container, list):
            for item in container:
                if not isinstance(item, dict):
                    continue
                name = item.get("polluant") or item.get("pollutant") or item.get("nom")
                add(name, item)
    return pollutants


def normalize_forecast(payload: Any, insee: str) -> list[dict[str, Any]]:
    """Return a list of {'date', 'global', 'pollutants'} sorted by date."""
    results: list[dict[str, Any]] = []
    for entry in _extract_entries(payload, insee):
        day = None
        for key in _DATE_KEYS:
            day = parse_date(entry.get(key))
            if day:
                break
        if day is None:
            continue
        global_level = None
        for key in _GLOBAL_KEYS:
            if key in entry:
                global_level = parse_level(entry[key])
                if global_level is not None:
                    break
        pollutants = _parse_pollutants(entry)
        if global_level is None and not pollutants:
            continue
        results.append({"date": day, "global": global_level, "pollutants": pollutants})
    results.sort(key=lambda item: item["date"])
    return results


_EPISODE_DAYS = {"today": "jour", "tomorrow": "demain"}
_NO_LEVEL = {"", "-", "aucun", "none"}


def _episode_day(data: Any) -> dict[str, Any] | None:
    if not isinstance(data, dict):
        return None
    pollutants: dict[str, str | None] = {}
    for item in data.get("polluants") or []:
        if not isinstance(item, dict) or not isinstance(item.get("nom"), str):
            continue
        code = _pollutant_code(item["nom"])
        if code is None:
            continue
        raw = item.get("niveau")
        level = _slug(raw) if isinstance(raw, str) else None
        pollutants[code] = None if not level or raw.strip() in _NO_LEVEL else level
    active = data.get("actif")
    if not isinstance(active, bool):
        active = any(level is not None for level in pollutants.values())
    return {"active": active, "pollutants": pollutants}


def normalize_episodes(payload: Any) -> dict[str, Any] | None:
    """Return {'active', 'message', 'days': {'today'|'tomorrow': {...}}}.

    Each day is {'active': bool, 'pollutants': {code: level slug or None}}.
    Returns None when the payload does not look like an episodes response.
    """
    if not isinstance(payload, dict):
        return None
    days = {
        day: parsed
        for day, key in _EPISODE_DAYS.items()
        if (parsed := _episode_day(payload.get(key))) is not None
    }
    if not days:
        return None
    message = payload.get("message")
    if isinstance(message, str):
        message = {"fr": message, "en": message}
    elif not isinstance(message, dict):
        message = {}
    active = payload.get("actif")
    if not isinstance(active, bool):
        active = any(day["active"] for day in days.values())
    return {"active": active, "message": message, "days": days}
