# gnome-newapi-monitor

A GNOME Shell extension to monitor multiple NewAPI-compatible service balances in real time.

## Features

- Monitor multiple NewAPI (OneAPI) sites simultaneously
- Configurable API Key and API URL via settings UI
- Auto-refresh with configurable interval (default 300s, min 30s)
- Shows usage in panel bar and detailed breakdown in dropdown menu

## Installation

1. Clone into extensions directory

```bash
cd ~/.local/share/gnome-shell/extensions/
git clone https://github.com/xt1990xt1990/gnome-newapi-monitor bytecat-balance@local
```

2. Compile schema

```bash
glib-compile-schemas ~/.local/share/gnome-shell/extensions/bytecat-balance@local/schemas/
```

3. Enable extension

```bash
gnome-extensions enable bytecat-balance@local
```

4. Open Settings, fill in your API Key and API URL for Site 1.

## Notes

- `SITE2_KEY` in `extension.js` is a placeholder — replace it with your own API key before use.
- The extension delays the first request by 5 seconds after login to avoid blocking GNOME Shell input events.
