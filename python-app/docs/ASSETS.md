# Bundled offline assets

- `lentera/assets/map/vendor/maplibre-gl.js` and CSS: MapLibre GL JS 5.13.0, BSD-3-Clause; full license in adjacent `LICENSE.txt`. Downloaded from the versioned npm distribution on unpkg.
- `lentera/assets/map/vendor/qwebchannel.js`: Qt 6.12.0 resource, The Qt Company / KDAB; LGPL-3.0-only or GPL-2.0-only or GPL-3.0-only (or commercial), as identified in its header. Corresponding source: https://code.qt.io/cgit/qt/qtwebchannel.git/tree/src/webchannel/qwebchannel.js?h=v6.12.0 . LGPL text is bundled alongside it. This file is unmodified.
- `lentera/assets/fonts/Inter.ttf`: Google Fonts / Rasmus Andersson, SIL Open Font License; `Inter-OFL.txt`.
- `lentera/assets/fonts/JetBrainsMono.ttf`: Google Fonts / JetBrains, SIL Open Font License; `JetBrainsMono-OFL.txt`.
- `icon.svg`: project-created LENTERA launcher graphic. Navigation uses local text glyphs, without an external icon CDN.

Fonts were downloaded from the google/fonts repository. MapLibre CSS retains its self-contained data URI images. No runtime CDN or Google Fonts requests are required. OpenStreetMap/Geofabrik map attribution remains visible on the map; actual tile datasets must carry their own applicable attribution/licensing.
