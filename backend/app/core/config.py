from urllib.parse import urlparse, urlunparse

from pydantic import model_validator
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Runtime
    runtime_env: str = "local-pc"  # local-pc | local-mac

    # Local AI (Ollama)
    ollama_base_url: str = "http://localhost:11434"
    local_chat_heavy: str = "qwen2.5:14b"
    local_chat_light: str = "llama3.1:8b"
    local_embed_model: str = "nomic-embed-text"

    # LLM routing mode: auto (local-first, cloud fallback) | cloud | local
    llm_mode_light: str = "auto"   # embed, tag_topics, score_quality
    llm_mode_heavy: str = "auto"   # summarize, rag_answer

    # Cloud fallback
    openai_api_key: str = ""
    anthropic_api_key: str = ""
    cloud_chat_model: str = "gpt-4o-mini"
    cloud_chat_fallback: str = "claude-haiku-3-5"
    cloud_embed_model: str = "text-embedding-3-small"

    # Database
    database_url: str = "postgresql+asyncpg://localhost/distill"

    # Embedding
    embed_dimensions: int = 768

    model_config = {"env_file": [".env", "../.env"], "extra": "ignore"}

    @model_validator(mode="after")
    def normalize_database_url(self):
        """Ensure DATABASE_URL uses asyncpg driver and strip query params asyncpg doesn't support."""
        url = self.database_url
        if url.startswith("postgresql://"):
            url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
        # Strip query params (sslmode, channel_binding, etc.) — SSL is handled via connect_args
        parsed = urlparse(url)
        self.database_url = urlunparse(parsed._replace(query=""))
        return self


settings = Settings()
