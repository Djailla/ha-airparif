"""Pollution episode binary sensors for the AirParif integration."""

from __future__ import annotations

from typing import Any

from homeassistant.components.binary_sensor import BinarySensorEntity
from homeassistant.core import HomeAssistant
from homeassistant.helpers.device_registry import DeviceEntryType, DeviceInfo
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import ATTRIBUTION, DOMAIN
from .coordinator import AirParifConfigEntry, AirParifCoordinator

PARALLEL_UPDATES = 0

EPISODE_DAYS = ("today", "tomorrow")


async def async_setup_entry(
    hass: HomeAssistant,
    entry: AirParifConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up AirParif episode binary sensors."""
    coordinator = entry.runtime_data
    async_add_entities(AirParifEpisodeSensor(coordinator, day) for day in EPISODE_DAYS)


class AirParifEpisodeSensor(CoordinatorEntity[AirParifCoordinator], BinarySensorEntity):
    """On when a pollution episode is ongoing or forecast for the day (region-wide)."""

    _attr_has_entity_name = True
    _attr_attribution = ATTRIBUTION

    def __init__(self, coordinator: AirParifCoordinator, day: str) -> None:
        """Initialize the binary sensor."""
        super().__init__(coordinator)
        self._day = day
        insee = coordinator.insee
        self._attr_unique_id = f"{insee}_{day}_episode"
        self._attr_translation_key = f"episode_{day}"
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, insee)},
            name=f"AirParif {insee}",
            manufacturer="AirParif",
            entry_type=DeviceEntryType.SERVICE,
        )

    @property
    def _episode_day(self) -> dict[str, Any] | None:
        episodes = self.coordinator.data.episodes
        if episodes is None:
            return None
        return episodes["days"].get(self._day)

    @property
    def available(self) -> bool:
        """Unavailable when the episodes could not be fetched."""
        return super().available and self._episode_day is not None

    @property
    def is_on(self) -> bool | None:
        """Return whether an episode is ongoing or forecast."""
        day = self._episode_day
        return None if day is None else day["active"]

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        """Return the per-pollutant episode level and the AirParif message."""
        day = self._episode_day
        if day is None:
            return {}
        message = self.coordinator.data.episodes["message"]
        language = "fr" if self.hass.config.language.startswith("fr") else "en"
        return {
            "pollutants": day["pollutants"],
            "message": message.get(language) or message.get("fr"),
        }
