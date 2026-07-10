from app.core.orchestrator import AgentOrchestrator


class SimulationRunner:
    def __init__(self, agent_config: dict, test_cases: list[dict]):
        self.config = agent_config
        self.test_cases = test_cases

    async def run(self) -> dict:
        orch = AgentOrchestrator(self.config)
        results = []

        for tc in self.test_cases:
            result = await orch.run(tc["input"])
            expected = tc.get("expected_contains", "").lower()
            passed = (expected in result["output"].lower()) if expected else True
            results.append({
                "input": tc["input"],
                "output": result["output"],
                "expected_contains": expected,
                "passed": passed,
                "guardrail_triggered": result["guardrail_triggered"],
                "latency_ms": result["latency_ms"],
            })

        passed_count = sum(1 for r in results if r["passed"])
        total = len(results)
        return {
            "total": total,
            "passed": passed_count,
            "failed": total - passed_count,
            "pass_rate": round(passed_count / total * 100, 1) if total > 0 else 0.0,
            "results": results,
        }
