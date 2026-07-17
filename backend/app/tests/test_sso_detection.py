from app.api.architect import _detect_sso_required


def test_detects_sso_keyword():
    assert _detect_sso_required("Internal enterprise app with SSO for legal team") is True


def test_detects_azure_ad():
    assert _detect_sso_required("Deploy on Azure AD with Entra ID authentication") is True


def test_detects_entra_id_case_insensitive():
    assert _detect_sso_required("uses entra id for login") is True


def test_detects_okta():
    assert _detect_sso_required("Users authenticate via Okta single sign-on") is True


def test_detects_single_sign_on_variant():
    assert _detect_sso_required("supports single sign on for all employees") is True


def test_no_sso_keywords_returns_false():
    assert _detect_sso_required("Cloud-hosted SaaS for multiple teams and tenants") is False


def test_empty_summary_returns_false():
    assert _detect_sso_required("") is False
