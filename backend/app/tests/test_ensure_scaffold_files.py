from app.api.architect import _ensure_scaffold_files


def test_backfills_missing_scaffold_files():
    all_files = {"backend/requirements.txt": "fastapi==0.115.8\n"}
    _ensure_scaffold_files(all_files)
    for path in (
        ".github/workflows/ci.yml",
        "backend/tests/__init__.py",
        "backend/tests/conftest.py",
        "backend/tests/test_smoke.py",
        "backend/alembic.ini",
        "backend/migrations/script.py.mako",
        "backend/migrations/env.py",
    ):
        assert path in all_files, f"{path} should have been backfilled"
    assert "pytest==" in all_files["backend/requirements.txt"]
    assert "pytest-asyncio==" in all_files["backend/requirements.txt"]
    assert "httpx==" in all_files["backend/requirements.txt"]
    assert "slowapi==" in all_files["backend/requirements.txt"]


def test_guarantees_slowapi_since_rate_limiting_is_always_mandatory():
    """Observed in a real generation: main.py imported and used slowapi.Limiter
    (per the mandatory RATE LIMITING prompt instruction) but requirements.txt
    didn't list it -- ModuleNotFoundError on a clean install. slowapi must be
    guaranteed the same way pytest/opentelemetry are, not left to the LLM
    remembering the prompt instruction alone."""
    all_files = {"backend/requirements.txt": "fastapi==0.115.8\n"}
    _ensure_scaffold_files(all_files)
    assert "slowapi==" in all_files["backend/requirements.txt"]


def test_does_not_duplicate_existing_slowapi_pin():
    all_files = {"backend/requirements.txt": "fastapi==0.115.8\nslowapi==0.1.9\n"}
    _ensure_scaffold_files(all_files)
    assert all_files["backend/requirements.txt"].count("slowapi") == 1


def test_guarantees_jose_and_passlib_when_auth_module_present():
    """Observed in a real download: backend/app/auth/security.py imported
    jose and passlib but requirements.txt listed neither -- ModuleNotFoundError
    on a clean install. Same failure mode as slowapi; guaranteed the same way."""
    all_files = {
        "backend/requirements.txt": "fastapi==0.115.8\n",
        "backend/app/auth/security.py": "from jose import jwt\nfrom passlib.context import CryptContext\n",
    }
    _ensure_scaffold_files(all_files)
    req = all_files["backend/requirements.txt"]
    assert "python-jose" in req
    assert "passlib" in req


def test_does_not_add_auth_packages_when_no_auth_module_generated():
    all_files = {"backend/requirements.txt": "fastapi==0.115.8\n"}
    _ensure_scaffold_files(all_files)
    req = all_files["backend/requirements.txt"]
    assert "python-jose" not in req
    assert "passlib" not in req


def test_does_not_overwrite_llm_generated_files():
    all_files = {
        "backend/tests/test_smoke.py": "# custom LLM-written smoke test",
        "backend/requirements.txt": "fastapi==0.115.8\npytest==8.3.4\n",
    }
    _ensure_scaffold_files(all_files)
    assert all_files["backend/tests/test_smoke.py"] == "# custom LLM-written smoke test"
    # pytest already present -> must not duplicate the pin
    assert all_files["backend/requirements.txt"].count("pytest==") == 1


def test_guarantees_otel_packages_since_telemetry_py_is_always_embedded():
    all_files = {"backend/requirements.txt": "fastapi==0.115.8\n", "backend/telemetry.py": "..."}
    _ensure_scaffold_files(all_files)
    req = all_files["backend/requirements.txt"]
    for pkg in ("opentelemetry-api", "opentelemetry-sdk", "opentelemetry-instrumentation-fastapi", "opentelemetry-exporter-otlp-proto-http"):
        assert pkg in req, f"{pkg} should be guaranteed in requirements.txt"


def test_guarantees_env_excludes_env_file():
    all_files = {"backend/requirements.txt": "fastapi==0.115.8\n"}
    _ensure_scaffold_files(all_files)
    assert ".env" in all_files[".gitignore"].splitlines()


def test_does_not_duplicate_existing_gitignore_env_entry():
    all_files = {"backend/requirements.txt": "fastapi==0.115.8\n", ".gitignore": "node_modules/\n.env\n"}
    _ensure_scaffold_files(all_files)
    assert all_files[".gitignore"].count(".env") == 1
