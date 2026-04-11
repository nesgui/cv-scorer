import pytest
import json
from unittest.mock import patch, AsyncMock, MagicMock
import httpx

from claude import (
    call_claude,
    close_client,
    _anthropic_json_round,
    _is_prompt_cache_api_error,
    _strip_cache_control_from_messages,
)


@pytest.fixture(autouse=True)
async def cleanup():
    yield
    await close_client()


@pytest.mark.asyncio
async def test_call_claude_success():
    """Test successful Claude API call with valid JSON response."""
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.raise_for_status = MagicMock()
    mock_response.json.return_value = {
        "content": [
            {
                "text": json.dumps(
                    {
                        "score": 82,
                        "nom": "Jean Dupont",
                        "email": "jean@example.com",
                        "telephone": "+33 6 12 34",
                        "niveau": "senior",
                        "annees_experience": 10,
                        "points_forts": ["Python"],
                        "points_faibles": ["Angular"],
                        "competences_cles": ["FastAPI"],
                        "recommandation": "Bon profil",
                        "decision": "oui",
                    }
                )
            }
        ]
    }

    with patch("claude.get_client") as mock_get:
        mock_client = AsyncMock()
        mock_client.post.return_value = mock_response
        mock_get.return_value = mock_client

        result = await call_claude("CV text here", "test.pdf", "Dev Python")
        assert result["score"] == 82
        assert result["nom"] == "Jean Dupont"
        assert result["decision"] == "oui"


@pytest.mark.asyncio
async def test_call_claude_invalid_json():
    """Test Claude API returning non-JSON response."""
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.raise_for_status = MagicMock()
    mock_response.json.return_value = {
        "content": [{"text": "Sorry, I cannot process this."}]
    }

    with patch("claude.get_client") as mock_get:
        mock_client = AsyncMock()
        mock_client.post.return_value = mock_response
        mock_get.return_value = mock_client

        with pytest.raises(ValueError, match="JSON invalide"):
            await call_claude("bad CV", "fail.pdf", "Dev")


@pytest.mark.asyncio
async def test_call_claude_retries_on_429():
    """Test retry logic on rate limit (429)."""
    mock_429 = MagicMock()
    mock_429.status_code = 429

    mock_ok = MagicMock()
    mock_ok.status_code = 200
    mock_ok.raise_for_status = MagicMock()
    mock_ok.json.return_value = {
        "content": [
            {"text": json.dumps({"score": 50, "nom": "Test", "decision": "peut-être"})}
        ]
    }

    with patch("claude.get_client") as mock_get:
        mock_client = AsyncMock()
        mock_client.post.side_effect = [mock_429, mock_ok]
        mock_get.return_value = mock_client

        with patch("claude.RETRY_BACKOFF", [0.01, 0.01, 0.01]):
            result = await call_claude("CV text", "retry.pdf", "Dev")
            assert result["score"] == 50


@pytest.mark.asyncio
async def test_call_claude_400_propagates_anthropic_message():
    """Erreur API 4xx : message Anthropic exposé (ex. crédits insuffisants)."""
    mock_bad = MagicMock()
    mock_bad.status_code = 400
    mock_bad.text = json.dumps(
        {
            "type": "error",
            "error": {
                "type": "invalid_request_error",
                "message": "Your credit balance is too low to access the Anthropic API.",
            },
        }
    )
    mock_bad.raise_for_status.side_effect = httpx.HTTPStatusError(
        "400",
        request=MagicMock(),
        response=mock_bad,
    )
    mock_bad.json = lambda: json.loads(mock_bad.text)

    with patch("claude.get_client") as mock_get:
        mock_client = AsyncMock()
        mock_client.post.return_value = mock_bad
        mock_get.return_value = mock_client

        with pytest.raises(RuntimeError, match="credit balance"):
            await call_claude("CV", "x.pdf", "Dev")


def test_is_prompt_cache_api_error_credit_balance_not_cache():
    assert not _is_prompt_cache_api_error(
        400,
        "Your credit balance is too low to access the Anthropic API.",
        "",
    )


def test_is_prompt_cache_api_error_cache_control():
    assert _is_prompt_cache_api_error(
        400,
        "cache_control.ephemeral is not supported for this model.",
        "",
    )


def test_strip_cache_control_from_messages():
    messages = [
        {
            "role": "user",
            "content": [
                {"type": "text", "text": "cached", "cache_control": {"type": "ephemeral"}},
                {"type": "text", "text": "var"},
            ],
        }
    ]
    _strip_cache_control_from_messages(messages)
    blocks = messages[0]["content"]
    assert "cache_control" not in blocks[0]
    assert blocks[0]["text"] == "cached"


@pytest.mark.asyncio
async def test_prompt_cache_fallback_then_success():
    """400 lié au prompt cache → repli sans cache puis 200."""
    msg_400 = json.dumps(
        {
            "type": "error",
            "error": {
                "type": "invalid_request_error",
                "message": "cache_control is invalid for this endpoint.",
            },
        }
    )
    mock_400 = MagicMock()
    mock_400.status_code = 400
    mock_400.text = msg_400
    mock_400.json = lambda: json.loads(msg_400)

    mock_200 = MagicMock()
    mock_200.status_code = 200
    mock_200.raise_for_status = MagicMock()
    mock_200.json.return_value = {
        "content": [{"text": json.dumps({"score": 71, "nom": "FB", "decision": "peut-être"})}]
    }

    messages = [
        {
            "role": "user",
            "content": [
                {"type": "text", "text": "cached block", "cache_control": {"type": "ephemeral"}},
                {"type": "text", "text": "variable"},
            ],
        }
    ]

    with patch("claude.get_client") as mock_get:
        mock_client = AsyncMock()
        mock_client.post.side_effect = [mock_400, mock_200]
        mock_get.return_value = mock_client

        with patch("claude.CLAUDE_PROMPT_CACHE", True):
            data, _ = await _anthropic_json_round("fb.pdf", messages=messages, phase="single")
        assert data["score"] == 71
        assert mock_client.post.await_count == 2
        second = mock_client.post.await_args_list[1]
        assert "anthropic-beta" not in second.kwargs["headers"]


@pytest.mark.asyncio
async def test_call_claude_retries_on_network_error():
    """Test retry on network timeout."""
    mock_ok = MagicMock()
    mock_ok.status_code = 200
    mock_ok.raise_for_status = MagicMock()
    mock_ok.json.return_value = {
        "content": [{"text": json.dumps({"score": 70, "nom": "Net", "decision": "peut-être"})}]
    }

    with patch("claude.get_client") as mock_get:
        mock_client = AsyncMock()
        mock_client.post.side_effect = [httpx.ReadTimeout("timeout"), mock_ok]
        mock_get.return_value = mock_client

        with patch("claude.RETRY_BACKOFF", [0.01, 0.01, 0.01]):
            result = await call_claude("CV text", "net.pdf", "Dev")
            assert result["score"] == 70
