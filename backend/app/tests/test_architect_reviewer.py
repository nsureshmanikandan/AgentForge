"""
Tests for the Agentic Code (Custom Code Export) reviewer-loop hardening
pass: the ast-based static code quality validator, the entrypoint
disambiguation fix, the paired bcrypt pin, and the verify-fix-reverify
reviewer loop. See:
docs/superpowers/specs/2026-07-24-agentic-code-reviewer-agent-design.md
docs/superpowers/specs/2026-07-26-agentic-code-reviewer-agent-v2-design.md

Every bug reproduced here as a synthetic fixture is a real bug confirmed by
downloading and executing an actual generated project, not a hypothetical.
"""
from unittest.mock import AsyncMock, patch

from app.api.architect import (
    _ensure_requirements_complete,
    _fix_dockerfile_entrypoint,
    _resolve_primary_main_py,
    _review_and_fix_generated_code,
    _run_verified_review_loop,
    _static_code_quality_report,
)


MODELS_PY = (
    "from app.database import Base\n"
    "from sqlalchemy.orm import Mapped, mapped_column\n"
    "from sqlalchemy import Integer, String, Text, ForeignKey\n\n"
    "class PolicyDocument(Base):\n"
    "    __tablename__ = \"policy_documents\"\n"
    "    id: Mapped[int] = mapped_column(Integer, primary_key=True)\n"
    "    title: Mapped[str] = mapped_column(String(255))\n\n"
    "class ChatMessage(Base):\n"
    "    __tablename__ = \"chat_messages\"\n"
    "    id: Mapped[int] = mapped_column(Integer, primary_key=True)\n"
    "    session_id: Mapped[int] = mapped_column(Integer)\n"
    "    sender_type: Mapped[str] = mapped_column(String(50))\n"
    "    message_text: Mapped[str] = mapped_column(Text)\n"
)

CONFIG_PY = (
    "from pydantic_settings import BaseSettings\n\n"
    "class Settings(BaseSettings):\n"
    "    DATABASE_URL: str = \"sqlite:///./app.db\"\n"
    "    APP_SECRET_KEY: str = \"change-me\"\n\n"
    "settings = Settings()\n"
)


def _base_project() -> dict:
    """A minimal but internally-consistent backend, used as the clean
    baseline every test mutates from."""
    return {
        "backend/app/database.py": (
            "from sqlalchemy.orm import DeclarativeBase\n\n"
            "class Base(DeclarativeBase):\n"
            "    pass\n"
        ),
        "backend/app/models.py": MODELS_PY,
        "backend/app/config.py": CONFIG_PY,
        "backend/app/main.py": (
            "from fastapi import FastAPI\n"
            "app = FastAPI()\n"
        ),
        "backend/Dockerfile": (
            "FROM python:3.11-slim\n"
            "WORKDIR /app\n"
            "COPY . .\n"
            'CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]\n'
        ),
        "backend/requirements.txt": "fastapi==0.115.8\n",
    }


# ── _static_code_quality_report ─────────────────────────────────────────────

def test_clean_project_reports_no_issues():
    assert _static_code_quality_report(_base_project()) == []


def test_detects_broken_import_of_nonexistent_model():
    """Reproduces the exact confirmed bug: documents.py imports a `Document`
    class that models.py never defines (only `PolicyDocument` exists)."""
    files = _base_project()
    files["backend/app/api/documents.py"] = "from app.models import Document\n"
    issues = _static_code_quality_report(files)
    assert any("Document" in i and "documents.py" in i for i in issues)


def test_detects_schema_mismatch_on_model_constructor():
    """Reproduces the exact confirmed bug: chat.py constructs ChatMessage
    with `role`/`content` kwargs that don't match its real declared fields
    (`sender_type`/`message_text`)."""
    files = _base_project()
    files["backend/app/api/chat.py"] = (
        "from app.models import ChatMessage\n"
        "def save(session_id):\n"
        "    return ChatMessage(session_id=session_id, role=\"user\", content=\"hi\")\n"
    )
    issues = _static_code_quality_report(files)
    assert any("ChatMessage" in i and "role" in i and "content" in i for i in issues)


def test_detects_dead_import_symbol():
    """Reproduces the exact confirmed bug: main.py imports `limiter` from
    chat.py, but chat.py never defines any such name."""
    files = _base_project()
    files["backend/app/api/chat.py"] = "router = None\n"
    files["backend/app/main.py"] += (
        "\nfrom app.api.chat import router as chat_router, limiter as chat_limiter\n"
    )
    issues = _static_code_quality_report(files)
    assert any("limiter" in i and "chat.py" in i for i in issues)


def test_detects_undeclared_settings_field():
    """Reproduces the exact confirmed bug: security.py references
    settings.JWT_SECRET, but config.py's Settings class never declares it."""
    files = _base_project()
    files["backend/app/auth/security.py"] = (
        "from app.config import settings\n"
        "def make_token():\n"
        "    return settings.JWT_SECRET\n"
    )
    issues = _static_code_quality_report(files)
    assert any("JWT_SECRET" in i and "security.py" in i for i in issues)


def test_detects_duplicate_entrypoint():
    """Reproduces the exact confirmed bug: a stray flat backend/main.py
    coexists with the real backend/app/main.py."""
    files = _base_project()
    files["backend/main.py"] = "from app.api import decisions\n"
    issues = _static_code_quality_report(files)
    assert any("competing FastAPI entrypoints" in i for i in issues)


def test_detects_dockerfile_cmd_mismatch():
    files = _base_project()
    files["backend/Dockerfile"] = files["backend/Dockerfile"].replace(
        '"app.main:app"', '"main:app"'
    )
    issues = _static_code_quality_report(files)
    assert any("Dockerfile" in i and "ModuleNotFoundError" in i for i in issues)


def test_never_raises_on_unparseable_python():
    """A single malformed file must degrade gracefully, not crash the whole
    generation pipeline."""
    files = _base_project()
    files["backend/app/api/broken.py"] = "def f(:\n    this is not python\n"
    issues = _static_code_quality_report(files)  # must not raise
    assert isinstance(issues, list)


# ── _resolve_primary_main_py ────────────────────────────────────────────────

def test_resolve_primary_main_py_dedupes_stray_entrypoint():
    files = {
        "backend/app/main.py": "canonical",
        "backend/main.py": "stray",
    }
    resolved = _resolve_primary_main_py(files)
    assert resolved == "backend/app/main.py"
    assert "backend/main.py" not in files
    assert "backend/app/main.py" in files


def test_resolve_primary_main_py_single_canonical():
    files = {"backend/app/main.py": "x"}
    assert _resolve_primary_main_py(files) == "backend/app/main.py"


def test_resolve_primary_main_py_falls_back_to_stray_alone():
    files = {"backend/main.py": "x"}
    assert _resolve_primary_main_py(files) == "backend/main.py"


def test_resolve_primary_main_py_none_when_neither_exists():
    assert _resolve_primary_main_py({"backend/app/config.py": "x"}) is None


# ── _fix_dockerfile_entrypoint ──────────────────────────────────────────────

def test_fix_dockerfile_entrypoint_rewrites_wrong_module():
    files = _base_project()
    files["backend/Dockerfile"] = files["backend/Dockerfile"].replace(
        '"app.main:app"', '"main:app"'
    )
    fixed = _fix_dockerfile_entrypoint(files)
    assert '"app.main:app"' in fixed["backend/Dockerfile"]


def test_fix_dockerfile_entrypoint_is_idempotent_on_correct_cmd():
    files = _base_project()
    before = files["backend/Dockerfile"]
    fixed = _fix_dockerfile_entrypoint(files)
    assert fixed["backend/Dockerfile"] == before


# ── bcrypt/passlib pairing ───────────────────────────────────────────────────

def test_ensure_requirements_pairs_bcrypt_with_passlib():
    """Reproduces the exact confirmed bug: passlib[bcrypt]==1.7.4 present
    with no bcrypt pin crashes on the first password hash against any
    modern bcrypt a fresh `pip install` resolves to."""
    files = {"backend/requirements.txt": "fastapi==0.115.8\npasslib[bcrypt]==1.7.4\n"}
    fixed = _ensure_requirements_complete(files)
    assert "bcrypt==4.0.1" in fixed["backend/requirements.txt"]


def test_ensure_requirements_does_not_duplicate_existing_bcrypt_pin():
    files = {
        "backend/requirements.txt": (
            "fastapi==0.115.8\npasslib[bcrypt]==1.7.4\nbcrypt==4.0.1\n"
        )
    }
    fixed = _ensure_requirements_complete(files)
    assert fixed["backend/requirements.txt"].count("bcrypt==") == 1


def test_ensure_requirements_no_bcrypt_added_without_passlib():
    files = {"backend/requirements.txt": "fastapi==0.115.8\n"}
    fixed = _ensure_requirements_complete(files)
    assert "bcrypt" not in fixed["backend/requirements.txt"]


# ── _run_verified_review_loop ───────────────────────────────────────────────

async def test_review_loop_skips_llm_call_when_already_clean():
    """No cost, no latency for the common case where nothing is wrong."""
    mock_client = AsyncMock()
    with patch("app.api.architect._review_and_fix_generated_code") as mock_review:
        result = await _run_verified_review_loop(
            _base_project(), mock_client, "gpt-4o", "max_tokens", "TestApp", "A test app",
        )
    mock_review.assert_not_called()
    assert result == _base_project()


async def test_review_loop_calls_reviewer_with_known_issues_then_reverifies():
    files = _base_project()
    files["backend/app/api/documents.py"] = "from app.models import Document\n"

    async def fake_review(all_files, client, llm_model, tok_kwarg, known_issues=None):
        # Simulate the LLM correctly fixing the confirmed bug it was told about.
        assert known_issues and any("Document" in i for i in known_issues)
        all_files["backend/app/api/documents.py"] = "from app.models import PolicyDocument\n"
        return all_files

    with patch(
        "app.api.architect._review_and_fix_generated_code", side_effect=fake_review
    ) as mock_review:
        result = await _run_verified_review_loop(
            files, AsyncMock(), "gpt-4o", "max_tokens", "TestApp", "A test app",
        )

    assert mock_review.call_count == 1  # resolved after one iteration, no need for a second
    assert _static_code_quality_report(result) == []


async def test_review_loop_stops_early_when_no_progress_made():
    """If an LLM pass doesn't change the outstanding issue set at all,
    a second identical call is pointless -- stop instead of burning another
    round-trip on a bug the reviewer already failed to fix once."""
    files = _base_project()
    files["backend/app/api/documents.py"] = "from app.models import Document\n"

    async def no_op_review(all_files, client, llm_model, tok_kwarg, known_issues=None):
        return all_files  # reviewer "tries" but changes nothing

    with patch(
        "app.api.architect._review_and_fix_generated_code", side_effect=no_op_review
    ) as mock_review:
        result = await _run_verified_review_loop(
            files, AsyncMock(), "gpt-4o", "max_tokens", "TestApp", "A test app", max_iterations=5,
        )

    mock_review.assert_called_once()  # stopped after iteration 1, not all 5
    assert len(_static_code_quality_report(result)) == 1


# ── _review_and_fix_generated_code known_issues wiring ──────────────────────

async def test_review_and_fix_embeds_known_issues_in_prompt():
    files = _base_project()
    mock_client = AsyncMock()
    mock_response = AsyncMock()
    mock_response.choices = [AsyncMock(message=AsyncMock(content='{"files": {}}'))]

    with patch("asyncio.to_thread", new=AsyncMock(return_value=mock_response)) as mock_thread:
        await _review_and_fix_generated_code(
            files, mock_client, "gpt-4o", "max_tokens",
            known_issues=["documents.py: imports 'Document' but it doesn't exist"],
        )

    sent_prompt = mock_thread.call_args.kwargs["messages"][0]["content"]
    assert "CONFIRMED BUGS" in sent_prompt
    assert "Document" in sent_prompt


async def test_review_and_fix_survives_llm_failure_unchanged():
    files = _base_project()
    with patch("asyncio.to_thread", side_effect=RuntimeError("network blip")):
        result = await _review_and_fix_generated_code(
            dict(files), AsyncMock(), "gpt-4o", "max_tokens", known_issues=["something"],
        )
    assert result == files
