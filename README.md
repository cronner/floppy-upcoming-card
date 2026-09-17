# Floppy Upcoming Card

Custom [Home Assistant](https://www.home-assistant.io/) integration + Lovelace card
showing upcoming episodes from your self-hosted [Floppy](https://github.com/MauriceGit/floppy)
media server, grouped by air date.

## Features

- **Upcoming episodes** from the Floppy calendar, filtered to `datetime >= now`
- **Grouped by date** layout with weekday headers and `I dag` / `I morgen` / `Om N dage` labels
- **Flat list** layout option
- **Filter modes**: all, in progress, not caught up, planning, paused, completed, dropped
- Poster thumbnails (auto-scaled), click-through to the episode in Floppy
- Column count and episode limit controls
- Danish/English date language (follows the Home Assistant locale by default)
- Live current-date header ("I dag er det torsdag 17. september · kl. 17:32")
- Survives Floppy outages — the integration caches the last-good payload
- Visual card editor (UI) and full YAML configuration
- No CORS or token exposure: the browser card only ever talks to Home Assistant

## How it works

| Part | Role |
|------|------|
| `custom_components/floppy/` | Integration that polls the Floppy API (calendar + library statuses), joins on `media_id`, and exposes one sensor per filter mode |
| `floppy-upcoming-card.js` | Lovelace card that reads the integration's sensors and renders them |

The API key is stored encrypted in the Home Assistant config entry — never in the
dashboard, the browser, or this repository.

## Installation

### Integration (HACS)

1. In HACS → three dots → **Custom repositories**
2. Add `https://github.com/cronner/floppy-upcoming-card` as category **Integration**
3. Install **Floppy**, then restart Home Assistant
4. Settings → Devices & services → **Add Integration** → **Floppy**
5. Enter your server URL (e.g. `http://192.168.1.2:8000`) and your Floppy API key
   (found under Settings in Floppy), plus the update interval

### Card (HACS)

1. In HACS → three dots → **Custom repositories**
2. Add `https://github.com/cronner/floppy-upcoming-card` as category **Frontend**
   (Lovelace)
3. Install **Floppy Upcoming Card** and reload the browser

The card is also served automatically by the integration at
`/floppy/static/floppy-upcoming-card.js` — add that URL as a JavaScript Module
resource under Settings → Dashboards → Resources if you installed the
integration only.

## Usage

Add the card to any dashboard:

```yaml
type: custom:floppy-upcoming-card
mode: all            # all | in_progress | not_caught_up | planning | paused | completed | dropped
layout: grouped      # grouped | list
title: Kommende serier
columns: 3
max_episodes: 24
show_images: true
image_size: 52
show_dates: true
show_date_header: true
lang: auto           # auto | da | en
hide_when_empty: false
```

All options are also available in the visual card editor.

## Options

| Option | Default | Description |
|--------|---------|-------------|
| `entity` | auto | Sensor entity to read (overrides `mode`) |
| `mode` | `all` | Which upcoming list to show |
| `layout` | `grouped` | `grouped` = date columns, `list` = flat rows |
| `title` | `Kommende serier` | Card title |
| `columns` | `3` | Number of date columns (grouped layout) |
| `max_episodes` | unlimited | Cap on episodes shown |
| `show_images` | `true` | Show poster thumbnails |
| `image_size` | `52` | Poster width in px |
| `show_dates` | `true` | Show date headers/labels |
| `show_date_header` | `true` | Show the current-date line above the list |
| `lang` | `auto` | Date language; `auto` follows Home Assistant |
| `hide_when_empty` | `false` | Render nothing when the list is empty |

## Sensors

The integration creates one sensor per mode — each with `count` as its state and
the episode data in the `results` attribute:

- `sensor.floppy_upcoming_all`
- `sensor.floppy_upcoming_in_progress`
- `sensor.floppy_upcoming_not_caught_up`
- `sensor.floppy_upcoming_planning`
- `sensor.floppy_upcoming_paused`
- `sensor.floppy_upcoming_completed`
- `sensor.floppy_upcoming_dropped`