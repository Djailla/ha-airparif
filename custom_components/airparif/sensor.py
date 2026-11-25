"""Sensors for the AirParif integration."""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any

from homeassistant.components.sensor import SensorDeviceClass, SensorEntity
from homeassistant.core import HomeAssistant
from homeassistant.helpers.device_registry import DeviceEntryType, DeviceInfo
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity
from homeassistant.util import dt as dt_util

from .const import ATTRIBUTION, DOMAIN, INDEX_LEVELS, POLLUTANT_NAMES, POLLUTANTS
from .coordinator import AirParifConfigEntry, AirParifCoordinator

PARALLEL_UPDATES = 0

# Forecast day -> offset from today.
DAYS: dict[str, int] = {"today": 0, "tomorrow": 1}


async def async_setup_entry(
    hass: HomeAssistant,
    entry: AirParifConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up AirParif sensors."""
    coordinator = entry.runtime_data
    entities: list[AirParifSensor] = []
    for day in DAYS:
        entities.append(AirParifSensor(coordinator, day, None))
        entities.extend(AirParifSensor(coordinator, day, code) for code in POLLUTANTS)
    async_add_entities(entities)


class AirParifSensor(CoordinatorEntity[AirParifCoordinator], SensorEntity):
    """Air quality level (global or per pollutant) for one forecast day."""

    _attr_has_entity_name = True
    _attr_attribution = ATTRIBUTION
    _attr_device_class = SensorDeviceClass.ENUM
    _attr_options = list(INDEX_LEVELS)

    def __init__(
        self, coordinator: AirParifCoordinator, day: str, pollutant: str | None
    ) -> None:
        """Initialize the sensor."""
        super().__init__(coordinator)
        self._day = day
        self._pollutant = pollutant
        insee = coordinator.insee
        key = pollutant or "index"
        self._attr_unique_id = f"{insee}_{day}_{key}"
        self._attr_translation_key = (
            f"{key if pollutant is None else 'pollutant'}_{day}"
        )
        if pollutant:
            self._attr_translation_placeholders = {
                "pollutant": POLLUTANT_NAMES[pollutant]
            }
            # Per-pollutant sensors are noisy: only today's are on by default.
            self._attr_entity_registry_enabled_default = day == "today"
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, insee)},
            name=f"AirParif {insee}",
            manufacturer="AirParif",
            entry_type=DeviceEntryType.SERVICE,
        )

    @property
    def _target_date(self) -> date:
        return dt_util.now().date() + timedelta(days=DAYS[self._day])

    @property
    def _level(self) -> dict[str, Any] | None:
        entry = self.coordinator.data.forecast.get(self._target_date)
        if entry is None:
            return None
        if self._pollutant is None:
            return entry["global"]
        return entry["pollutants"].get(self._pollutant)

    @property
    def available(self) -> bool:
        """Unavailable when the forecast does not cover this day."""
        return super().available and self._level is not None

    @property
    def native_value(self) -> str | None:
        """Return the level label."""
        level = self._level
        if level is None:
            return None
        return level["label"]

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        """Return the numeric index, the date and (for the global sensor) pollutants."""
        attrs: dict[str, Any] = {"forecast_date": self._target_date.isoformat()}
        level = self._level
        if level is not None:
            attrs["index"] = level["index"]
        if self._pollutant is None:
            entry = self.coordinator.data.forecast.get(self._target_date)
            if entry:
                attrs["pollutants"] = {
                    code: lvl["label"] or lvl["raw"]
                    for code, lvl in entry["pollutants"].items()
                }
        return attrs
