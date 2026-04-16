# freebox-mcp 🏠

Developpé à partir du travail de  @HGHugo ==> https://github.com/HGHugo/FreeboxOS-Ultra-Dashboard/

**MCP Server pour piloter votre Freebox via Claude AI**

Connecte Claude à l'API officielle Freebox OS pour piloter votre box directement en langage naturel.

---

## Ce que vous pouvez faire

Une fois connecté, vous pouvez demander à Claude :

- *"Quels appareils sont connectés sur mon réseau ?"*
- *"Montre-moi les téléchargements en cours et leur progression"*
- *"Ajoute ce lien magnet à la liste des téléchargements"*
- *"Quelle est la température de ma Freebox ?"*
- *"Liste mes appels manqués du jour"*
- *"Ouvre le port 8080 vers mon serveur local 192.168.1.10"*
- *"Démarre la VM Ubuntu"*
- *"Active le Wi-Fi"*
- *"Montre-moi les stats de débit des dernières 24h"*

---

## Prérequis

- **Node.js ≥ 22** (ou Docker)
- **Claude Desktop** (avec support MCP)
- Être sur le **même réseau local** que votre Freebox *(l'API Freebox n'est pas accessible depuis internet)*

---

## Installation

### Option 1 — Node.js (recommandé pour Claude Desktop)

```bash
git clone https://github.com/leto1210/mafreebox-mcpserver.git
cd mafreebox-mcpserver
npm install
npm run build
```

### Option 2 — Docker (image pré-compilée)

```bash
docker pull ghcr.io/leto1210/mafreebox-mcpserver:latest
```

Ou construire depuis les sources :

```bash
docker build -t freebox-mcp .
```

### Option 3 — Docker Compose (avec FreeboxOS-Ultra-Dashboard)

Si vous utilisez le [tableau de bord FreeboxOS-Ultra-Dashboard](https://github.com/HGHugo/FreeboxOS-Ultra-Dashboard), le serveur MCP est disponible en tant que profil Compose optionnel :

```bash
docker compose --profile mcp up -d
```

Le service utilise l'image `ghcr.io/leto1210/mafreebox-mcpserver:latest` et partage le volume `freebox_mcp_data` pour la persistance du token.

---

## Lancer le serveur MCP

### Node.js

```bash
node dist/index.js
```

Ou avec des variables d'environnement personnalisées :

```bash
FREEBOX_HOST=192.168.1.254 FREEBOX_TOKEN_FILE=/chemin/token.json node dist/index.js
```

### Docker

```bash
# Image pré-compilée (recommandé)
docker run --rm -it \
  -v freebox-data:/app/data \
  -e FREEBOX_HOST=mafreebox.freebox.fr \
  ghcr.io/leto1210/mafreebox-mcpserver:latest

# Ou depuis une image construite localement
docker build -t freebox-mcp .
docker run --rm -it \
  -v freebox-data:/app/data \
  -e FREEBOX_HOST=mafreebox.freebox.fr \
  freebox-mcp
```

### Dépannage — mode verbose

```bash
docker run --rm -i \
  -v freebox-data:/app/data \
  -e FREEBOX_HOST=mafreebox.freebox.fr \
  -e DEBUG=1 \
  freebox-mcp
```

Les logs `[DEBUG]` apparaissent sur `stderr` : config au démarrage, chargement/sauvegarde du token, chaque appel d'outil et chaque requête HTTP vers l'API Freebox.

> **Note** : le serveur communique via **stdio** — il est conçu pour être lancé par Claude Desktop comme processus enfant, pas comme un service en arrière-plan. Lancez-le manuellement uniquement pour tester ou déboguer.

---

## Configuration Claude Desktop

Editez `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) ou `%APPDATA%\Claude\claude_desktop_config.json` (Windows).

### Option 1 — Node.js

```json
{
  "mcpServers": {
    "freebox": {
      "command": "node",
      "args": ["/chemin/absolu/vers/freebox-mcp/dist/index.js"],
      "env": {
        "FREEBOX_HOST": "mafreebox.freebox.fr"
      }
    }
  }
}
```

### Option 2 — Docker (image pré-compilée)

```json
{
  "mcpServers": {
    "freebox": {
      "command": "docker",
      "args": [
        "run", "--rm", "-i",
        "-v", "freebox-data:/app/data",
        "-e", "FREEBOX_HOST=mafreebox.freebox.fr",
        "ghcr.io/leto1210/mafreebox-mcpserver:latest"
      ]
    }
  }
}
```

> **`-i` et non `-it`** : Claude Desktop communique via stdio sans TTY — `-t` provoque une erreur. `--rm` supprime le conteneur à chaque arrêt ; le volume `freebox-data` assure la persistance du token.

Redémarrez Claude Desktop.

---

## Première connexion (à faire une seule fois)

1. Dans Claude Desktop, demandez : **"Connecte-toi à ma Freebox"**
2. Claude appellera `freebox_authorize`
3. **Sur votre Freebox** : un message s'affiche sur l'écran LCD
4. **Appuyez sur `>`** pour autoriser l'application
5. Demandez à Claude : **"Vérifie si l'autorisation est accordée"** avec le `track_id` retourné
6. ✅ C'est fait ! Le token est sauvegardé pour les prochaines sessions.

---

## Variables d'environnement

| Variable             | Défaut                          | Description                                          |
|----------------------|---------------------------------|------------------------------------------------------|
| `FREEBOX_HOST`       | `mafreebox.freebox.fr`          | Hostname ou IP de la Freebox                         |
| `FREEBOX_APP_ID`     | `fr.freebox.mcp`                | Identifiant de l'application                         |
| `FREEBOX_TOKEN_FILE` | `<dist>/../freebox_token.json`  | Chemin absolu du fichier token. En Docker : `/app/data/freebox_token.json` (défini dans l'image) |
| `DEBUG`              | _(désactivé)_                   | Mettre à `1` pour activer les logs détaillés sur stderr (config, appels d'outils, requêtes API) |

---

## Outils MCP disponibles (29 outils)

### 🔐 Authentification
| Outil | Description |
|-------|-------------|
| `freebox_authorize` | Lance la demande d'autorisation (LCD Freebox) |
| `freebox_check_authorization` | Vérifie si l'autorisation a été accordée |

### 🌐 Connexion & Système
| Outil | Description |
|-------|-------------|
| `freebox_get_connection` | État de la connexion internet, IP publique, débits |
| `freebox_get_system` | Températures, uptime, firmware, mémoire |
| `freebox_reboot` | Redémarre la Freebox |

### 🖥️ Réseau local
| Outil | Description |
|-------|-------------|
| `freebox_get_lan_hosts` | Liste des appareils connectés |
| `freebox_wake_on_lan` | Réveille un appareil par son adresse MAC |

### 📶 Wi-Fi
| Outil | Description |
|-------|-------------|
| `freebox_get_wifi` | Configuration Wi-Fi globale |
| `freebox_toggle_wifi` | Active / désactive le Wi-Fi |
| `freebox_get_wifi_networks` | Liste des réseaux (SSID, bandes, sécurité) |

### ⬇️ Téléchargements
| Outil | Description |
|-------|-------------|
| `freebox_get_downloads` | Liste et progression des téléchargements |
| `freebox_add_download` | Ajoute une URL ou lien magnet |
| `freebox_pause_download` | Met en pause |
| `freebox_resume_download` | Reprend |
| `freebox_delete_download` | Supprime |

### 📞 Téléphonie
| Outil | Description |
|-------|-------------|
| `freebox_get_calls` | Journal d'appels (entrants, sortants, manqués) |
| `freebox_mark_call_read` | Marque un appel manqué comme lu |
| `freebox_get_contacts` | Répertoire téléphonique |

### 📁 Fichiers
| Outil | Description |
|-------|-------------|
| `freebox_list_files` | Explore les fichiers du disque Freebox |

### 🔧 Réseau avancé
| Outil | Description |
|-------|-------------|
| `freebox_get_dhcp` | Config DHCP + baux actifs |
| `freebox_get_port_forwarding` | Règles de redirection de ports |
| `freebox_add_port_forwarding` | Ajoute une règle NAT |
| `freebox_delete_port_forwarding` | Supprime une règle NAT |

### 👨‍👧 Contrôle parental
| Outil | Description |
|-------|-------------|
| `freebox_get_parental` | Profils et filtres de contrôle parental |

### 💻 Machines virtuelles (Ultra/Delta)
| Outil | Description |
|-------|-------------|
| `freebox_get_vms` | Liste des VMs et leur état |
| `freebox_start_vm` | Démarre une VM |
| `freebox_stop_vm` | Arrête une VM |

### 💾 Infrastructure
| Outil | Description |
|-------|-------------|
| `freebox_get_storage` | Disques connectés, espace, état SMART |
| `freebox_get_freeplug` | État des adaptateurs CPL |
| `freebox_get_stats` | Statistiques RRD (débit, températures, DSL) |

---

## Architecture

```
Claude Desktop
     │
     │ MCP (stdio)
     ▼
freebox-mcp (Node.js)
  ├── src/index.ts           # Serveur MCP + définition des 29 outils
  ├── src/freeboxClient.ts   # Client API Freebox (auth HMAC-SHA1 + endpoints)
  └── Dockerfile             # Image Docker du serveur
     │
     │ HTTP (réseau local uniquement)
     ▼
Freebox OS API v8+
(mafreebox.freebox.fr)
```

Le serveur tourne en **stdio** : Claude Desktop l'exécute comme un processus enfant et communique via stdin/stdout selon le protocole MCP.

---

## Compatibilité Freebox

| Modèle | Support | VMs |
|--------|---------|-----|
| Freebox Ultra | ✅ Complet | ✅ |
| Freebox Delta | ✅ Complet | ✅ |
| Freebox Pop | ✅ Complet | ❌ |
| Freebox Mini 4K | ⚠️ Partiel | ❌ |
| Freebox Revolution | ⚠️ Partiel | ❌ |

---

## Sécurité

- Le token d'authentification est stocké dans `freebox_token.json` (à côté du binaire), ou dans le chemin défini par `FREEBOX_TOKEN_FILE`
- L'API Freebox n'est accessible que depuis le réseau local : aucune donnée ne transite par internet
- Le serveur MCP tourne en local sur votre machine

---

## Licence

MIT
