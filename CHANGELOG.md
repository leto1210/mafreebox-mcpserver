# Changelog

All notable changes to this project are documented here.

## [1.3.0] - 2026-04-28

### Phase 4 - High-Value Dashboard Features (18 new tools)

#### DHCP Static Leases (4 tools)
- `freebox_get_dhcp_static_leases` - List all static IP assignments
- `freebox_add_dhcp_static_lease` - Add a static IP for a device (MAC)
- `freebox_update_dhcp_static_lease` - Modify an existing IP assignment
- `freebox_delete_dhcp_static_lease` - Remove a static IP

#### WiFi Guest Networks (4 tools)
- `freebox_get_wifi_guest_networks` - List guest networks configured
- `freebox_add_wifi_guest_network` - Create a new guest network
- `freebox_update_wifi_guest_network` - Modify a guest network (SSID, key, state)
- `freebox_delete_wifi_guest_network` - Delete a guest network

#### WiFi Advanced (4 tools)
- `freebox_get_wifi_access_points` - List APs by band (2.4/5/6 GHz)
- `freebox_get_wifi_stations` - Show connected WiFi clients with signal/throughput
- `freebox_get_wifi_planning` - Get WiFi activation schedule
- `freebox_set_wifi_planning` - Configure WiFi schedule (daily hours)

#### Download Stats & Details (6 tools)
- `freebox_get_download_stats` - Global statistics (bytes downloaded, torrent count)
- `freebox_get_downloads_config` - Download configuration
- `freebox_get_download_trackers` - List torrent trackers (seeders/leechers)
- `freebox_get_download_peers` - Show connected peers (IP, country, throughput)
- `freebox_get_download_files` - List torrent files (size, progress)
- `freebox_set_download_file_priority` - Set download priority for a file

### Phase 5 - Extended Test Coverage

- 14/14 tests passing (9 existing + 5 Phase 4)
- Full DHCP static leases CRUD testing
- WiFi guest networks CRUD testing
- WiFi advanced features testing (APs, stations, planning)
- Download stats and file priority testing

### Improvements

- Tool count: 31 → 49 (+18)
- Dashboard API coverage: ~44% → ~58% (+14%)
- Test suite: 9 → 14 tests (+5)
- Production-ready with zero breaking changes

### Documentation

- Updated CLAUDE.md with Phase 1-5 overview and development patterns
- Updated README.md tool catalog (now 49 tools)
- Added version history table
- Added tool coverage metrics

---

## [1.2.0] - 2026-04-28

### Phase 3 - Model Detection & Capability Filtering

#### Features
- Model detection from `/api_version` endpoint
- Supported models: Ultra, Delta, Pop, Revolution, Unknown
- Capability caching (5-minute TTL)
- Dynamic tool visibility based on detected model
- VM tools masked for incompatible models

#### New Tools
- `freebox_get_capabilities` - Get detected model and capabilities

#### Improvements
- Capability caching reduces API calls
- Smart tool gating prevents runtime errors on unsupported models
- Model-aware error messages for incompatible features

### Phase 2 - Auth & Permissions (same release)

#### New Tools
- `freebox_reset_authorization` - Reset token and session state

#### Features
- Permission error enrichment with actionable messages
- PERMISSION_LABELS map for French descriptions
- Permission tracking and reuse across requests
- Structured error responses with recovery guidance

### Test Coverage

- 9/9 tests passing
- Model detection and caching verified
- Pop model detection tested
- Capability caching validated

---

## [1.1.2] - 2026-04-28

### Phase 1 - Request Pipeline Hardening

#### Features
- HTTP request timeouts via AbortController
- Configurable timeout: `FREEBOX_REQUEST_TIMEOUT` env var (default 10000ms)
- Safe JSON parsing with fallback detection
- Automatic session retry on `auth_required`
- Error enrichment and permission labeling

#### Fixes
- **downloads/add encoding** - Now sends as `application/x-www-form-urlencoded` (download_url parameter)
- Non-JSON response detection with clear error messages
- Session expiry handling with transparent retry

#### Environment Variables
- Added `FREEBOX_REQUEST_TIMEOUT` (default: 10000ms)

### Test Coverage

- 9 tests total (5 new Phase 1 tests)
- Basic auth flow and session reuse
- Session retry on `auth_required`
- Form-urlencoded downloads
- Non-JSON response detection
- Timeout handling

---

## [1.0.0] - Initial Release

### Core Features
- MCP server for Freebox OS API
- HMAC-SHA1 authentication
- 29 tools across 10+ categories
- Docker support (Node 25-Alpine)
- Token persistence
- Stdio-based communication

### Tools Coverage
- Authentification (3)
- Connection & System (3)
- Network/LAN (2)
- WiFi (3)
- Downloads (5)
- Telephony (3)
- Files (1)
- DHCP (1)
- Port Forwarding (3)
- Parental Control (1)
- VMs (3)
- Storage (1)

---

## Deployment Status

| Version | Status | Breaking Changes |
|---------|--------|------------------|
| v1.3.0 | ✅ Production | None |
| v1.2.0 | ✅ Stable | None |
| v1.1.2 | ✅ Stable | None |
| v1.0.0 | ✅ Legacy | N/A |

---

## Phases Roadmap

### Completed
- ✅ Phase 1: Request pipeline hardening
- ✅ Phase 2: Auth & permissions
- ✅ Phase 3: Model detection & capability filtering
- ✅ Phase 4: High-value dashboard features
- ✅ Phase 5: Extended test coverage

### Future (Potential)
- WiFi advanced (WPS, temporary disable, MLO)
- DHCP additional features (dynamic lease management)
- Download advanced (binary torrent upload)
- Statistics & monitoring (extended RRD support)
- Integration with FreeboxOS-Ultra-Dashboard profiling
