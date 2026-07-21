import os
os.environ.setdefault("OTEL_EXPORTER", "none")

import asyncio
import pytest


@pytest.fixture(autouse=True, scope="session")
def _cleanup_test_users_and_projects():
    """Tests that hit /api/auth/register and /api/projects run against the
    real dev database (app.database.engine), not an isolated test DB -- there
    is no fixture wiring a separate DATABASE_URL for tests. Every test user is
    created with an "@example.com" email (the convention used across every
    test file), so once the whole test session finishes we delete any
    projects owned by such users and the users themselves. Without this,
    every pytest run leaves permanent rows (e.g. published "Public one" test
    projects) visible in the real app's My Projects / Published Projects
    pages.

    This runs ONCE after the entire session (not per-test) and via a fresh
    asyncio.run() rather than a pytest-asyncio fixture, so it never touches
    the per-test event loops that app/tests/conftest.py's
    _dispose_engine_after_test fixture manages -- an earlier per-test version
    of this cleanup broke test isolation across the suite."""
    yield

    async def _cleanup():
        from sqlalchemy import delete, select
        from app.database import AsyncSessionLocal, engine
        from app.models.project import Project
        from app.models.user import User

        async with AsyncSessionLocal() as session:
            test_user_ids = (
                await session.execute(select(User.id).where(User.email.like("%@example.com")))
            ).scalars().all()
            if test_user_ids:
                # Projects have a plain FK to users.id with no ON DELETE CASCADE,
                # so they must be removed before their owning test users.
                await session.execute(delete(Project).where(Project.owner_id.in_(test_user_ids)))
                await session.execute(delete(User).where(User.id.in_(test_user_ids)))
                await session.commit()
        await engine.dispose()

    asyncio.run(_cleanup())
