# AirParif pour Home Assistant

Intégration personnalisée qui expose dans Home Assistant, sous forme de capteurs,
les prévisions de qualité de l'air AirParif par commune
(`/indices/prevision/commune`) et les épisodes de pollution en Île-de-France
(`/episodes/en-cours-et-prevus`).

## Installation

Copiez `custom_components/airparif` dans le dossier `config/custom_components/` de
votre Home Assistant (ou ajoutez ce dépôt à HACS comme dépôt personnalisé),
redémarrez Home Assistant, puis allez dans **Paramètres → Appareils et services →
Ajouter une intégration → AirParif**.

## Configuration

| Champ | Description |
|-------|-------------|
| Clé d'API | Votre clé d'API AirParif (envoyée dans l'en-tête `X-Api-Key`) |
| Code INSEE | Code INSEE à 5 chiffres de la commune, par exemple `75117` pour Paris 17e |

- **Clé d'API** : demandez-la sur la
  [page de l'API AirParif](https://www.airparif.fr/interface-de-programmation-applicative).
- **Code INSEE** : ce n'est pas le code postal. Retrouvez-le à partir du code postal
  dans la
  [table de correspondance code INSEE / code postal](https://hub.huwise.com/explore/assets/correspondance-code-insee-code-postal/view/).

Une entrée de configuration par commune. Si la clé est refusée par la suite, Home
Assistant lance une procédure de réauthentification.

## Entités

Pour chaque commune configurée (un appareil) :

- **Qualité de l'air aujourd'hui / demain** : indice ATMO, capteur de type énumération
  avec les états `bon`, `moyen`, `degrade`, `mauvais`, `tres_mauvais`,
  `extremement_mauvais`. Attributs : `index` (de 1 à 6), `forecast_date`, `pollutants`.
- **NO₂, O₃, PM10, PM2.5, SO₂ aujourd'hui / demain** : niveau par polluant. Ceux du
  jour sont activés par défaut, ceux du lendemain sont désactivés par défaut.
- **Épisode de pollution aujourd'hui / demain** : capteur binaire, à `on` lorsqu'un
  épisode de pollution est en cours ou prévu. Les épisodes concernent toute la région,
  pas une commune en particulier. Attributs : `pollutants` (niveau d'épisode par
  polluant tel que renvoyé par AirParif, `null` s'il n'y en a pas) et `message` (texte
  d'AirParif, en français ou en anglais selon la langue de Home Assistant).

Les capteurs sont `unavailable` (indisponibles) lorsque la prévision ne couvre pas le
jour concerné. Les capteurs d'épisode sont indisponibles lorsque l'appel aux épisodes
échoue ; les capteurs de prévision continuent de fonctionner.

Les données sont actualisées toutes les heures.

## Avertissement

L'analyseur de réponses (`parser.py`) est volontairement tolérant, car il a été écrit
sans pouvoir appeler l'API réelle. Si un capteur reste indisponible, ouvrez un ticket
en joignant la sortie brute de :

```bash
curl -H "X-Api-Key: <clé>" "https://api.airparif.fr/indices/prevision/commune?insee=75117"
```
