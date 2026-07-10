import json
import time
from app.core.azure_openai import AzureOpenAIClient
from app.core.guardrails import GuardrailsEngine
from app.core.telemetry import get_tracer


class AgentOrchestrator:
    def __init__(self, agent_config: dict):
        self.config = agent_config
        self._llm = AzureOpenAIClient(model=agent_config.get("model", "gpt-4o"))
        guardrail_cfg = agent_config.get("guardrails", {})
        self._guardrails = GuardrailsEngine(
            pii_enabled=guardrail_cfg.get("pii", True),
            hallucination_enabled=guardrail_cfg.get("hallucination", True),
        )

    async def run(self, user_input: str, chat_history: list[dict] | None = None) -> dict:
        tracer = get_tracer()
        with tracer.start_as_current_span("agent.run") as span:
            span.set_attribute("agent.name", self.config.get("name", "unknown"))
            span.set_attribute("agent.model", self.config.get("model", "gpt-4o"))

            start = time.monotonic()
            messages = [{"role": "system", "content": self.config.get("system_prompt", "")}]
            if chat_history:
                messages.extend(chat_history)
            messages.append({"role": "user", "content": user_input})

            raw_output = await self._llm.chat(messages)
            guardrail_result = await self._guardrails.check(raw_output)
            latency_ms = int((time.monotonic() - start) * 1000)

            span.set_attribute("agent.guardrail_triggered", guardrail_result["pii_triggered"] or guardrail_result["hallucination_triggered"])
            span.set_attribute("agent.pii_triggered", guardrail_result["pii_triggered"])
            span.set_attribute("agent.hallucination_triggered", guardrail_result["hallucination_triggered"])
            span.set_attribute("agent.latency_ms", latency_ms)

            return {
                "output": guardrail_result["output"],
                "raw_output": raw_output,
                "guardrail_triggered": guardrail_result["pii_triggered"] or guardrail_result["hallucination_triggered"],
                "pii_triggered": guardrail_result["pii_triggered"],
                "hallucination_triggered": guardrail_result["hallucination_triggered"],
                "latency_ms": latency_ms,
            }


class MultiAgentOrchestrator:
    def __init__(self, manager_config: dict, worker_configs: list[dict]):
        self.manager = AgentOrchestrator(manager_config)
        self.workers = {cfg["name"]: AgentOrchestrator(cfg) for cfg in worker_configs}

    async def run(self, user_input: str) -> dict:
        tracer = get_tracer()
        with tracer.start_as_current_span("multi_agent.run") as span:
            span.set_attribute("agent.worker_count", len(self.workers))

            worker_names = list(self.workers.keys())
            manager_prompt = (
                f"You are a manager agent. Decide which workers to invoke from: {worker_names}. "
                f"Return ONLY a JSON array. User request: {user_input}"
            )
            manager_result = await self.manager.run(manager_prompt)
            try:
                raw = manager_result["output"].strip()
                start = raw.find("[")
                end = raw.rfind("]") + 1
                worker_order = json.loads(raw[start:end]) if start >= 0 else []
            except Exception:
                worker_order = worker_names[:1]

            results = []
            context = user_input
            for worker_name in worker_order:
                if worker_name in self.workers:
                    with tracer.start_as_current_span("agent.worker") as wspan:
                        wspan.set_attribute("agent.worker_name", worker_name)
                        result = await self.workers[worker_name].run(context)
                    results.append({"agent": worker_name, "result": result})
                    context = result["output"]

            return {
                "final_output": context,
                "steps": results,
                "guardrail_triggered": any(r["result"]["guardrail_triggered"] for r in results),
            }
