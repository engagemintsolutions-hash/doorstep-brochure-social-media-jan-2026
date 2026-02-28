"""
Configuration module for the Property Listing Generator backend.
Loads settings from environment variables.
"""
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Optional
import logging
import os
from pathlib import Path

# Force load .env file before anything else
env_path = Path(__file__).parent.parent / ".env"
if env_path.exists():
    with open(env_path) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                key, value = line.split('=', 1)
                os.environ.setdefault(key.strip(), value.strip())

logger = logging.getLogger(__name__)


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore"
    )

    backend_host: str = "0.0.0.0"
    backend_port: int = 8000
    port: Optional[int] = None  # Railway sets this automatically
    api_key_placeholder: str = "your-api-key-here"
    log_level: str = "INFO"
    anthropic_api_key: Optional[str] = None
    ideal_postcodes_api_key: Optional[str] = None

    # Claude model configuration
    claude_model: str = "claude-haiku-4-5-20251001"  # Default to Haiku for cost savings
    claude_vision_model: str = "claude-haiku-4-5-20251001"  # Haiku for vision analysis

    # Mock mode for testing without API key
    mock_generation: bool = False  # Set to True to use mock responses instead of Claude API
    
    # Vision provider settings
    vision_provider: str = "claude"  # mock | google | claude
    vision_max_image_mb: int = 8
    vision_allowed_types: str = "jpg,jpeg,png,webp"
    google_application_credentials: Optional[str] = None
    
    # Enrichment settings
    enrichment_enabled: bool = True
    enrichment_cache_ttl_seconds: int = 3600  # 1 hour
    enrichment_cache_max_size: int = 1000
    enrichment_timeout_seconds: int = 10
    
    # Compliance settings
    compliance_required_keywords: str = "garden,parking,schools,epc,transport,bathroom,bedroom,kitchen"
    compliance_strict_mode: bool = False
    
    # UI/Editor settings
    editor_max_variants: int = 5
    shrink_enabled: bool = True
    editor_show_hygiene: bool = True
    
    # Export settings
    pdf_max_size_mb: float = 10.0
    pdf_template: str = "simple"  # simple | classic | premium
    pdf_enable_qr: bool = True
    pdf_qr_target_url: Optional[str] = None
    
    # Branding defaults
    export_agency_name: str = "Your Agency"
    export_agency_phone: str = "+44 0000 000000"
    export_agency_email: str = "info@example.com"
    export_brand_primary: str = "#0A5FFF"
    export_brand_secondary: str = "#0B1B2B"
    export_logo_path: Optional[str] = "./branding/logo.png"
    
    # Portal & Social settings
    portal_format: str = "rightmove"
    social_hashtags_default: str = "#NewListing #Property #ForSale"
    
    # Export storage
    export_tmp_dir: str = "./exports_tmp"
    export_retention_hours: int = 24

    # Database settings
    database_url: str = "postgresql+asyncpg://localhost/doorstep_dev"  # Railway will override this
    db_echo: bool = False  # Set to True for SQL query logging
    db_use_null_pool: bool = False  # Set to True for serverless/Railway

    # Social Media OAuth settings
    meta_app_id: Optional[str] = None
    meta_app_secret: Optional[str] = None
    meta_redirect_uri: str = "http://localhost:8000/auth/callback"  # Will be updated for production

    # Scheduler settings
    scheduler_enabled: bool = True
    scheduler_check_interval_seconds: int = 60  # Check for posts to publish every 60 seconds


settings = Settings()

# Log API key status on startup (no sensitive data)
if os.getenv("ANTHROPIC_API_KEY"):
    logger.info("ANTHROPIC_API_KEY configured")
else:
    logger.warning("ANTHROPIC_API_KEY not found in environment")
