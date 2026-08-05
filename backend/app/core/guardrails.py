from presidio_analyzer import AnalyzerEngine
from presidio_anonymizer import AnonymizerEngine
from app.core.telemetry import get_tracer

_analyzer = AnalyzerEngine()
_anonymizer = AnonymizerEngine()

# Org-wide safety rule toggles (Safety & Guardrails page). Lives here, not in
# api/safety.py, so this module -- the thing that actually enforces
# guardrails -- can be the one source of truth `is_rule_enabled` reads,
# instead of the api layer owning state the core layer depends on.
# In-memory (no DB table) is intentional for this MVP, matching how
# per-agent guardrail config predates any persistence concerns here too.
# Only "pii-detection" and "hallucination-check" are backed by real
# enforcement code below; the other five are still UI-only (see
# frontend/src/pages/Safety.tsx's banner).
GLOBAL_SAFETY_RULES: dict[str, dict] = {
    "pii-detection": {"id": "pii-detection", "name": "PII Detection", "description": "Redact personally identifiable information from inputs and outputs", "enabled": True, "severity": "critical", "category": "pii"},
    "hallucination-check": {"id": "hallucination-check", "name": "Hallucination Check", "description": "Detect and flag responses with low factual confidence", "enabled": True, "severity": "high", "category": "hallucination"},
    "toxicity-filter": {"id": "toxicity-filter", "name": "Toxicity Filter", "description": "Block toxic, abusive, or harmful content", "enabled": True, "severity": "high", "category": "toxicity"},
    "prompt-injection": {"id": "prompt-injection", "name": "Prompt Injection Guard", "description": "Detect attempts to override system prompts", "enabled": True, "severity": "critical", "category": "content"},
    "data-leakage": {"id": "data-leakage", "name": "Data Leakage Prevention", "description": "Prevent sensitive business data from being included in responses", "enabled": False, "severity": "high", "category": "content"},
    "off-topic-filter": {"id": "off-topic-filter", "name": "Off-Topic Filter", "description": "Restrict agent responses to configured topic domains", "enabled": False, "severity": "medium", "category": "content"},
    "rate-limit-guard": {"id": "rate-limit-guard", "name": "Rate Limit Guard", "description": "Throttle excessive requests from a single user", "enabled": True, "severity": "medium", "category": "content"},
    "output-length": {"id": "output-length", "name": "Output Length Control", "description": "Enforce maximum token limits on agent responses", "enabled": False, "severity": "low", "category": "content"},
}


def is_rule_enabled(rule_id: str) -> bool:
    """True if the org-wide rule is enabled or doesn't exist (fail-open --
    an unrecognized rule_id should never silently disable a guardrail)."""
    rule = GLOBAL_SAFETY_RULES.get(rule_id)
    return rule["enabled"] if rule else True

UNCERTAINTY_PHRASES = [
    "i'm not sure but",
    "i think maybe",
    "i believe but i'm not certain",
    "it might be",
    "i cannot verify",
    "i'm not certain",
]

class GuardrailsEngine:
    def __init__(self, pii_enabled: bool = True, hallucination_enabled: bool = True):
        self.pii_enabled = pii_enabled
        self.hallucination_enabled = hallucination_enabled

    async def check(self, text: str) -> dict:
        tracer = get_tracer()
        with tracer.start_as_current_span("guardrails.check") as span:
            span.set_attribute("guardrails.pii_enabled", self.pii_enabled)
            span.set_attribute("guardrails.hallucination_enabled", self.hallucination_enabled)

            output = text
            pii_triggered = False

            if self.pii_enabled:
                results = _analyzer.analyze(
                    text=text,
                    language="en",
                    entities=["EMAIL_ADDRESS", "PHONE_NUMBER", "PERSON", "CREDIT_CARD", "US_SSN"],
                )
                if results:
                    pii_triggered = True
                    anonymized = _anonymizer.anonymize(text=text, analyzer_results=results)
                    output = anonymized.text

            hallucination_triggered = False
            if self.hallucination_enabled:
                lower = output.lower()
                hallucination_triggered = any(phrase in lower for phrase in UNCERTAINTY_PHRASES)

            span.set_attribute("guardrails.pii_triggered", pii_triggered)
            span.set_attribute("guardrails.hallucination_triggered", hallucination_triggered)

            return {
                "output": output,
                "pii_triggered": pii_triggered,
                "hallucination_triggered": hallucination_triggered,
                "blocked": False,
            }
