# CV Scorer — Tri automatique de CV par IA

Application complète de tri et classement de CV alimentée par Claude (Anthropic).

## Architecture

```
nginx (port 80/443)
├── /api/*  →  backend FastAPI  (Python, pdfplumber, Claude API)
└── /*      →  frontend React   (upload, SSE streaming, résultats)
```

## Démarrage rapide (local)

### Prérequis
- Docker & Docker Compose installés
- Une clé API Anthropic : https://console.anthropic.com

### 1. Cloner et configurer

```bash
git clone <repo>
cd cv-scorer
cp .env.example .env
# Éditer .env et renseigner ANTHROPIC_API_KEY
```

### 2. Lancer en développement

```bash
docker-compose up --build
```

Ouvrir http://localhost dans le navigateur.

---

## Mise en production (VPS avec HTTPS)

### Prérequis serveur
- Ubuntu 22.04 (ou équivalent)
- Docker + Docker Compose installés
- Domaine DNS pointant vers le serveur

### 1. Configurer le .env

```bash
cp .env.example .env
nano .env
# Remplir : ANTHROPIC_API_KEY, DOMAIN, ACME_EMAIL
```

### 2. Lancer avec HTTPS automatique

```bash
docker-compose -f docker-compose.prod.yml up -d --build
```

Traefik génère automatiquement le certificat SSL via Let's Encrypt.

### 3. Vérifier

```bash
docker-compose -f docker-compose.prod.yml ps
curl https://votredomaine.com/health
```

---

## Déploiement sur un VPS (étapes complètes)

```bash
# 1. Installer Docker sur Ubuntu
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker

# 2. Cloner le projet
git clone <repo> /opt/cv-scorer
cd /opt/cv-scorer

# 3. Configurer
cp .env.example .env
nano .env  # Renseigner les variables

# 4. Lancer
docker-compose -f docker-compose.prod.yml up -d --build

# 5. Voir les logs
docker-compose -f docker-compose.prod.yml logs -f
```

---

## Variables d'environnement

| Variable | Obligatoire | Description |
|----------|-------------|-------------|
| `ANTHROPIC_API_KEY` | Oui | Clé API Anthropic |
| `DOMAIN` | Prod uniquement | Domaine de l'application |
| `ACME_EMAIL` | Prod uniquement | Email pour Let's Encrypt |

---

## Estimation des coûts API

Modèle utilisé : **Claude Haiku 4.5** (le moins cher)

| Volume | Coût estimé |
|--------|-------------|
| 100 CV | ~0.07 $ |
| 1 000 CV | ~0.65 $ |
| 5 000 CV | ~3.25 $ |
| 10 000 CV | ~6.50 $ |

Utiliser le **Batch API** d'Anthropic pour -50% supplémentaire sur les gros volumes.

---

## Limites & évolutions possibles

- **Taille max fichier** : 50 Mo par upload (configurable dans nginx)
- **Concurrence** : 3 CV traités en parallèle par défaut
- **Formats supportés** : PDF uniquement
- **Évolutions** : authentification (Keycloak/Auth0), stockage des résultats (PostgreSQL), webhook de notification, mode batch pour 1000+ CV

---

## Structure du projet

```
cv-scorer/
├── backend/
│   ├── main.py              # API FastAPI
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── index.js
│   │   └── App.js           # Interface React complète
│   ├── public/index.html
│   ├── nginx.conf           # Nginx interne au container
│   ├── package.json
│   └── Dockerfile
├── nginx/
│   └── default.conf         # Reverse proxy
├── docker-compose.yml       # Développement local
├── docker-compose.prod.yml  # Production HTTPS
├── .env.example
└── README.md
```
