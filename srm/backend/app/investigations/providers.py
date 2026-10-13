from abc import ABC, abstractmethod
import json
from typing import Any, Dict, Optional
import httpx

from app.core.config import settings
from app.core.exceptions import ServiceUnavailableError
from app.core.logging import get_logger

logger = get_logger("app.investigations.providers")


class BaseLLMProvider(ABC):
    """Abstract interface for LLM root-cause analysis providers."""

    @abstractmethod
    def generate_investigation(self, prompt: str) -> Dict[str, Any]:
        """Generates an investigation diagnosis from a prompt."""
        pass


class DeterministicFallbackProvider(BaseLLMProvider):
    """Fallback provider when no external LLM is configured or enabled."""

    def generate_investigation(self, prompt: str) -> Dict[str, Any]:
        # Return empty dictionary to signal service to use deterministic analyzer
        return {}


class MockLLMProvider(BaseLLMProvider):
    """
    Mock LLM provider designed for testing and safe demonstration.
    Can be configured to simulate valid outputs, malformed payloads, or provider errors.
    """

    def __init__(
        self,
        simulate_error: bool = False,
        simulate_invalid_json: bool = False,
        override_response: Optional[Dict[str, Any]] = None,
    ) -> None:
        self.simulate_error = simulate_error
        self.simulate_invalid_json = simulate_invalid_json
        self.override_response = override_response

    def generate_investigation(self, prompt: str) -> Dict[str, Any]:
        if self.simulate_error:
            logger.warning("MockLLMProvider: Simulating external LLM provider downtime.")
            raise ServiceUnavailableError("Mock LLM provider is currently unreachable (503 Service Unavailable).")

        if self.simulate_invalid_json:
            logger.warning("MockLLMProvider: Simulating malformed LLM response schema.")
            return {"unrelated_field": "hallucinated output missing required fields"}

        if self.override_response:
            return self.override_response

        # Default high-fidelity LLM response for demonstration
        return {
            "summary": "[LLM-Assisted] AI Analysis: Primary payment processor latency spike detected during customer checkout.",
            "customer_impact": "Users are experiencing checkout authorization stalls; orders are held in pending verification.",
            "failed_component": "payment-service",
            "failed_step": "Payment Authorization",
            "evidence_supporting_diagnosis": [
                "Telemetry confirms 504 Gateway Timeout during gateway handshake",
                "Upstream gateway failed to return synchronous card authorization token",
                "Adjacent service snapshots show healthy compute, isolating failure to payment gateway",
            ],
            "root_cause_hypothesis": "External acquiring bank TLS connection queue saturation causing indeterminate payment outcomes.",
            "alternative_explanations": [
                "Acquiring network rate limiting",
                "Downstream settlement batch job locking database records",
            ],
            "related_historical_incidents": ["demo_inc_d1_2", "demo_inc_d3_2"],
            "matching_known_patterns": ["[DEMO] Primary Payment Gateway Timeout"],
            "recommended_countermeasure": "Execute Payment Gateway Failover with mandatory status reconciliation inquiry.",
            "recommended_playbook_id": "demo_pb_payment_failover",
            "confidence_score": 0.94,
            "evidence_assessment": "conclusive",
            "human_investigation_required": False,
        }


class HttpLLMProvider(BaseLLMProvider):
    """Calls an external HTTP-based LLM provider (OpenAI, Anthropic, Gemini, or local Ollama)."""

    def __init__(
        self,
        api_key: Optional[str] = None,
        model_name: str = "gpt-4o",
        api_base: Optional[str] = None,
        timeout_seconds: float = 10.0,
    ) -> None:
        self.api_key = api_key or settings.LLM_API_KEY
        self.model_name = model_name or settings.LLM_MODEL_NAME
        self.api_base = api_base or settings.LLM_API_BASE or "https://api.openai.com/v1"
        self.timeout_seconds = timeout_seconds

    def generate_investigation(self, prompt: str) -> Dict[str, Any]:
        if not self.api_key:
            raise ServiceUnavailableError("LLM API key not configured.")

        url = f"{self.api_base.rstrip('/')}/chat/completions"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": self.model_name,
            "messages": [
                {"role": "system", "content": "You are an automated SRE root-cause analyzer. Respond strictly in JSON."},
                {"role": "user", "content": prompt},
            ],
            "temperature": settings.LLM_TEMPERATURE,
            "response_format": {"type": "json_object"},
        }

        try:
            with httpx.Client(timeout=self.timeout_seconds) as client:
                res = client.post(url, headers=headers, json=payload)
                res.raise_for_status()
                data = res.json()
                content = data["choices"][0]["message"]["content"]
                return json.loads(content)
        except Exception as e:
            logger.error(f"External LLM provider call failed: {e}")
            raise ServiceUnavailableError(f"External LLM call failed: {str(e)}")


def get_llm_provider(force_provider: Optional[str] = None) -> BaseLLMProvider:
    """Factory creating configured LLM provider instance."""
    provider_type = (force_provider or settings.LLM_PROVIDER or "none").lower()

    if provider_type == "mock":
        return MockLLMProvider()
    elif provider_type in ["openai", "gemini", "anthropic", "http"]:
        return HttpLLMProvider()
    return DeterministicFallbackProvider()
