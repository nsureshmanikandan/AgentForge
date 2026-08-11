"""Mock external-system APIs for Canadian Tire Auto-Build demo scenarios.

These are real, runnable FastAPI endpoints (not a generic echo service like
postman-echo) -- each one simulates a specific external system a Canadian
Tire agentic workflow would call via an http_request node: a credit bureau,
a parts/store inventory system, a fraud/account-verification service, a
vendor ERP, and a purchase-record lookup. Responses are derived
deterministically from the request text (hash-seeded + keyword heuristics)
so the same input always produces the same response, without needing a
real backing database.

Mounted at /api/mock in main.py. Point a workflow's http_request node URL at
one of these (e.g. http://localhost:8000/api/mock/credit-bureau?applicant={{input}})
instead of a placeholder domain or a generic echo endpoint.
"""
import hashlib
import random
import re
from datetime import date, timedelta

from fastapi import APIRouter, Query

router = APIRouter()


def _seeded_random(text: str) -> random.Random:
    """Same input text always yields the same synthetic response."""
    digest = hashlib.sha256(text.encode("utf-8")).hexdigest()
    return random.Random(int(digest[:16], 16))


def _has_any(text: str, *keywords: str) -> bool:
    lowered = text.lower()
    return any(re.search(rf"\b{re.escape(kw)}\b", lowered) for kw in keywords)


@router.get("/credit-bureau")
def credit_bureau_report(applicant: str = Query(default="")):
    """Simulates a Canadian credit bureau (Equifax/TransUnion-style) report pull."""
    rng = _seeded_random(applicant)
    score = rng.randint(640, 830)
    if _has_any(applicant, "bankruptcy", "default", "delinquent", "collections"):
        score = rng.randint(300, 560)
    delinquencies = rng.randint(0, 1) if score > 650 else rng.randint(2, 6)
    return {
        "bureau": rng.choice(["Equifax Canada", "TransUnion Canada"]),
        "report_id": f"CB-{rng.randint(100000, 999999)}",
        "credit_score": score,
        "score_range": "300-900",
        "delinquencies_count": delinquencies,
        "bankruptcy_flag": _has_any(applicant, "bankruptcy"),
        "utilization_pct": rng.randint(85, 99) if _has_any(applicant, "high utilization", "near limit") else rng.randint(5, 40),
        "report_date": date.today().isoformat(),
    }


@router.get("/parts-inventory")
def parts_inventory_check(part_query: str = Query(default="")):
    """Simulates a Canadian Tire parts/tire inventory lookup for automotive service."""
    rng = _seeded_random(part_query)
    in_stock = not _has_any(part_query, "backorder", "discontinued", "out of stock")
    return {
        "part_number": f"CT-{rng.randint(10000, 99999)}",
        "description": part_query[:80] or "General part lookup",
        "in_stock": in_stock,
        "quantity_on_hand": rng.randint(4, 60) if in_stock else 0,
        "eta_days": 0 if in_stock else rng.randint(2, 10),
        "store_id": f"CT-{rng.randint(100, 999)}",
        "warehouse": rng.choice(["Brampton DC", "Calgary DC", "Montreal DC"]),
    }


@router.get("/account-verification")
def account_verification_check(account_query: str = Query(default="")):
    """Simulates a Triangle Rewards account/fraud verification service."""
    rng = _seeded_random(account_query)
    suspicious = _has_any(account_query, "unusual", "suspicious", "multiple accounts", "fraud", "mismatch")
    flags = []
    if suspicious:
        flags = rng.sample(["ip_mismatch", "velocity_anomaly", "device_change", "multiple_redemptions_24h"], k=rng.randint(1, 3))
    return {
        "account_id": f"TR-{rng.randint(1000000, 9999999)}",
        "verification_status": "flagged" if suspicious else "verified",
        "fraud_flags": flags,
        "risk_indicators": len(flags),
        "last_login_ip_match": not suspicious,
    }


@router.get("/store-inventory")
def store_inventory_check(item_query: str = Query(default="")):
    """Simulates real-time store-level inventory for omnichannel fulfillment."""
    rng = _seeded_random(item_query)
    available = not _has_any(item_query, "out of stock", "sold out", "unavailable")
    return {
        "store_id": f"CT-{rng.randint(100, 999)}",
        "item": item_query[:80] or "General item lookup",
        "quantity_available": rng.randint(1, 25) if available else 0,
        "nearest_alt_store": f"CT-{rng.randint(100, 999)}",
        "distance_km": round(rng.uniform(1.5, 22.0), 1),
        "restock_eta_days": 0 if available else rng.randint(1, 5),
    }


@router.get("/vendor-erp")
def vendor_erp_lookup(vendor_query: str = Query(default="")):
    """Simulates an ERP/vendor-management system lookup for supply chain workflows."""
    rng = _seeded_random(vendor_query)
    delayed = _has_any(vendor_query, "delay", "backorder", "shortage", "late")
    return {
        "vendor_id": f"V-{rng.randint(1000, 9999)}",
        "vendor_name": rng.choice(["NorthStar Distribution", "Maple Supply Co.", "Trans-Canada Wholesale"]),
        "unit_price": round(rng.uniform(8.5, 120.0), 2),
        "lead_time_days": rng.randint(14, 45) if delayed else rng.randint(2, 10),
        "contract_status": "active",
        "moq": rng.choice([50, 100, 250, 500]),
    }


@router.get("/purchase-verification")
def purchase_verification_lookup(claim_query: str = Query(default="")):
    """Simulates a point-of-sale purchase-record lookup for warranty claims."""
    rng = _seeded_random(claim_query)
    verified = not _has_any(claim_query, "no receipt", "no proof of purchase", "unknown purchase date")
    days_since = rng.randint(10, 700)
    return {
        "purchase_verified": verified,
        "purchase_date": (date.today() - timedelta(days=days_since)).isoformat() if verified else None,
        "receipt_id": f"RCT-{rng.randint(100000, 999999)}" if verified else None,
        "store_location": rng.choice(["Toronto Yonge & Eglinton", "Ottawa South Keys", "Calgary Chinook"]),
        "days_since_purchase": days_since if verified else None,
        "warranty_window_days": 365,
    }
