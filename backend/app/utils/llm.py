"""Provider-neutral LangChain integration for structured LLM calls."""

from __future__ import annotations

import asyncio
import os
from typing import Any, TypeVar

from pydantic import BaseModel

from app.utils.config import DEFAULT_LLM_MODEL, DEFAULT_LLM_PROVIDER, LLM_MODELS
from app.models import CallRecord, LLMProvider
from app.utils.observability import Stopwatch, estimate_cost, record_call
from app.utils.progress import NullBus, ProgressBus

T = TypeVar("T", bound=BaseModel)


def _model_for(provider: LLMProvider, model: str | None) -> Any:
    selected_model = model or LLM_MODELS[provider]
    try:
        if provider == "anthropic":
            from langchain_anthropic import ChatAnthropic
            return ChatAnthropic(model=selected_model, anthropic_api_key=os.getenv("ANTHROPIC_API_KEY"), max_tokens=4096)
        if provider == "openai":
            from langchain_openai import ChatOpenAI
            # gpt-5 reasoning models default to a non-none effort, which Chat
            # Completions cannot combine with function tools. Non-reasoning
            # models such as gpt-4o-mini reject this argument altogether.
            reasoning_models = ("gpt-5", "o1", "o3", "o4")
            options: dict[str, Any] = {
                "model": selected_model,
                "api_key": os.getenv("OPENAI_API_KEY"),
                "max_tokens": 4096,
            }
            if selected_model.lower().startswith(reasoning_models):
                options["reasoning_effort"] = "none"
            return ChatOpenAI(**options)
        from langchain_google_genai import ChatGoogleGenerativeAI
        return ChatGoogleGenerativeAI(
            model=selected_model,
            google_api_key=os.getenv("GOOGLE_API_KEY"),
            max_output_tokens=4096,
            request_timeout=60,
            retries=0,
        )
    except ImportError as error:  # pragma: no cover - setup failure path
        package = {"anthropic": "langchain-anthropic", "openai": "langchain-openai", "google": "langchain-google-genai"}[provider]
        raise RuntimeError(f"Run `uv sync` after installing {package} before making LLM calls.") from error


def _usage(result: Any) -> tuple[int, int]:
    metadata = getattr(result, "usage_metadata", {}) or {}
    response = getattr(result, "response_metadata", {}) or {}
    usage = response.get("usage", {}) if isinstance(response, dict) else {}
    input_tokens = metadata.get("input_tokens", usage.get("input_tokens", usage.get("prompt_tokens", 0)))
    output_tokens = metadata.get("output_tokens", usage.get("output_tokens", usage.get("completion_tokens", 0)))
    return int(input_tokens or 0), int(output_tokens or 0)


class LLMClient:
    """Use LangChain adapters while preserving validation, retries, and telemetry."""

    def __init__(self, run_id: str, provider: LLMProvider = DEFAULT_LLM_PROVIDER, model: str | None = None, max_retries: int = 2, bus: ProgressBus | None = None):
        self.run_id = run_id
        self.provider = provider
        self.model = model or (DEFAULT_LLM_MODEL if provider == DEFAULT_LLM_PROVIDER else LLM_MODELS[provider])
        self.max_retries = max_retries
        self.bus = bus or NullBus()
        self._structured_chats: dict[type[BaseModel], Any] = {}

    async def structured(self, stage: str, prompt: str, response_model: type[T]) -> T:
        """Call the selected provider asynchronously and validate its result."""
        key_name = {"anthropic": "ANTHROPIC_API_KEY", "openai": "OPENAI_API_KEY", "google": "GOOGLE_API_KEY"}[self.provider]
        if not os.getenv(key_name):
            raise RuntimeError(f"{key_name} is required for {self.provider} generation and analysis.")
        chat = self._structured_chats.get(response_model)
        if chat is None:
            structured_options = {"method": "function_calling"} if self.provider == "openai" else {}
            chat = _model_for(self.provider, self.model).with_structured_output(
                response_model, **structured_options
            )
            self._structured_chats[response_model] = chat

        last_error: Exception | None = None
        for attempt in range(self.max_retries + 1):
            timer = Stopwatch.start()
            input_tokens = output_tokens = 0
            try:
                result = await chat.ainvoke(prompt)
                input_tokens, output_tokens = _usage(result)
                validated = result if isinstance(result, response_model) else response_model.model_validate(result)
                cost = estimate_cost(input_tokens, output_tokens)
                await record_call(CallRecord(run_id=self.run_id, stage=stage, model=f"{self.provider}:{self.model}", input_tokens=input_tokens, output_tokens=output_tokens, latency_seconds=timer.elapsed, estimated_cost_usd=cost, success=True))
                self.bus.cost(input_tokens, output_tokens, cost)
                return validated
            except Exception as error:
                last_error = error
                await record_call(CallRecord(run_id=self.run_id, stage=stage, model=f"{self.provider}:{self.model}", input_tokens=input_tokens, output_tokens=output_tokens, latency_seconds=timer.elapsed, estimated_cost_usd=estimate_cost(input_tokens, output_tokens), success=False, error=str(error)))
                if attempt == self.max_retries:
                    break
                self.bus.stage(stage, "retrying", detail=f"attempt {attempt + 2}")
                await asyncio.sleep(0.75 * (attempt + 1))
        raise RuntimeError(f"{stage} failed after {self.max_retries + 1} attempts: {last_error}")
