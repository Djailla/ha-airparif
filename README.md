# AirParif for Home Assistant

Custom integration exposing the AirParif commune air-quality forecast
(`/indices/prevision/commune`) and the Île-de-France pollution episodes
(`/episodes/en-cours-et-prevus`) as Home Assistant sensors.

## Installation

Copy `custom_components/airparif` into your Home Assistant `config/custom_components/`
folder (or add this repository to HACS as a custom repository), restart Home Assistant,
then **Settings → Devices & services → Add integration → AirParif**.

## Configuration

| Field | Description |
|-------|-------------|
| API key | Your AirParif API key (sent as the `X-Api-Key` header) |
| INSEE code | 5-digit INSEE code of the commune, e.g. `75117` for Paris 17e |

One config entry per commune. If the key is later rejected, Home Assistant starts a
re-authentication flow.

## Entities

For each configured commune (one device):

- **Air quality today / tomorrow**: ATMO level, an enum sensor with the states `bon`,
  `moyen`, `degrade`, `mauvais`, `tres_mauvais`, `extremement_mauvais`. Attributes:
  `index` (1 to 6), `forecast_date`, `pollutants`.
- **NO₂, O₃, PM10, PM2.5, SO₂ today / tomorrow**: per-pollutant level. Today's are
  enabled by default, tomorrow's are disabled by default.

- **Pollution episode today / tomorrow**: binary sensor, `on` when a pollution
  episode is ongoing or forecast. Episodes are region-wide, not per commune.
  Attributes: `pollutants` (episode level per pollutant as reported by AirParif,
  `null` when none) and `message` (AirParif's text, in French or English
  depending on the Home Assistant language).

Sensors are `unavailable` when the forecast does not cover the day. The episode
sensors are `unavailable` when the episodes endpoint fails; the forecast sensors
keep working.

Data is refreshed hourly.

## Caveat

The response parser (`parser.py`) is deliberately tolerant because it was written without
being able to call the live API. If a sensor stays unavailable, open an issue with the
raw output of:

```bash
curl -H "X-Api-Key: <key>" "https://api.airparif.fr/indices/prevision/commune?insee=75117"
```
