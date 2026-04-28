# Analyse Comparative : Dashboard Freebox vs MCP Server v1.2.0

**Date:** 28 avril 2026  
**Repos:** HGHugo/FreeboxOS-Ultra-Dashboard vs mafreebox-mcpserver  
**Scope:** Endpoints API Freebox - DHCP, Téléchargements, WiFi & Fonctionnalités manquantes

---

## 1. RÉSUMÉ EXÉCUTIF

### Dashboard (FreeboxOS-Ultra-Dashboard)
- **Endpoints API Freebox implémentés:** 70+ endpoints couvrant 13 catégories
- **Outils MCP v1.2.0:** 31 outils (hors VM si non supportée)
- **Endpoints DHCP:** 8 endpoints (config, leases, static leases CRUD)
- **Endpoints Téléchargements:** 17 endpoints (gestion complète + stats, trackers, pairs, fichiers, pieces, blacklist, logs)
- **Endpoints WiFi:** 22 endpoints (config, APs, BSS, stations, planification, WPS, v13 temp-disable, v14 guest network + MLO)

### Recommandation Prioritaire
**Le dashboard utilise ~2.26x plus d'endpoints que le MCP.**  
Pour maximiser la valeur utilisateur, **prioriser DHCP (static leases) et Téléchargements (détails complets)**.

---

## 2. ENDPOINTS API FREEBOX IDENTIFIÉS

### 2.1 Endpoints DHCP

| Catégorie | Endpoint API Freebox | Méthode | Paramètres | Réponse | MCP v1.2.0 |
|-----------|----------------------|---------|-----------|---------|-----------|
| **Config** | `/dhcp/config/` | GET | - | `{enabled, gateway, netmask, ip_range_start, ip_range_end, dns[], always_broadcast, sticky_assign}` | ✅ `freebox_get_dhcp` |
| **Config** | `/dhcp/config/` | PUT | Config JSON | `{success, result}` | ❌ |
| **Leases Dynamiques** | `/dhcp/dynamic_lease/` | GET | - | `[{id, ip, mac, hostname, last_activity}]` | ✅ (inclus dans `freebox_get_dhcp`) |
| **Static Leases (Liste)** | `/dhcp/static_lease/` | GET | - | `[{id, mac, ip, comment, hostname}]` | ❌ |
| **Static Lease (Détail)** | `/dhcp/static_lease/{id}` | GET | `id: string` | `{id, mac, ip, comment, hostname}` | ❌ |
| **Static Lease (Créer)** | `/dhcp/static_lease/` | POST | `{mac, ip, comment}` | `{success, result: {id, mac, ip, comment}}` | ❌ |
| **Static Lease (Modif)** | `/dhcp/static_lease/{id}` | PUT | `{mac, ip, comment}` | `{success, result}` | ❌ |
| **Static Lease (Suppr)** | `/dhcp/static_lease/{id}` | DELETE | `id: string` | `{success}` | ❌ |

**Couverture MCP:** 1/8 (12.5%)  
**Outils MCP manquants:**
- Gestion complète des baux DHCP statiques (CRUD)
- Mise à jour de la config DHCP

---

### 2.2 Endpoints Téléchargements

| Endpoint API | Méthode | Paramètres | Réponse | MCP v1.2.0 |
|--------------|---------|-----------|---------|-----------|
| `/downloads/` | GET | - | `[{id, name, status, progress, speed}]` | ✅ `freebox_get_downloads` |
| `/downloads/{id}` | GET | `id: number` | Détail téléchargement | ❌ |
| `/downloads/stats/` | GET | - | `{bytes_done_down, bytes_done_up, bytes_done, bytes_to_do, nb_tasks}` | ❌ |
| `/downloads/config/` | GET | - | Config téléchargements | ❌ |
| `/downloads/config/` | PUT | Config JSON | `{success, result}` | ❌ |
| `/downloads/{id}/trackers` | GET | `id: number` | `[{url, status, nb_leechers, nb_seeders}]` | ❌ |
| `/downloads/{id}/peers` | GET | `id: number` | `[{ip, port, flags, progress}]` | ❌ |
| `/downloads/{id}/files` | GET | `id: number` | `[{name, path, priority, progress}]` | ❌ |
| `/downloads/{id}/files/{fileId}` | PUT | `{priority: string}` | `{success}` | ❌ |
| `/downloads/{id}/pieces` | GET | `id: number` | `[{index, state}]` (bitmap) | ❌ |
| `/downloads/{id}/blacklist` | GET | `id: number` | Peers blacklistés | ❌ |
| `/downloads/{id}/blacklist/empty` | DELETE | `id: number` | `{success}` | ❌ |
| `/downloads/{id}/log` | GET | `id: number` | `[{timestamp, message}]` | ❌ |
| `/downloads/{id}` | PUT | `{status, io_priority}` | `{success}` | ✅ (pause/resume) |
| `/downloads/{id}` | DELETE | `id: number, delete_files: bool` | `{success}` | ✅ `freebox_delete_download` |
| `/downloads/add/` | POST | `{download_url, download_dir}` | `{success, result: {id}}` | ✅ `freebox_add_download` |
| `/downloads/add/` (multipart) | POST | fichier + filename | `{success, result: {id}}` | ❌ (URL seulement) |

**Couverture MCP:** 3/17 (17.6%)  
**Outils MCP manquants:** 14 endpoints pour:
- Stats détaillées (bytes, tâches)
- Configuration des téléchargements
- Trackers & pairs (debug torrent)
- Détails fichiers, priorités
- Blacklist, logs
- Upload de fichiers torrent/magnet

---

### 2.3 Endpoints WiFi

| Endpoint API | Méthode | Paramètres | Réponse | MCP v1.2.0 |
|--------------|---------|-----------|---------|-----------|
| `/wifi/config/` | GET | - | `{enabled, mac_filter_state}` | ✅ `freebox_get_wifi` |
| `/wifi/config/` | PUT | `{enabled}` | `{success}` | ✅ `freebox_toggle_wifi` |
| `/wifi/ap/` | GET | - | `[{id, name, band, channel, channel_width}]` | ❌ |
| `/wifi/ap/{id}/stations/` | GET | `id: number` | `[{mac, rssi, rx_rate, tx_rate}]` | ❌ |
| `/wifi/bss/` | GET | - | `[{id, ssid, enabled, encryption, sta_count}]` | ✅ `freebox_get_wifi_networks` |
| `/wifi/bss/{id}` | PUT | `{config: {enabled}}` | `{success}` | ❌ |
| `/wifi/stations/` | GET | - | `[{mac, bssid, rssi, tx_rate, rx_rate}]` | ❌ |
| `/wifi/mac_filter/` | GET | - | `{state, list: []}` | ❌ |
| `/wifi/planning/` | GET | - | Calendrier WiFi | ❌ |
| `/wifi/planning/` | PUT | Calendrier JSON | `{success}` | ❌ |
| `/wifi/wps/sessions/` | GET | - | `[{session_data}]` | ❌ |
| `/wifi/wps/sessions/` | POST | `{bss_id}` | `{success, result}` | ❌ |
| `/wifi/wps/sessions/` | DELETE | - | `{success}` | ❌ |
| `/wifi/temp_disable/` | GET | - | `{remaining_time}` | ❌ (v13.0+) |
| `/wifi/temp_disable/` | POST | `{duration}` | `{success}` | ❌ (v13.0+) |
| `/wifi/temp_disable/` | DELETE | - | `{success}` | ❌ (v13.0+) |
| `/wifi/custom_key/config/` | GET | - | Config réseau invité | ❌ (v14.0+) |
| `/wifi/custom_key/config/` | PUT | Config JSON | `{success}` | ❌ (v14.0+) |
| `/wifi/custom_key/` | GET | - | `[{id, key, comment}]` | ❌ (v14.0+) |
| `/wifi/custom_key/` | POST | `{key, comment}` | `{success, result}` | ❌ (v14.0+) |
| `/wifi/custom_key/{id}` | DELETE | `id: number` | `{success}` | ❌ (v14.0+) |
| `/wifi/mlo/config/` | GET | - | Config WiFi 7 MLO | ❌ (v14.0+) |
| `/wifi/mlo/config/` | PUT | Config JSON | `{success}` | ❌ (v14.0+) |

**Couverture MCP:** 2/22 (9%)  
**Outils MCP manquants:** 20 endpoints + features v13/v14:
- APs détaillés (stations connectées)
- BSS enabled/disabled
- Stations détails (RSSI, débit)
- MAC filter
- Planification WiFi (on/off calendrier)
- WPS start/stop/status
- **v13:** Désactivation temporaire WiFi
- **v14:** Réseau invité (guest network), WiFi 7 MLO

---

### 2.4 Autres Endpoints (Non DHCP/Downloads/WiFi)

| Catégorie | Endpoint | MCP v1.2.0 | Status |
|-----------|----------|-----------|--------|
| **Connexion** | `/connection/` (status) | ✅ | Couvert |
| **Connexion** | `/connection/config/` | ✅ | Couvert |
| **Connexion** | `/connection/ipv6/config/` | ❌ | Manquant |
| **Connexion** | `/connection/ftth/` | ❌ | Manquant |
| **Connexion** | `/connection/logs/` | ❌ | Manquant |
| **Système** | `/system/` | ✅ | Couvert |
| **Système** | `/system/reboot/` | ✅ | Couvert |
| **RRD (Stats)** | `/rrd/` (net, temp, dsl, switch) | ✅ | Couvert |
| **LAN** | `/lan/browser/interfaces/` | ✅ | Couvert |
| **LAN** | `/lan/wol/` (Wake-on-LAN) | ✅ | Couvert |
| **Appels** | `/call/log/` | ✅ | Couvert |
| **Contacts** | `/contact/` | ✅ | Couvert |
| **Fichiers** | `/fs/ls/`, `/fs/mv/`, etc. | ✅ | Couvert |
| **Redirection Ports** | `/fw/redir/` | ✅ | Couvert |
| **Contrôle Parental** | `/parental/config/`, `/parental/filter/` | ✅ | Couvert |
| **Machines Virtuelles** | `/vm/` | ✅ | Couvert (si compatible) |
| **Stockage** | `/storage/disk/` | ✅ | Couvert |
| **Freeplug** | `/freeplug/` | ✅ | Couvert |
| **TV/PVR** | `/tv/channels/`, `/pvr/` | ❌ | Manquants |
| **VPN Serveur** | `/vpn/config/`, `/vpn/user/` | ❌ | Manquants |
| **VPN Client** | `/vpn_client/config/`, `/vpn_client/status/` | ❌ | Manquants |
| **FTP** | `/ftp/config/` | ❌ | Manquant |
| **Switch/Ports** | `/switch/status/`, `/switch/port/` | ❌ | Manquants |
| **LCD** | `/lcd/config/` | ❌ | Manquant |
| **DMZ** | `/fw/dmz/` | ❌ | Manquant |

---

## 3. DÉTAIL : PARAMÈTRES & RÉPONSES DHCP/DOWNLOADS/WIFI

### 3.1 DHCP

#### Configuration
```typescript
// GET /dhcp/config/
GET /api/v8/dhcp/config/

Response:
{
  success: true,
  result: {
    enabled: true,
    gateway: "192.168.1.254",
    netmask: "255.255.255.0",
    ip_range_start: "192.168.1.100",
    ip_range_end: "192.168.1.249",
    always_broadcast: false,
    sticky_assign: true,
    dns: ["1.1.1.1", "8.8.8.8"]
  }
}

// PUT /dhcp/config/
PUT /api/v8/dhcp/config/
Body: {
  enabled: boolean,
  gateway: string,
  netmask: string,
  ip_range_start: string,
  ip_range_end: string,
  dns: string[],
  always_broadcast: boolean,
  sticky_assign: boolean
}

Response: { success: true, result: {...} }
```

#### Baux Dynamiques
```typescript
// GET /dhcp/dynamic_lease/
GET /api/v8/dhcp/dynamic_lease/

Response: {
  success: true,
  result: [
    {
      id: "AA:BB:CC:DD:EE:FF",
      ip: "192.168.1.120",
      mac: "AA:BB:CC:DD:EE:FF",
      hostname: "my-laptop",
      last_activity: 1714291200
    }
  ]
}
```

#### Baux Statiques (CRUD)
```typescript
// GET /dhcp/static_lease/
GET /api/v8/dhcp/static_lease/
Response: [
  {
    id: "AA:BB:CC:DD:EE:FF",
    mac: "AA:BB:CC:DD:EE:FF",
    ip: "192.168.1.50",
    comment: "NAS principal",
    hostname: "nas-synology"
  }
]

// GET /dhcp/static_lease/{id}
GET /api/v8/dhcp/static_lease/AA:BB:CC:DD:EE:FF
Response: { success: true, result: {...} }

// POST /dhcp/static_lease/
POST /api/v8/dhcp/static_lease/
Body: { mac: "AA:BB:CC:DD:EE:FF", ip: "192.168.1.50", comment: "NAS" }
Response: { success: true, result: { id, mac, ip, comment } }

// PUT /dhcp/static_lease/{id}
PUT /api/v8/dhcp/static_lease/AA:BB:CC:DD:EE:FF
Body: { ip: "192.168.1.51", comment: "NAS principal v2" }
Response: { success: true, result: {...} }

// DELETE /dhcp/static_lease/{id}
DELETE /api/v8/dhcp/static_lease/AA:BB:CC:DD:EE:FF
Response: { success: true }
```

---

### 3.2 Téléchargements

#### Listes & Stats
```typescript
// GET /downloads/stats/
GET /api/v8/downloads/stats/
Response: {
  success: true,
  result: {
    bytes_done_down: 1000000,
    bytes_done_up: 500000,
    bytes_done: 1500000,
    bytes_to_do: 8500000,  // Remaining
    nb_tasks: 3,           // Total downloads
    max_nb_tasks: 20
  }
}

// GET /downloads/{id}/
GET /api/v8/downloads/1/
Response: {
  success: true,
  result: {
    id: 1,
    name: "ubuntu-20.04.iso",
    status: "downloading",
    progress: 65,
    speed: 2500000,        // bytes/sec
    size: 2500000000,
    eta: 900                // seconds
  }
}

// GET /downloads/config/
GET /api/v8/downloads/config/
Response: {
  success: true,
  result: {
    max_nb_tasks: 20,
    max_nb_connections: 200,
    use_dht: true,
    use_pex: true
  }
}

// PUT /downloads/config/
PUT /api/v8/downloads/config/
Body: { max_nb_tasks: 25, ... }
Response: { success: true, result: {...} }
```

#### Détails Torrent
```typescript
// GET /downloads/{id}/trackers
GET /api/v8/downloads/1/trackers
Response: {
  success: true,
  result: [
    {
      url: "http://tracker.example.com:6969/announce",
      status: "working",
      nb_leechers: 50,
      nb_seeders: 100,
      next_announce: 1714300000
    }
  ]
}

// GET /downloads/{id}/peers
GET /api/v8/downloads/1/peers
Response: {
  success: true,
  result: [
    {
      ip: "203.0.113.45",
      port: 52891,
      flags: "UDH",           // U=unchoked, D=downloading, H=interested
      progress: 0.75,
      speed_down: 150000,
      speed_up: 50000
    }
  ]
}

// GET /downloads/{id}/pieces
GET /api/v8/downloads/1/pieces
Response: {
  success: true,
  result: [
    { index: 0, state: "downloaded" },
    { index: 1, state: "downloading" },
    { index: 2, state: "missing" },
    // ...
  ]
}

// GET /downloads/{id}/blacklist
GET /api/v8/downloads/1/blacklist
Response: {
  success: true,
  result: [
    { ip: "192.0.2.1", reason: "corrupted_data", timestamp: 1714291200 },
    { ip: "198.51.100.5", reason: "timeout" }
  ]
}

// DELETE /downloads/{id}/blacklist/empty
DELETE /api/v8/downloads/1/blacklist/empty
Response: { success: true }

// GET /downloads/{id}/log
GET /api/v8/downloads/1/log
Response: {
  success: true,
  result: [
    { timestamp: 1714291200, message: "Connected to peer 203.0.113.45" },
    { timestamp: 1714291205, message: "Received 1024 bytes" }
  ]
}
```

#### Fichiers
```typescript
// GET /downloads/{id}/files
GET /api/v8/downloads/1/files
Response: {
  success: true,
  result: [
    {
      name: "ubuntu-20.04.iso",
      path: "ubuntu-20.04.iso",
      size: 2500000000,
      priority: 0,              // 0=skip, 1=normal, 2=high
      progress: 0.65
    }
  ]
}

// PUT /downloads/{id}/files/{fileId}
PUT /api/v8/downloads/1/files/ubuntu-20.04.iso
Body: { priority: 2 }  // high
Response: { success: true }
```

#### Contrôle
```typescript
// PUT /downloads/{id} - pause/resume
PUT /api/v8/downloads/1/
Body: {
  status: "stopped",          // "stopped" or "downloading"
  io_priority: "low"          // "low", "normal", "high"
}
Response: { success: true }

// POST /downloads/add/
POST /api/v8/downloads/add/
Content-Type: application/x-www-form-urlencoded
Body: download_url=magnet:?xt=urn:btih:...&download_dir=/Disque%20dur/

Response: {
  success: true,
  result: { id: 10, name: "torrent.name" }
}

// POST /downloads/add/ (multipart - fichier torrent)
POST /api/v8/downloads/add/
Content-Type: multipart/form-data
Body:
  filename: "ubuntu.torrent"
  file: <binary>
  download_dir: "/Disque dur/"

Response: { success: true, result: { id: 11 } }

// DELETE /downloads/{id}
DELETE /api/v8/downloads/1/?delete_files=true
Response: { success: true }
```

---

### 3.3 WiFi

#### Configuration Globale
```typescript
// GET /wifi/config/
GET /api/v8/wifi/config/
Response: {
  success: true,
  result: {
    enabled: true,
    mac_filter_state: "disabled",  // "disabled", "whitelist", "blacklist"
    country_code: "FR",
    hide_wifi_key: false
  }
}

// PUT /wifi/config/
PUT /api/v8/wifi/config/
Body: { enabled: true }
Response: { success: true }
```

#### Access Points (Bandes)
```typescript
// GET /wifi/ap/
GET /api/v8/wifi/ap/
Response: {
  success: true,
  result: [
    {
      id: 0,
      name: "2.4GHz-main",
      status: {
        state: "up",
        channel_width: 40,
        primary_channel: 6,
        secondary_channel: 10,
        dfs_cac_remaining_time: 0
      },
      config: {
        band: "2.4g",
        channel_width: "40MHz",
        primary_channel: 6,
        secondary_channel: 10
      }
    },
    {
      id: 1,
      name: "5GHz-main",
      status: { state: "up", ... },
      config: { band: "5g", ... }
    },
    {
      id: 2,
      name: "6GHz-main",     // Ultra/Delta v14+
      status: { state: "up", ... },
      config: { band: "6g", ... }
    }
  ]
}

// GET /wifi/ap/{id}/stations/
GET /api/v8/wifi/ap/0/stations/
Response: {
  success: true,
  result: [
    {
      mac: "AA:BB:CC:DD:EE:FF",
      bssid: "00:11:22:33:44:55",
      rssi: -45,                 // dBm (signal strength)
      tx_rate: 216000,           // bps
      rx_rate: 72000,
      status: "active",
      connected_time: 3600       // seconds
    }
  ]
}
```

#### BSS (SSIDs)
```typescript
// GET /wifi/bss/
GET /api/v8/wifi/bss/
Response: {
  success: true,
  result: [
    {
      id: "00:11:22:33:44:55",
      phy_id: 0,
      status: {
        state: "enabled",
        sta_count: 5,             // Connected devices
        is_main_bss: true
      },
      config: {
        enabled: true,
        ssid: "FreeboxWiFi",
        hide_ssid: false,
        encryption: "WPA2/WPA3",
        key: "password123"
      }
    }
  ]
}

// PUT /wifi/bss/{id} - Enable/disable SSID
PUT /api/v8/wifi/bss/00:11:22:33:44:55
Body: { config: { enabled: false } }
Response: { success: true }

// GET /wifi/stations/
GET /api/v8/wifi/stations/
Response: {
  success: true,
  result: [
    {
      mac: "AA:BB:CC:DD:EE:FF",
      bssid: "00:11:22:33:44:55",
      rssi: -52,
      tx_rate: 144000,
      rx_rate: 54000
    }
  ]
}
```

#### Filtrage MAC
```typescript
// GET /wifi/mac_filter/
GET /api/v8/wifi/mac_filter/
Response: {
  success: true,
  result: {
    state: "disabled",              // "disabled", "whitelist", "blacklist"
    list: ["AA:BB:CC:DD:EE:FF"]
  }
}
```

#### Planification WiFi
```typescript
// GET /wifi/planning/
GET /api/v8/wifi/planning/
Response: {
  success: true,
  result: {
    enabled: true,
    rules: [
      {
        day: 1,                    // 0=Monday...6=Sunday
        start_time: 900,           // HHMM (09:00)
        end_time: 1800,            // 18:00
        enabled: true
      }
    ]
  }
}

// PUT /wifi/planning/
PUT /api/v8/wifi/planning/
Body: { enabled: true, rules: [...] }
Response: { success: true }
```

#### WPS
```typescript
// GET /wifi/wps/sessions/
GET /api/v8/wifi/wps/sessions/
Response: {
  success: true,
  result: [
    {
      session_id: "12345",
      state: "active",
      bss_id: 0,
      remaining_time: 120        // seconds
    }
  ]
}

// POST /wifi/wps/sessions/
POST /api/v8/wifi/wps/sessions/
Body: { bss_id: 0 }
Response: { success: true, result: { session_id: "12345" } }

// DELETE /wifi/wps/sessions/
DELETE /api/v8/wifi/wps/sessions/
Response: { success: true }
```

#### Désactivation Temporaire WiFi (v13.0+)
```typescript
// GET /wifi/temp_disable/
GET /api/v8/wifi/temp_disable/
Response: {
  success: true,
  result: {
    remaining_time: 3600,          // seconds (0 if not active)
    max_duration: 86400            // max 24 hours
  }
}

// POST /wifi/temp_disable/
POST /api/v8/wifi/temp_disable/
Body: { duration: 3600 }           // 1 hour
Response: { success: true }

// DELETE /wifi/temp_disable/
DELETE /api/v8/wifi/temp_disable/
Response: { success: true }
```

#### Réseau Invité (v14.0+)
```typescript
// GET /wifi/custom_key/config/
GET /api/v8/wifi/custom_key/config/
Response: {
  success: true,
  result: {
    enabled: true,
    ssid_suffix: "-Guest",
    encryption: "WPA2",
    duration: 24              // hours (0 = unlimited)
  }
}

// PUT /wifi/custom_key/config/
PUT /api/v8/wifi/custom_key/config/
Body: {
  enabled: true,
  ssid_suffix: "-Guest",
  duration: 24
}
Response: { success: true }

// GET /wifi/custom_key/
GET /api/v8/wifi/custom_key/
Response: {
  success: true,
  result: [
    {
      id: 0,
      key: "guest_password",
      comment: "Visiteurs",
      created: 1714291200,
      expires: 1714377600       // null = pas d'expiration
    }
  ]
}

// POST /wifi/custom_key/
POST /api/v8/wifi/custom_key/
Body: { key: "guest_pwd", comment: "Visiteurs", duration: 12 }
Response: { success: true, result: { id: 1 } }

// DELETE /wifi/custom_key/{id}
DELETE /api/v8/wifi/custom_key/0
Response: { success: true }
```

#### WiFi 7 MLO (v14.0+)
```typescript
// GET /wifi/mlo/config/
GET /api/v8/wifi/mlo/config/
Response: {
  success: true,
  result: {
    enabled: true,
    primary_band: "5g",
    secondary_bands: ["6g"],
    simultaneous_links: true,
    straps_assoc_pref: "performance"  // "performance" or "latency"
  }
}

// PUT /wifi/mlo/config/
PUT /api/v8/wifi/mlo/config/
Body: {
  enabled: true,
  straps_assoc_pref: "performance"
}
Response: { success: true }
```

---

## 4. COMPARAISON MCP vs DASHBOARD

### 4.1 Tableaux Comparatifs

#### DHCP
```
Catégorie                    | Dashboard | MCP v1.2.0 | Priorité
---------------------------------------------------------
Config DHCP (READ)          |    ✅     |     ✅     | -
Config DHCP (UPDATE)        |    ✅     |     ❌     | HAUTE
Dynamic Leases (clients)    |    ✅     |     ✅     | -
Static Leases (CRUD)        |    ✅     |     ❌     | TRÈS HAUTE
---------------------------------------------------------
Couverture DHCP            | 8/8 (100%)| 2/8 (25%)  |
```

#### Téléchargements
```
Catégorie                    | Dashboard | MCP v1.2.0 | Priorité
---------------------------------------------------------
Liste téléchargements       |    ✅     |     ✅     | -
Détail téléchargement       |    ✅     |     ❌     | MOYENNE
Stats (bytes, vitesse)      |    ✅     |     ❌     | MOYENNE
Config downloads            |    ✅     |     ❌     | BASSE
Pause/Resume                |    ✅     |     ✅     | -
Supprimer                   |    ✅     |     ✅     | -
Ajouter (URL)              |    ✅     |     ✅     | -
Ajouter (fichier torrent)   |    ✅     |     ❌     | MOYENNE
Trackers & Pairs            |    ✅     |     ❌     | BASSE
Fichiers détails            |    ✅     |     ❌     | MOYENNE
Blacklist                   |    ✅     |     ❌     | BASSE
Logs                        |    ✅     |     ❌     | BASSE
---------------------------------------------------------
Couverture Téléchargements | 17/17 (100%)| 4/17 (24%)|
```

#### WiFi
```
Catégorie                    | Dashboard | MCP v1.2.0 | Priorité
---------------------------------------------------------
Config globale (ON/OFF)     |    ✅     |     ✅     | -
Liste réseaux (BSS)         |    ✅     |     ✅     | -
APs détails (bandes)        |    ✅     |     ❌     | BASSE
Stations connectées         |    ✅     |     ❌     | MOYENNE
Filtrage MAC                |    ✅     |     ❌     | BASSE
Planification WiFi          |    ✅     |     ❌     | MOYENNE
WPS (start/stop/status)     |    ✅     |     ❌     | BASSE
v13: Désact. temporaire     |    ✅     |     ❌     | MOYENNE
v14: Réseau invité (CRUD)   |    ✅     |     ❌     | TRÈS HAUTE
v14: WiFi 7 MLO             |    ✅     |     ❌     | BASSE
---------------------------------------------------------
Couverture WiFi            | 22/22 (100%)| 2/22 (9%) |
```

### 4.2 Statistiques Globales

| Métrique | Dashboard | MCP v1.2.0 | Delta |
|----------|-----------|-----------|-------|
| **Endpoints identifiés** | 70+ | 31 | -57% |
| **DHCP endpoints** | 8 | 2 | -75% |
| **Téléchargements endpoints** | 17 | 4 | -76% |
| **WiFi endpoints** | 22 | 2 | -91% |
| **Couverture DHCP** | 100% | 25% | -75% |
| **Couverture Téléchargements** | 100% | 24% | -76% |
| **Couverture WiFi** | 100% | 9% | -91% |

**Conclusion:** Le dashboard expose ~2.26x plus de fonctionnalités Freebox que le MCP.

---

## 5. FONCTIONNALITÉS DASHBOARD NON COUVERTES PAR MCP v1.2.0

### 5.1 Par Priorité d'Ajout

#### 🔴 TRÈS HAUTE PRIORITÉ (Impact utilisateur maximal)

1. **Gestion DHCP Complète** (4 outils)
   - `freebox_get_dhcp_static_leases` - Liste les baux statiques (réseau stable)
   - `freebox_add_dhcp_static_lease` - Ajouter une adresse IP fixe
   - `freebox_update_dhcp_static_lease` - Modifier adresse/commentaire
   - `freebox_delete_dhcp_static_lease` - Supprimer un bail
   - **Justification:** Fondamental pour gérer équipements réseau (NAS, caméras, etc.)

2. **Réseaux WiFi Invités** (4 outils) - *v14.0+*
   - `freebox_get_wifi_guest_config` - Config réseau invité
   - `freebox_update_wifi_guest_config` - Modifier durée/paramètres
   - `freebox_create_wifi_guest_key` - Générer clé invité
   - `freebox_delete_wifi_guest_key` - Révoquer accès
   - **Justification:** Sécurité domestique, gestion visiteurs

3. **Téléchargements Avancés** (4 outils)
   - `freebox_get_download_detail` - Infos complètes téléchargement
   - `freebox_get_download_stats` - Stats globales (bytes, vitesse)
   - `freebox_upload_torrent_file` - Ajouter fichier .torrent
   - `freebox_get_download_files` - Détails fichiers (priorité, sélection)
   - **Justification:** Contrôle granulaire des téléchargements

#### 🟠 HAUTE PRIORITÉ

4. **WiFi Avancé** (5 outils)
   - `freebox_get_wifi_aps` - Détails APs (bandes, canaux)
   - `freebox_get_wifi_stations` - Clients WiFi (RSSI, débit)
   - `freebox_update_wifi_bss` - Enable/disable SSID
   - `freebox_get_wifi_planning` - Calendrier ON/OFF
   - `freebox_update_wifi_planning` - Modifier planning
   - **Justification:** Analyse réseau, optimisation canaux

5. **Configuration DHCP** (1 outil)
   - `freebox_update_dhcp_config` - Plage IP, DNS, gateway
   - **Justification:** Gestion réseau avancée

#### 🟡 MOYENNE PRIORITÉ

6. **WPS WiFi** (2 outils)
   - `freebox_start_wps` - Démarrer session WPS
   - `freebox_get_wps_status` - Vérifier état WPS
   - **Justification:** Appairage facile dispositifs WiFi

7. **Désactivation WiFi Temporaire** (1 outil) - *v13.0+*
   - `freebox_set_wifi_temp_disable` - Désactiver X heures
   - **Justification:** Économie d'énergie, horaires dodo

8. **Détails Torrents** (3 outils)
   - `freebox_get_download_trackers` - Trackers/pairs/seeders
   - `freebox_get_download_peers` - Liste pairs (debug)
   - `freebox_get_download_pieces` - Bitmap pièces
   - **Justification:** Debug téléchargements problématiques

#### 🔵 BASSE PRIORITÉ

9. **Other**
   - `freebox_get_wifi_mac_filter` - Filtrage MAC
   - `freebox_get_download_blacklist` - Peers bloquées
   - `freebox_get_download_log` - Logs détaillés
   - `freebox_get_wifi_mlo_config` - WiFi 7 MLO (futur)
   - **Justification:** Cas avancés, peu fréquents

---

### 5.2 Endpoints Entièrement Manquants (Non DHCP/Downloads/WiFi)

| Catégorie | Endpoints | Raison |
|-----------|-----------|--------|
| **Connexion** | IPv6 config, FTTH, logs | Cas avancé/spécifique |
| **TV/PVR** | Tout (channels, recordings, EPG) | Pas de TV sur Freebox standard |
| **VPN** | Serveur & Client complets | Cas avancé, peu utilisé |
| **FTP** | Configuration | Remplacé par SFTP/SAMBA |
| **Switch** | Ports Ethernet | Cas très avancé |
| **LCD** | Configuration écran | Peu pertinent pour Claude |
| **DMZ** | Configuration DMZ | Rare, risqué |

---

## 6. ROADMAP RECOMMANDÉE

### Phase 1 (v1.3.0) - **DHCP + Guest WiFi**
```
- freebox_manage_dhcp_static_leases (CRUD)
- freebox_manage_wifi_guest_network (CRUD)
- freebox_get_download_stats
⏱️  Estimation: 2-3 jours
```

### Phase 2 (v1.4.0) - **WiFi Avancé**
```
- freebox_get_wifi_detailed_status (APs + stations)
- freebox_manage_wifi_planning
- freebox_manage_wifi_wps
- freebox_manage_download_files (priorités, sélection)
⏱️  Estimation: 3-4 jours
```

### Phase 3 (v1.5.0) - **Torrent Détails + v13+ Features**
```
- freebox_get_download_torrent_info (trackers, peers, pieces)
- freebox_set_wifi_temp_disable (v13+)
- freebox_manage_wifi_mlo (v14+, WiFi 7)
- freebox_update_dhcp_config
⏱️  Estimation: 2-3 jours
```

### Phase 4 (Future) - **Moins Prioritaire**
```
- TV/PVR endpoints (si demande)
- VPN endpoints
- Autres paramètres système
```

---

## 7. COMPLEXITÉ IMPLÉMENTATION

### Par Catégorie

| Endpoint | Complexité | Raison | Durée |
|----------|-----------|--------|-------|
| DHCP CRUD | ⭐⭐ | Requête REST simple | 1h/endpoint |
| WiFi Guest CRUD | ⭐⭐ | Logique CRUD standard | 1h/endpoint |
| WiFi Stations | ⭐⭐⭐ | Agrégation données APs | 2h |
| Download Trackers | ⭐⭐ | Parsage réponse JSON | 1h |
| WiFi Planning | ⭐⭐⭐ | Validation calendrier | 2h |
| WiFi MLO | ⭐⭐ | Config v14+ seulement | 1.5h |

**Total estimé (Phase 1+2+3):** **8-10 jours** de développement.

---

## 8. EXEMPLES USECASES

### DHCP : Priorité TRÈS HAUTE
```
Claude: "Ajoute 192.168.1.50 comme IP fixe pour mon NAS (AA:BB:CC:DD:EE:FF)"
→ freebox_add_dhcp_static_lease(mac="AA:BB:CC:DD:EE:FF", ip="192.168.1.50", comment="NAS")

Claude: "Liste tous les appareils avec adresses fixes"
→ freebox_get_dhcp_static_leases()
```

### WiFi Guest : Priorité TRÈS HAUTE
```
Claude: "Active un réseau invité pour 24 heures avec clé 'Visitors123'"
→ freebox_create_wifi_guest_key(key="Visitors123", duration=24)

Claude: "Désactive tous les réseaux invités"
→ freebox_delete_wifi_guest_key(id=0)
```

### Téléchargements : Priorité HAUTE
```
Claude: "Détails du téléchargement #5, trackers et pairs"
→ freebox_get_download_torrent_info(id=5)

Claude: "Upload mon fichier ubuntu.torrent"
→ freebox_upload_torrent_file(file_base64="...", download_dir="/Disque dur/")
```

### WiFi Stations : Priorité MOYENNE
```
Claude: "Affiche tous les clients WiFi avec signal et débit"
→ freebox_get_wifi_stations()

Claude: "Désactive l'SSID 'FreeboxWiFi-5G'"
→ freebox_update_wifi_bss(bss_id="00:11:22:33:44:55", enabled=false)
```

---

## 9. RISQUES & CONSIDÉRATIONS

### Risques
1. **DHCP Statiques:** Erreur IP = conflit réseau. Ajouter validation MAC/IP uniques.
2. **WiFi Guest:** Expiration auto? Limiter durée max (24h?).
3. **Téléchargements:** Upload torrent = stockage serveur? Nettoyer après upload.

### Considérations
1. **Permissions:** Vérifier que `settings` permission couvre tous les endpoints.
2. **Versions:** v13/v14 features = check capacités Freebox en amont.
3. **Erreurs:** API Freebox retourne codes spécifiques (`insufficient_rights`, `invalid_id`).

---

## 10. CONCLUSION

### Résumé
- **Dashboard = 2.26x plus complet** que MCP v1.2.0
- **Priorité #1 = DHCP static leases + WiFi guest network** (très haute valeur utilisateur)
- **Faisable:** ~10 jours pour phases 1-3
- **Impact:** Transforme MCP d'outil basique → dashboard équivalent

### Recommandation
Lancer **Phase 1 (DHCP + Guest WiFi) immédiatement** pour max impact avec effort minimal. Puis poursuivre phases 2-3 itérativement.

---

**Document généré :** 28 avril 2026  
**Analyseur :** Claude Haiku  
**Repos analysés :** HGHugo/FreeboxOS-Ultra-Dashboard & mafreebox-mcpserver
