from presidio_analyzer import AnalyzerEngine
from presidio_anonymizer import AnonymizerEngine
from app.core.telemetry import get_tracer

_analyzer = AnalyzerEngine()
_anonymizer = AnonymizerEngine()

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
