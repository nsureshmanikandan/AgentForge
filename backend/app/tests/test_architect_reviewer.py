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
    _dedupe_tablename_collisions,
    _ensure_requirements_complete,
    _fix_database_url_scheme_drift,
    _fix_dead_telemetry,
    _fix_dockerfile_entrypoint,
    _fix_dockerfile_expose_port,
    _fix_json_response_format_missing_keyword,
    _fix_missing_logging_config,
    _format_database_schema_for_prompt,
    _format_phase_coverage_instruction,
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
            "from dotenv import load_dotenv\n"
            "load_dotenv()\n"
            "import logging\n"
            "logging.basicConfig(level=logging.INFO)\n"
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


async def test_review_loop_runs_for_phase_coverage_even_when_static_check_is_clean():
    """Phase tasks are free text, so there's no static AST fact to check --
    but plan_phases must still trigger one reviewer pass (skipped entirely
    when neither expected_agents nor plan_phases is given, per the
    already-clean-project test above)."""
    plan_phases = [{"phase": 1, "name": "Foundation", "tasks": ["Set up auth", "Create Users table"]}]

    async def fake_review(all_files, client, llm_model, tok_kwarg, known_issues=None):
        assert known_issues and any("Foundation" in i for i in known_issues)
        assert any("Set up auth" in i for i in known_issues)
        return all_files  # LLM reviewer itself makes no changes

    with patch(
        "app.api.architect._review_and_fix_generated_code", side_effect=fake_review
    ) as mock_review:
        result = await _run_verified_review_loop(
            _base_project(), AsyncMock(), "gpt-4o", "max_tokens", "TestApp", "A test app",
            plan_phases=plan_phases,
        )

    # The one required assertion here is that the phase note alone (with no
    # static issues at all) was enough to trigger a reviewer pass -- not that
    # the files end up byte-identical, since _rerun_deterministic_fixups
    # (e.g. injecting a health-check route) always runs once per iteration
    # regardless of what the mocked LLM reviewer itself did.
    mock_review.assert_called_once()
    assert _static_code_quality_report(result) == []


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


async def test_review_and_fix_prioritizes_all_api_route_files_over_misc_files():
    """Reproduces a real bug found via live gpt-5-mini testing: an
    unwired-agent-method issue named roadmap.py/progress.py as the files
    needing a new call added, but the reviewer's file-selection budget only
    prioritized a few specifically-named files (chat.py, documents.py, ...)
    -- any other /api/ route file sorted after generic misc files and could
    get truncated out of the prompt entirely, making the bug unfixable
    (the reviewer can't edit a file it was never shown). Any /api/ route
    file must now outrank non-route files regardless of its literal name."""
    files = _base_project()
    files["backend/app/agents/CareerCoachingAgent.py"] = (
        "class CareerCoachingAgent:\n"
        "    def generate_roadmap(self, p, m): return {}\n"
    )
    # A large misc (non-route, non-priority-named) file that would consume
    # most of the budget if the priority ordering didn't rank api/ files first.
    files["backend/app/misc_notes.py"] = "# padding\n" + ("x = 1\n" * 4000)
    files["backend/app/api/roadmap.py"] = (
        "from app.agents.CareerCoachingAgent import CareerCoachingAgent\n"
        "def get_roadmap(profile_id): return {}\n"  # doesn't call generate_roadmap yet
    )

    mock_client = AsyncMock()
    mock_response = AsyncMock()
    mock_response.choices = [AsyncMock(message=AsyncMock(content='{"files": {}}'))]

    with patch("asyncio.to_thread", new=AsyncMock(return_value=mock_response)) as mock_thread:
        await _review_and_fix_generated_code(
            files, mock_client, "gpt-4o", "max_tokens",
            known_issues=["Agent method CareerCoachingAgent.generate_roadmap is defined but never called"],
        )

    sent_prompt = mock_thread.call_args.kwargs["messages"][0]["content"]
    assert "app/api/roadmap.py" in sent_prompt or "backend/app/api/roadmap.py" in sent_prompt


async def test_review_and_fix_survives_llm_failure_unchanged():
    files = _base_project()
    with patch("asyncio.to_thread", side_effect=RuntimeError("network blip")):
        result = await _review_and_fix_generated_code(
            dict(files), AsyncMock(), "gpt-4o", "max_tokens", known_issues=["something"],
        )
    assert result == files


# ── v3: agent-pipeline completeness ──────────────────────────────────────────
# docs/superpowers/specs/2026-07-28-agentic-code-reviewer-agent-v3-pipeline-completeness-design.md

def test_pipeline_completeness_flags_unwired_agent_classes():
    """Reproduces the confirmed research-engine bug: 5 separate agent
    classes, only the first (Coordinator) ever called from a route."""
    files = _base_project()
    files["backend/app/agents/ResearchCoordinatorAgent.py"] = (
        "class ResearchCoordinatorAgent:\n    def define_scope(self, topic): return {}\n"
    )
    files["backend/app/agents/WebSearchAgent.py"] = (
        "class WebSearchAgent:\n    def search(self, query): return {}\n"
    )
    files["backend/app/agents/SynthesisAgent.py"] = (
        "class SynthesisAgent:\n    def synthesize(self, findings): return {}\n"
    )
    files["backend/app/agents/CitationValidatorAgent.py"] = (
        "class CitationValidatorAgent:\n    def validate(self, claims): return {}\n"
    )
    files["backend/app/agents/ReportWriterAgent.py"] = (
        "class ReportWriterAgent:\n    def write_report(self, context): return {}\n"
    )
    files["backend/app/api/research_runs.py"] = (
        "from app.agents.ResearchCoordinatorAgent import ResearchCoordinatorAgent\n"
        "def create_run(topic):\n"
        "    agent = ResearchCoordinatorAgent()\n"
        "    return agent.define_scope(topic)\n"
    )
    issues = _static_code_quality_report(files)
    unwired = [i for i in issues if "never called from any API route" in i]
    assert len(unwired) == 4
    assert any("WebSearchAgent.search" in i for i in unwired)
    assert any("SynthesisAgent.synthesize" in i for i in unwired)
    assert any("CitationValidatorAgent.validate" in i for i in unwired)
    assert any("ReportWriterAgent.write_report" in i for i in unwired)
    assert not any("define_scope" in i for i in unwired)


def test_pipeline_completeness_flags_unwired_methods_on_single_class():
    """Reproduces the confirmed recruitment-app bug: one agent class with 5
    domain methods, only 2 ever called -- the shape that motivated checking
    at the method level instead of matching classes to tables, since 2 of
    the 3 unwired methods here still have their DB table written to via
    plain manual CRUD that bypasses the agent entirely."""
    files = _base_project()
    files["backend/app/agents/RecruitmentPipelineAgent.py"] = (
        "class RecruitmentPipelineAgent:\n"
        "    def analyze_resume_batch(self, jd, resumes): return {}\n"
        "    def score_candidate(self, profile): return {}\n"
        "    def propose_interview_slots(self, name, constraints): return {}\n"
        "    def collect_feedback_summary(self, text): return {}\n"
        "    def generate_hiring_report(self, context): return {}\n"
        "    def answer_question(self, question, history=None): return {}\n"
    )
    files["backend/app/api/jobs.py"] = (
        "from app.agents.RecruitmentPipelineAgent import RecruitmentPipelineAgent\n"
        "def upload_resumes(jd, resumes):\n"
        "    agent = RecruitmentPipelineAgent()\n"
        "    return agent.analyze_resume_batch(jd, resumes)\n"
    )
    files["backend/app/api/candidates.py"] = (
        "from app.agents.RecruitmentPipelineAgent import RecruitmentPipelineAgent\n"
        "def create_interview(candidate_id):\n"
        "    interview = {}  # manual CRUD, agent never consulted\n"
        "    return interview\n"
        "def generate_report(candidate_id, context):\n"
        "    agent = RecruitmentPipelineAgent()\n"
        "    return agent.generate_hiring_report(context)\n"
    )
    issues = _static_code_quality_report(files)
    unwired = [i for i in issues if "never called from any API route" in i]
    assert len(unwired) == 3
    assert any("score_candidate" in i for i in unwired)
    assert any("propose_interview_slots" in i for i in unwired)
    assert any("collect_feedback_summary" in i for i in unwired)
    # answer_question is the mandatory chat orchestrator entry point --
    # excluded from this check even though nothing calls it here either.
    assert not any("answer_question" in i for i in unwired)


def test_pipeline_completeness_reports_nothing_when_fully_wired():
    files = _base_project()
    files["backend/app/agents/SoloAgent.py"] = (
        "class SoloAgent:\n    def do_thing(self, x): return {}\n"
    )
    files["backend/app/api/things.py"] = (
        "from app.agents.SoloAgent import SoloAgent\n"
        "def run(x):\n    agent = SoloAgent()\n    return agent.do_thing(x)\n"
    )
    issues = _static_code_quality_report(files)
    assert not any("never called from any API route" in i for i in issues)


def test_pipeline_completeness_ignores_plain_chat_app():
    """A single-agent chatbot with only answer_question must never trigger
    this check -- it's the common case, not the bug shape."""
    files = _base_project()
    files["backend/app/agents/ChatAgent.py"] = (
        "class ChatAgent:\n"
        "    def __init__(self): pass\n"
        "    def answer_question(self, question, history=None): return {}\n"
    )
    issues = _static_code_quality_report(files)
    assert not any("never called from any API route" in i for i in issues)


# ── plan-completeness: agent count vs. plan.agents ───────────────────────────

def test_flags_fewer_agent_methods_than_plan_promised():
    """Reproduces a real live-tested bug: plan.agents lists 5 agents, but the
    generated agent class only got 3 domain methods written -- nothing in
    the pre-existing pipeline-wiring check catches methods that were never
    generated at all (as opposed to generated-but-unwired)."""
    files = _base_project()
    files["backend/app/agents/CareerAdvisorAgent.py"] = (
        "class CareerAdvisorAgent:\n"
        "    def analyze_profile(self, text): return {}\n"
        "    def research_market(self, role): return {}\n"
        "    def generate_roadmap(self, profile, market): return {}\n"
        "    def answer_question(self, question, history=None): return {}\n"
    )
    files["backend/app/api/profile.py"] = (
        "from app.agents.CareerAdvisorAgent import CareerAdvisorAgent\n"
        "def analyze(text):\n    agent = CareerAdvisorAgent()\n    return agent.analyze_profile(text)\n"
    )
    files["backend/app/api/market.py"] = (
        "from app.agents.CareerAdvisorAgent import CareerAdvisorAgent\n"
        "def research(role):\n    agent = CareerAdvisorAgent()\n    return agent.research_market(role)\n"
    )
    files["backend/app/api/roadmap.py"] = (
        "from app.agents.CareerAdvisorAgent import CareerAdvisorAgent\n"
        "def build(p, m):\n    agent = CareerAdvisorAgent()\n    return agent.generate_roadmap(p, m)\n"
    )
    plan_agents = [
        {"name": "Profile Analysis Agent"},
        {"name": "Market Research Agent"},
        {"name": "Roadmap Generation Agent"},
        {"name": "Mock Interview Agent"},
        {"name": "Progress Tracking Agent"},
    ]
    issues = _static_code_quality_report(files, expected_agents=plan_agents)
    completeness = [i for i in issues if "Plan promised" in i]
    assert len(completeness) == 1
    assert "5 agent(s)" in completeness[0]
    assert "3 domain method(s)" in completeness[0]
    assert "Mock Interview Agent" in completeness[0]


def test_does_not_flag_when_agent_count_matches_plan():
    files = _base_project()
    files["backend/app/agents/SoloAgent.py"] = (
        "class SoloAgent:\n    def do_thing(self, x): return {}\n"
    )
    files["backend/app/api/things.py"] = (
        "from app.agents.SoloAgent import SoloAgent\n"
        "def run(x):\n    agent = SoloAgent()\n    return agent.do_thing(x)\n"
    )
    plan_agents = [{"name": "Solo Agent"}]
    issues = _static_code_quality_report(files, expected_agents=plan_agents)
    assert not any("Plan promised" in i for i in issues)


def test_agent_count_check_is_a_noop_without_expected_agents():
    """Existing callers that don't pass expected_agents (e.g. every call site
    predating this feature) must see identical behavior to before."""
    files = _base_project()
    files["backend/app/agents/SoloAgent.py"] = (
        "class SoloAgent:\n    def do_thing(self, x): return {}\n"
    )
    issues = _static_code_quality_report(files)
    assert not any("Plan promised" in i for i in issues)


# ── v3: DB init / first-run correctness ──────────────────────────────────────

def test_detects_tablename_collision_across_differently_named_classes():
    files = _base_project()
    files["backend/app/models.py"] += (
        "\nclass LegacyDocument(Base):\n"
        "    __tablename__ = \"policy_documents\"\n"
        "    id: Mapped[int] = mapped_column(Integer, primary_key=True)\n"
    )
    issues = _static_code_quality_report(files)
    assert any("policy_documents" in i and "different model classes" in i for i in issues)


def test_dedupe_tablename_collisions_keeps_the_used_definition():
    files = _base_project()
    files["backend/app/models.py"] += (
        "\nclass LegacyDocument(Base):\n"
        "    __tablename__ = \"policy_documents\"\n"
        "    id: Mapped[int] = mapped_column(Integer, primary_key=True)\n"
        "    old_field: Mapped[str] = mapped_column(String(50))\n"
    )
    files["backend/app/api/documents.py"] = "PolicyDocument(title='x')\n"  # only the real one is used
    result = _dedupe_tablename_collisions(files)
    assert "class LegacyDocument" not in result["backend/app/models.py"]
    assert "class PolicyDocument" in result["backend/app/models.py"]


def test_no_tablename_collision_reports_nothing():
    issues = _static_code_quality_report(_base_project())
    assert not any("different model classes" in i for i in issues)


def test_detects_database_url_scheme_drift():
    files = _base_project()
    files["backend/app/config.py"] = CONFIG_PY.replace(
        "sqlite:///./app.db", "postgresql+asyncpg://postgres:postgres@localhost:5432/app"
    )
    files["backend/.env.example"] = "DATABASE_URL=sqlite:///./app.db\n"
    issues = _static_code_quality_report(files)
    assert any("DATABASE_URL default uses" in i for i in issues)


def test_fix_database_url_scheme_drift_makes_env_example_match_config():
    files = _base_project()
    files["backend/app/config.py"] = CONFIG_PY.replace(
        "sqlite:///./app.db", "postgresql+asyncpg://postgres:postgres@localhost:5432/app"
    )
    files["backend/.env.example"] = "DATABASE_URL=sqlite:///./app.db\n"
    result = _fix_database_url_scheme_drift(files)
    assert result["backend/.env.example"].startswith("DATABASE_URL=postgresql+asyncpg://")
    # idempotent -- re-running on already-fixed output changes nothing further
    assert _fix_database_url_scheme_drift(result) == result


def test_database_url_scheme_drift_targets_backend_env_example_not_root():
    """Reproduces a real bug found via live gpt-5-mini testing: generated
    projects commonly ship BOTH a root .env.example and backend/.env.example
    -- `next(p for p in all_files if p.endswith(".env.example"))` matched
    whichever came first regardless of which one actually pairs with
    config.py, so a drifting root file kept getting reported/left unfixed
    forever while the correct backend/.env.example (already matching
    config.py) was silently ignored."""
    files = _base_project()
    files["backend/app/config.py"] = CONFIG_PY.replace(
        "sqlite:///./app.db", "postgresql+asyncpg://postgres:postgres@localhost:5432/app"
    )
    # Root file has drift (irrelevant to config.py); backend/.env.example
    # already correctly matches -- the check/fix must key off the latter.
    files[".env.example"] = "DATABASE_URL=postgresql://postgres:postgres@localhost:5432/app\n"
    files["backend/.env.example"] = "DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/app\n"

    issues = _static_code_quality_report(files)
    assert not any("DATABASE_URL default uses" in i for i in issues)

    result = _fix_database_url_scheme_drift(dict(files))
    assert result["backend/.env.example"] == files["backend/.env.example"]  # already correct, untouched


def test_no_database_url_drift_reports_nothing():
    issues = _static_code_quality_report(_base_project())
    assert not any("DATABASE_URL default uses" in i for i in issues)


# ── v3: observability ─────────────────────────────────────────────────────────

def test_detects_missing_logging_config():
    files = _base_project()
    files["backend/app/main.py"] = "from fastapi import FastAPI\napp = FastAPI()\n"
    issues = _static_code_quality_report(files)
    assert any("No file in the generated backend configures logging" in i for i in issues)


def test_fix_missing_logging_config_injects_basicConfig():
    files = _base_project()
    files["backend/app/main.py"] = "from dotenv import load_dotenv\nload_dotenv()\nfrom fastapi import FastAPI\napp = FastAPI()\n"
    result = _fix_missing_logging_config(files)
    assert "logging.basicConfig" in result["backend/app/main.py"]
    assert not any(
        "No file in the generated backend configures logging" in i
        for i in _static_code_quality_report(result)
    )


def test_base_project_reports_no_logging_issue():
    issues = _static_code_quality_report(_base_project())
    assert not any("No file in the generated backend configures logging" in i for i in issues)


def test_detects_dead_telemetry():
    files = _base_project()
    files["backend/telemetry.py"] = "def setup_telemetry(app):\n    pass\n"
    issues = _static_code_quality_report(files)
    assert any("OTEL instrumentation is dead code" in i for i in issues)


def test_fix_dead_telemetry_wires_the_call():
    files = _base_project()
    files["backend/telemetry.py"] = "def setup_telemetry(app):\n    pass\n"
    result = _fix_dead_telemetry(files)
    assert "setup_telemetry(" in result["backend/app/main.py"]
    assert not any("OTEL instrumentation is dead code" in i for i in _static_code_quality_report(result))


def test_no_telemetry_file_reports_nothing():
    issues = _static_code_quality_report(_base_project())
    assert not any("dead code" in i for i in issues)


# ── v3: Docker validity ───────────────────────────────────────────────────────

def test_detects_expose_port_mismatch():
    files = _base_project()
    files["backend/Dockerfile"] = (
        "FROM python:3.11-slim\nWORKDIR /app\nCOPY . .\nEXPOSE 8080\n"
        'CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]\n'
    )
    issues = _static_code_quality_report(files)
    assert any("EXPOSE 8080" in i and "8000" in i for i in issues)


def test_fix_dockerfile_expose_port_matches_cmd():
    files = _base_project()
    files["backend/Dockerfile"] = (
        "FROM python:3.11-slim\nWORKDIR /app\nCOPY . .\nEXPOSE 8080\n"
        'CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]\n'
    )
    result = _fix_dockerfile_expose_port(files)
    assert "EXPOSE 8000" in result["backend/Dockerfile"]
    assert not any("doesn't match the port" in i for i in _static_code_quality_report(result))


def test_expose_port_match_reports_nothing():
    issues = _static_code_quality_report(_base_project())
    assert not any("doesn't match the port" in i for i in issues)


def test_detects_docker_compose_env_drift():
    files = _base_project()
    files["backend/docker-compose.yml"] = (
        "services:\n  backend:\n    environment:\n"
        "      DATABASE_URL: postgresql+asyncpg://postgres:postgres@db:5432/app\n"
    )
    issues = _static_code_quality_report(files)
    assert any("docker-compose.yml sets" in i for i in issues)


def test_docker_compose_matching_scheme_reports_nothing():
    files = _base_project()
    files["backend/docker-compose.yml"] = (
        "services:\n  backend:\n    environment:\n      DATABASE_URL: sqlite:///./app.db\n"
    )
    issues = _static_code_quality_report(files)
    assert not any("docker-compose.yml sets" in i for i in issues)


# ── v3 bonus: response_format json_object without the word "json" ───────────

def test_fix_json_response_format_missing_keyword_appends_reminder():
    files = _base_project()
    original = (
        'class ReportAgent:\n'
        '    def generate(self, ctx):\n'
        '        r = self.client.chat.completions.create(model="x", messages=[{"role": "system", "content": "You are a report generator."}], response_format={"type": "json_object"})\n'
    )
    files["backend/app/agents/ReportAgent.py"] = original
    result = _fix_json_response_format_missing_keyword(files)
    fixed = result["backend/app/agents/ReportAgent.py"]
    assert fixed != original
    assert "Return your answer as JSON." in fixed
    # Second call is idempotent -- doesn't double-append
    twice = _fix_json_response_format_missing_keyword(result)
    assert twice["backend/app/agents/ReportAgent.py"] == fixed


def test_fix_json_response_format_leaves_compliant_prompts_alone():
    files = _base_project()
    original = (
        'class ReportAgent:\n'
        '    def generate(self, ctx):\n'
        '        r = self.client.chat.completions.create(model="x", messages=[{"role": "system", "content": "Return JSON exactly as: {...}"}], response_format={"type": "json_object"})\n'
    )
    files["backend/app/agents/ReportAgent.py"] = original
    result = _fix_json_response_format_missing_keyword(files)
    assert result["backend/app/agents/ReportAgent.py"] == original


def test_fix_json_response_format_handles_concatenated_content():
    """Generated agents often build the system message as `SYSTEM_PROMPT +
    "some literal"` instead of a single literal string -- the reminder must
    still land right before the literal text, not be silently skipped
    because "content" isn't immediately followed by an opening quote."""
    files = _base_project()
    original = (
        'class ReportAgent:\n'
        '    SYSTEM_PROMPT = "You are an expert."\n'
        '    def generate(self, ctx):\n'
        '        r = self.client.chat.completions.create(model="x", messages=[{"role": "system", "content": self.SYSTEM_PROMPT + " Summarize."}], response_format={"type": "json_object"})\n'
    )
    files["backend/app/agents/ReportAgent.py"] = original
    result = _fix_json_response_format_missing_keyword(files)
    fixed = result["backend/app/agents/ReportAgent.py"]
    assert fixed != original
    assert "Return your answer as JSON." in fixed


def test_fix_json_response_format_fixes_every_call_in_a_file():
    """A file with multiple non-compliant calls must get every one fixed, not
    just the first -- fixing the first call shifts string offsets for every
    call after it if spans aren't re-derived from the original text."""
    files = _base_project()
    original = (
        'class ReportAgent:\n'
        '    def first(self, ctx):\n'
        '        r = self.client.chat.completions.create(model="x", messages=[{"role": "system", "content": "You are a report generator."}], response_format={"type": "json_object"})\n'
        '    def second(self, ctx):\n'
        '        r = self.client.chat.completions.create(model="x", messages=[{"role": "system", "content": "You are a scoring expert."}], response_format={"type": "json_object"})\n'
    )
    files["backend/app/agents/ReportAgent.py"] = original
    result = _fix_json_response_format_missing_keyword(files)
    fixed = result["backend/app/agents/ReportAgent.py"]
    assert fixed.count("Return your answer as JSON.") == 2


def test_fix_json_response_format_ignores_json_dumps_as_false_compliance():
    """`json.dumps(...)` in a user-content argument contains the literal
    substring "json" in source, but serializes to plain data with no such
    word in the actual runtime message -- it must not count as already
    satisfying OpenAI's "messages must contain the word json" requirement."""
    files = _base_project()
    original = (
        'class ReportAgent:\n'
        '    def generate(self, profile, market):\n'
        '        r = self.client.chat.completions.create(model="x", messages=[{"role": "system", "content": "You are a planner."}, {"role": "user", "content": json.dumps({"profile": profile, "market": market})}], response_format={"type": "json_object"})\n'
    )
    files["backend/app/agents/ReportAgent.py"] = original
    result = _fix_json_response_format_missing_keyword(files)
    fixed = result["backend/app/agents/ReportAgent.py"]
    assert fixed != original
    assert "Return your answer as JSON." in fixed


# ── _format_database_schema_for_prompt / _format_phase_coverage_instruction ──

def test_format_database_schema_handles_structured_array():
    schema = [
        {"table": "Users", "description": "Registered accounts", "columns": ["id", "email"]},
        {"table": "Roadmaps", "description": "Generated career roadmaps", "columns": ["id", "user_id"]},
    ]
    text = _format_database_schema_for_prompt(schema)
    assert "Users: id, email -- Registered accounts" in text
    assert "Roadmaps: id, user_id -- Generated career roadmaps" in text


def test_format_database_schema_handles_legacy_string():
    """Already-saved plans/sessions predating the structured-schema change
    still pass a flat string -- must pass through unchanged, not crash."""
    assert _format_database_schema_for_prompt("Users table: id, email") == "Users table: id, email"


def test_format_database_schema_handles_empty_input():
    assert _format_database_schema_for_prompt(None) == "Design appropriate tables for the application"
    assert _format_database_schema_for_prompt([]) == "Design appropriate tables for the application"


def test_format_phase_coverage_instruction_lists_every_phase_and_task():
    plan_phases = [
        {"phase": 1, "name": "Foundation", "tasks": ["Set up auth", "Create Users table"]},
        {"phase": 2, "name": "Core Features", "tasks": ["Build roadmap generator"]},
    ]
    text = _format_phase_coverage_instruction(plan_phases)
    assert "Phase 1 (Foundation): Set up auth; Create Users table" in text
    assert "Phase 2 (Core Features): Build roadmap generator" in text


def test_format_phase_coverage_instruction_returns_none_when_absent():
    assert _format_phase_coverage_instruction(None) is None
    assert _format_phase_coverage_instruction([]) is None
