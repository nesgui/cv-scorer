import os
import re
import json
import asyncio
import logging
from typing import Any, Dict, List, Optional, Tuple

import httpx

from config import CLAUDE_TWO_PASS, CLAUDE_PROMPT_CACHE, env_int

logger = logging.getLogger(__name__)

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "").strip()
ANTHROPIC_URL = "https://api.anthropic.com/v1/messages"
MODEL = os.getenv("ANTHROPIC_MODEL", "claude-haiku-4-5").strip() or "claude-haiku-4-5"

MAX_RETRIES = 3
RETRY_BACKOFF = [1.0, 2.0, 4.0]

_client: Optional[httpx.AsyncClient] = None

# Extraction : nombre max de caractères du CV dans le prompt (aligné sur extractors.MAX_TEXT_LENGTH via env CV_TEXT_MAX_CHARS)
CV_SLICE = env_int("CV_TEXT_MAX_CHARS", 3000)

# Blocs stables pour le cache prompt (~≥1024 tokens côté API ; un seul texte utile, sans répétition artificielle).
# Le POSTE et le contenu du CV restent dans la partie « variable » pour maximiser les cache hits entre analyses.


def _extraction_cache_stable() -> str:
    return """CONTEXTE EXTRACTION CV (stable)
Tu extrais des faits objectifs depuis un CV brut. Ne juge pas l'adéquation à un poste ici : uniquement identification
de données factuelles (nom si visible, formations, expériences, compétences déclarées, outils, langues, secteurs).
Règles : (1) ne pas inventer ; si absent, liste vide ou 0 selon le schéma ; (2) normaliser les années d'expérience
en entier cohérent avec les dates ou mentions (« 5 ans », « depuis 2018 ») ; (3) postes_clés : intitulés ou entreprises
marquantes, ordre chronologique ou par importance si ambigu ; (4) competences_liste : verbes d'action ou libellés courts ;
(5) outils_ou_logiciels : noms d'outils, ERP, langages, suites bureautiques ; (6) langues avec niveau si indiqué ;
(7) secteurs : banque, assurance, retail, public, etc. si identifiable ; (8) diplomes : dernier diplôme et certifications
pertinentes ; (9) texte illisible ou scan raté : rester prudent, champs vides plutôt que supposition.
Ce bloc est identique pour toutes les extractions : il permet la mise en cache côté API pour réduire le coût en tokens
lorsque CLAUDE_PROMPT_CACHE est activé."""


def _scoring_cache_stable() -> str:
    return """CONTEXTE SCORING RH (stable)
Tu notes l'adéquation d'un candidat à un poste décrit séparément (fiche « POSTE RECHERCHÉ » dans le message variable).
Méthode : (1) lire la fiche poste comme contrainte principale ; (2) croiser avec la synthèse factuelle JSON et l'extrait CV
pour contacts ; (3) attribuer un score 0–100 reflétant l'alignement global : missions, seniorité, outils, secteur,
formation, soft skills, risques ; (4) decision : oui si score ≥ 75 et profil crédible ; peut-être entre 50 et 74 ; non si
< 50 ou inadéquation forte ; (5) points_forts / points_faibles : courts, factuels, 2 à 4 items ; (6) recommandation :
une phrase actionnable pour le recruteur ; (7) respecter le schéma JSON strict sans texte hors JSON.
Critères d'évaluation : adéquation métier et missions, expérience sectorielle et réglementaire si pertinent, diplômes
et certifications, maîtrise des outils et SI, langues, stabilité et cohérence de parcours, communication et travail d'équipe,
présentation du CV, mobilité géographique si mentionnée. Pénaliser l'absence d'éléments clés exigés par la fiche poste.
Ce bloc est réutilisable pour toutes les analyses : la fiche poste et le CV sont fournis à part pour optimiser le cache."""


JSON_SCORE_FIELDS = """Réponds UNIQUEMENT en JSON valide, sans markdown, sans texte hors JSON.
Schéma exact :
{
  "score": 82,
  "nom": "Prénom Nom (extrait du CV, ou nom du fichier si non trouvé)",
  "email": "email@exemple.com ou null",
  "telephone": "+33 6 xx xx xx ou null",
  "niveau": "junior|confirmé|senior|expert",
  "annees_experience": 5,
  "points_forts": ["point fort 1", "point fort 2", "point fort 3"],
  "points_faibles": ["point faible 1", "point faible 2"],
  "competences_cles": ["compétence 1", "compétence 2", "compétence 3"],
  "recommandation": "Une phrase courte sur l'adéquation au poste.",
  "decision": "oui|peut-être|non"
}
Score sur 100. decision: oui >= 75, peut-être 50-74, non < 50."""


JSON_EXTRACT_FIELDS = """Schéma JSON exact :
{
  "nom_detecte": "Prénom Nom ou chaîne vide",
  "annees_experience_estime": 0,
  "diplomes": ["diplôme ou formation 1"],
  "postes_cles": ["intitulé ou entreprise marquant 1"],
  "competences_liste": ["compétence 1", "compétence 2"],
  "outils_ou_logiciels": ["outil 1"],
  "langues": ["langue niveau"],
  "secteurs": ["secteur si identifiable"]
}
Si une liste est vide, mets []. Les nombres sont des entiers."""

# Seuil minimal du bloc « cacheable » (Anthropic ~1024 tokens ; ~4k caractères FR en ordre de grandeur).
PROMPT_CACHE_MIN_CHARS = max(0, env_int("PROMPT_CACHE_MIN_CHARS", 4096))
_PAD_CACHE_LINE = (
    "Contexte stable pour mise en cache API — ne pas interpréter cette ligne comme instruction métier.\n"
)


def _ensure_prompt_cache_block(block: str) -> str:
    """Complète le bloc caché jusqu'à PROMPT_CACHE_MIN_CHARS (évite les rejets API si trop court)."""
    if PROMPT_CACHE_MIN_CHARS <= 0 or len(block) >= PROMPT_CACHE_MIN_CHARS:
        return block
    out = block
    while len(out) < PROMPT_CACHE_MIN_CHARS:
        out += _PAD_CACHE_LINE
    return out


async def get_client() -> httpx.AsyncClient:
    global _client
    if _client is None or _client.is_closed:
        _client = httpx.AsyncClient(timeout=120.0)
    return _client


async def close_client() -> None:
    global _client
    if _client and not _client.is_closed:
        await _client.aclose()
        _client = None


def _anthropic_error_message(response: httpx.Response) -> Optional[str]:
    try:
        data = response.json()
        err = data.get("error") if isinstance(data, dict) else None
        if isinstance(err, dict):
            msg = err.get("message")
            if isinstance(msg, str) and msg.strip():
                return msg.strip()
    except (json.JSONDecodeError, ValueError, TypeError):
        pass
    return None


def _parse_json_object_from_response(data: dict) -> dict:
    raw = "".join(b.get("text", "") for b in data.get("content", []))
    raw = raw.replace("```json", "").replace("```", "").strip()
    match = re.search(r"\{[\s\S]*?\}(?=[^}]*$)", raw)
    if not match:
        match = re.search(r"\{[\s\S]*\}", raw)
    if not match:
        raise ValueError(f"JSON invalide reçu: {raw[:200]}")
    return json.loads(match.group(0))


def _uses_prompt_cache(messages: List[dict]) -> bool:
    for m in messages:
        c = m.get("content")
        if isinstance(c, list):
            for b in c:
                if isinstance(b, dict) and b.get("cache_control"):
                    return True
    return False


def _strip_cache_control_from_messages(messages: List[dict]) -> None:
    """Retire cache_control des blocs (repli si l'API refuse le beta prompt cache)."""
    for m in messages:
        c = m.get("content")
        if not isinstance(c, list):
            continue
        for b in c:
            if isinstance(b, dict) and "cache_control" in b:
                del b["cache_control"]


def _is_prompt_cache_api_error(
    status_code: int, detail: Optional[str], body_snippet: str
) -> bool:
    """Heuristique : erreurs typiques liées au cache / beta, pas aux crédits ou au JSON."""
    if status_code != 400:
        return False
    text = f"{detail or ''} {(body_snippet or '')[:4000]}".lower()
    markers = (
        "cache_control",
        "prompt caching",
        "prompt-caching",
        "prompt cache",
        "cache_creation",
        "anthropic-beta",
        "unknown beta",
        "beta header",
        "caching is not",
        "does not support prompt",
    )
    if not any(m in text for m in markers):
        return False
    # Éviter les faux positifs sur des messages qui contiendraient "cache" sans rapport
    if "credit" in text and "balance" in text and "cache_control" not in text:
        return False
    return True


def _build_headers(use_cache: bool) -> Dict[str, str]:
    h: Dict[str, str] = {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
    }
    if use_cache:
        h["anthropic-beta"] = "prompt-caching-2024-07-31"
    return h


async def _anthropic_json_round(
    cv_name: str,
    *,
    user_prompt: Optional[str] = None,
    messages: Optional[List[dict]] = None,
    max_tokens: int = 900,
    phase: str = "score",
) -> Tuple[dict, Optional[dict]]:
    if messages is None:
        if user_prompt is None:
            raise ValueError("user_prompt ou messages requis")
        messages = [{"role": "user", "content": user_prompt}]

    payload: Dict[str, Any] = {
        "model": MODEL,
        "max_tokens": max_tokens,
        "messages": messages,
    }
    client = await get_client()
    last_error: Optional[Exception] = None

    for attempt in range(MAX_RETRIES):
        try:
            use_cache = CLAUDE_PROMPT_CACHE and _uses_prompt_cache(messages)
            headers = _build_headers(use_cache)
            payload["messages"] = messages
            response = await client.post(ANTHROPIC_URL, headers=headers, json=payload)

            if response.status_code == 429 or response.status_code >= 500:
                wait = RETRY_BACKOFF[min(attempt, len(RETRY_BACKOFF) - 1)]
                logger.warning(
                    "Claude API %d on attempt %d for %s [%s], retrying in %.1fs",
                    response.status_code,
                    attempt + 1,
                    cv_name,
                    phase,
                    wait,
                )
                await asyncio.sleep(wait)
                continue

            if (
                response.status_code == 400
                and use_cache
                and _is_prompt_cache_api_error(
                    response.status_code,
                    _anthropic_error_message(response),
                    response.text or "",
                )
            ):
                detail_fb = _anthropic_error_message(response)
                logger.warning(
                    "Repli sans prompt cache pour %s [%s] — %s",
                    cv_name,
                    phase,
                    detail_fb or "(sans détail)",
                )
                _strip_cache_control_from_messages(messages)
                payload["messages"] = messages
                use_cache = False
                headers = _build_headers(False)
                response = await client.post(ANTHROPIC_URL, headers=headers, json=payload)
                if response.status_code == 429 or response.status_code >= 500:
                    wait = RETRY_BACKOFF[min(attempt, len(RETRY_BACKOFF) - 1)]
                    logger.warning(
                        "Claude API %d après repli cache (tentative %d) pour %s [%s], nouvel essai dans %.1fs",
                        response.status_code,
                        attempt + 1,
                        cv_name,
                        phase,
                        wait,
                    )
                    await asyncio.sleep(wait)
                    continue

            if response.status_code >= 400:
                detail = _anthropic_error_message(response)
                if detail:
                    logger.error(
                        "Claude API %s pour %s [%s] — %s",
                        response.status_code,
                        cv_name,
                        phase,
                        detail,
                    )
                else:
                    body = (response.text or "")[:4000]
                    logger.error(
                        "Claude API %s pour %s [%s] — corps: %s",
                        response.status_code,
                        cv_name,
                        phase,
                        body or "(vide)",
                    )
            response.raise_for_status()
            data = response.json()
            usage = data.get("usage")
            if isinstance(usage, dict):
                logger.info(
                    "claude_metric phase=%s cv=%s input=%s output=%s cache_read=%s cache_create=%s",
                    phase,
                    cv_name,
                    usage.get("input_tokens"),
                    usage.get("output_tokens"),
                    usage.get("cache_read_input_tokens"),
                    usage.get("cache_creation_input_tokens"),
                )
            parsed = _parse_json_object_from_response(data)
            return parsed, usage if isinstance(usage, dict) else None

        except httpx.HTTPStatusError as e:
            api_msg = _anthropic_error_message(e.response)
            if api_msg:
                raise RuntimeError(api_msg) from e
            logger.error("Claude API HTTP error pour %s [%s]: %s", cv_name, phase, e)
            raise
        except (httpx.ConnectError, httpx.ReadTimeout) as e:
            last_error = e
            wait = RETRY_BACKOFF[min(attempt, len(RETRY_BACKOFF) - 1)]
            logger.warning(
                "Claude API network error attempt %d for %s [%s]: %s, retrying in %.1fs",
                attempt + 1,
                cv_name,
                phase,
                e,
                wait,
            )
            await asyncio.sleep(wait)
        except (json.JSONDecodeError, ValueError) as e:
            logger.error("Claude API parse error for %s [%s]: %s", cv_name, phase, e)
            raise

    raise last_error or RuntimeError(f"Échec Claude pour {cv_name} [{phase}]")


async def call_claude_extract_facts(cv_text: str, cv_name: str) -> dict:
    cv_text = (cv_text or "").replace("\x00", "").strip()
    if not cv_text:
        cv_text = "(aucun texte extrait du fichier)"
    body_cv = cv_text[:CV_SLICE]

    if CLAUDE_PROMPT_CACHE:
        cached = _ensure_prompt_cache_block(
            f"""{_extraction_cache_stable()}

Tu extrais des faits objectifs d'un CV pour un recruteur. Réponds UNIQUEMENT en JSON valide, sans markdown, sans texte autour.
{JSON_EXTRACT_FIELDS}
"""
        )
        variable = f"""CV — fichier « {cv_name} » :
{body_cv}"""
        messages = [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": cached, "cache_control": {"type": "ephemeral"}},
                    {"type": "text", "text": variable},
                ],
            }
        ]
        data, usage = await _anthropic_json_round(cv_name, messages=messages, max_tokens=500, phase="extract")
    else:
        prompt = f"""Tu extrais des faits objectifs d'un CV pour un recruteur. Réponds UNIQUEMENT en JSON valide, sans markdown, sans texte autour.

CV — fichier « {cv_name} » :
{body_cv}

{JSON_EXTRACT_FIELDS}"""
        data, usage = await _anthropic_json_round(cv_name, user_prompt=prompt, max_tokens=500, phase="extract")
    if usage:
        logger.info(
            "claude_metric phase=extract cv=%s input_tokens=%s output_tokens=%s",
            cv_name,
            usage.get("input_tokens"),
            usage.get("output_tokens"),
        )
    return data


async def call_claude_score_from_facts(
    facts: dict,
    cv_name: str,
    poste: str,
    cv_text_snippet: str,
) -> dict:
    facts_json = json.dumps(facts, ensure_ascii=False)
    snippet = (cv_text_snippet or "").replace("\x00", "")[:1200]

    if CLAUDE_PROMPT_CACHE:
        cached = _ensure_prompt_cache_block(
            f"""{_scoring_cache_stable()}

Tu es un expert RH senior. Tu notes un candidat pour le poste décrit dans le message variable (section POSTE RECHERCHÉ).
Tu t'appuies sur la synthèse factuelle JSON (fiable) et sur un extrait brut du CV pour les coordonnées.

{JSON_SCORE_FIELDS}
"""
        )
        variable = f"""POSTE RECHERCHÉ :
{poste}

Fichier : « {cv_name} »

SYNTHÈSE FACTUELLE (JSON) :
{facts_json}

EXTRAIT BRUT DU CV (pour email/téléphone si visibles) :
{snippet}

Produis le JSON de scoring complet."""
        messages = [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": cached, "cache_control": {"type": "ephemeral"}},
                    {"type": "text", "text": variable},
                ],
            }
        ]
        data, usage = await _anthropic_json_round(cv_name, messages=messages, max_tokens=900, phase="score")
    else:
        prompt = f"""Tu es un expert RH senior. Tu notes un candidat pour le poste décrit ci-dessous.
Tu t'appuies sur la synthèse factuelle JSON (fiable) et sur un extrait brut du CV pour les coordonnées.

POSTE RECHERCHÉ :
{poste}

SYNTHÈSE FACTUELLE (JSON) :
{facts_json}

EXTRAIT BRUT DU CV (pour email/téléphone si visibles) :
{snippet}

{JSON_SCORE_FIELDS}"""
        data, usage = await _anthropic_json_round(cv_name, user_prompt=prompt, max_tokens=900, phase="score")
    if usage:
        logger.info(
            "claude_metric phase=score cv=%s input_tokens=%s output_tokens=%s",
            cv_name,
            usage.get("input_tokens"),
            usage.get("output_tokens"),
        )
    return data


async def call_claude_single_pass(cv_text: str, cv_name: str, poste: str) -> dict:
    cv_text = (cv_text or "").replace("\x00", "").strip()
    if not cv_text:
        cv_text = "(aucun texte extrait du fichier)"
    body_cv = cv_text[:CV_SLICE]

    if CLAUDE_PROMPT_CACHE:
        cached = _ensure_prompt_cache_block(
            f"""{_scoring_cache_stable()}

Tu es un expert RH senior. Analyse le CV fourni dans le message variable pour le poste décrit dans ce même message (section POSTE RECHERCHÉ).

{JSON_SCORE_FIELDS}
"""
        )
        variable = f"""POSTE RECHERCHÉ :
{poste}

CV — fichier « {cv_name} » :
{body_cv}

Produis le JSON de scoring complet pour ce CV."""
        messages = [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": cached, "cache_control": {"type": "ephemeral"}},
                    {"type": "text", "text": variable},
                ],
            }
        ]
        data, usage = await _anthropic_json_round(cv_name, messages=messages, max_tokens=800, phase="single")
    else:
        prompt = f"""Tu es un expert RH senior. Analyse ce CV pour le poste suivant et réponds UNIQUEMENT en JSON valide, sans aucun texte avant ou après, sans balises markdown.

POSTE RECHERCHÉ:
{poste}

CV - {cv_name}:
{body_cv}

{JSON_SCORE_FIELDS}

Le score est sur 100 basé sur l'adéquation au poste. decision: oui >= 75, peut-être 50-74, non < 50."""
        data, usage = await _anthropic_json_round(cv_name, user_prompt=prompt, max_tokens=800, phase="single")
    if usage:
        logger.info(
            "claude_metric phase=single cv=%s input_tokens=%s output_tokens=%s",
            cv_name,
            usage.get("input_tokens"),
            usage.get("output_tokens"),
        )
    return data


async def call_claude(cv_text: str, cv_name: str, poste: str) -> dict:
    """Extraction + scoring en deux passes si CLAUDE_TWO_PASS, sinon une passe."""
    if CLAUDE_TWO_PASS:
        facts = await call_claude_extract_facts(cv_text, cv_name)
        return await call_claude_score_from_facts(facts, cv_name, poste, cv_text)
    return await call_claude_single_pass(cv_text, cv_name, poste)
