import os
import logging

# --- Logging ---
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)

# --- API Key ---
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "").strip()

# --- CORS ---
ALLOWED_ORIGINS = os.getenv(
    "ALLOWED_ORIGINS",
    "http://localhost,http://localhost:3000,http://localhost:80",
).split(",")

# --- Rate limiting ---
RATE_LIMIT_PER_MINUTE = int(os.getenv("RATE_LIMIT_PER_MINUTE", "10"))

# --- Auth ---
API_TOKEN = os.getenv("API_TOKEN", "").strip()
# Si true : API_TOKEN obligatoire pour toutes les routes protégées (déploiement exposé)
REQUIRE_API_TOKEN = os.getenv("REQUIRE_API_TOKEN", "").lower() in ("1", "true", "yes")

# --- Claude ---
# Deux passes : extraction factuelle JSON puis scoring (plus stable, + coût latence)
CLAUDE_TWO_PASS = os.getenv("CLAUDE_TWO_PASS", "").lower() in ("1", "true", "yes")

# Cache de prompt Anthropic (en-tête beta) : bloc d’instructions réutilisé = forte baisse des tokens d’entrée (désactiver : 0/false)
CLAUDE_PROMPT_CACHE = os.getenv("CLAUDE_PROMPT_CACHE", "1").lower() not in ("0", "false", "no", "")

# --- Processing ---
MAX_CONCURRENT_DEFAULT = 3
MAX_CONCURRENT_LIMIT = 10
MAX_FILE_SIZE_MB = 50
