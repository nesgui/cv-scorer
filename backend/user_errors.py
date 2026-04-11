"""Messages utilisateur pour erreurs d'analyse (ex. crédits API)."""
from typing import Optional, Tuple

_MSG_CREDITS = (
    "Les crédits API Anthropic sont insuffisants ou épuisés. L’analyse ne peut pas continuer. "
    "Rechargez le compte sur https://console.anthropic.com ou contactez l’administrateur de l’application."
)


def scoring_error_for_user(exc: BaseException) -> Tuple[Optional[str], str]:
    """
    Retourne (code, message) avec code non None pour les cas connus (ex. crédits).
    Sinon message = str(exc) pour affichage brut.
    """
    raw = str(exc).strip()
    low = raw.lower()
    markers = (
        "credit balance",
        "too low to access the anthropic api",
        "too low to access",
        "insufficient credits",
        "billing",
        "payment required",
        "exceeded your included usage",
        "usage limit",
        "spend limit",
    )
    if any(m in low for m in markers):
        return ("insufficient_credits", _MSG_CREDITS)
    return (None, raw)
