"""Configuration lue depuis .env.

Changer de modèle ne demande que deux lignes : LLM_PROVIDER et LLM_MODEL.
Aucune clé API n'apparaît dans le code.
"""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # --- Choix du modèle -------------------------------------------------
    #: Un seul fournisseur possible : ollama.
    llm_provider: str = "ollama"
    #: Vide = modèle par défaut du fournisseur (llama3.2:3b).
    llm_model: str = "llama3.2:3b"

    # --- Ollama --------------------------------------------------------
    #: Ollama tourne en local, aucune clé nécessaire.
    ollama_base_url: str = "http://localhost:11434"

    # --- Divers ----------------------------------------------------------
    frontend_origin: str = "http://localhost:5173"
    llm_timeout: float = 120.0

    # --- Google OAuth2 pour rappels e-mail --------------------------------
    google_client_id: str = ""
    google_client_secret: str = ""
    google_redirect_uri: str = "http://localhost:8000/api/reminders/callback"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
