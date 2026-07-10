import pytest
from app.core.security import hash_password, verify_password, create_access_token, decode_token

def test_password_hash_and_verify():
    hashed = hash_password("MySecret123!")
    assert verify_password("MySecret123!", hashed) is True
    assert verify_password("WrongPassword", hashed) is False

def test_create_and_decode_token():
    token = create_access_token("user-abc", "admin")
    payload = decode_token(token)
    assert payload["sub"] == "user-abc"
    assert payload["role"] == "admin"
