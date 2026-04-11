from user_errors import scoring_error_for_user


def test_scoring_error_insufficient_credits_anthropic_message():
    exc = RuntimeError("Your credit balance is too low to access the Anthropic API.")
    code, msg = scoring_error_for_user(exc)
    assert code == "insufficient_credits"
    assert "crédits API Anthropic" in msg
    assert "console.anthropic.com" in msg


def test_scoring_error_generic():
    code, msg = scoring_error_for_user(RuntimeError("Something broke"))
    assert code is None
    assert msg == "Something broke"
