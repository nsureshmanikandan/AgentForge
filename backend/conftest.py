import os
os.environ.setdefault("OTEL_EXPORTER", "none")

import asyncio
import pytest


@pytest.fixture(autouse=True, scope="session")
def _cleanup_test_users_and_projects():
    """Tests that hit /api/auth/register, /api/projects, /api/agents, and
    /api/builder/workflows all run against the real dev database
    (app.database.engine), not an isolated test DB -- there is no fixture
    wiring a separate DATABASE_URL for tests. Every test user is created with
    an "@example.com" email (the convention used across every test file), and
    every test-created agent/workflow uses one of a small set of hardcoded
    names (see the regex/list below, matching what the test files actually
    use). Once the whole test session finishes we delete all of it. Without
    this, every pytest run leaves permanent rows visible in the real app
    (e.g. published "Public one" test projects, "SSE Approval Test"/"Manager
    One" etc. cluttering Published Projects / Agent Studio / Visual
    Builder's saved-workflows picker).

    This runs ONCE after the entire session (not per-test) and via a fresh
    asyncio.run() rather than a pytest-asyncio fixture, so it never touches
    the per-test event loops that app/tests/conftest.py's
    _dispose_engine_after_test fixture manages -- an earlier per-test version
    of this cleanup broke test isolation across the suite."""
    yield

    async def _cleanup():
        import re
        from sqlalchemy import delete, select
        from app.database import AsyncSessionLocal, engine
        from app.models.project import Project
        from app.models.user import User
        from app.models.agent import Agent, AgentVersion
        from app.models.workflow import Workflow, WorkflowRun

        # Agent Studio auto-renames on a name collision (e.g. "Manager One"
        # -> "Manager One_v2"), so these need a regex, not an exact match.
        # Workflow names have no such uniqueness constraint, so exact names
        # are enough there.
        AGENT_TEST_NAME_RE = re.compile(
            r"^(Manager (One|Two|Three|Four|Five)|Worker (One|Two|Three|Four|Five)|"
            r"Deletable Agent|HR Bot|Sales Bot)(_v\d+)?$"
        )
        WORKFLOW_TEST_NAMES = {"SSE Approval Test", "SSE Condition Test", "Deploy Approval Test"}

        async with AsyncSessionLocal() as session:
            test_user_ids = (
                await session.execute(select(User.id).where(User.email.like("%@example.com")))
            ).scalars().all()
            if test_user_ids:
                # Projects have a plain FK to users.id with no ON DELETE CASCADE,
                # so they must be removed before their owning test users.
                await session.execute(delete(Project).where(Project.owner_id.in_(test_user_ids)))
                await session.execute(delete(User).where(User.id.in_(test_user_ids)))

            all_agent_names = (await session.execute(select(Agent.id, Agent.name))).all()
            test_agent_ids = [aid for aid, name in all_agent_names if AGENT_TEST_NAME_RE.match(name)]
            if test_agent_ids:
                # AgentVersion has a plain FK to agents.id with no ON DELETE
                # CASCADE (the same gap that caused the Delete-button 500 bug
                # fixed earlier this session), so versions must go first.
                await session.execute(delete(AgentVersion).where(AgentVersion.agent_id.in_(test_agent_ids)))
                await session.execute(delete(Agent).where(Agent.id.in_(test_agent_ids)))

            test_workflow_ids = (
                await session.execute(select(Workflow.id).where(Workflow.name.in_(WORKFLOW_TEST_NAMES)))
            ).scalars().all()
            if test_workflow_ids:
                # WorkflowRun already has ondelete="CASCADE" on its FK, but
                # deleting explicitly keeps this symmetric with the others
                # and avoids relying on DB-level cascade behavior alone.
                await session.execute(delete(WorkflowRun).where(WorkflowRun.workflow_id.in_(test_workflow_ids)))
                await session.execute(delete(Workflow).where(Workflow.id.in_(test_workflow_ids)))

            await session.commit()
        await engine.dispose()

    asyncio.run(_cleanup())
