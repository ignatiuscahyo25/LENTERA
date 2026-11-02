# Validation results

Environment: Windows 11 x64, Python 3.14.7, PySide6 6.12.0 / Qt WebEngine 6.12.0.140. This is development-machine verification, not Raspberry Pi certification.

## Automated checks

- `python -m pytest -q`: 57 tests passed. Includes concurrent database upserts, exact legacy-copy preservation, schema idempotence, plaintext-to-hash login upgrade, settings persistence, deletion restrictions, failed storage, receiver dedup/ACK ordering, numeric wire-token stability, heartbeat expiry, XYZ/TMS and gzip tiles, optional OSRM, hardware-init failure without simulation fallback, and a real receiver subprocess with exclusive ownership. Launcher tests also cover mode selection, offline checks, missing assets, optional installation of GPIO libraries, mismatched backend/receiver rejection, failure without simulation fallback, and starting/reusing real background simulation services without duplicates. Layout checks verify shared paths, web database seeding without overwriting, safe frontend cleanup, and Git exclusions for local data. Map-package tests cover atomic activation, resume, servers without Range support, incomplete downloads, reuse of existing packages, and metadata-cache invalidation.
- `python scripts/verify_desktop.py`: passed native registration/login, report filters and counts, MapLibre initialization, two markers and QWebChannel report selection, status update, clipboard coordinates, missing-OSRM handling, saved settings, logout, and real HTTP reception after closing the desktop. Uses an isolated fixture database.
- Operational database migration: compared every row of reports/users/report_logs after copying. 2 reports, 3 logs, 3 users identical. Repeated migration leaves the copy intact; SHA-256 of the original database remained unchanged.
- Python compilation and `git diff --check` pass.

## Visual review

Qt screenshots: `artifacts/desktop/login-1280.png`, `dashboard-1280.png`, `dashboard-1920.png`, `sos-1280.png`, `operations-1280.png`, `detail-1280.png`, `settings-1280.png`. Sidebar checks confirm distinct report/map/settings pages, exclusive highlighting, and refresh preserving the active page.

The official Geofabrik Jawa Shortbread package was downloaded to `shared/map-data/java-shortbread-1.0.mbtiles` (584,138,752 bytes, zooms 0–14), validated with SQLite quick_check and the expected vector layers. `python scripts/verify_desktop.py --require-map` passed: real `streets` features rendered at zoom 14 around Jakarta through the local Python tile endpoint and Qt WebEngine. A sample Jakarta tile (14/13054/8477) returned 275,448 gzip-compressed bytes and 659,538 uncompressed bytes. WebView permits only local resources; the runtime basemap does not use an internet tile server. Current operation/detail screenshots show the real basemap. This does not verify every tile or field routing accuracy.

Reference React screenshots: `artifacts/web-reference/screenshots/`. Generated from an isolated copy, retaining the original layout and styling. To make the older source buildable with available packages, the reference uses MapLibre 5.13.0 and its bundled worker, same-origin fixture login, and local fonts; the unused Leaflet CSS import is omitted. These are not screenshots of a live Pi deployment.

Comparison led to the native dark-grid login, full-width header, 240px sidebar, original metric order, badge statuses, Detail actions, and side-by-side location/map detail layout. Native Qt controls and typography have platform differences; the result is not claimed to be pixel-identical.

Regenerate reference screenshots (development only; requires Node/npm and network for the isolated build):

```bash
python scripts/prepare_web_reference.py
python scripts/capture_web_reference.py
```

## Required on Raspberry Pi before cutover

- Confirm aarch64 OS, working PySide6/Qt WebEngine packages, GPU/WebGL, and both target display resolutions.
- Install and verify the actual Jawa Shortbread MBTiles package with internet disconnected. Verify OSRM with matching Jawa road data if routing is required.
- Confirm wiring, antenna, SX1278 register version, received SOS, two-way ACK, actual retransmission behavior, and backend-failure recovery using the original field node.
- Close/logout from the desktop during transmission, reboot Pi, and confirm systemd restarts exactly one receiver and retains reports.
- Exercise coverage, location accuracy, local power backup, and field routing separately from software simulation.

No Raspberry Pi, radio hardware, or live OSRM dataset was accessible in this workspace. These target checks remain outstanding; the real Jawa MBTiles package has now been verified on Windows.

## Repository layout

Run Python commands from `python-app/`. React sources are in `../web-app/`; shared map inputs and the legacy snapshot are in `../shared/`. Local databases, downloaded map packages, virtual environments, and artifacts are excluded from Git. Deployment paths now use `/opt/lentera/python-app`.
