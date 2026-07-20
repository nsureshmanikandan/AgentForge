import pytest
from app.api.builder import _assert_ssrf_safe_url


def test_allows_public_https_url():
    _assert_ssrf_safe_url("https://api.github.com/users/octocat")


def test_blocks_localhost():
    with pytest.raises(ValueError, match="internal/private"):
        _assert_ssrf_safe_url("http://localhost:8000/admin")


def test_blocks_loopback_ip():
    with pytest.raises(ValueError, match="internal/private"):
        _assert_ssrf_safe_url("http://127.0.0.1:5432/")


def test_blocks_cloud_metadata_endpoint():
    with pytest.raises(ValueError, match="internal/private"):
        _assert_ssrf_safe_url("http://169.254.169.254/latest/meta-data/")


def test_blocks_private_network_ip():
    with pytest.raises(ValueError, match="internal/private"):
        _assert_ssrf_safe_url("http://10.0.0.5/internal-api")
    with pytest.raises(ValueError, match="internal/private"):
        _assert_ssrf_safe_url("http://192.168.1.1/router")


def test_blocks_non_http_scheme():
    with pytest.raises(ValueError, match="scheme"):
        _assert_ssrf_safe_url("file:///etc/passwd")


def test_blocks_missing_hostname():
    with pytest.raises(ValueError, match="hostname"):
        _assert_ssrf_safe_url("http:///no-host")
