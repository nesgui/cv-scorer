import io
import os
import asyncio
import logging

import pdfplumber

logger = logging.getLogger(__name__)

# Limite de caractères extraits du CV (entrée modèle) — réduire pour économiser des tokens
MAX_TEXT_LENGTH = int(os.getenv("CV_TEXT_MAX_CHARS", "3000"))


def _extract_pdf(content: bytes) -> str:
    """Synchronous PDF text extraction (run via to_thread)."""
    try:
        with pdfplumber.open(io.BytesIO(content)) as pdf:
            pages = []
            for page in pdf.pages[:8]:
                text = page.extract_text()
                if text:
                    pages.append(text)
            return "\n".join(pages)[:MAX_TEXT_LENGTH]
    except Exception as e:
        logger.error("PDF extraction failed: %s", e)
        raise ValueError(f"Erreur extraction PDF: {e}") from e


def _extract_txt(content: bytes) -> str:
    return content.decode("utf-8", errors="ignore")[:MAX_TEXT_LENGTH]


async def extract_text(filename: str, content: bytes) -> str:
    """Extraction du texte depuis un PDF uniquement (délégation synchrone dans un thread)."""
    ext = filename.lower().rsplit(".", 1)[-1] if "." in filename else ""
    if ext != "pdf":
        raise ValueError("Format non supporté : seuls les fichiers PDF (.pdf) sont acceptés.")
    return await asyncio.to_thread(_extract_pdf, content)
