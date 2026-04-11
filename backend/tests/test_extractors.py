import pytest
import asyncio
from extractors import extract_text, _extract_txt, MAX_TEXT_LENGTH


@pytest.mark.asyncio
async def test_extract_txt_basic():
    content = b"Hello world, this is a test CV."
    result = await extract_text("cv.txt", content)
    assert result == "Hello world, this is a test CV."


@pytest.mark.asyncio
async def test_extract_txt_truncates():
    content = b"A" * (MAX_TEXT_LENGTH + 500)
    result = await extract_text("long.txt", content)
    assert len(result) == MAX_TEXT_LENGTH


@pytest.mark.asyncio
async def test_extract_unsupported_format():
    with pytest.raises(ValueError, match="Format non supporté"):
        await extract_text("file.xyz", b"data")


@pytest.mark.asyncio
async def test_extract_doc_format_rejected():
    """Ensure .doc (old Word format) is rejected since python-docx can't handle it."""
    with pytest.raises(ValueError, match="Format non supporté"):
        await extract_text("old.doc", b"fake doc content")


@pytest.mark.asyncio
async def test_extract_txt_utf8_errors():
    content = b"Valid text \xff\xfe with bad bytes"
    result = await extract_text("messy.txt", content)
    assert "Valid text" in result


def test_extract_txt_sync():
    result = _extract_txt(b"Direct sync test")
    assert result == "Direct sync test"
