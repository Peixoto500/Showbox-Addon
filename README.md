---
title: ShowBox Stremio Addon
emoji: 🎬
colorFrom: purple
colorTo: indigo
sdk: docker
pinned: false
---

# ShowBox Stremio Addon v3

Direct HTTP streams via ShowBox + FebBox.

## Required Secrets (Space Settings → Variables and Secrets)

| Secret | How to get it |
|--------|--------------|
| `FEBBOX_UI_COOKIE` | [febbox.com](https://www.febbox.com) → login → F12 → Application → Cookies → copy `ui` value |
| `TMDB_API_KEY` | [themoviedb.org/signup](https://www.themoviedb.org/signup) → free account → Settings → API → v3 key |

## Install in Stremio

Once the Space is running, add this URL in Stremio:
```
https://YOUR_USERNAME-YOUR_SPACE_NAME.hf.space/manifest.json
```
