from app.api.evaluations import parse_judge_verdict


def test_verdict_marker_pass():
    assert parse_judge_verdict("The response covers the same guidance.\nVERDICT: PASS") is True


def test_verdict_marker_fail():
    assert parse_judge_verdict("The response misses the escalation step.\nVERDICT: FAIL") is False


def test_verdict_marker_is_case_insensitive():
    assert parse_judge_verdict("looks equivalent\nverdict: pass") is True


def test_verdict_marker_wins_over_conflicting_mention_in_reasoning():
    """The reasoning text may mention both words (e.g. 'this should not
    FAIL') -- the explicit marker line must be the source of truth, not a
    bare substring search over the whole reply."""
    reply = "This should not FAIL just because it's longer.\nVERDICT: PASS"
    assert parse_judge_verdict(reply) is True


def test_falls_back_to_bare_pass_when_marker_missing():
    assert parse_judge_verdict("PASS") is True


def test_falls_back_to_bare_fail_when_marker_missing():
    assert parse_judge_verdict("FAIL") is False


def test_empty_reply_is_not_a_pass():
    assert parse_judge_verdict("") is False
