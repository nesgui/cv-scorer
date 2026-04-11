import pytest
import asyncio
from extractors import extract_text, _extract_txt, MAX_TEXT_LENGTH


def test_extract_txt_helpers_basic():
    content = b"Hello world, this is a test CV."
    result = _extract_txt(content)
    assert result == "Hello world, this is a test CV."


def test_extract_txt_helpers_truncates():
    content = b"A" * (MAX_TEXT_LENGTH + 500)
    result = _extract_txt(content)
    assert len(result) == MAX_TEXT_LENGTH


@pytest.mark.asyncio
async def test_extract_unsupported_format():
    with pytest.raises(ValueError, match="seuls les fichiers PDF"):
        await extract_text("file.xyz", b"data")


@pytest.mark.asyncio
async def test_extract_doc_format_rejected():
    """Seuls les .pdf sont acceptés pour l'analyse."""
    with pytest.raises(ValueError, match="seuls les fichiers PDF"):
        await extract_text("old.doc", b"fake doc content")


def test_extract_txt_utf8_errors():
    content = b"Valid text \xff\xfe with bad bytes"
    result = _extract_txt(content)
    assert "Valid text" in result


def test_extract_txt_sync():
    result = _extract_txt(b"Direct sync test")
    assert result == "Direct sync test"
