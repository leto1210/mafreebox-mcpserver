#!/usr/bin/env node
/**
 * freebox-mcp — MCP Server pour piloter une Freebox via Claude
 *
 * Usage (stdio, pour Claude Desktop) :
 *   node dist/index.js
 *
 * Variables d'environnement :
 *   FREEBOX_HOST       (défaut: mafreebox.freebox.fr)
 *   FREEBOX_APP_ID     (défaut: fr.freebox.mcp)
 *   FREEBOX_TOKEN_FILE (optionnel: chemin du fichier token à réutiliser)
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { FreeboxClient } from "./freeboxClient.js";
import { fileURLToPath } from "url";

// ─── Configuration ─────────────────────────────────────────────────────────

const FREEBOX_HOST = process.env.FREEBOX_HOST ?? "mafreebox.freebox.fr";
const APP_ID = process.env.FREEBOX_APP_ID ?? "fr.freebox.mcp";
const DEBUG = process.env.DEBUG === "1";
const __dirname = dirname(fileURLToPath(import.meta.url));

function loadAppVersion(): string {
  try {
    const packageJsonPath = join(__dirname, "..", "package.json");
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as { version?: string };
    return packageJson.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

const APP_VERSION = loadAppVersion();

function debug(msg: string) {
  if (DEBUG) process.stderr.write(`[DEBUG] ${msg}\n`);
}

const client = new FreeboxClient({
  host: FREEBOX_HOST,
  appId: APP_ID,
  appName: "Freebox MCP",
  appVersion: APP_VERSION,
  deviceName: "Claude AI",
});

// ─── Helpers ───────────────────────────────────────────────────────────────

function ok(content: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(content, null, 2) }],
  };
}

function err(message: string) {
  return {
    content: [{ type: "text" as const, text: `❌ Erreur : ${message}` }],
    isError: true,
  };
}

async function safe(fn: () => Promise<unknown>) {
  try {
    const result = await fn();
    return ok(result);
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : String(e));
  }
}

// ─── Définition des outils ─────────────────────────────────────────────────

const TOOLS = [
  // AUTH
  {
    name: "freebox_authorize",
    description:
      "Démarre la procédure d'autorisation de l'application sur la Freebox. L'utilisateur doit appuyer sur '>' sur l'écran LCD de sa Freebox pour valider. À appeler une seule fois lors de la première utilisation.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "freebox_check_authorization",
    description: "Vérifie si l'autorisation en attente a été accordée par l'utilisateur sur la Freebox.",
    inputSchema: {
      type: "object",
      properties: {
        track_id: { type: "number", description: "L'identifiant de suivi retourné par freebox_authorize" },
      },
      required: ["track_id"],
    },
  },
  {
    name: "freebox_reset_authorization",
    description: "Réinitialise le token d'autorisation local pour forcer un nouvel enregistrement de l'application avec les bons droits.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },

  // CONNEXION & SYSTÈME
  {
    name: "freebox_get_connection",
    description: "Retourne l'état de la connexion internet : type (fibre/ADSL), débit montant/descendant, IP publique, état de la ligne.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "freebox_get_system",
    description: "Retourne les informations système de la Freebox : température CPU, uptime, modèle, version du firmware, utilisation mémoire.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "freebox_get_capabilities",
    description: "Retourne les capacités détectées de la Freebox (modèle, support VM, Wi-Fi 6GHz/7, stockage interne).",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "freebox_reboot",
    description: "Redémarre la Freebox. Action irréversible, demander confirmation à l'utilisateur avant d'appeler cet outil.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },

  // RÉSEAU LOCAL
  {
    name: "freebox_get_lan_hosts",
    description: "Liste tous les appareils détectés sur le réseau local (LAN + Wi-Fi) avec leur nom, adresse IP, adresse MAC, type et statut de connexion.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "freebox_wake_on_lan",
    description: "Envoie un paquet Wake-on-LAN pour réveiller un appareil sur le réseau local.",
    inputSchema: {
      type: "object",
      properties: {
        mac: { type: "string", description: "Adresse MAC de l'appareil (ex: AA:BB:CC:DD:EE:FF)" },
        password: { type: "string", description: "Mot de passe WoL optionnel (6 octets en hexa)" },
      },
      required: ["mac"],
    },
  },

  // WI-FI
  {
    name: "freebox_get_wifi",
    description: "Retourne la configuration Wi-Fi globale de la Freebox (activé/désactivé, puissance).",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "freebox_toggle_wifi",
    description: "Active ou désactive le Wi-Fi de la Freebox.",
    inputSchema: {
      type: "object",
      properties: {
        enabled: { type: "boolean", description: "true pour activer, false pour désactiver" },
      },
      required: ["enabled"],
    },
  },
  {
    name: "freebox_get_wifi_networks",
    description: "Liste les réseaux Wi-Fi (BSS) configurés : SSID, bande (2.4/5/6 GHz), sécurité, statut.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },

  // TÉLÉCHARGEMENTS
  {
    name: "freebox_get_downloads",
    description: "Liste les téléchargements en cours et terminés avec leur progression, vitesse, taille et statut.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "freebox_add_download",
    description: "Ajoute un téléchargement à partir d'une URL (HTTP, magnet, torrent).",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "URL ou lien magnet à télécharger" },
      },
      required: ["url"],
    },
  },
  {
    name: "freebox_pause_download",
    description: "Met en pause un téléchargement en cours.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "number", description: "Identifiant du téléchargement" },
      },
      required: ["id"],
    },
  },
  {
    name: "freebox_resume_download",
    description: "Reprend un téléchargement mis en pause.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "number", description: "Identifiant du téléchargement" },
      },
      required: ["id"],
    },
  },
  {
    name: "freebox_delete_download",
    description: "Supprime un téléchargement de la liste.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "number", description: "Identifiant du téléchargement" },
      },
      required: ["id"],
    },
  },

  // APPELS
  {
    name: "freebox_get_calls",
    description: "Retourne le journal des appels téléphoniques (entrants, sortants, manqués) avec date, durée, numéro et statut.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "freebox_mark_call_read",
    description: "Marque un appel manqué comme lu.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "number", description: "Identifiant de l'entrée du journal d'appels" },
      },
      required: ["id"],
    },
  },

  // CONTACTS
  {
    name: "freebox_get_contacts",
    description: "Retourne le répertoire téléphonique enregistré sur la Freebox.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },

  // FICHIERS
  {
    name: "freebox_list_files",
    description: "Liste les fichiers et dossiers d'un répertoire du disque de la Freebox.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Chemin absolu (ex: /Disque dur/Films)" },
      },
      required: ["path"],
    },
  },

  // DHCP
  {
    name: "freebox_get_dhcp",
    description: "Retourne la configuration DHCP (plage d'adresses, DNS, gateway) et la liste des baux DHCP actifs.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },

  // REDIRECTION DE PORTS
  {
    name: "freebox_get_port_forwarding",
    description: "Liste les règles de redirection de ports (NAT) configurées sur la Freebox.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "freebox_add_port_forwarding",
    description: "Ajoute une règle de redirection de port.",
    inputSchema: {
      type: "object",
      properties: {
        lan_ip: { type: "string", description: "Adresse IP locale de destination" },
        lan_port: { type: "number", description: "Port local de destination" },
        wan_port_start: { type: "number", description: "Port WAN de début" },
        wan_port_end: { type: "number", description: "Port WAN de fin" },
        ip_proto: { type: "string", enum: ["tcp", "udp"], description: "Protocole" },
        comment: { type: "string", description: "Commentaire descriptif" },
        enabled: { type: "boolean", description: "Activer la règle immédiatement" },
      },
      required: ["lan_ip", "lan_port", "wan_port_start", "wan_port_end", "ip_proto", "comment"],
    },
  },
  {
    name: "freebox_delete_port_forwarding",
    description: "Supprime une règle de redirection de port.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "number", description: "Identifiant de la règle" },
      },
      required: ["id"],
    },
  },

  // CONTRÔLE PARENTAL
  {
    name: "freebox_get_parental",
    description: "Retourne la configuration du contrôle parental et les filtres actifs par profil.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },

  // MACHINES VIRTUELLES (Ultra/Delta uniquement)
  {
    name: "freebox_get_vms",
    description: "Liste les machines virtuelles configurées (Ultra/Delta uniquement) avec leur état, ressources allouées et configuration réseau.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "freebox_start_vm",
    description: "Démarre une machine virtuelle (Ultra/Delta uniquement).",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "number", description: "Identifiant de la VM" },
      },
      required: ["id"],
    },
  },
  {
    name: "freebox_stop_vm",
    description: "Arrête une machine virtuelle (Ultra/Delta uniquement).",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "number", description: "Identifiant de la VM" },
      },
      required: ["id"],
    },
  },

  // STOCKAGE
  {
    name: "freebox_get_storage",
    description: "Retourne l'état des disques connectés à la Freebox : capacité, espace libre, état SMART, partitions.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },

  // FREEPLUG (CPL)
  {
    name: "freebox_get_freeplug",
    description: "Retourne l'état des adaptateurs CPL Freeplug connectés (débit, qualité du lien, voisins).",
    inputSchema: { type: "object", properties: {}, required: [] },
  },

  // STATISTIQUES RRD
  {
    name: "freebox_get_stats",
    description: "Retourne des statistiques historiques (débit, températures, CPU) sur une période donnée.",
    inputSchema: {
      type: "object",
      properties: {
        db: {
          type: "string",
          enum: ["net", "temp", "dsl", "switch"],
          description: "Base de données : net (débit), temp (températures), dsl (ADSL/fibre), switch (ports ethernet)",
        },
        fields: {
          type: "array",
          items: { type: "string" },
          description: "Champs à récupérer. Pour net: [bw_up, bw_down]. Pour temp: [cpum, cpub, sw, hdd]. Pour dsl: [rate_up, rate_down, snr_up, snr_down].",
        },
        date_start: { type: "number", description: "Timestamp Unix de début (optionnel, défaut: 1h avant)" },
        date_end: { type: "number", description: "Timestamp Unix de fin (optionnel, défaut: maintenant)" },
        precision: { type: "number", description: "Précision en secondes (optionnel)" },
      },
      required: ["db", "fields"],
    },
  },

  // DHCP STATIC LEASES (Phase 4)
  {
    name: "freebox_get_dhcp_static_leases",
    description: "Liste toutes les adresses IP fixes attribuées (baux DHCP statiques) avec MAC, IP, hostname.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "freebox_add_dhcp_static_lease",
    description: "Ajoute une nouvelle adresse IP fixe (DHCP statique).",
    inputSchema: {
      type: "object",
      properties: {
        mac: { type: "string", description: "Adresse MAC de l'appareil (ex: AA:BB:CC:DD:EE:FF)" },
        ip: { type: "string", description: "Adresse IP à réserver (ex: 192.168.1.50)" },
        hostname: { type: "string", description: "Nom d'hôte optionnel" },
        comment: { type: "string", description: "Commentaire descriptif (optionnel)" },
      },
      required: ["mac", "ip"],
    },
  },
  {
    name: "freebox_update_dhcp_static_lease",
    description: "Modifie une adresse IP fixe existante.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Identifiant du bail statique" },
        mac: { type: "string", description: "Nouvelle adresse MAC (optionnel)" },
        ip: { type: "string", description: "Nouvelle adresse IP (optionnel)" },
        hostname: { type: "string", description: "Nouveau hostname (optionnel)" },
        comment: { type: "string", description: "Nouveau commentaire (optionnel)" },
      },
      required: ["id"],
    },
  },
  {
    name: "freebox_delete_dhcp_static_lease",
    description: "Supprime une adresse IP fixe (DHCP statique).",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Identifiant du bail statique" },
      },
      required: ["id"],
    },
  },

  // WIFI GUEST NETWORKS (Phase 4)
  {
    name: "freebox_get_wifi_guest_networks",
    description: "Liste les réseaux Wi-Fi invités configurés (SSIDs, clés, permissions).",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "freebox_add_wifi_guest_network",
    description: "Crée un nouveau réseau Wi-Fi invité.",
    inputSchema: {
      type: "object",
      properties: {
        ssid: { type: "string", description: "Nom du réseau Wi-Fi invité" },
        key: { type: "string", description: "Clé WPA2 (optionnel, générée si absent)" },
        enable: { type: "boolean", description: "Activer immédiatement (défaut: true)" },
        hidden: { type: "boolean", description: "Masquer le SSID (défaut: false)" },
      },
      required: ["ssid"],
    },
  },
  {
    name: "freebox_update_wifi_guest_network",
    description: "Modifie un réseau Wi-Fi invité existant.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Identifiant du réseau invité" },
        ssid: { type: "string", description: "Nouveau SSID (optionnel)" },
        key: { type: "string", description: "Nouvelle clé (optionnel)" },
        enable: { type: "boolean", description: "Activer/désactiver (optionnel)" },
        hidden: { type: "boolean", description: "Masquer SSID (optionnel)" },
      },
      required: ["id"],
    },
  },
  {
    name: "freebox_delete_wifi_guest_network",
    description: "Supprime un réseau Wi-Fi invité.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Identifiant du réseau invité" },
      },
      required: ["id"],
    },
  },

  // WIFI ADVANCED (Phase 4)
  {
    name: "freebox_get_wifi_access_points",
    description: "Liste les Access Points (APs) Wi-Fi par bande (2.4/5/6 GHz) avec puissance, clients, canal.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "freebox_get_wifi_stations",
    description: "Liste tous les clients Wi-Fi connectés avec signal (dBm), débit, bande, hostname.",
    inputSchema: {
      type: "object",
      properties: {
        ap_id: { type: "string", description: "Filtrer par Access Point (optionnel)" },
      },
      required: [],
    },
  },
  {
    name: "freebox_get_wifi_planning",
    description: "Retourne le calendrier d'activation/désactivation Wi-Fi programmé.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "freebox_set_wifi_planning",
    description: "Configure le calendrier d'activation/désactivation du Wi-Fi (jours/heures).",
    inputSchema: {
      type: "object",
      properties: {
        planning: { type: "string", description: "Calendrier au format Freebox (ex: config JSON)" },
      },
      required: ["planning"],
    },
  },

  // DOWNLOADS STATS & DETAILS (Phase 4)
  {
    name: "freebox_get_download_stats",
    description: "Retourne les statistiques globales des téléchargements (bytes téléchargés, vitesse moyenne, nb torrents).",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "freebox_get_downloads_config",
    description: "Retourne la configuration des téléchargements (répertoire, limites de vitesse, options torrent).",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "freebox_get_download_trackers",
    description: "Retourne les trackers d'un torrent spécifique avec le nombre de seeders/leechers.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "number", description: "Identifiant du téléchargement/torrent" },
      },
      required: ["id"],
    },
  },
  {
    name: "freebox_get_download_peers",
    description: "Retourne les pairs (peers) connectées d'un torrent avec IP, pays, débit, pourcentage complété.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "number", description: "Identifiant du téléchargement/torrent" },
      },
      required: ["id"],
    },
  },
  {
    name: "freebox_get_download_files",
    description: "Retourne la liste des fichiers d'un torrent avec taille, progression et priorité.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "number", description: "Identifiant du téléchargement/torrent" },
      },
      required: ["id"],
    },
  },
  // VPN SERVER (Phase 7)
  {
    name: "freebox_list_vpn_servers",
    description: "Liste les serveurs VPN configurés sur la Freebox (OpenVPN, WireGuard, L2TP) avec leur état.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "freebox_get_vpn_server_config",
    description: "Retourne la configuration détaillée d'un serveur VPN (certificats, port, protocole).",
    inputSchema: {
      type: "object",
      properties: {
        server_id: { type: "string", description: "Identifiant du serveur VPN" },
      },
      required: ["server_id"],
    },
  },
  {
    name: "freebox_start_vpn_server",
    description: "Démarre un serveur VPN.",
    inputSchema: {
      type: "object",
      properties: {
        server_id: { type: "string", description: "Identifiant du serveur VPN" },
      },
      required: ["server_id"],
    },
  },
  {
    name: "freebox_stop_vpn_server",
    description: "Arrête un serveur VPN.",
    inputSchema: {
      type: "object",
      properties: {
        server_id: { type: "string", description: "Identifiant du serveur VPN" },
      },
      required: ["server_id"],
    },
  },
  {
    name: "freebox_list_vpn_server_users",
    description: "Liste les utilisateurs autorisés à se connecter à un serveur VPN.",
    inputSchema: {
      type: "object",
      properties: {
        server_id: { type: "string", description: "Identifiant du serveur VPN" },
      },
      required: ["server_id"],
    },
  },
  {
    name: "freebox_get_vpn_connections",
    description: "Liste les connexions VPN actives (IP, utilisateur, durée, débit).",
    inputSchema: { type: "object", properties: {}, required: [] },
  },

  // VPN CLIENT (Phase 7)
  {
    name: "freebox_list_vpn_clients",
    description: "Liste les configurations de client VPN enregistrées sur la Freebox.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "freebox_get_vpn_client_status",
    description: "Retourne l'état de connexion d'un client VPN (connecté, IP assignée, durée).",
    inputSchema: {
      type: "object",
      properties: {
        client_id: { type: "string", description: "Identifiant du client VPN" },
      },
      required: ["client_id"],
    },
  },

  // PARENTAL PROFILES (Phase 7)
  {
    name: "freebox_list_parental_profiles",
    description: "Liste les profils de contrôle parental configurés avec leur état et les appareils associés.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "freebox_get_parental_profile",
    description: "Retourne les détails d'un profil de contrôle parental (planification, filtres, appareils).",
    inputSchema: {
      type: "object",
      properties: {
        profile_id: { type: "string", description: "Identifiant du profil parental" },
      },
      required: ["profile_id"],
    },
  },
  {
    name: "freebox_update_parental_profile",
    description: "Modifie un profil de contrôle parental (activer/désactiver, planification horaire).",
    inputSchema: {
      type: "object",
      properties: {
        profile_id: { type: "string", description: "Identifiant du profil parental" },
        enabled: { type: "boolean", description: "Activer/désactiver le profil" },
        default_filter: { type: "string", description: "Filtre par défaut (allow/deny)" },
      },
      required: ["profile_id"],
    },
  },

  // DMZ / FIREWALL (Phase 7)
  {
    name: "freebox_get_dmz_config",
    description: "Retourne la configuration DMZ (hôte exposé sur internet, activé/désactivé).",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "freebox_set_dmz_config",
    description: "Configure ou désactive la DMZ (expose un appareil interne directement sur internet).",
    inputSchema: {
      type: "object",
      properties: {
        enabled: { type: "boolean", description: "Activer/désactiver la DMZ" },
        ip: { type: "string", description: "Adresse IP locale de l'hôte DMZ (ex: 192.168.1.100)" },
      },
      required: ["enabled"],
    },
  },
  {
    name: "freebox_list_nat_rules",
    description: "Liste les règles NAT (incoming) du pare-feu Freebox.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "freebox_list_upnp_redirections",
    description: "Liste les redirections UPnP IGD actives créées automatiquement par des applications.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },

  // FTP (Phase 6)
  {
    name: "freebox_get_ftp_config",
    description: "Retourne la configuration du serveur FTP de la Freebox (activé, accès anonyme, port).",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "freebox_set_ftp_config",
    description: "Modifie la configuration du serveur FTP de la Freebox.",
    inputSchema: {
      type: "object",
      properties: {
        enabled: { type: "boolean", description: "Activer/désactiver le serveur FTP" },
        allow_anonymous: { type: "boolean", description: "Autoriser l'accès anonyme" },
        allow_anonymous_write: { type: "boolean", description: "Autoriser l'écriture anonyme" },
        port_ctrl: { type: "number", description: "Port de contrôle FTP" },
        remote_access: { type: "boolean", description: "Autoriser l'accès depuis internet" },
      },
      required: [],
    },
  },

  // SWITCH (Phase 6)
  {
    name: "freebox_get_switch_status",
    description: "Retourne l'état des ports physiques du switch intégré à la Freebox (débit, duplex, lien).",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "freebox_get_switch_port_stats",
    description: "Retourne les statistiques de trafic d'un port physique du switch (octets reçus/envoyés, erreurs).",
    inputSchema: {
      type: "object",
      properties: {
        port_id: { type: "number", description: "Numéro du port (1-4)" },
      },
      required: ["port_id"],
    },
  },

  // LCD (Phase 6)
  {
    name: "freebox_get_lcd_config",
    description: "Retourne la configuration de l'écran LCD de la Freebox (luminosité, orientation, mode).",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "freebox_set_lcd_config",
    description: "Modifie la configuration de l'écran LCD de la Freebox.",
    inputSchema: {
      type: "object",
      properties: {
        brightness: { type: "number", description: "Luminosité (0-100)" },
        orientation: { type: "number", description: "Orientation en degrés (0, 90, 180, 270)" },
        mode: { type: "string", description: "Mode d'affichage" },
      },
      required: [],
    },
  },

  // SHARE LINKS (Phase 6)
  {
    name: "freebox_list_share_links",
    description: "Liste les liens de partage publics créés pour des fichiers/dossiers de la Freebox.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "freebox_create_share_link",
    description: "Crée un lien de partage public pour un fichier ou dossier de la Freebox.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Chemin absolu du fichier/dossier à partager (ex: /Disque dur/Photos)" },
        expire: { type: "number", description: "Timestamp Unix d'expiration (optionnel, 0 = jamais)" },
      },
      required: ["path"],
    },
  },
  {
    name: "freebox_get_share_link",
    description: "Retourne les informations d'un lien de partage par son token.",
    inputSchema: {
      type: "object",
      properties: {
        token: { type: "string", description: "Token du lien de partage" },
      },
      required: ["token"],
    },
  },
  {
    name: "freebox_delete_share_link",
    description: "Supprime un lien de partage public.",
    inputSchema: {
      type: "object",
      properties: {
        token: { type: "string", description: "Token du lien de partage à supprimer" },
      },
      required: ["token"],
    },
  },

  // AIRMEDIA (Phase 6)
  {
    name: "freebox_get_airmedia_config",
    description: "Retourne la configuration AirMedia (AirPlay) de la Freebox (activé, mot de passe).",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "freebox_get_airmedia_receivers",
    description: "Liste les récepteurs AirMedia disponibles sur le réseau local.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },

  {
    name: "freebox_set_download_file_priority",
    description: "Définit la priorité de téléchargement d'un fichier dans un torrent.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "number", description: "Identifiant du téléchargement/torrent" },
        file_id: { type: "number", description: "Identifiant du fichier" },
        priority: { type: "string", enum: ["low", "normal", "high"], description: "Priorité" },
      },
      required: ["id", "file_id", "priority"],
    },
  },
];

// ─── Serveur MCP ───────────────────────────────────────────────────────────

const server = new Server(
  { name: "freebox-mcp", version: APP_VERSION },
  { capabilities: { tools: {} } }
);

const VM_TOOL_NAMES = new Set(["freebox_get_vms", "freebox_start_vm", "freebox_stop_vm"]);

async function getFilteredTools() {
  try {
    const capabilities = await client.getCapabilities();
    if (!client.supportsVm(capabilities)) {
      return TOOLS.filter((tool) => !VM_TOOL_NAMES.has(tool.name));
    }
  } catch (e) {
    debug(`échec détection capacités pour filtrage outils: ${e}`);
  }

  return TOOLS;
}

async function assertVmSupport() {
  const capabilities = await client.getCapabilities();
  if (!client.supportsVm(capabilities)) {
    throw new Error(`Les machines virtuelles ne sont pas supportées sur ${capabilities.modelName}.`);
  }
}

// Liste des outils
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: await getFilteredTools() }));

// Exécution des outils
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const a = (args ?? {}) as Record<string, unknown>;
  debug(`tool call: ${name} ${JSON.stringify(a)}`);

  switch (name) {
    // AUTH
    case "freebox_authorize":
      return safe(() => client.startAuthorization());

    case "freebox_check_authorization":
      return safe(() => client.checkAuthorizationStatus(a.track_id as number));

    case "freebox_reset_authorization":
      return safe(() => client.resetAuthorization());

    // CONNEXION & SYSTÈME
    case "freebox_get_connection":
      return safe(() => client.getConnectionStatus());

    case "freebox_get_system":
      return safe(() => client.getSystemInfo());

    case "freebox_get_capabilities":
      return safe(() => client.getCapabilities());

    case "freebox_reboot":
      return safe(() => client.reboot());

    // RÉSEAU LOCAL
    case "freebox_get_lan_hosts":
      return safe(() => client.getLanHosts());

    case "freebox_wake_on_lan":
      return safe(() => client.wakeOnLan(a.mac as string, a.password as string | undefined));

    // WI-FI
    case "freebox_get_wifi":
      return safe(() => client.getWifiConfig());

    case "freebox_toggle_wifi":
      return safe(() => client.setWifiEnabled(a.enabled as boolean));

    case "freebox_get_wifi_networks":
      return safe(() => client.getWifiBSS());

    // TÉLÉCHARGEMENTS
    case "freebox_get_downloads":
      return safe(() => client.getDownloads());

    case "freebox_add_download":
      return safe(() => client.addDownload(a.url as string));

    case "freebox_pause_download":
      return safe(() => client.updateDownload(a.id as number, "stopped"));

    case "freebox_resume_download":
      return safe(() => client.updateDownload(a.id as number, "downloading"));

    case "freebox_delete_download":
      return safe(() => client.deleteDownload(a.id as number));

    // APPELS
    case "freebox_get_calls":
      return safe(() => client.getCallLog());

    case "freebox_mark_call_read":
      return safe(() => client.markCallRead(a.id as number));

    // CONTACTS
    case "freebox_get_contacts":
      return safe(() => client.getContacts());

    // FICHIERS
    case "freebox_list_files":
      return safe(() => client.listFiles(a.path as string));

    // DHCP
    case "freebox_get_dhcp":
      return safe(async () => ({
        config: await client.getDHCPConfig(),
        leases: await client.getDHCPLeases(),
      }));

    // REDIRECTION DE PORTS
    case "freebox_get_port_forwarding":
      return safe(() => client.getPortForwarding());

    case "freebox_add_port_forwarding":
      return safe(() =>
        client.addPortForwarding({
          lan_ip: a.lan_ip as string,
          lan_port: a.lan_port as number,
          wan_port_start: a.wan_port_start as number,
          wan_port_end: a.wan_port_end as number,
          ip_proto: a.ip_proto as "tcp" | "udp",
          comment: a.comment as string,
          enabled: (a.enabled as boolean) ?? true,
        })
      );

    case "freebox_delete_port_forwarding":
      return safe(() => client.deletePortForwarding(a.id as number));

    // CONTRÔLE PARENTAL
    case "freebox_get_parental":
      return safe(async () => ({
        config: await client.getParentalConfig(),
        filters: await client.getParentalFilters(),
      }));

    // VMs
    case "freebox_get_vms":
      return safe(async () => {
        await assertVmSupport();
        return client.getVMs();
      });

    case "freebox_start_vm":
      return safe(async () => {
        await assertVmSupport();
        return client.startVM(a.id as number);
      });

    case "freebox_stop_vm":
      return safe(async () => {
        await assertVmSupport();
        return client.stopVM(a.id as number);
      });

    // STOCKAGE
    case "freebox_get_storage":
      return safe(() => client.getStorageDisks());

    // FREEPLUG
    case "freebox_get_freeplug":
      return safe(() => client.getFreeplug());

    // STATS RRD
    case "freebox_get_stats":
      return safe(() =>
        client.getRRDStats(
          a.db as string,
          a.fields as string[],
          a.date_start as number | undefined,
          a.date_end as number | undefined,
          a.precision as number | undefined
        )
      );

    // DHCP STATIC LEASES (Phase 4)
    case "freebox_get_dhcp_static_leases":
      return safe(() => client.getDhcpStaticLeases());

    case "freebox_add_dhcp_static_lease": {
      const lease: Record<string, unknown> = {
        mac: a.mac,
        ip: a.ip,
      };
      if (a.hostname) lease.hostname = a.hostname;
      if (a.comment) lease.comment = a.comment;
      return safe(() => client.addDhcpStaticLease(lease));
    }

    case "freebox_update_dhcp_static_lease": {
      const lease: Record<string, unknown> = {};
      if (a.mac) lease.mac = a.mac;
      if (a.ip) lease.ip = a.ip;
      if (a.hostname) lease.hostname = a.hostname;
      if (a.comment) lease.comment = a.comment;
      return safe(() => client.updateDhcpStaticLease(a.id as string, lease));
    }

    case "freebox_delete_dhcp_static_lease":
      return safe(() => client.deleteDhcpStaticLease(a.id as string));

    // WIFI GUEST NETWORKS (Phase 4)
    case "freebox_get_wifi_guest_networks":
      return safe(() => client.getWifiGuestNetworks());

    case "freebox_add_wifi_guest_network": {
      const config: Record<string, unknown> = {
        ssid: a.ssid,
        enable: a.enable !== false,
        hidden: a.hidden === true,
      };
      if (a.key) config.key = a.key;
      return safe(() => client.addWifiGuestNetwork(config));
    }

    case "freebox_update_wifi_guest_network": {
      const config: Record<string, unknown> = {};
      if (a.ssid) config.ssid = a.ssid;
      if (a.key) config.key = a.key;
      if (a.enable !== undefined) config.enable = a.enable;
      if (a.hidden !== undefined) config.hidden = a.hidden;
      return safe(() => client.updateWifiGuestNetwork(a.id as string, config));
    }

    case "freebox_delete_wifi_guest_network":
      return safe(() => client.deleteWifiGuestNetwork(a.id as string));

    // WIFI ADVANCED (Phase 4)
    case "freebox_get_wifi_access_points":
      return safe(() => client.getWifiAccessPoints());

    case "freebox_get_wifi_stations":
      return safe(() => client.getWifiStations(a.ap_id as string | undefined));

    case "freebox_get_wifi_planning":
      return safe(() => client.getWifiPlanning());

    case "freebox_set_wifi_planning":
      return safe(() => client.setWifiPlanning(JSON.parse(a.planning as string)));

    // DOWNLOADS STATS & DETAILS (Phase 4)
    case "freebox_get_download_stats":
      return safe(() => client.getDownloadStats());

    case "freebox_get_downloads_config":
      return safe(() => client.getDownloadsConfig());

    case "freebox_get_download_trackers":
      return safe(() => client.getDownloadTrackers(a.id as number));

    case "freebox_get_download_peers":
      return safe(() => client.getDownloadPeers(a.id as number));

    case "freebox_get_download_files":
      return safe(() => client.getDownloadFiles(a.id as number));

    case "freebox_set_download_file_priority":
      return safe(() =>
        client.setDownloadFilePriority(a.id as number, a.file_id as number, a.priority as string)
      );

    // VPN SERVER (Phase 7)
    case "freebox_list_vpn_servers":
      return safe(() => client.listVpnServers());

    case "freebox_get_vpn_server_config":
      return safe(() => client.getVpnServerConfig(a.server_id as string));

    case "freebox_start_vpn_server":
      return safe(() => client.setVpnServerActive(a.server_id as string, true));

    case "freebox_stop_vpn_server":
      return safe(() => client.setVpnServerActive(a.server_id as string, false));

    case "freebox_list_vpn_server_users":
      return safe(() => client.listVpnServerUsers(a.server_id as string));

    case "freebox_get_vpn_connections":
      return safe(() => client.getVpnConnections());

    // VPN CLIENT (Phase 7)
    case "freebox_list_vpn_clients":
      return safe(() => client.listVpnClients());

    case "freebox_get_vpn_client_status":
      return safe(() => client.getVpnClientStatus(a.client_id as string));

    // PARENTAL PROFILES (Phase 7)
    case "freebox_list_parental_profiles":
      return safe(() => client.listParentalProfiles());

    case "freebox_get_parental_profile":
      return safe(() => client.getParentalProfile(a.profile_id as string));

    case "freebox_update_parental_profile": {
      const config: Record<string, unknown> = {};
      if (a.enabled !== undefined) config.enabled = a.enabled;
      if (a.default_filter !== undefined) config.default_filter = a.default_filter;
      return safe(() => client.updateParentalProfile(a.profile_id as string, config));
    }

    // DMZ / FIREWALL (Phase 7)
    case "freebox_get_dmz_config":
      return safe(() => client.getDmzConfig());

    case "freebox_set_dmz_config": {
      const config: { enabled: boolean; ip?: string } = { enabled: a.enabled as boolean };
      if (a.ip) config.ip = a.ip as string;
      return safe(() => client.setDmzConfig(config));
    }

    case "freebox_list_nat_rules":
      return safe(() => client.listNatRules());

    case "freebox_list_upnp_redirections":
      return safe(() => client.listUpnpRedirections());

    // FTP (Phase 6)
    case "freebox_get_ftp_config":
      return safe(() => client.getFtpConfig());

    case "freebox_set_ftp_config": {
      const config: Record<string, unknown> = {};
      if (a.enabled !== undefined) config.enabled = a.enabled;
      if (a.allow_anonymous !== undefined) config.allow_anonymous = a.allow_anonymous;
      if (a.allow_anonymous_write !== undefined) config.allow_anonymous_write = a.allow_anonymous_write;
      if (a.port_ctrl !== undefined) config.port_ctrl = a.port_ctrl;
      if (a.remote_access !== undefined) config.remote_access = a.remote_access;
      return safe(() => client.setFtpConfig(config));
    }

    // SWITCH (Phase 6)
    case "freebox_get_switch_status":
      return safe(() => client.getSwitchStatus());

    case "freebox_get_switch_port_stats":
      return safe(() => client.getSwitchPortStats(a.port_id as number));

    // LCD (Phase 6)
    case "freebox_get_lcd_config":
      return safe(() => client.getLcdConfig());

    case "freebox_set_lcd_config": {
      const config: Record<string, unknown> = {};
      if (a.brightness !== undefined) config.brightness = a.brightness;
      if (a.orientation !== undefined) config.orientation = a.orientation;
      if (a.mode !== undefined) config.mode = a.mode;
      return safe(() => client.setLcdConfig(config));
    }

    // SHARE LINKS (Phase 6)
    case "freebox_list_share_links":
      return safe(() => client.listShareLinks());

    case "freebox_create_share_link":
      return safe(() => client.createShareLink({ path: a.path as string, expire: a.expire as number | undefined }));

    case "freebox_get_share_link":
      return safe(() => client.getShareLink(a.token as string));

    case "freebox_delete_share_link":
      return safe(() => client.deleteShareLink(a.token as string));

    // AIRMEDIA (Phase 6)
    case "freebox_get_airmedia_config":
      return safe(() => client.getAirmediaConfig());

    case "freebox_get_airmedia_receivers":
      return safe(() => client.getAirmediaReceivers());

    default:
      return err(`Outil inconnu: ${name}`);
  }
});

// ─── Démarrage ─────────────────────────────────────────────────────────────

async function main() {
  process.stderr.write("✅ Freebox MCP server démarré (stdio)\n");
  debug(`FREEBOX_HOST=${FREEBOX_HOST}`);
  debug(`FREEBOX_APP_ID=${APP_ID}`);
  debug(`FREEBOX_TOKEN_FILE=${process.env.FREEBOX_TOKEN_FILE ?? "(défaut)"}`);
  debug(`token chargé: ${client.isAuthorized()}`);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((e) => {
  process.stderr.write(`Fatal: ${e}\n`);
  process.exit(1);
});
