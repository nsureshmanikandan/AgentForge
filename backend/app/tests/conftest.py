import pytest_asyncio
from app.database import engine


@pytest_asyncio.fixture(autouse=True)
async def _dispose_engine_after_test():
    """Dispose the shared async engine's connection pool after each test.

    pytest-asyncio (mode=auto) tears down and creates a new event loop per
    test function. The SQLAlchemy async engine in app.database is a
    module-level singleton, so pooled asyncpg connections opened during one
    test remain bound to that test's (now-closed) event loop and blow up
    with "Event loop is closed" / "'NoneType' object has no attribute
    'send'" when reused by a later test. Disposing the pool after each test
    forces fresh connections to be opened against the current loop.
    """
    yield
    await engine.dispose()
