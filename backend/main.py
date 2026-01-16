"""
FastAPI application for Property Listing Generator.
Updated to use Anthropic API key from environment variables.
Includes postcode autocomplete and full UK address lookup with Ideal Postcodes API.
Version: 2025-01-27
"""
import sys
print("=== MAIN.PY LOADING ===", flush=True)
print(f"Python: {sys.version}", flush=True)
print(f"Executable: {sys.executable}", flush=True)

from fastapi import FastAPI, File, UploadFile, HTTPException, Request, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, RedirectResponse, Response
from starlette.middleware.base import BaseHTTPMiddleware
from typing import List, Optional, Dict
import logging
import asyncio
import os
import time
import uuid
import json
import base64
import secrets
from pathlib import Path

from backend.config import settings
from backend.schemas import (
    HealthResponse,
    GenerateRequest,
    GenerateResponse,
    ShrinkRequest,
    ShrinkResponse,
    ImageAnalysisResponse,
    EnrichmentRequest,
    EnrichmentResponse,
    POIResult,
    PostcodeAutocompleteRequest,
    PostcodeAutocompleteResponse,
    AddressSuggestion,
    AddressLookupRequest,
    AddressLookupResponse,
    FullAddress,
    ComplianceCheckRequest,
    ComplianceCheckResponse,
    ComplianceWarning,
    KeywordCoverageResult,
    # Collaboration schemas
    UserSession,
    BrochureState,
    ShareBrochureRequest,
    HandoffNotification,
    PendingHandoffsResponse,
    AcceptHandoffResponse,
    HeartbeatRequest,
    ActiveUsersResponse,
    # Brochure session schemas
    BrochureSessionData,
    BrochureSessionResponse,
    BrochureSessionCreateRequest,
    BrochurePhoto,
    BrochurePage,
    # Text transformation schemas
    TextTransformationStyle,
    TextTransformRequest,
    TextTransformResponse,
    # Repurpose schemas
    RepurposeRequest,
    RepurposeResponse,
    PlatformContent,
    # Quick social post schemas
    QuickSocialPostRequest,
    QuickSocialPostResponse,
    SocialPostVariant,
    # Background removal schemas
    BackgroundRemovalRequest,
    BackgroundRemovalResponse,
)
from backend.schemas_export import (
    PDFExportRequest,
    PackExportRequest,
    ExportResponse,
    PackExportResponse,
)
from services.generator import Generator
from services.rewrite_compressor import RewriteCompressor
from services.shrink_service import ShrinkService
from services.vision_adapter import VisionAdapter, ValidationError
from services.claude_client import ClaudeClient
from services.enrichment_service import EnrichmentService
from services.cache_manager import CacheManager
from services.epc_service import EPCService
from services.compliance_checker import ComplianceChecker
from services.keyword_coverage import KeywordCoverage
from services.length_policy import LengthPolicy
from services.export_service import ExportService
from services.rate_limiter import GlobalRateLimiter
from services.marketing_generator import MarketingGenerator
from services.agency_templates import (
    get_template_service,
    AgencyBranding,
    PropertyCharacter,
    TemplateType
)
from services.user_profile_service import UserProfileService, UserProfile
from services.property_autofill_service import PropertyAutofillService
from services.brochure_session_service import BrochureSessionService
from services.photo_scorer import get_photo_scorer
from services.post_scheduler import start_scheduler, stop_scheduler
from services.background_remover import get_background_remover
from services.hashtag_service import get_hashtag_service, HashtagService
from providers import VisionProvider, make_vision_client
from providers.geocoding_client import GeocodingClient
from providers.places_client import PlacesClient
from providers.address_lookup_client import AddressLookupClient

# Configure logging
logging.basicConfig(level=settings.log_level)
logger = logging.getLogger(__name__)

# Initialize FastAPI app
fastapi_app = FastAPI(
    title="Property Listing Generator",
    description="AI-powered property listing copy generation",
    version="1.0.0"
)

# Add CORS middleware
fastapi_app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================================================
# BASIC AUTH MIDDLEWARE (Pure ASGI - works with mounted apps)
# ============================================================================
AUTH_USERNAME = "doorstep"
AUTH_PASSWORD = "BobLemmons123"

class BasicAuthASGIMiddleware:
    """Pure ASGI middleware that works with mounted StaticFiles."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        # Skip auth for health check, static files, and brochure session API
        path = scope.get("path", "")

        # Skip auth for static files and specific API endpoints
        skip_auth_paths = [
            "/health",
            "/static/",
            "/api/brochure/session/",
        ]

        for skip_path in skip_auth_paths:
            if path.startswith(skip_path) or path == skip_path.rstrip("/"):
                await self.app(scope, receive, send)
                return

        # Check for Authorization header
        headers = dict(scope.get("headers", []))
        auth_header = headers.get(b"authorization", b"").decode("utf-8")

        authenticated = False
        if auth_header.startswith("Basic "):
            try:
                encoded_credentials = auth_header[6:]
                decoded = base64.b64decode(encoded_credentials).decode("utf-8")
                username, password = decoded.split(":", 1)
                if (secrets.compare_digest(username, AUTH_USERNAME) and
                    secrets.compare_digest(password, AUTH_PASSWORD)):
                    authenticated = True
            except Exception:
                pass

        if authenticated:
            await self.app(scope, receive, send)
        else:
            # Return 401 response
            response_body = b"Authentication required"
            await send({
                "type": "http.response.start",
                "status": 401,
                "headers": [
                    [b"content-type", b"text/plain"],
                    [b"www-authenticate", b'Basic realm="Doorstep Brochure Editor"'],
                    [b"content-length", str(len(response_body)).encode()],
                ],
            })
            await send({
                "type": "http.response.body",
                "body": response_body,
            })

# Application lifecycle events
@fastapi_app.on_event("startup")
async def startup_event():
    """Initialize services and start background tasks on app startup"""
    logger.info("🚀 Starting Property Listing Generator application...")

    # Import database session factory
    from backend.database import AsyncSessionLocal

    # Start the post scheduler background task
    try:
        await start_scheduler(AsyncSessionLocal)
        logger.info("✅ Post scheduler started successfully")
    except Exception as e:
        logger.error(f"❌ Failed to start post scheduler: {e}")


@fastapi_app.on_event("shutdown")
async def shutdown_event():
    """Clean up resources on app shutdown"""
    logger.info("🛑 Shutting down Property Listing Generator application...")

    # Stop the post scheduler
    try:
        await stop_scheduler()
        logger.info("✅ Post scheduler stopped successfully")
    except Exception as e:
        logger.error(f"❌ Failed to stop post scheduler: {e}")

# Disable caching for development
@fastapi_app.middleware("http")
async def disable_cache(request, call_next):
    response = await call_next(request)
    if request.url.path.startswith("/static/"):
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
    return response

# Mount static files (frontend)
fastapi_app.mount("/static", StaticFiles(directory="frontend"), name="static")

# Mount branding files
fastapi_app.mount("/branding", StaticFiles(directory="branding"), name="branding")

# Mount uploads directory (photographer photos)
if not os.path.exists("uploads"):
    os.makedirs("uploads")
fastapi_app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

# Mount test images directory
if os.path.exists("test_images"):
    fastapi_app.mount("/test_images", StaticFiles(directory="test_images"), name="test_images")

# Initialize global rate limiter for API calls
# This prevents acceleration limit errors when multiple photos are analyzed
global_rate_limiter = GlobalRateLimiter(min_delay_seconds=1.2)
logger.info("Global rate limiter initialized (1.2s minimum delay)")

# ============================================================================
# COLLABORATION IN-MEMORY STORAGE
# ============================================================================
# Active user sessions: {user_email: UserSession}
active_sessions: Dict[str, UserSession] = {}
# Pending handoffs: {recipient_email: [list of handoff dicts]}
pending_handoffs: Dict[str, List[Dict]] = {}
# Session expiry: 5 minutes
SESSION_EXPIRY_SECONDS = 300

def _cleanup_expired_sessions():
    """Remove sessions older than SESSION_EXPIRY_SECONDS."""
    current_time = time.time()
    expired = [email for email, session in active_sessions.items()
               if current_time - session.last_seen > SESSION_EXPIRY_SECONDS]
    for email in expired:
        del active_sessions[email]
        logger.debug(f"Expired session for {email}")

# Initialize Claude client
try:
    claude_client = ClaudeClient()
    if claude_client.is_available():
        logger.info("Claude API client initialized successfully")
    else:
        logger.warning("Claude API client not available - using mock generation")
except Exception as e:
    logger.warning(f"Failed to initialize Claude client: {e}")
    claude_client = None

# Initialize vision client with rate limiter
try:
    provider = VisionProvider(settings.vision_provider.lower())
    vision_client = make_vision_client(
        provider=provider,
        config={
            "google_credentials_path": settings.google_application_credentials,
            "anthropic_api_key": settings.anthropic_api_key,
            "rate_limiter": global_rate_limiter  # Pass rate limiter to vision client
        }
    )
    logger.info(f"Vision client initialized: {settings.vision_provider}")
except Exception as e:
    logger.warning(f"Failed to initialize vision client, using mock: {e}")
    vision_client = make_vision_client(VisionProvider.MOCK, {})

# Initialize services
generator = Generator(claude_client=claude_client)
compressor = RewriteCompressor()
vision_adapter = VisionAdapter(
    vision_client=vision_client,
    max_size_mb=settings.vision_max_image_mb,
    allowed_types=settings.vision_allowed_types.split(",")
)
length_policy = LengthPolicy()

# Initialize shrink service (uses Claude if available)
shrink_service = ShrinkService(
    claude_client=claude_client,
    required_keywords=[kw.strip() for kw in settings.compliance_required_keywords.split(",") if kw.strip()]
)

# Initialize enrichment service
enrichment_service = None
if settings.enrichment_enabled:
    try:
        geocoding_client = GeocodingClient(timeout_seconds=settings.enrichment_timeout_seconds)
        places_client = PlacesClient(timeout_seconds=settings.enrichment_timeout_seconds)
        cache_manager = CacheManager(max_size=settings.enrichment_cache_max_size)
        enrichment_service = EnrichmentService(
            geocoding_client=geocoding_client,
            places_client=places_client,
            cache_manager=cache_manager,
        )
        logger.info("Enrichment service initialized")
    except Exception as e:
        logger.warning(f"Failed to initialize enrichment service: {e}")
        enrichment_service = None

# Initialize EPC service
try:
    epc_service = EPCService()
    if epc_service.available:
        logger.info("EPC service initialized successfully")
    else:
        logger.warning("EPC service initialized but database not found")
        epc_service = None
except Exception as e:
    logger.warning(f"Failed to initialize EPC service: {e}")
    epc_service = None

# Initialize address lookup client (Ideal Postcodes)
address_lookup_client = None
if settings.ideal_postcodes_api_key:
    try:
        address_lookup_client = AddressLookupClient(api_key=settings.ideal_postcodes_api_key)
        logger.info("Address lookup client initialized (Ideal Postcodes)")
    except Exception as e:
        logger.warning(f"Failed to initialize address lookup client: {e}")
        address_lookup_client = None
else:
    logger.info("Address lookup disabled (no IDEAL_POSTCODES_API_KEY)")

# Initialize compliance and keyword coverage services
try:
    required_keywords = settings.compliance_required_keywords.split(",")
    required_keywords = [kw.strip() for kw in required_keywords if kw.strip()]
    compliance_checker = ComplianceChecker(required_keywords=required_keywords)
    keyword_coverage = KeywordCoverage(required_keywords=required_keywords)
    logger.info(f"Compliance services initialized with keywords: {required_keywords}")
except Exception as e:
    logger.warning(f"Failed to initialize compliance services: {e}")
    compliance_checker = ComplianceChecker()
    keyword_coverage = KeywordCoverage()

# Initialize export service
try:
    export_service = ExportService(
        export_dir=settings.export_tmp_dir,
        pdf_max_size_mb=settings.pdf_max_size_mb,
        portal_format=settings.portal_format,
        social_hashtags=settings.social_hashtags_default,
        retention_hours=settings.export_retention_hours
    )
    logger.info("Export service initialized")
except Exception as e:
    logger.warning(f"Failed to initialize export service: {e}")
    export_service = None

# Initialize agency template service
try:
    template_service = get_template_service()
    logger.info(f"Agency template service initialized with {len(template_service.list_agencies())} agencies")
except Exception as e:
    logger.warning(f"Failed to initialize agency template service: {e}")
    template_service = None

# Initialize marketing generator
try:
    marketing_generator = MarketingGenerator(claude_client=claude_client)
    logger.info("Marketing generator initialized")
except Exception as e:
    logger.warning(f"Failed to initialize marketing generator: {e}")
    marketing_generator = None

# Initialize user profile service
try:
    user_profile_service = UserProfileService(storage_dir="./user_profiles")
    logger.info("User profile service initialized")
except Exception as e:
    logger.warning(f"Failed to initialize user profile service: {e}")
    user_profile_service = None

# Initialize property autofill service
try:
    property_autofill_service = PropertyAutofillService()
    logger.info("Property autofill service initialized")
except Exception as e:
    logger.warning(f"Failed to initialize property autofill service: {e}")
    property_autofill_service = None

# Initialize brochure session service
try:
    brochure_session_service = BrochureSessionService(
        base_dir=Path("./brochure_sessions"),
        expiry_hours=24
    )
    logger.info(f"Brochure session service initialized: {brochure_session_service.base_dir.absolute()}")
except Exception as e:
    logger.warning(f"Failed to initialize brochure session service: {e}")
    brochure_session_service = None


# Register admin routes for database management
from backend.admin_routes import router as admin_router
fastapi_app.include_router(admin_router)

# Register OAuth routes for social media account connection
from backend.oauth_routes import router as oauth_router
fastapi_app.include_router(oauth_router)

# Register posts routes for scheduling and managing social media posts
from backend.posts_routes import router as posts_router
fastapi_app.include_router(posts_router)


@fastapi_app.get("/")
async def root():
    """
    Root route redirects to the main application.

    Returns:
        RedirectResponse: Redirect to /static/index.html
    """
    return RedirectResponse(url="/static/index.html")


@fastapi_app.get("/health", response_model=HealthResponse)
async def health_check():
    """
    Health check endpoint.

    Returns:
        HealthResponse: Service status and version.
    """
    logger.info("Health check requested")
    return HealthResponse(status="ok", version="1.0.0")


@fastapi_app.post("/generate", response_model=GenerateResponse)
async def generate_listing(request: GenerateRequest):
    """
    Generate property listing variants.
    
    Args:
        request: GenerateRequest with property data, location, audience, tone, channel
        
    Returns:
        GenerateResponse: Generated variants with metadata and optional compliance data
        
    Raises:
        HTTPException: If generation fails
    """
    logger.info(f"Generate request for {request.property_data.property_type} property")
    
    try:
        # Optionally enrich location data
        enrichment_data = None
        if request.include_enrichment and enrichment_service and request.location_data.postcode:
            try:
                logger.info("Enriching location data")
                enrichment_data = await enrichment_service.enrich_location(
                    postcode=request.location_data.postcode
                )
                logger.info(f"Enrichment complete: {len(enrichment_data.get('highlights', []))} highlights")
            except Exception as e:
                logger.warning(f"Enrichment failed, continuing without: {e}")
                enrichment_data = None
        
        # Generate 3 variants (pass enrichment data, photo analysis, and brochure sections if available)
        variants = await generator.generate_variants(
            request,
            num_variants=3,
            enrichment_data=enrichment_data,
            photo_analysis=request.photo_analysis,
            brochure_sections=request.brochure_sections
        )
        
        metadata = {
            "channel": request.channel.channel.value,
            "tone": request.tone.tone.value,
            "target_words": request.channel.target_words,
            "hard_cap": request.channel.hard_cap,
            "enrichment_used": enrichment_data is not None,
            "target_ranges": {
                "headline_chars": [50, 90],
                "full_text_words": [
                    request.channel.target_words or 150,
                    request.channel.hard_cap or 300
                ] if request.channel.target_words else [150, 300],
                "features_count": [6, 10]
            }
        }
        
        # Optionally run compliance check on first variant
        compliance_response = None
        if request.include_compliance and variants:
            try:
                logger.info("Running compliance check on generated variant")
                
                # Use the first variant's full text for compliance check
                first_variant_text = variants[0]["full_text"]
                
                # Convert property_data to dict
                property_data_dict = {
                    "property_type": request.property_data.property_type.value,
                    "bedrooms": request.property_data.bedrooms,
                    "bathrooms": request.property_data.bathrooms,
                    "epc_rating": request.property_data.epc_rating,
                    "features": request.property_data.features,
                }
                
                # Run compliance check
                compliance_result = compliance_checker.check_compliance(
                    text=first_variant_text,
                    channel=request.channel.channel,
                    property_data=property_data_dict
                )
                
                # Run keyword coverage analysis
                keyword_result = keyword_coverage.analyze_coverage(
                    text=first_variant_text,
                    channel=request.channel.channel,
                    property_features=request.property_data.features
                )
                
                # Convert warnings to ComplianceWarning objects
                warnings = [
                    ComplianceWarning(
                        severity=w["severity"],
                        message=w["message"],
                        suggestion=w.get("suggestion")
                    )
                    for w in compliance_result["warnings"]
                ]
                
                # Create keyword coverage result
                keyword_coverage_result = KeywordCoverageResult(
                    covered_keywords=keyword_result["covered_keywords"],
                    missing_keywords=keyword_result["missing_keywords"],
                    coverage_score=keyword_result["coverage_score"],
                    suggestions=keyword_result["suggestions"]
                )
                
                # Combine suggestions
                all_suggestions = list(set(
                    compliance_result["suggestions"] + keyword_result["suggestions"]
                ))[:5]
                
                compliance_response = ComplianceCheckResponse(
                    compliant=compliance_result["compliant"],
                    warnings=warnings,
                    compliance_score=compliance_result["score"],
                    keyword_coverage=keyword_coverage_result,
                    suggestions=all_suggestions
                )
                
                logger.info(f"Compliance check complete: score={compliance_result['score']}, compliant={compliance_result['compliant']}")
                
            except Exception as e:
                logger.warning(f"Compliance check failed, continuing without: {e}")
                compliance_response = None
        
        # Convert compliance to dict if present (for Pydantic serialization)
        compliance_dict = compliance_response.model_dump() if compliance_response else None
        
        return GenerateResponse(
            variants=variants,
            metadata=metadata,
            compliance=compliance_dict
        )
        
    except Exception as e:
        logger.error(f"Generation failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Generation failed: {str(e)}")


@fastapi_app.post("/generate/room")
async def generate_room_description(request: dict):
    """
    Generate ONLY a room-specific description using a custom prompt.
    Bypasses the full property description template.

    Expects: {"prompt": "Your custom prompt here", "target_words": 180, "session_id": "optional"}
    Returns: {"text": "Generated description", "word_count": int, "usage_stats": {...}}
    """
    try:
        prompt = request.get("prompt", "")
        target_words = request.get("target_words", 180)
        session_id = request.get("session_id", None)

        if not prompt:
            raise HTTPException(status_code=400, detail="Prompt is required")

        # Check edit limit if session_id provided
        session = None
        if session_id and brochure_session_service:
            try:
                session = brochure_session_service.load_session(session_id)

                # Check if edit limit reached
                if session.usage_stats.get('edits_count', 0) >= session.usage_stats.get('edit_limit', 100):
                    raise HTTPException(
                        status_code=429,
                        detail=f"Edit limit of {session.usage_stats.get('edit_limit', 100)} reached for this brochure. Please contact support to increase your limit."
                    )
            except HTTPException:
                raise
            except Exception as e:
                logger.warning(f"Failed to load session {session_id}: {e}")
                session = None

        logger.info(f"Room description request: {prompt[:100]}...")

        # Import shared guardrails
        from services.guardrails import get_base_guardrails, get_room_specific_additions

        # Build full prompt with enhanced guardrails
        base_guardrails = get_base_guardrails(target_words)
        room_additions = get_room_specific_additions()

        full_prompt = f"""You are a professional property copywriter for Savills, writing natural, engaging property descriptions.

{base_guardrails}

{room_additions}

TASK:
{prompt}

Remember: Lead with facts, not feelings. Specific details, not vague praise."""

        # Directly call Claude with the custom prompt
        text = await claude_client.generate_completion(
            prompt=full_prompt,
            temperature=0.7,
            max_tokens=800
        )

        word_count = len(text.split())
        logger.info(f"Generated room description: {word_count} words")

        # Calculate cost and update usage stats if session exists
        usage_stats = None
        if session:
            input_tokens = len(full_prompt) // 4  # rough estimate
            output_tokens = len(text) // 4
            cost = (input_tokens * 0.003 / 1000) + (output_tokens * 0.015 / 1000)

            # Update session usage stats
            session.usage_stats['edits_count'] = session.usage_stats.get('edits_count', 0) + 1
            session.usage_stats['total_cost_usd'] = session.usage_stats.get('total_cost_usd', 0.183) + cost

            # Check if limit reached after this edit
            if session.usage_stats['edits_count'] >= session.usage_stats.get('edit_limit', 100):
                session.usage_stats['edit_limit_reached'] = True

            # Save updated session
            brochure_session_service.update_session(session_id, session)

            usage_stats = {
                "edits_count": session.usage_stats['edits_count'],
                "edit_limit": session.usage_stats.get('edit_limit', 100),
                "total_cost_usd": session.usage_stats['total_cost_usd'],
                "edit_limit_reached": session.usage_stats.get('edit_limit_reached', False),
                "this_request_cost_usd": cost
            }

            logger.info(f"✅ Room edit #{session.usage_stats['edits_count']}, cost: ${cost:.4f}, total: ${session.usage_stats['total_cost_usd']:.4f}")

        return {
            "text": text,
            "word_count": word_count,
            "usage_stats": usage_stats
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Room description generation failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Generation failed: {str(e)}")


@fastapi_app.post("/generate/fast", response_model=GenerateResponse)
async def generate_listing_fast(request: GenerateRequest):
    """
    FAST generation endpoint for brochure editor - generates only 1 variant, no compliance.

    Args:
        request: GenerateRequest with property data, location, audience, tone, channel

    Returns:
        GenerateResponse: Single generated variant with metadata

    Raises:
        HTTPException: If generation fails
    """
    logger.info(f"FAST generate request for {request.property_data.property_type} property")

    try:
        # Generate ONLY 1 variant for speed
        variants = await generator.generate_variants(
            request,
            num_variants=1,
            enrichment_data=None,  # No enrichment for speed
            photo_analysis=request.photo_analysis,
            brochure_sections=request.brochure_sections
        )

        metadata = {
            "channel": request.channel.channel.value,
            "tone": request.tone.tone.value,
            "target_words": request.channel.target_words,
            "hard_cap": request.channel.hard_cap,
            "enrichment_used": False,
            "fast_mode": True,
            "target_ranges": {
                "headline_chars": [50, 90],
                "full_text_words": [
                    request.channel.target_words or 150,
                    request.channel.hard_cap or 300
                ] if request.channel.target_words else [150, 300],
                "features_count": [6, 10]
            }
        }

        return GenerateResponse(
            variants=variants,
            metadata=metadata,
            compliance=None  # No compliance check in fast mode
        )

    except Exception as e:
        logger.error(f"Fast generation failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Fast generation failed: {str(e)}")


@fastapi_app.post("/enrich", response_model=EnrichmentResponse)
async def enrich_location(request: EnrichmentRequest):
    """
    Enrich a location with local context data.
    
    Args:
        request: EnrichmentRequest with postcode OR latitude/longitude
        
    Returns:
        EnrichmentResponse: Local amenities, nearest POIs, highlights, descriptors
        
    Raises:
        HTTPException: If enrichment not enabled or request invalid
    """
    logger.info(f"Enrichment request: postcode={request.postcode}, lat={request.latitude}, lon={request.longitude}")
    
    if not settings.enrichment_enabled:
        raise HTTPException(status_code=503, detail="Enrichment service is disabled")
    
    if not enrichment_service:
        raise HTTPException(status_code=503, detail="Enrichment service not available")
    
    # Validate that at least one input is provided
    if not request.postcode and (request.latitude is None or request.longitude is None):
        raise HTTPException(
            status_code=400,
            detail="Must provide either postcode OR both latitude and longitude"
        )
    
    try:
        result = await enrichment_service.enrich_location(
            postcode=request.postcode,
            latitude=request.latitude,
            longitude=request.longitude,
        )
        
        # Convert nearest POIs to POIResult schema
        nearest_converted = {}
        for category, poi in result.get("nearest", {}).items():
            nearest_converted[category] = POIResult(**poi)
        
        return EnrichmentResponse(
            postcode=result["postcode"],
            coordinates=result["coordinates"],
            amenities=result["amenities"],
            nearest=nearest_converted,
            highlights=result["highlights"],
            descriptors=result["descriptors"],
        )
        
    except Exception as e:
        logger.error(f"Enrichment failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Enrichment failed: {str(e)}")


@fastapi_app.post("/postcode/autocomplete", response_model=PostcodeAutocompleteResponse)
async def autocomplete_postcode(request: PostcodeAutocompleteRequest):
    """
    Autocomplete a partial postcode to get address suggestions.

    Args:
        request: PostcodeAutocompleteRequest with partial or full postcode

    Returns:
        PostcodeAutocompleteResponse: List of matching addresses with location data

    Raises:
        HTTPException: If autocomplete fails
    """
    logger.info(f"Postcode autocomplete request: {request.postcode}")

    if not geocoding_client:
        raise HTTPException(status_code=503, detail="Geocoding service not available")

    try:
        addresses = await geocoding_client.autocomplete_postcode(request.postcode)

        # Convert to AddressSuggestion schema
        # Ensure district and county are strings, not None
        suggestions = [
            AddressSuggestion(
                postcode=addr["postcode"],
                district=addr.get("district") or "",
                county=addr.get("county") or "",
                latitude=addr["latitude"],
                longitude=addr["longitude"],
            )
            for addr in addresses
        ]

        logger.info(f"Returning {len(suggestions)} address suggestions")

        return PostcodeAutocompleteResponse(addresses=suggestions)

    except Exception as e:
        logger.error(f"Postcode autocomplete failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Postcode autocomplete failed: {str(e)}")


@fastapi_app.post("/address/lookup", response_model=AddressLookupResponse)
async def lookup_address(request: AddressLookupRequest):
    """
    Get all full addresses for a given postcode using Ideal Postcodes API.

    Args:
        request: AddressLookupRequest with full postcode

    Returns:
        AddressLookupResponse: List of full addresses with detailed information

    Raises:
        HTTPException: If address lookup service is not available or lookup fails
    """
    logger.info(f"Address lookup request: {request.postcode}")

    if not address_lookup_client:
        raise HTTPException(
            status_code=503,
            detail="Address lookup service not available (requires IDEAL_POSTCODES_API_KEY)"
        )

    try:
        # Get addresses from Ideal Postcodes API
        addresses = await address_lookup_client.lookup_addresses(request.postcode)

        # Convert to FullAddress schema
        full_addresses = []
        for addr in addresses:
            # Build formatted single-line address
            parts = [
                addr.get("line_1", ""),
                addr.get("line_2", ""),
                addr.get("line_3", ""),
                addr.get("post_town", ""),
                addr.get("postcode", "")
            ]
            formatted = ", ".join([p for p in parts if p])

            full_addresses.append(
                FullAddress(
                    line_1=addr.get("line_1", ""),
                    line_2=addr.get("line_2", ""),
                    line_3=addr.get("line_3", ""),
                    post_town=addr.get("post_town", ""),
                    postcode=addr.get("postcode", ""),
                    county=addr.get("county", ""),
                    latitude=addr.get("latitude"),
                    longitude=addr.get("longitude"),
                    formatted=formatted
                )
            )

        logger.info(f"Returning {len(full_addresses)} full addresses")

        return AddressLookupResponse(addresses=full_addresses)

    except Exception as e:
        logger.error(f"Address lookup failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Address lookup failed: {str(e)}")


@fastapi_app.post("/compliance/check", response_model=ComplianceCheckResponse)
async def check_compliance(request: ComplianceCheckRequest):
    """
    Check property listing text for compliance and keyword coverage.
    
    Args:
        request: ComplianceCheckRequest with text, channel, and optional property data
        
    Returns:
        ComplianceCheckResponse: Compliance analysis with warnings and keyword coverage
        
    Raises:
        HTTPException: If compliance check fails
    """
    logger.info(f"Compliance check request for {request.channel} channel")
    
    try:
        # Convert property_data to dict if provided
        property_data_dict = None
        if request.property_data:
            property_data_dict = {
                "property_type": request.property_data.property_type.value,
                "bedrooms": request.property_data.bedrooms,
                "bathrooms": request.property_data.bathrooms,
                "epc_rating": request.property_data.epc_rating,
                "features": request.property_data.features,
            }
        
        # Run compliance check
        compliance_result = compliance_checker.check_compliance(
            text=request.text,
            channel=request.channel,
            property_data=property_data_dict
        )
        
        # Run keyword coverage analysis
        property_features = request.property_data.features if request.property_data else None
        keyword_result = keyword_coverage.analyze_coverage(
            text=request.text,
            channel=request.channel,
            property_features=property_features
        )
        
        # Convert warnings to ComplianceWarning objects
        warnings = [
            ComplianceWarning(
                severity=w["severity"],
                message=w["message"],
                suggestion=w.get("suggestion")
            )
            for w in compliance_result["warnings"]
        ]
        
        # Create keyword coverage result
        keyword_coverage_result = KeywordCoverageResult(
            covered_keywords=keyword_result["covered_keywords"],
            missing_keywords=keyword_result["missing_keywords"],
            coverage_score=keyword_result["coverage_score"],
            suggestions=keyword_result["suggestions"]
        )
        
        # Combine suggestions
        all_suggestions = list(set(
            compliance_result["suggestions"] + keyword_result["suggestions"]
        ))[:5]  # Limit to 5
        
        return ComplianceCheckResponse(
            compliant=compliance_result["compliant"],
            warnings=warnings,
            compliance_score=compliance_result["score"],
            keyword_coverage=keyword_coverage_result,
            suggestions=all_suggestions
        )
        
    except Exception as e:
        logger.error(f"Compliance check failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Compliance check failed: {str(e)}")


@fastapi_app.post("/shrink", response_model=ShrinkResponse)
async def shrink_text(request: ShrinkRequest):
    """
    Compress text to target word count while preserving tone and keywords.
    
    Args:
        request: ShrinkRequest with text, target word count, optional tone/channel, and keywords
        
    Returns:
        ShrinkResponse: Compressed text with metrics
        
    Raises:
        HTTPException: If compression fails
    """
    logger.info(f"Shrink request: target {request.target_words} words, tone={request.tone}, channel={request.channel}")
    
    if not settings.shrink_enabled:
        raise HTTPException(status_code=503, detail="Shrink feature is disabled")
    
    try:
        result = await shrink_service.compress(
            text=request.text,
            target_words=request.target_words,
            tone=request.tone,
            channel=request.channel,
            preserve_keywords=request.preserve_keywords
        )
        return result
        
    except Exception as e:
        logger.error(f"Compression failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Compression failed: {str(e)}")


@fastapi_app.post("/analyze-images")
async def analyze_images(files: List[UploadFile] = File(...)):
    """
    Analyze uploaded property images.

    Args:
        files: List of image files to analyze

    Returns:
        List[ImageAnalysisResponse]: Analysis results for each image

    Raises:
        HTTPException: If analysis fails
    """
    logger.info(f"Image analysis request received: {len(files) if files else 0} files")

    if not files:
        raise HTTPException(status_code=422, detail="No files provided")
    
    try:
        results = []
        for file in files:
            # Read file content
            content = await file.read()

            try:
                # Analyze image (rate limiting handled by GlobalRateLimiter in vision client)
                analysis = await vision_adapter.analyze_image(
                    image_data=content,
                    filename=file.filename
                )
                results.append(analysis)
            except ValidationError as e:
                # Return validation error for specific file
                logger.warning(f"Validation failed for {file.filename}: {str(e)}")
                raise HTTPException(status_code=400, detail=f"{file.filename}: {str(e)}")

        return results
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Image analysis failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Image analysis failed: {str(e)}")


@fastapi_app.post("/api/remove-background", response_model=BackgroundRemovalResponse)
async def remove_background(request: BackgroundRemovalRequest):
    """
    Remove background from an image using AI.

    Uses rembg (U2Net deep learning model) to automatically detect and remove
    backgrounds from property photos. Returns a PNG with transparent background.

    Args:
        request: BackgroundRemovalRequest with base64 encoded image

    Returns:
        BackgroundRemovalResponse: PNG image with transparent background

    Raises:
        HTTPException: If background removal fails
    """
    logger.info("Background removal request received")

    try:
        # Get background remover service
        bg_remover = get_background_remover()

        # Process the image
        result_base64, metadata = bg_remover.remove_background(
            image_base64=request.image,
            alpha_matting=request.alpha_matting,
            foreground_threshold=request.foreground_threshold,
            background_threshold=request.background_threshold
        )

        return BackgroundRemovalResponse(
            success=True,
            image=result_base64,
            original_size=list(metadata['original_size']),
            processed_size=list(metadata['processed_size']),
            was_resized=metadata['was_resized']
        )

    except RuntimeError as e:
        # Service not available (rembg not installed)
        logger.error(f"Background removal service error: {e}")
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        logger.error(f"Background removal failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Background removal failed: {str(e)}")


@fastapi_app.post("/export/pdf", response_model=ExportResponse)
async def export_pdf(request: PDFExportRequest):
    """
    Generate a branded PDF brochure.
    
    Args:
        request: PDF export request with listing data, images, and branding
        
    Returns:
        ExportResponse: Export metadata with download URL
        
    Raises:
        HTTPException: If export service unavailable or generation fails
    """
    if not export_service:
        raise HTTPException(status_code=503, detail="Export service not available")
    
    logger.info(f"PDF export requested for {request.listing_data.address}")
    
    try:
        # Generate PDF
        result = export_service.generate_pdf(
            listing_data=request.listing_data,
            images=request.images,
            branding=request.branding,
            options=request.options
        )
        
        # Build response
        response = ExportResponse(
            export_id=result["export_id"],
            download_url=f"/export/{result['export_id']}",
            size_bytes=result["size_bytes"],
            size_mb=result["size_mb"],
            size_warning_exceeded=result["size_warning_exceeded"],
            meta=result["meta"]
        )
        
        logger.info(f"PDF generated: {result['export_id']} ({result['size_mb']} MB)")
        
        return response
        
    except Exception as e:
        logger.error(f"PDF export failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"PDF export failed: {str(e)}")


@fastapi_app.post("/export/pack", response_model=PackExportResponse)
async def export_pack(request: PackExportRequest):
    """
    Generate a complete marketing pack (PDF + portal + social + email).
    
    Args:
        request: Pack export request with listing data, images, and branding
        
    Returns:
        PackExportResponse: Export metadata with download URL and contents manifest
        
    Raises:
        HTTPException: If export service unavailable or generation fails
    """
    if not export_service:
        raise HTTPException(status_code=503, detail="Export service not available")
    
    logger.info(f"Marketing pack export requested for {request.listing_data.address}")
    
    try:
        # Generate marketing pack
        result = export_service.generate_marketing_pack(
            listing_data=request.listing_data,
            images=request.images,
            branding=request.branding,
            options=request.options
        )
        
        # Build response
        response = PackExportResponse(
            export_id=result["export_id"],
            download_url=f"/export/{result['export_id']}",
            size_bytes=result["size_bytes"],
            size_mb=result["size_mb"],
            contents=result["contents"]
        )
        
        logger.info(f"Marketing pack generated: {result['export_id']} ({result['size_mb']} MB)")
        
        return response
        
    except Exception as e:
        logger.error(f"Pack export failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Pack export failed: {str(e)}")


@fastapi_app.get("/export/{export_id}")
async def get_export(export_id: str):
    """
    Retrieve a previously generated export (PDF or ZIP).
    
    Args:
        export_id: Export identifier returned from /export/pdf or /export/pack
        
    Returns:
        FileResponse: The requested file for download
        
    Raises:
        HTTPException: If export not found or export service unavailable
    """
    if not export_service:
        raise HTTPException(status_code=503, detail="Export service not available")
    
    logger.info(f"Export retrieval requested: {export_id}")
    
    try:
        # Get export metadata
        export_info = export_service.get_export(export_id)
        
        # Determine media type
        media_type = "application/pdf" if export_info["file_type"] == "pdf" else "application/zip"
        
        # Determine filename
        filename = f"{export_id}.{export_info['file_type']}"
        
        # Return file
        return FileResponse(
            path=export_info["file_path"],
            media_type=media_type,
            filename=filename
        )
        
    except FileNotFoundError:
        logger.warning(f"Export not found: {export_id}")
        raise HTTPException(status_code=404, detail=f"Export not found: {export_id}")
    except Exception as e:
        logger.error(f"Export retrieval failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Export retrieval failed: {str(e)}")


@fastapi_app.post("/refine-text")
async def refine_text(request: dict):
    """
    Refine property text using AI.

    Args:
        request: Dictionary with 'text' and 'instruction' fields

    Returns:
        Dictionary with refined text
    """
    try:
        text = request.get("text", "")
        instruction = request.get("instruction", "")

        if not text or not instruction:
            raise HTTPException(status_code=400, detail="Both 'text' and 'instruction' are required")

        logger.info(f"Refining text with instruction: {instruction[:50]}...")

        # Build refinement prompt
        prompt = f"""You are an expert property copywriter. The user wants to refine this text:

TEXT:
{text}

INSTRUCTION:
{instruction}

Please provide the refined version that follows their instruction while maintaining professional property marketing standards. Return ONLY the refined text, nothing else."""

        # Use Claude to refine
        if claude_client and claude_client.is_available():
            response = await claude_client.generate_completion(
                prompt=prompt,
                max_tokens=1000,
                temperature=0.7
            )
            refined_text = response.strip()
        else:
            # Fallback: return original with note
            refined_text = f"[Mock refinement] {text}"

        return {"refined_text": refined_text}

    except Exception as e:
        logger.error(f"Text refinement failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Text refinement failed: {str(e)}")


@fastapi_app.post("/generate-text-variant")
async def generate_text_variant(request: dict):
    """
    Generate a variant of existing text for brochure editor.
    Used by text regeneration system with credit tracking.
    Cost: ~0.003 GBP per call (~500 input + 150 output tokens)

    Args:
        request: Dict with:
            - original_text (str): Text to regenerate
            - context (dict): Page context (page_name, property_type, tone, page_layout, max_length)
            - user_email (str): For usage tracking

    Returns:
        Dict with regenerated text
    """
    try:
        original_text = request.get("original_text", "")
        context = request.get("context", {})
        user_email = request.get("user_email", "")

        if not original_text:
            raise HTTPException(status_code=400, detail="original_text is required")

        logger.info(f"Generating text variant for {context.get('page_name', 'Unknown')} (user: {user_email})")

        # Build prompt for regeneration
        tone = context.get("tone", "professional")
        page_name = context.get("page_name", "Unknown")
        property_type = context.get("property_type", "property")
        page_layout = context.get("page_layout", "standard")
        max_length = context.get("max_length", 1000)

        # Tone instructions
        tone_instructions = {
            "professional": "formal, trustworthy, and detailed",
            "punchy": "concise, energetic, and impactful",
            "boutique": "sophisticated, exclusive, and refined",
            "premium": "luxurious, aspirational, and elegant",
            "conversational": "warm, friendly, and approachable"
        }
        tone_desc = tone_instructions.get(tone, "professional and engaging")

        prompt = f"""You are an expert property copywriter. Rewrite the following text to be more engaging and persuasive while maintaining the same key information.

**Original Text:**
{original_text}

**Context:**
- Page: {page_name}
- Property Type: {property_type}
- Page Layout: {page_layout}
- Target Tone: {tone_desc}

**Instructions:**
1. Keep the same facts and features mentioned in the original
2. Make the language more {tone_desc}
3. Improve flow and readability
4. Avoid clichés like "stunning", "immaculate", "dream home"
5. Use specific, vivid details
6. Maximum {max_length} characters
7. DO NOT add information that wasn't in the original
8. DO NOT use superlatives unless they were in the original

Provide ONLY the rewritten text, no explanations or meta-commentary."""

        # Use mock generation if Claude not available
        if not claude_client or not claude_client.is_available():
            logger.warning("Claude not available - using mock variant")
            mock_variants = [
                f"[Variant] {original_text[:500]}...",
                f"This {property_type} offers {original_text[:100]}...",
                f"Featuring {original_text[:100]}..."
            ]
            import random
            regenerated_text = random.choice(mock_variants)
        else:
            # Call Claude
            response = await claude_client.generate_completion(
                prompt=prompt,
                max_tokens=500,
                temperature=0.8
            )
            regenerated_text = response.strip()

        # Truncate if exceeds max length
        if len(regenerated_text) > max_length:
            regenerated_text = regenerated_text[:max_length].rsplit(' ', 1)[0] + '...'

        logger.info(f"Generated variant: {len(regenerated_text)} chars")

        return {
            "text": regenerated_text,
            "original_length": len(original_text),
            "new_length": len(regenerated_text),
            "model_used": "claude-3-5-sonnet" if claude_client and claude_client.is_available() else "mock"
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Text variant generation failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Text variant generation failed: {str(e)}")


@fastapi_app.post("/export/brochure-pdf")
async def export_brochure_pdf(request: dict):
    """
    Export interactive brochure to PDF.

    Args:
        request: Complete brochure data including pages, photos (dataUrls), layouts

    Returns:
        PDF file as blob
    """
    try:
        logger.info("Generating interactive brochure PDF")

        # Import brochure PDF generator
        from services.brochure_pdf_generator import BrochurePDFGenerator
        import base64
        import tempfile
        import uuid
        from pathlib import Path

        # Create temp directory for this brochure
        temp_dir = Path(tempfile.gettempdir()) / f"brochure_{uuid.uuid4().hex}"
        temp_dir.mkdir(exist_ok=True)

        # Extract property and agent data
        property_data = request.get("property", {})
        agent_data = request.get("agent", {})
        pages_data = request.get("pages", [])
        floorplan_data = request.get("floorplan", None)
        layout_style = request.get("layoutStyle", "standard")

        logger.info(f"Processing {len(pages_data)} pages with {layout_style} layout")

        # Process agent photo if provided
        if agent_data.get("photoDataUrl"):
            try:
                photo_data_url = agent_data["photoDataUrl"]
                if photo_data_url.startswith("data:image"):
                    header, encoded = photo_data_url.split(",", 1)
                    image_data = base64.b64decode(encoded)

                    image_ext = "jpg"
                    if "png" in header:
                        image_ext = "png"

                    agent_photo_path = temp_dir / f"agent_photo.{image_ext}"
                    with open(agent_photo_path, "wb") as f:
                        f.write(image_data)

                    agent_data["photoPath"] = str(agent_photo_path)
                    logger.info(f"✅ Agent photo saved: {agent_photo_path}")
            except Exception as e:
                logger.warning(f"Failed to decode agent photo: {e}")

        # Process logo if provided
        if agent_data.get("logoUrl"):
            # Logo URL is already a path, just pass it through
            logger.info(f"✅ Logo URL: {agent_data['logoUrl']}")

        # Process floorplan if provided
        if floorplan_data:
            try:
                if floorplan_data.startswith("data:image") or floorplan_data.startswith("data:application/pdf"):
                    header, encoded = floorplan_data.split(",", 1)
                    file_data = base64.b64decode(encoded)

                    file_ext = "jpg"
                    if "png" in header:
                        file_ext = "png"
                    elif "pdf" in header:
                        file_ext = "pdf"

                    floorplan_path = temp_dir / f"floorplan.{file_ext}"
                    with open(floorplan_path, "wb") as f:
                        f.write(file_data)

                    # Add floorplan to agent_data for PDF generator
                    agent_data["floorplanPath"] = str(floorplan_path)
                    logger.info(f"✅ Floorplan saved: {floorplan_path}")
            except Exception as e:
                logger.warning(f"Failed to decode floorplan: {e}")

        # BUG FIX #3: Track failed photos for better error handling
        failed_photos = []
        total_photos = sum(len(page.get("photos", [])) for page in pages_data)

        # Process pages and decode base64 images
        processed_pages = []
        for page in pages_data:
            processed_photos = []
            page_title = page.get("title", "Unknown Page")

            for photo in page.get("photos", []):
                # Decode base64 dataUrl
                data_url = photo.get("dataUrl", "")
                photo_name = photo.get("name", "unknown.jpg")

                if data_url.startswith("data:image"):
                    try:
                        # Extract base64 data (format: data:image/jpeg;base64,...)
                        header, encoded = data_url.split(",", 1)
                        image_data = base64.b64decode(encoded)

                        # Save to temp file
                        image_ext = "jpg"
                        if "png" in header:
                            image_ext = "png"
                        elif "webp" in header:
                            image_ext = "webp"

                        image_filename = f"photo_{uuid.uuid4().hex}.{image_ext}"
                        image_path = temp_dir / image_filename

                        with open(image_path, "wb") as f:
                            f.write(image_data)

                        # BUG FIX #8: Include custom dimensions and wrap style
                        processed_photos.append({
                            "path": str(image_path),
                            "name": photo_name,
                            "category": photo.get("category", page.get("type", "")),
                            "width": photo.get("width"),  # Custom width
                            "height": photo.get("height"),  # Custom height
                            "wrapStyle": photo.get("wrapStyle", "square")  # Text wrapping
                        })

                    except Exception as e:
                        error_msg = f"{photo_name} on page '{page_title}': {str(e)}"
                        logger.warning(f"Failed to decode photo: {error_msg}")
                        failed_photos.append(error_msg)
                        continue

            processed_pages.append({
                "title": page.get("title", ""),
                "type": page.get("type", ""),
                "layout": page.get("layout", "standard"),
                "photos": processed_photos,
                "content": page.get("content", [])
            })

        # BUG FIX #3: Report failed photos if too many failures
        if failed_photos:
            failure_rate = len(failed_photos) / max(total_photos, 1)
            logger.warning(f"Failed to process {len(failed_photos)}/{total_photos} photos")

            if failure_rate > 0.5:  # More than 50% failed
                raise HTTPException(
                    status_code=400,
                    detail={
                        "message": f"Too many photo decode failures ({len(failed_photos)}/{total_photos})",
                        "failed_photos": failed_photos[:10]  # First 10 failures
                    }
                )
            elif len(failed_photos) > 0:
                # Log warning but continue
                logger.warning(f"Some photos failed but continuing: {', '.join(failed_photos[:5])}")

        # Determine brand colors based on agent/org
        # Check for agency identifier (from logoUrl, agent name, or orgId in future)
        brand_colors = {"primary": "#002855", "secondary": "#C5A572"}  # Default to Savills

        logo_url = agent_data.get("logoUrl", "")
        agent_name = agent_data.get("name", "").lower()

        if "savills" in logo_url.lower() or "savills" in agent_name:
            # Savills branding
            brand_colors = {"primary": "#002855", "secondary": "#C5A572"}
        elif "doorstep" in logo_url.lower() or "doorstep" in agent_name:
            # Doorstep branding (if they generate their own brochures)
            brand_colors = {"primary": "#17A2B8", "secondary": "#FF6B6B"}
        # Future: Add more agencies here as they join

        logger.info(f"Using brand colors: {brand_colors}")

        # Generate PDF
        pdf_filename = f"brochure_{uuid.uuid4().hex}.pdf"
        pdf_path = temp_dir / pdf_filename

        generator = BrochurePDFGenerator()
        generator.generate_brochure_pdf(
            property_data=property_data,
            agent_data=agent_data,
            pages=processed_pages,
            layout_style=layout_style,
            output_path=str(pdf_path),
            brand_colors=brand_colors
        )

        logger.info(f"PDF generated: {pdf_path}")

        # Return PDF as file response
        from fastapi.responses import FileResponse

        return FileResponse(
            path=str(pdf_path),
            media_type="application/pdf",
            filename=f"{property_data.get('address', 'brochure').replace(' ', '_')}.pdf",
            headers={
                "Content-Disposition": f"attachment; filename=\"{property_data.get('address', 'brochure').replace(' ', '_')}.pdf\""
            }
        )

    except Exception as e:
        logger.error(f"Brochure PDF export failed: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Brochure PDF export failed: {str(e)}")


# ============================================================================
# NEW ENDPOINTS: Content Generators + Usage Tracking + Brand Profiles
# ============================================================================

from services.usage_tracker import UsageTracker
from services.content_generators import (
    RightmoveGenerator,
    SocialMediaGenerator,
    EmailCampaignGenerator
)
from services.brand_profiles import BrandProfileManager, get_brand_profile

# Initialize new services
usage_tracker = UsageTracker()
rightmove_gen = RightmoveGenerator(claude_client)
social_gen = SocialMediaGenerator(claude_client)
email_gen = EmailCampaignGenerator(claude_client)
brand_manager = BrandProfileManager()

logger.info("Initialized content generators and usage tracking")


@fastapi_app.get("/usage/check")
async def check_usage(user_email: str):
    """
    Check user's free trial / subscription status.

    Args:
        user_email: User email address

    Returns:
        Usage data and trial status
    """
    try:
        usage_data = usage_tracker.get_user_usage(user_email)
        can_create, message = usage_tracker.can_create_brochure(user_email)

        return {
            "user_email": user_email,
            "can_create_brochure": can_create,
            "message": message,
            "usage": usage_data
        }

    except Exception as e:
        logger.error(f"Usage check failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@fastapi_app.get("/usage/stats")
async def get_usage_stats():
    """
    Get overall usage statistics (admin endpoint).

    Returns:
        Total users, brochures, etc.
    """
    try:
        stats = usage_tracker.get_stats()
        return stats

    except Exception as e:
        logger.error(f"Stats retrieval failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@fastapi_app.post("/usage/deduct")
async def deduct_credits(request: dict):
    """
    Deduct credits from user account.

    Args:
        request: {
            "user_email": str,
            "credits": float,
            "action": str,
            "metadata": dict (optional)
        }

    Returns:
        Updated usage data
    """
    try:
        user_email = request.get("user_email")
        credits = request.get("credits", 0)
        action = request.get("action", "unknown")
        metadata = request.get("metadata", {})

        if not user_email:
            raise HTTPException(status_code=400, detail="user_email is required")

        # For now, just log the deduction (implement actual credit system later)
        logger.info(f"Credits deducted: {user_email} - {credits} credits for {action}")
        logger.info(f"Metadata: {metadata}")

        # Get user usage
        usage_data = usage_tracker.get_user_usage(user_email)

        return {
            "success": True,
            "message": f"{credits} credits deducted for {action}",
            "usage": usage_data
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Credit deduction failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@fastapi_app.post("/usage/reward")
async def reward_credits(request: dict):
    """
    Reward credits to user for constructive feedback.

    Args:
        request: {
            "user_email": str,
            "credits": float,
            "reason": str,
            "feedback": str
        }

    Returns:
        Updated usage data with reward confirmation
    """
    try:
        user_email = request.get("user_email")
        credits = request.get("credits", 0)
        reason = request.get("reason", "feedback")
        feedback = request.get("feedback", "")

        if not user_email:
            raise HTTPException(status_code=400, detail="user_email is required")

        # Log the reward for machine learning
        logger.info(f"✨ Credits rewarded: {user_email} + {credits} credits for {reason}")
        logger.info(f"Feedback for ML: {feedback}")

        # Get user usage
        usage_data = usage_tracker.get_user_usage(user_email)

        return {
            "success": True,
            "message": f"🎉 You earned {credits} credits for providing valuable feedback!",
            "credits_rewarded": credits,
            "reason": reason,
            "usage": usage_data
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Credit reward failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@fastapi_app.post("/api/ai-command")
async def process_ai_command(request: dict):
    """
    Process natural language AI commands for brochure editing.

    Args:
        request: {
            "command": str,
            "pageContext": {
                "pageIndex": int,
                "pageTitle": str,
                "pageType": str,
                "photosCount": int,
                "contentBlocks": list
            },
            "fullState": dict
        }

    Returns:
        {
            "message": str,
            "changes": dict (optional)
        }
    """
    try:
        command = request.get("command", "").lower().strip()
        page_context = request.get("pageContext", {})
        full_state = request.get("fullState", {})

        if not command:
            raise HTTPException(status_code=400, detail="command is required")

        logger.info(f"🤖 AI Command: '{command}' on page {page_context.get('pageIndex', 0)} ({page_context.get('pageTitle', 'Unknown')})")

        # Parse command and generate response
        # Simple pattern matching for now (can be replaced with Claude API for NLP)

        changes = {}
        message = ""

        # Change title
        if "change" in command and "title" in command:
            # Extract new title (simple parsing - improve with Claude API)
            if "to " in command:
                new_title = command.split("to ", 1)[1].strip().strip('"\'')
                changes["title"] = new_title.title()
                message = f"✓ Changed title to '{changes['title']}'"

        # Remove photo
        elif "remove" in command and ("photo" in command or "image" in command):
            if "first" in command or "1" in command:
                changes["removePhoto"] = 0
                message = "✓ Removed first photo from page"
            elif "last" in command:
                changes["removePhoto"] = page_context.get("photosCount", 1) - 1
                message = "✓ Removed last photo from page"
            else:
                changes["removePhoto"] = 0
                message = "✓ Removed photo from page"

        # Add feature
        elif "add" in command and "feature" in command:
            if "about " in command:
                feature_text = command.split("about ", 1)[1].strip().strip('"\'')
                changes["addContent"] = {
                    "type": "feature",
                    "text": feature_text
                }
                message = f"✓ Added feature: '{feature_text}'"

        # Rewrite section
        elif "rewrite" in command or "change" in command:
            message = "🤖 I'll rewrite that section. This feature uses AI text generation and will be implemented soon."

        # Default response
        else:
            message = f"🤖 I understood: '{command}'. This is a new command pattern - I'll learn from it!"

        return {
            "message": message,
            "changes": changes if changes else None
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"AI command processing failed: {e}")
        import traceback
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"AI command failed: {str(e)}")


@fastapi_app.post("/api/transform-text", response_model=TextTransformResponse)
async def transform_text(request: TextTransformRequest):
    """
    Transform text content using AI with before/after preview.

    Supports multiple transformation styles:
    - paragraph: Standard prose format
    - bullet_points: Bullet point list
    - key_features: Highlighted key features
    - concise: Shorter, punchy version
    - elaborate: Longer, more detailed version
    - professional: Formal tone
    - friendly: Warm, approachable tone
    """
    try:
        logger.info(f"🤖 Text transformation request: {request.transformation_style} for '{request.page_title}'")

        # Check edit limit if session_id provided
        session = None
        if request.session_id and brochure_session_service:
            try:
                session = brochure_session_service.load_session(request.session_id)

                # Check if edit limit reached
                if session.usage_stats.get('edits_count', 0) >= session.usage_stats.get('edit_limit', 100):
                    raise HTTPException(
                        status_code=429,
                        detail=f"Edit limit of {session.usage_stats.get('edit_limit', 100)} reached for this brochure. Please contact support to increase your limit."
                    )
            except HTTPException:
                raise
            except Exception as e:
                logger.warning(f"Failed to load session {request.session_id}: {e}")
                session = None

        # Check if Claude client is available
        if not claude_client or not claude_client.is_available():
            logger.warning("Claude API not available - using fallback transformation")
            return TextTransformResponse(
                original_text=request.original_text,
                transformed_text=request.original_text,
                transformation_style=request.transformation_style,
                preview_message="Claude API is not available. Original text returned unchanged.",
                success=False
            )

        # Build transformation prompt based on style
        style_instructions = {
            TextTransformationStyle.PARAGRAPH: "Rewrite this as flowing, elegant prose with smooth transitions between sentences.",
            TextTransformationStyle.BULLET_POINTS: "Extract the key points and present them as a clean bullet point list. Start each point with '•'. Be concise and impactful.",
            TextTransformationStyle.KEY_FEATURES: "Identify and highlight the 3-5 most compelling features. Present each as a short, punchy statement that emphasizes benefits.",
            TextTransformationStyle.CONCISE: "Condense this text to be 30-40% shorter while preserving all key selling points. Make every word count.",
            TextTransformationStyle.ELABORATE: "Expand this text with more vivid descriptions, sensory details, and lifestyle benefits. Make it 50% longer and more evocative.",
            TextTransformationStyle.PROFESSIONAL: "Rewrite in a formal, professional tone suitable for corporate clients and high-end properties. Use simple, direct language like real estate agents. Include specific measurements and facts where possible.",
            TextTransformationStyle.FRIENDLY: "Rewrite in a warm, welcoming tone that makes readers feel at home. Use inclusive language.",
            TextTransformationStyle.LUXURY: "Rewrite in a luxury, boutique, lifestyle tone. Aspirational and sophisticated. Emphasize prestige, quality, exclusivity, and refined living. Use elegant but not flowery language.",
            TextTransformationStyle.BOUTIQUE: "Rewrite in a boutique, lifestyle-focused tone. Warm, aspirational storytelling. Focus on experience and emotion. Paint a picture of lifestyle benefits.",
            TextTransformationStyle.LIFESTYLE: "Rewrite with lifestyle-focused aspirational language. Emphasize how the space enhances daily living. Focus on experience, atmosphere, and quality of life.",
            TextTransformationStyle.STRAIGHTFORWARD: "Rewrite in a basic, straightforward, factual style. Minimal adjectives. Focus on practical details and concrete facts. Simple, direct sentences like Savills.",
            TextTransformationStyle.FACTUAL: "Rewrite using ONLY factual information. Remove ALL embellishment, flowery language, and subjective descriptions. Include measurements, dates, specific counts. Focus ONLY on structural features."
        }

        instruction = style_instructions.get(
            request.transformation_style,
            "Rewrite this text to improve clarity and impact."
        )

        # Add context from page type if available
        context_note = ""
        if request.page_type:
            context_note = f"\n\nContext: This describes the {request.page_type} of a property."

        # Add custom instruction if provided
        if request.custom_instruction:
            instruction += f"\n\nAdditional instruction: {request.custom_instruction}"

        # Build the full prompt with Savills-style requirements
        prompt = f"""{instruction}{context_note}

Page Title: {request.page_title}

CRITICAL WRITING RULES (ALWAYS FOLLOW):
1. Focus ONLY on STRUCTURAL features (built-ins, room sizes, windows, doors, architectural details)
2. NEVER describe furniture, art, rugs, chandeliers, curtains, bedding, decorative items
3. NEVER use AI phrases: "distinguished residence", "epitomises", "seamlessly blending", "sanctuary"
4. NEVER use hyphens mid-sentence (e.g. "open-plan" → "open plan", "well-appointed" → "well appointed")
5. Use SIMPLE language: "wonderfully presented", "excellent proportions", "lovely aspect"
6. NO flowery descriptions: "restorative repose", "enchanting vistas", "morning contemplation"
7. Include CONCRETE FACTS: measurements, dates, specific counts when possible
8. Write SHORT, factual sentences. Professional but direct.

Original Text:
{request.original_text}

Transformed Text:"""

        # Call Claude API
        try:
            response = await claude_client.generate_completion(
                prompt=prompt,
                max_tokens=1000,
                temperature=0.7
            )

            transformed_text = response.strip()

            # Calculate cost and update usage stats if session exists
            if session:
                input_tokens = len(prompt) // 4  # rough estimate
                output_tokens = len(transformed_text) // 4
                cost = (input_tokens * 0.003 / 1000) + (output_tokens * 0.015 / 1000)

                # Update session usage stats
                session.usage_stats['transforms_count'] = session.usage_stats.get('transforms_count', 0) + 1
                session.usage_stats['total_cost_usd'] = session.usage_stats.get('total_cost_usd', 0.183) + cost

                # Save updated session
                brochure_session_service.update_session(request.session_id, session)

                logger.info(f"✅ Transform #{session.usage_stats['transforms_count']}, cost: ${cost:.4f}, total: ${session.usage_stats['total_cost_usd']:.4f}")

            # Generate preview message
            style_names = {
                TextTransformationStyle.PARAGRAPH: "flowing prose",
                TextTransformationStyle.BULLET_POINTS: "bullet points",
                TextTransformationStyle.KEY_FEATURES: "key features",
                TextTransformationStyle.CONCISE: "concise version",
                TextTransformationStyle.ELABORATE: "detailed version",
                TextTransformationStyle.PROFESSIONAL: "professional tone",
                TextTransformationStyle.FRIENDLY: "friendly tone",
                TextTransformationStyle.LUXURY: "luxury/boutique tone",
                TextTransformationStyle.BOUTIQUE: "boutique/lifestyle tone",
                TextTransformationStyle.LIFESTYLE: "lifestyle-focused tone",
                TextTransformationStyle.STRAIGHTFORWARD: "straightforward/factual",
                TextTransformationStyle.FACTUAL: "pure factual"
            }

            style_name = style_names.get(request.transformation_style, "new format")
            preview_message = f"Transformed to {style_name}"

            if len(transformed_text) < len(request.original_text) * 0.7:
                preview_message += f" ({len(transformed_text)} chars, {int((1 - len(transformed_text)/len(request.original_text)) * 100)}% shorter)"
            elif len(transformed_text) > len(request.original_text) * 1.3:
                preview_message += f" ({len(transformed_text)} chars, {int((len(transformed_text)/len(request.original_text) - 1) * 100)}% longer)"

            return TextTransformResponse(
                original_text=request.original_text,
                transformed_text=transformed_text,
                transformation_style=request.transformation_style,
                preview_message=preview_message,
                success=True
            )

        except Exception as api_error:
            logger.error(f"Claude API call failed: {api_error}")
            raise HTTPException(
                status_code=500,
                detail=f"Text transformation failed: {str(api_error)}"
            )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Text transformation failed: {e}")
        import traceback
        logger.error(traceback.format_exc())
        raise HTTPException(
            status_code=500,
            detail=f"Text transformation failed: {str(e)}"
        )


@fastapi_app.post("/api/repurpose-brochure", response_model=RepurposeResponse)
async def repurpose_brochure(request: RepurposeRequest):
    """
    Repurpose brochure content for multiple marketing platforms.

    Generates platform-specific content from brochure session data:
    - Portal listings (Rightmove, Zoopla, OnTheMarket)
    - Social media posts (Facebook, Instagram, LinkedIn)
    - Email/newsletter content
    """
    try:
        logger.info(f"🔄 Repurpose request for session {request.session_id}: {request.platforms}")

        # Load brochure session
        session = brochure_session_service.load_session(request.session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Brochure session not found")

        # Check if Claude is available
        if not claude_client or not claude_client.is_available():
            raise HTTPException(status_code=503, detail="AI service temporarily unavailable")

        # Extract property data
        prop = session.property
        pages = session.pages

        # Get brochure content summary
        brochure_content = "\n\n".join([
            f"{page.get('title', 'Page')}: {page.get('content', {}).get('description', '')}"
            for page in pages if page.get('content', {}).get('description')
        ])

        # Platform-specific prompts
        platform_prompts = {
            "rightmove": {
                "instructions": "Write a Rightmove listing (MAX 1000 characters). Follow Rightmove guidelines: professional, factual, highlight key selling points. NO hyphens mid-sentence.",
                "target_chars": 1000
            },
            "zoopla": {
                "instructions": "Write a Zoopla listing (MAX 1000 characters). Professional tone, emphasize location and features. NO hyphens mid-sentence.",
                "target_chars": 1000
            },
            "onthemarket": {
                "instructions": "Write an OnTheMarket listing (MAX 1000 characters). Clear, concise, highlight unique features. NO hyphens mid-sentence.",
                "target_chars": 1000
            },
            "facebook": {
                "instructions": "Write a Facebook post (250-300 characters). Engaging, conversational, emoji-friendly. Include 3-5 relevant hashtags. Call-to-action at end.",
                "target_chars": 300
            },
            "instagram": {
                "instructions": "Write an Instagram caption (150-200 characters of text, then 10-15 hashtags). Aspirational, lifestyle-focused. Heavy on hashtags.",
                "target_chars": 200
            },
            "linkedin": {
                "instructions": "Write a LinkedIn post (250-300 characters). Professional tone, emphasize investment/business aspects. 2-3 relevant hashtags.",
                "target_chars": 300
            },
            "email": {
                "instructions": "Write an email newsletter (400-500 characters). Subject line + body. Professional but warm. Strong call-to-action. NO hyphens mid-sentence.",
                "target_chars": 500
            }
        }

        generated_content = {}
        total_cost = 0.0

        # Generate content for each requested platform
        for platform in request.platforms:
            if platform not in platform_prompts:
                continue

            prompt_config = platform_prompts[platform]

            prompt = f"""{prompt_config['instructions']}

Property Details:
- Type: {prop.get('propertyType', 'Property')}
- Bedrooms: {prop.get('bedrooms', 'N/A')}
- Bathrooms: {prop.get('bathrooms', 'N/A')}
- Location: {prop.get('address', 'N/A')}
- Price: £{prop.get('askingPrice', 'POA')}

Brochure Content Summary:
{brochure_content[:1500]}

CRITICAL RULES:
1. Focus ONLY on structural features (built-ins, room sizes, windows, doors)
2. NEVER describe furniture, art, rugs, decorative items
3. NO hyphens mid-sentence (e.g. "open plan" not "open-plan")
4. Include concrete facts: measurements, room counts
5. Simple, direct language like Savills
6. Character limit: {prompt_config['target_chars']} characters MAX

Generate the content now in this format:

HEADLINE: [8-12 word headline]

DESCRIPTION:
[Main description text - {prompt_config['target_chars']} characters max]

KEY_FEATURES:
- [Feature 1]
- [Feature 2]
- [Feature 3]
- [Feature 4]
- [Feature 5]

{f"HASHTAGS: [comma-separated hashtags]" if platform in ['facebook', 'instagram', 'linkedin'] else ""}
{f"CALL_TO_ACTION: [clear CTA]" if platform in ['facebook', 'email'] else ""}"""

            # Call Claude
            response = await claude_client.generate_completion(
                prompt=prompt,
                max_tokens=800,
                temperature=0.7
            )

            # Calculate cost
            input_tokens = len(prompt) // 4  # rough estimate
            output_tokens = len(response) // 4
            cost = (input_tokens * 0.003 / 1000) + (output_tokens * 0.015 / 1000)
            total_cost += cost

            # Parse response
            lines = response.strip().split('\n')
            headline = ""
            description = ""
            key_features = []
            hashtags = []
            cta = ""

            current_section = None
            for line in lines:
                line = line.strip()
                if line.startswith("HEADLINE:"):
                    headline = line.replace("HEADLINE:", "").strip()
                elif line.startswith("DESCRIPTION:"):
                    current_section = "description"
                elif line.startswith("KEY_FEATURES:"):
                    current_section = "features"
                elif line.startswith("HASHTAGS:"):
                    hashtags = [h.strip() for h in line.replace("HASHTAGS:", "").split(',')]
                    current_section = None
                elif line.startswith("CALL_TO_ACTION:"):
                    cta = line.replace("CALL_TO_ACTION:", "").strip()
                    current_section = None
                elif line.startswith("- ") and current_section == "features":
                    key_features.append(line[2:].strip())
                elif current_section == "description" and line and not line.startswith(("KEY_FEATURES", "HASHTAGS", "CALL")):
                    description += line + " "

            description = description.strip()

            generated_content[platform] = PlatformContent(
                platform=platform,
                headline=headline or f"Stunning {prop.get('bedrooms', '')} Bedroom {prop.get('propertyType', 'Property')}",
                description=description,
                key_features=key_features[:5],
                hashtags=hashtags if hashtags else None,
                call_to_action=cta if cta else None,
                character_count=len(description),
                word_count=len(description.split())
            )

        # Update usage stats in session
        if hasattr(session, 'usage_stats'):
            session.usage_stats['transforms_count'] = session.usage_stats.get('transforms_count', 0) + len(request.platforms)
            session.usage_stats['total_cost_usd'] = session.usage_stats.get('total_cost_usd', 0.183) + total_cost
            brochure_session_service.update_session(request.session_id, session)

        logger.info(f"✅ Generated content for {len(generated_content)} platforms, cost: ${total_cost:.4f}")

        return RepurposeResponse(
            session_id=request.session_id,
            content=generated_content,
            total_cost_usd=total_cost,
            success=True
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Repurpose failed: {e}")
        import traceback
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Repurpose failed: {str(e)}")


@fastapi_app.post("/content/rightmove")
async def generate_rightmove_description(request: dict):
    """
    Generate Rightmove-optimized description (80 words max).

    Args:
        request: {
            "property_data": {...},
            "location_data": {...},
            "main_description": "...",  # optional
            "brand_profile_id": "savills"  # optional
        }

    Returns:
        {"description": "80-word Rightmove description"}
    """
    try:
        property_data = request.get("property_data", {})
        location_data = request.get("location_data", {})
        main_description = request.get("main_description")
        brand_profile_id = request.get("brand_profile_id", "generic")

        brand_profile = get_brand_profile(brand_profile_id)

        description = await rightmove_gen.generate(
            property_data=property_data,
            location_data=location_data,
            main_description=main_description,
            brand_profile=brand_profile
        )

        return {
            "description": description,
            "word_count": len(description.split()),
            "character_count": len(description)
        }

    except Exception as e:
        logger.error(f"Rightmove generation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@fastapi_app.post("/content/social-media")
async def generate_social_media_content(request: dict):
    """
    Generate social media posts (Instagram + Facebook).

    Args:
        request: {
            "property_data": {...},
            "location_data": {...},
            "platforms": ["instagram", "facebook"]  # optional
        }

    Returns:
        {
            "instagram": [{caption, hashtags, cta}, ...],
            "facebook": [{post_text, cta}, ...]
        }
    """
    try:
        property_data = request.get("property_data", {})
        location_data = request.get("location_data", {})
        platforms = request.get("platforms", ["instagram", "facebook"])

        result = {}

        if "instagram" in platforms:
            instagram_posts = await social_gen.generate_instagram_posts(
                property_data=property_data,
                location_data=location_data,
                num_variants=3
            )
            result["instagram"] = instagram_posts

        if "facebook" in platforms:
            facebook_posts = await social_gen.generate_facebook_posts(
                property_data=property_data,
                location_data=location_data,
                num_variants=3
            )
            result["facebook"] = facebook_posts

        return result

    except Exception as e:
        logger.error(f"Social media generation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@fastapi_app.post("/content/email-campaign")
async def generate_email_campaign(request: dict):
    """
    Generate "Just Listed" email campaign.

    Args:
        request: {
            "property_data": {...},
            "location_data": {...},
            "agent_details": {...}  # optional
        }

    Returns:
        {
            "subject": "...",
            "preview_text": "...",
            "body_html": "...",
            "body_text": "...",
            "cta": "..."
        }
    """
    try:
        property_data = request.get("property_data", {})
        location_data = request.get("location_data", {})
        agent_details = request.get("agent_details")

        email = await email_gen.generate_just_listed_email(
            property_data=property_data,
            location_data=location_data,
            agent_details=agent_details
        )

        return email

    except Exception as e:
        logger.error(f"Email generation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@fastapi_app.get("/brand-profiles")
async def list_brand_profiles():
    """
    List all available brand profiles (Savills, generic, etc.).

    Returns:
        List of brand profiles
    """
    try:
        profiles = brand_manager.list_profiles()
        return {"profiles": profiles}

    except Exception as e:
        logger.error(f"Profile listing failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@fastapi_app.get("/brand-profiles/{profile_id}")
async def get_brand_profile_details(profile_id: str):
    """
    Get details of a specific brand profile.

    Args:
        profile_id: e.g., "savills", "generic"

    Returns:
        Complete brand profile configuration
    """
    try:
        profile = get_brand_profile(profile_id)

        if not profile:
            raise HTTPException(status_code=404, detail=f"Profile not found: {profile_id}")

        return {
            "profile_id": profile.profile_id,
            "name": profile.name,
            "colors": profile.get_colors(),
            "fonts": profile.get_fonts(),
            "layout": profile.get_layout_preferences(),
            "tone": profile.get_tone_preferences(),
            "logo_url": profile.get_logo_url()
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Profile retrieval failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# AUTH SYSTEM: Multi-Tenant Portal for Savills Demo
# ============================================================================

from services.auth_system import AuthSystem, get_auth_system

# Initialize auth system
auth_system_instance = get_auth_system()

logger.info("Initialized auth system with Savills demo data")


@fastapi_app.get("/auth/organizations")
async def list_organizations():
    """
    List all organizations (e.g., Savills, Independent Agency).

    Returns:
        List of organizations with office counts
    """
    try:
        orgs = auth_system_instance.get_organizations()
        return {"organizations": orgs}

    except Exception as e:
        logger.error(f"Failed to list organizations: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@fastapi_app.get("/auth/offices/{org_id}")
async def list_offices(org_id: str):
    """
    List offices for an organization.

    Args:
        org_id: Organization ID (e.g., "savills")

    Returns:
        List of offices for the organization
    """
    try:
        offices = auth_system_instance.get_offices(org_id)
        return {"org_id": org_id, "offices": offices}

    except Exception as e:
        logger.error(f"Failed to list offices: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@fastapi_app.post("/auth/login")
async def authenticate_office(request: dict):
    """
    Authenticate access to an office using PIN.

    Args:
        request: {
            "org_id": "savills",
            "office_id": "savills_london",
            "pin": "2025",
            "user_email": "james.smith@savills.com"
        }

    Returns:
        Authentication result with office data
    """
    try:
        org_id = request.get("org_id")
        office_id = request.get("office_id")
        pin = request.get("pin")
        user_email = request.get("user_email")

        if not all([org_id, office_id, pin, user_email]):
            raise HTTPException(status_code=400, detail="Missing required fields")

        # Authenticate office PIN
        success, message = auth_system_instance.authenticate_office(org_id, office_id, pin)

        if not success:
            raise HTTPException(status_code=401, detail=message)

        # Get user data
        user = auth_system_instance.get_user(user_email)

        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        if user["office_id"] != office_id:
            raise HTTPException(status_code=403, detail="User not authorized for this office")

        # Get office stats
        stats = auth_system_instance.get_office_stats(office_id)

        return {
            "success": True,
            "message": "Authentication successful",
            "user": user,
            "office": {
                "office_id": office_id,
                "org_id": org_id
            },
            "stats": stats
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Authentication failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@fastapi_app.get("/office/brochures/{office_id}")
async def get_office_brochures(office_id: str):
    """
    Get all brochures for an office (shared library).

    All team members can see these.

    Args:
        office_id: Office ID (e.g., "savills_london")

    Returns:
        List of brochures
    """
    try:
        brochures = auth_system_instance.get_office_brochures(office_id)

        return {
            "office_id": office_id,
            "brochures": brochures,
            "count": len(brochures)
        }

    except Exception as e:
        logger.error(f"Failed to retrieve brochures: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@fastapi_app.post("/office/brochures/{office_id}")
async def add_office_brochure(office_id: str, request: dict):
    """
    Add a brochure to the office's shared library.

    Args:
        office_id: Office ID
        request: Brochure metadata

    Returns:
        Success confirmation
    """
    try:
        auth_system_instance.add_brochure_to_office(office_id, request)

        return {
            "success": True,
            "message": "Brochure added to office library",
            "office_id": office_id
        }

    except Exception as e:
        logger.error(f"Failed to add brochure: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@fastapi_app.get("/office/photographer-uploads/{office_id}")
async def get_photographer_uploads(office_id: str):
    """
    Get pending photographer uploads for an office.

    Photographers upload photos, agents assign properties and create brochures.

    Args:
        office_id: Office ID

    Returns:
        List of pending photo uploads
    """
    try:
        uploads = auth_system_instance.get_photographer_uploads(office_id)

        return {
            "office_id": office_id,
            "uploads": uploads,
            "count": len(uploads)
        }

    except Exception as e:
        logger.error(f"Failed to retrieve uploads: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@fastapi_app.post("/office/photographer-uploads/{office_id}")
async def add_photographer_upload(office_id: str, request: dict):
    """
    Add photographer upload batch.

    Args:
        office_id: Office ID
        request: Upload metadata with photos

    Returns:
        Success confirmation
    """
    try:
        auth_system_instance.add_photographer_upload(office_id, request)

        return {
            "success": True,
            "message": "Photos uploaded successfully",
            "office_id": office_id
        }

    except Exception as e:
        logger.error(f"Failed to upload photos: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@fastapi_app.get("/office/stats/{office_id}")
async def get_office_statistics(office_id: str):
    """
    Get statistics for an office.

    Args:
        office_id: Office ID

    Returns:
        Office statistics
    """
    try:
        stats = auth_system_instance.get_office_stats(office_id)

        return {
            "office_id": office_id,
            "stats": stats
        }

    except Exception as e:
        logger.error(f"Failed to retrieve stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# PHOTOGRAPHER PORTAL: Photo Upload and Assignment
# ============================================================================

from fastapi import Form
import os
from datetime import datetime

@fastapi_app.post("/photographer/upload")
async def upload_photographer_photos(
    property_name: str = Form(...),
    agent_email: str = Form(...),
    photographer_email: str = Form(...),
    photographer_name: str = Form(...),
    office_id: str = Form(...),
    photos: List[UploadFile] = File(...)
):
    """
    Handle photographer photo uploads.

    Photographer uploads photos for a property and assigns to an agent.
    Photos are saved to /uploads/{office_id}/{property_name}/

    Args:
        property_name: Property name (e.g., "Avenue Road")
        agent_email: Agent to assign photos to
        photographer_email: Email of photographer
        office_id: Office ID (e.g., "savills_london")
        photos: List of image files

    Returns:
        Success confirmation with upload_id
    """
    try:
        # Sanitize property name for filesystem
        # Remove invalid characters and strip whitespace
        safe_property_name = property_name.strip()
        # Remove/replace invalid Windows path characters: \ / : * ? " < > |
        invalid_chars = ['\\', '/', ':', '*', '?', '"', '<', '>', '|']
        for char in invalid_chars:
            safe_property_name = safe_property_name.replace(char, '-')
        # Remove any trailing/leading dots or spaces (Windows doesn't like these)
        safe_property_name = safe_property_name.strip('. ')
        # Replace multiple spaces with single space
        import re
        safe_property_name = re.sub(r'\s+', ' ', safe_property_name)

        logger.info(f"📸 Photographer upload: {safe_property_name} ({len(photos)} photos) → {agent_email}")

        # Create upload directory using absolute path construction
        base_dir = os.path.abspath("uploads")
        upload_dir = os.path.join(base_dir, office_id, safe_property_name)

        logger.info(f"Creating directory: {upload_dir}")
        os.makedirs(upload_dir, exist_ok=True)

        # Save photos
        photo_paths = []
        for photo in photos:
            # Generate safe filename
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            safe_filename = f"{timestamp}_{photo.filename}"
            photo_path = os.path.join(upload_dir, safe_filename)

            logger.info(f"Saving to: {photo_path}")

            # Save file
            with open(photo_path, "wb") as f:
                content = await photo.read()
                f.write(content)

            # Store relative path (use forward slashes for URLs)
            photo_paths.append(f"/uploads/{office_id}/{safe_property_name}/{safe_filename}")
            logger.info(f"  ✓ Saved: {safe_filename}")

        # Create upload record in auth system
        upload_data = {
            "property_name": safe_property_name,
            "agent_email": agent_email,
            "uploaded_by": photographer_email,
            "photographer_name": photographer_name,
            "photo_count": len(photos),
            "photos": photo_paths
        }

        auth_system_instance.add_photographer_upload(office_id, upload_data)

        logger.info(f"✅ Upload complete: {len(photos)} photos saved for {safe_property_name}")

        return {
            "success": True,
            "message": f"Successfully uploaded {len(photos)} photos",
            "property_name": safe_property_name,
            "photo_count": len(photos),
            "agent_email": agent_email
        }

    except Exception as e:
        logger.error(f"❌ Photographer upload failed: {e}")
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")


@fastapi_app.get("/photographer/uploads")
async def get_photographer_upload_history(photographer_email: str):
    """
    Get upload history for a photographer.

    Args:
        photographer_email: Email of photographer

    Returns:
        List of uploads by this photographer
    """
    try:
        logger.info(f"Fetching upload history for {photographer_email}")

        # Get all uploads across all offices (filter by photographer)
        # For now, we'll check savills_london office
        # TODO: Make this work across all offices the photographer has access to

        data = auth_system_instance._load_data()
        all_uploads = []

        for office_id, uploads in data.get("photographer_uploads", {}).items():
            for upload in uploads:
                if upload.get("uploaded_by") == photographer_email:
                    all_uploads.append({
                        "upload_id": upload.get("upload_id"),
                        "property_name": upload.get("property_name"),
                        "agent_email": upload.get("agent_email"),
                        "photo_count": upload.get("photo_count"),
                        "uploaded_at": upload.get("uploaded_at"),
                        "status": upload.get("status"),
                        "office_id": office_id
                    })

        # Sort by upload date (most recent first)
        all_uploads.sort(key=lambda x: x.get("uploaded_at", ""), reverse=True)

        return {
            "photographer_email": photographer_email,
            "uploads": all_uploads,
            "count": len(all_uploads)
        }

    except Exception as e:
        logger.error(f"Failed to fetch upload history: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@fastapi_app.post("/feedback")
async def submit_feedback(
    experience_rating: Optional[int] = None,
    quality_rating: Optional[int] = None,
    feedback_text: Optional[str] = None,
    time_spent_seconds: int = 0,
    time_saved_seconds: int = 0,
    user_email: str = "anonymous",
    property_address: str = "unknown",
    timestamp: str = None
):
    """
    Submit user feedback and gamification stats after brochure export.

    Args:
        experience_rating: 1-5 rating for overall experience
        quality_rating: 1-5 rating for generated brochure quality
        feedback_text: Optional text feedback
        time_spent_seconds: Time user spent creating brochure
        time_saved_seconds: Estimated time saved vs manual
        user_email: User email (or "anonymous")
        property_address: Property address for context
        timestamp: ISO timestamp

    Returns:
        Confirmation message
    """
    try:
        import json
        from datetime import datetime

        # Prepare feedback data
        feedback_entry = {
            "experience_rating": experience_rating,
            "quality_rating": quality_rating,
            "feedback_text": feedback_text,
            "time_spent_seconds": time_spent_seconds,
            "time_saved_seconds": time_saved_seconds,
            "user_email": user_email,
            "property_address": property_address,
            "timestamp": timestamp or datetime.utcnow().isoformat(),
            "received_at": datetime.utcnow().isoformat()
        }

        logger.info(f"📊 Feedback received from {user_email}")
        logger.info(f"   Experience: {experience_rating}/5, Quality: {quality_rating}/5")
        logger.info(f"   Time spent: {time_spent_seconds}s, Time saved: {time_saved_seconds}s")
        if feedback_text:
            logger.info(f"   Comment: {feedback_text[:100]}...")

        # Store feedback (append to JSON file)
        feedback_file = Path("./feedback_data.json")

        # Load existing feedback
        if feedback_file.exists():
            with open(feedback_file, "r") as f:
                all_feedback = json.load(f)
        else:
            all_feedback = []

        # Append new feedback
        all_feedback.append(feedback_entry)

        # Save back to file
        with open(feedback_file, "w") as f:
            json.dump(all_feedback, f, indent=2)

        logger.info(f"✓ Feedback saved to {feedback_file} (total entries: {len(all_feedback)})")

        return {
            "status": "success",
            "message": "Thank you for your feedback!",
            "feedback_id": len(all_feedback),
            "stored": True
        }

    except Exception as e:
        logger.error(f"Failed to save feedback: {e}")
        # Don't fail the request - feedback is optional
        return {
            "status": "success",
            "message": "Thank you for your feedback!",
            "feedback_id": 0,
            "stored": False
        }


# ===================================================================
# AGENCY BRANDING ENDPOINTS
# ===================================================================

@fastapi_app.get("/agencies")
async def list_agencies():
    """
    List all available agencies with branding configurations.
    """
    try:
        if not template_service:
            raise HTTPException(status_code=503, detail="Template service not available")

        agencies = template_service.list_agencies()
        return {
            "agencies": agencies,
            "count": len(agencies)
        }
    except Exception as e:
        logger.error(f"Failed to list agencies: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@fastapi_app.get("/agencies/{agency_id}")
async def get_agency_branding(agency_id: str):
    """
    Get complete branding configuration for an agency.
    """
    try:
        if not template_service:
            raise HTTPException(status_code=503, detail="Template service not available")

        branding = template_service.get_agency_branding(agency_id)
        if not branding:
            raise HTTPException(status_code=404, detail=f"Agency '{agency_id}' not found")

        return branding.dict()
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get agency branding: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@fastapi_app.get("/agencies/{agency_id}/colors")
async def get_agency_colors(agency_id: str):
    """
    Get color palette for an agency.
    """
    try:
        if not template_service:
            raise HTTPException(status_code=503, detail="Template service not available")

        branding = template_service.get_agency_branding(agency_id)
        if not branding:
            raise HTTPException(status_code=404, detail=f"Agency '{agency_id}' not found")

        return branding.colors.dict()
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get agency colors: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@fastapi_app.get("/agencies/{agency_id}/logo")
async def get_agency_logo(agency_id: str):
    """
    Get logo file for an agency.
    """
    try:
        if not template_service:
            raise HTTPException(status_code=503, detail="Template service not available")

        logo_path = template_service.get_logo_path(agency_id)
        if not logo_path or not logo_path.exists():
            raise HTTPException(status_code=404, detail=f"Logo not found for agency '{agency_id}'")

        return FileResponse(
            path=str(logo_path),
            media_type="image/png",
            filename=logo_path.name
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get agency logo: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@fastapi_app.post("/agencies/{agency_id}/select-template")
async def select_template_for_property(
    agency_id: str,
    property_character: PropertyCharacter,
    price: int = None,
    bedrooms: int = None,
    property_type: str = None
):
    """
    Get recommended template for a property based on its characteristics.

    Example request body:
    {
        "property_character": "traditional",
        "price": 750000,
        "bedrooms": 3,
        "property_type": "house"
    }
    """
    try:
        if not template_service:
            raise HTTPException(status_code=503, detail="Template service not available")

        branding = template_service.get_agency_branding(agency_id)
        if not branding:
            raise HTTPException(status_code=404, detail=f"Agency '{agency_id}' not found")

        template = template_service.select_template(
            agency_id=agency_id,
            property_character=property_character,
            price=price,
            bedrooms=bedrooms,
            property_type=property_type
        )

        template_config = branding.templates.get(template)

        return {
            "agency_id": agency_id,
            "selected_template": template.value,
            "template_config": template_config.dict() if template_config else None,
            "property_details": {
                "character": property_character.value,
                "price": price,
                "bedrooms": bedrooms,
                "property_type": property_type
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to select template: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@fastapi_app.post("/agencies/{agency_id}/upload-logo")
async def upload_agency_logo(
    agency_id: str,
    file: UploadFile = File(...)
):
    """
    Upload logo for an agency.
    """
    try:
        if not template_service:
            raise HTTPException(status_code=503, detail="Template service not available")

        # Validate file type
        if not file.content_type or not file.content_type.startswith("image/"):
            raise HTTPException(status_code=400, detail="File must be an image")

        # Read file data
        logo_data = await file.read()

        # Save logo
        logo_path = template_service.save_logo(
            agency_id=agency_id,
            logo_data=logo_data,
            filename=file.filename or "logo.png"
        )

        logger.info(f"Logo uploaded for agency '{agency_id}': {logo_path}")

        return {
            "status": "success",
            "agency_id": agency_id,
            "logo_path": logo_path,
            "filename": file.filename,
            "size": len(logo_data)
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to upload logo: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# COLLABORATION ENDPOINTS
# ============================================================================

@fastapi_app.post("/collaborate/heartbeat")
async def heartbeat(request: HeartbeatRequest):
    """
    Keep user session alive.
    Frontend should call this every 30 seconds.
    """
    try:
        _cleanup_expired_sessions()

        active_sessions[request.user_email] = UserSession(
            user_email=request.user_email,
            user_name=request.user_name,
            last_seen=time.time()
        )

        logger.debug(f"Heartbeat from {request.user_email}")

        return {
            "status": "ok",
            "active_users": len(active_sessions)
        }
    except Exception as e:
        logger.error(f"Heartbeat error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@fastapi_app.get("/collaborate/active-users", response_model=ActiveUsersResponse)
async def get_active_users(current_user_email: Optional[str] = None):
    """
    Get list of ALL users (excluding current user), with online status.
    Users can send to anyone regardless of online status.
    """
    try:
        _cleanup_expired_sessions()

        # Get current user's office
        current_user = auth_system_instance.get_user(current_user_email) if current_user_email else None
        office_id = current_user.get("office_id") if current_user else "savills_london"  # Default to Savills London

        # Get all users from the same office
        office_users = auth_system_instance.get_office_users(office_id)

        # Build user list with online status
        users = []
        for user_data in office_users:
            email = user_data["email"]

            # Skip current user and photographers
            if email == current_user_email or user_data.get("role") == "photographer":
                continue

            # Check if user has active session
            is_active = email in active_sessions
            last_seen = active_sessions[email].last_seen if is_active else 0

            users.append(UserSession(
                user_email=email,
                user_name=user_data.get("name", email),
                last_seen=last_seen
            ))

        logger.debug(f"All users request: {len(users)} users available from office {office_id}")

        return ActiveUsersResponse(users=users)
    except Exception as e:
        logger.error(f"Get users error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@fastapi_app.post("/collaborate/share")
async def share_brochure(request: ShareBrochureRequest):
    """
    Share brochure state with another user.
    """
    try:
        # Generate unique handoff ID
        handoff_id = str(uuid.uuid4())

        # Create handoff notification
        handoff = {
            "handoff_id": handoff_id,
            "sender_email": request.brochure_state.address or "Unknown",  # Temporary sender ID
            "sender_name": request.sender_name,
            "timestamp": time.time(),
            "address": request.brochure_state.address,
            "message": request.message,
            "brochure_state": request.brochure_state.dict()
        }

        # Add to recipient's pending handoffs
        if request.recipient_email not in pending_handoffs:
            pending_handoffs[request.recipient_email] = []

        pending_handoffs[request.recipient_email].append(handoff)

        logger.info(
            f"Brochure shared: {request.sender_name or 'Unknown'} → {request.recipient_email} "
            f"(Address: {request.brochure_state.address})"
        )

        return {
            "status": "success",
            "handoff_id": handoff_id,
            "recipient_email": request.recipient_email
        }
    except Exception as e:
        logger.error(f"Share brochure error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@fastapi_app.get("/collaborate/pending", response_model=PendingHandoffsResponse)
async def get_pending_handoffs(user_email: str):
    """
    Get pending brochure handoffs for a user.
    """
    try:
        user_handoffs = pending_handoffs.get(user_email, [])

        notifications = [
            HandoffNotification(
                handoff_id=h["handoff_id"],
                sender_email=h["sender_email"],
                sender_name=h.get("sender_name"),
                timestamp=h["timestamp"],
                address=h.get("address"),
                message=h.get("message")
            )
            for h in user_handoffs
        ]

        logger.debug(f"Pending handoffs for {user_email}: {len(notifications)}")

        return PendingHandoffsResponse(handoffs=notifications)
    except Exception as e:
        logger.error(f"Get pending handoffs error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@fastapi_app.post("/collaborate/accept/{handoff_id}", response_model=AcceptHandoffResponse)
async def accept_handoff(handoff_id: str, user_email: str):
    """
    Accept and retrieve a pending handoff.
    This removes the handoff from pending list.
    """
    try:
        user_handoffs = pending_handoffs.get(user_email, [])

        # Find the handoff
        handoff = None
        for i, h in enumerate(user_handoffs):
            if h["handoff_id"] == handoff_id:
                handoff = user_handoffs.pop(i)
                break

        if not handoff:
            raise HTTPException(
                status_code=404,
                detail=f"Handoff {handoff_id} not found for user {user_email}"
            )

        # Convert brochure_state dict back to BrochureState object
        brochure_state = BrochureState(**handoff["brochure_state"])

        logger.info(
            f"Handoff accepted: {handoff_id} by {user_email} "
            f"(from {handoff.get('sender_name', 'Unknown')})"
        )

        return AcceptHandoffResponse(
            brochure_state=brochure_state,
            sender_email=handoff["sender_email"],
            sender_name=handoff.get("sender_name")
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Accept handoff error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@fastapi_app.get("/epc/search")
async def search_epc_by_postcode(postcode: str, limit: int = 50):
    """
    Search for properties by postcode in EPC database

    Returns list of properties with EPC ratings, addresses, and details
    """
    logger.info(f"EPC search request: postcode={postcode}")

    if not epc_service or not epc_service.available:
        raise HTTPException(status_code=503, detail="EPC service not available")

    try:
        results = epc_service.search_by_postcode(postcode, limit=limit)

        if not results:
            return {
                "postcode": postcode,
                "properties": [],
                "message": "No properties found for this postcode"
            }

        return {
            "postcode": postcode,
            "count": len(results),
            "properties": results
        }

    except Exception as e:
        logger.error(f"EPC search failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"EPC search failed: {str(e)}")


@fastapi_app.get("/epc/stats")
async def get_epc_statistics():
    """Get EPC database statistics"""
    if not epc_service or not epc_service.available:
        raise HTTPException(status_code=503, detail="EPC service not available")

    try:
        stats = epc_service.get_statistics()
        return stats
    except Exception as e:
        logger.error(f"Failed to get EPC stats: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# BROCHURE EDITING SESSION ENDPOINTS
# =============================================================================

@fastapi_app.post("/api/brochure/session-debug")
async def debug_brochure_session(request: Request):
    """Debug endpoint to see raw payload before Pydantic validation."""
    try:
        body = await request.json()
        logger.info(f"🔴 [DEBUG-SESSION] Raw payload keys: {list(body.keys())}")
        logger.info(f"🔴 [DEBUG-SESSION] user_email: {body.get('user_email')}")
        logger.info(f"🔴 [DEBUG-SESSION] property keys: {list(body.get('property', {}).keys())}")
        logger.info(f"🔴 [DEBUG-SESSION] agent keys: {list(body.get('agent', {}).keys())}")
        logger.info(f"🔴 [DEBUG-SESSION] photos count: {len(body.get('photos', []))}")
        if body.get('photos'):
            first_photo = body['photos'][0]
            logger.info(f"🔴 [DEBUG-SESSION] First photo keys: {list(first_photo.keys())}")
            logger.info(f"🔴 [DEBUG-SESSION] First photo id: {first_photo.get('id')}")
            logger.info(f"🔴 [DEBUG-SESSION] First photo dataUrl length: {len(first_photo.get('dataUrl', ''))}")
        logger.info(f"🔴 [DEBUG-SESSION] pages count: {len(body.get('pages', []))}")
        if body.get('pages'):
            first_page = body['pages'][0]
            logger.info(f"🔴 [DEBUG-SESSION] First page keys: {list(first_page.keys())}")

        # Try manual Pydantic validation to see exact error
        from pydantic import ValidationError
        try:
            validated = BrochureSessionCreateRequest(**body)
            logger.info(f"🔴 [DEBUG-SESSION] Pydantic validation PASSED!")
            return {"status": "validation_passed", "payload_keys": list(body.keys())}
        except ValidationError as ve:
            logger.error(f"🔴 [DEBUG-SESSION] Pydantic validation FAILED:")
            for error in ve.errors():
                logger.error(f"🔴   Field: {error['loc']}, Type: {error['type']}, Msg: {error['msg']}")
            return {"status": "validation_failed", "errors": ve.errors()}

    except Exception as e:
        logger.error(f"🔴 [DEBUG-SESSION] Error: {str(e)}")
        import traceback
        traceback.print_exc()
        return {"error": str(e)}

@fastapi_app.post("/api/brochure/session", response_model=BrochureSessionResponse)
async def create_brochure_session(request: BrochureSessionCreateRequest):
    """
    Create new brochure editing session.

    Saves complete brochure state with photos to server storage.
    Photos are decoded from base64 and saved as files.

    Returns session_id and photo URL mappings.
    """
    if not brochure_session_service:
        raise HTTPException(status_code=503, detail="Brochure session service not available")

    try:
        logger.info(f"Creating brochure session for {request.user_email}")
        logger.info(f"🔍 [BACKEND-RECEIVED] Photos with analysis: {[(p.name, bool(p.analysis)) for p in request.photos]}")

        # 🔥 FORENSIC: Show first photo BEFORE Pydantic
        if request.photos:
            first_photo = request.photos[0]
            logger.info(f"🔥 [FORENSIC-RAW] First photo BEFORE Pydantic:")
            logger.info(f"    name: {first_photo.name}")
            logger.info(f"    has analysis: {hasattr(first_photo, 'analysis')}")
            logger.info(f"    analysis value: {first_photo.analysis if hasattr(first_photo, 'analysis') else 'NO ATTRIBUTE'}")

        # Convert request to session data
        session_data = BrochureSessionData(
            user_email=request.user_email,
            property=request.property,
            agent=request.agent,
            photos=request.photos,
            pages=request.pages,
            preferences=request.preferences
        )

        logger.info(f"🔍 [BACKEND-AFTER-PYDANTIC] Photos with analysis: {[(p.name, bool(p.analysis)) for p in session_data.photos]}")

        # 🔥 FORENSIC: Show first photo AFTER Pydantic
        if session_data.photos:
            first_photo = session_data.photos[0]
            logger.info(f"🔥 [FORENSIC-PYDANTIC] First photo AFTER Pydantic:")
            logger.info(f"    name: {first_photo.name}")
            logger.info(f"    has analysis: {hasattr(first_photo, 'analysis')}")
            logger.info(f"    analysis value: {first_photo.analysis if hasattr(first_photo, 'analysis') else 'NO ATTRIBUTE'}")

        # Score photos for hero page selection
        try:
            scorer = get_photo_scorer()

            # Determine property character from preferences or default to 'modern'
            property_character = 'modern'
            if session_data.preferences:
                # Try to extract character from preferences
                if 'character' in session_data.preferences:
                    property_character = session_data.preferences['character']
                elif 'propertyCharacter' in session_data.preferences:
                    property_character = session_data.preferences['propertyCharacter']

            # Score each photo that has analysis data
            scored_count = 0
            for photo in session_data.photos:
                if photo.analysis:
                    photo.impact_score = scorer.score_photo(photo, property_character)
                    scored_count += 1
                else:
                    # Default score for photos without analysis
                    photo.impact_score = 50.0

            logger.info(f"📊 Scored {scored_count}/{len(session_data.photos)} photos for impact (character: {property_character})")

            # Log top 5 scored photos
            if session_data.photos:
                sorted_photos = sorted(session_data.photos, key=lambda p: p.impact_score or 0, reverse=True)
                top_5 = sorted_photos[:5]
                logger.info(f"🏆 Top 5 photos by impact score:")
                for idx, photo in enumerate(top_5, 1):
                    room_type = photo.analysis.get('room_type', 'unknown') if photo.analysis else 'unknown'
                    logger.info(f"  {idx}. {photo.name} ({room_type}): {photo.impact_score:.1f}")

        except Exception as e:
            logger.warning(f"Failed to score photos: {e}. Continuing without scores.")
            # Non-critical - continue even if scoring fails

        # Create session (saves photos to disk)
        response = brochure_session_service.create_session(session_data)

        logger.info(f"✅ Session created: {response.session_id}")

        return response

    except Exception as e:
        logger.error(f"Failed to create brochure session: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to create session: {str(e)}")


@fastapi_app.get("/api/brochure/session/{session_id}", response_model=BrochureSessionResponse)
async def load_brochure_session(session_id: str):
    """
    Load existing brochure editing session.

    Returns complete session data with photo URL mappings.
    """
    if not brochure_session_service:
        raise HTTPException(status_code=503, detail="Brochure session service not available")

    try:
        logger.info(f"Loading brochure session: {session_id}")

        # Load session data
        session_data = brochure_session_service.load_session(session_id)

        # Get photo URLs
        photo_urls = brochure_session_service.get_photo_urls(session_id)

        logger.info(f"✅ Session loaded: {session_id}")

        return BrochureSessionResponse(
            session_id=session_id,
            expires_at=session_data.expires_at,
            photo_urls=photo_urls,
            data=session_data
        )

    except ValueError as e:
        logger.warning(f"Session not found or expired: {session_id}")
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to load session: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to load session: {str(e)}")


@fastapi_app.put("/api/brochure/session/{session_id}")
async def update_brochure_session(session_id: str, data: BrochureSessionData):
    """
    Update existing brochure session (for auto-save).

    Updates session metadata and handles any new photos.
    """
    if not brochure_session_service:
        raise HTTPException(status_code=503, detail="Brochure session service not available")

    try:
        logger.info(f"Updating brochure session: {session_id}")

        # Update session
        brochure_session_service.update_session(session_id, data)

        logger.info(f"✅ Session updated: {session_id}")

        return {"status": "ok", "session_id": session_id, "updated_at": data.updated_at}

    except ValueError as e:
        logger.warning(f"Session not found: {session_id}")
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to update session: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to update session: {str(e)}")


@fastapi_app.get("/api/brochure/session/{session_id}/photo/{photo_id}")
async def serve_session_photo(session_id: str, photo_id: str):
    """
    Serve individual photo from a brochure session.

    Returns the photo file with appropriate content-type.
    """
    if not brochure_session_service:
        raise HTTPException(status_code=503, detail="Brochure session service not available")

    try:
        # Get photo file path
        photo_path = brochure_session_service.get_photo_path(session_id, photo_id)

        # Determine content type from extension
        extension = photo_path.suffix.lower()
        content_type = {
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.webp': 'image/webp',
            '.gif': 'image/gif'
        }.get(extension, 'image/jpeg')

        return FileResponse(
            path=photo_path,
            media_type=content_type,
            headers={
                "Cache-Control": "public, max-age=86400"  # Cache for 24 hours
            }
        )

    except FileNotFoundError as e:
        logger.warning(f"Photo not found: {session_id}/{photo_id}")
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to serve photo: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to serve photo: {str(e)}")


@fastapi_app.delete("/api/brochure/session/cleanup")
async def cleanup_expired_sessions():
    """
    Delete all expired brochure sessions.

    This endpoint can be called by a cron job or manually.
    Returns the number of sessions deleted.
    """
    if not brochure_session_service:
        raise HTTPException(status_code=503, detail="Brochure session service not available")

    try:
        deleted_count = brochure_session_service.cleanup_expired()

        logger.info(f"✅ Cleaned up {deleted_count} expired sessions")

        return {
            "status": "ok",
            "deleted_count": deleted_count,
            "message": f"Deleted {deleted_count} expired session(s)"
        }

    except Exception as e:
        logger.error(f"Failed to cleanup sessions: {e}")
        raise HTTPException(status_code=500, detail=f"Cleanup failed: {str(e)}")


# =============================================================================
# MARKETING CONTENT GENERATION ENDPOINTS
# =============================================================================

@fastapi_app.post("/marketing/portal-listing")
async def generate_portal_listing_endpoint(request: Request):
    """
    Generate formatted portal listing for Rightmove or Zoopla.
    Accepts form data from URLSearchParams.
    """
    if not marketing_generator:
        raise HTTPException(status_code=503, detail="Marketing generator not available")

    try:
        # Parse form data manually
        form_data = await request.form()
        data = dict(form_data)

        property_name = data.get('property_name', 'Luxury Property')
        address = data.get('address', 'Prime Location')
        portal = data.get('portal', 'rightmove')
        price = data.get('price')
        bedrooms = int(data.get('bedrooms')) if data.get('bedrooms') else None
        bathrooms = int(data.get('bathrooms')) if data.get('bathrooms') else None
        property_type = data.get('property_type')
        description = data.get('description')

        # Parse key_features JSON string if provided
        features_list = None
        key_features = data.get('key_features')
        if key_features:
            import json
            try:
                features_list = json.loads(key_features)
            except:
                features_list = [key_features]

        result = await marketing_generator.generate_portal_listing(
            property_name=property_name,
            address=address,
            price=price,
            bedrooms=bedrooms,
            bathrooms=bathrooms,
            property_type=property_type,
            key_features=features_list,
            description=description,
            portal=portal
        )

        logger.info(f"Generated {portal} listing for {property_name}")
        return result

    except Exception as e:
        logger.error(f"Failed to generate portal listing: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@fastapi_app.post("/marketing/email-newsletter")
async def generate_email_newsletter_endpoint(request: Request):
    """
    Generate email newsletter with HTML template.
    Accepts form data from URLSearchParams.
    """
    if not marketing_generator:
        raise HTTPException(status_code=503, detail="Marketing generator not available")

    try:
        # Parse form data manually
        form_data = await request.form()
        data = dict(form_data)

        property_name = data.get('property_name', 'Luxury Property')
        address = data.get('address', 'Prime Location')
        price = data.get('price')
        bedrooms = int(data.get('bedrooms')) if data.get('bedrooms') else None
        bathrooms = int(data.get('bathrooms')) if data.get('bathrooms') else None
        property_type = data.get('property_type')
        description = data.get('description')
        agent_name = data.get('agent_name')
        agent_phone = data.get('agent_phone')
        agent_email = data.get('agent_email')
        hero_image_url = data.get('hero_image_url')

        # Parse key_features JSON string if provided
        features_list = None
        key_features = data.get('key_features')
        if key_features:
            import json
            try:
                features_list = json.loads(key_features)
            except:
                features_list = [key_features]

        result = await marketing_generator.generate_email_newsletter(
            property_name=property_name,
            address=address,
            price=price,
            bedrooms=bedrooms,
            bathrooms=bathrooms,
            property_type=property_type,
            key_features=features_list,
            description=description,
            agent_name=agent_name,
            agent_phone=agent_phone,
            agent_email=agent_email,
            hero_image_url=hero_image_url
        )

        logger.info(f"Generated email newsletter for {property_name}")
        return result

    except Exception as e:
        logger.error(f"Failed to generate email newsletter: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@fastapi_app.post("/marketing/social-post")
async def generate_social_post_endpoint(request: Request):
    """
    Generate social media post for Facebook, Twitter, or Instagram.
    Accepts form data from URLSearchParams.
    """
    if not marketing_generator:
        raise HTTPException(status_code=503, detail="Marketing generator not available")

    try:
        # Parse form data manually
        form_data = await request.form()
        data = dict(form_data)

        property_name = data.get('property_name', 'Luxury Property')
        address = data.get('address', 'Prime Location')
        platform = data.get('platform', 'facebook')
        price = data.get('price')
        bedrooms = int(data.get('bedrooms')) if data.get('bedrooms') else None
        bathrooms = int(data.get('bathrooms')) if data.get('bathrooms') else None
        property_type = data.get('property_type')
        description = data.get('description')
        image_url = data.get('image_url')

        # Validate platform
        valid_platforms = ["facebook", "twitter", "instagram"]
        if platform.lower() not in valid_platforms:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid platform. Must be one of: {', '.join(valid_platforms)}"
            )

        # Parse key_features JSON string if provided
        features_list = None
        key_features = data.get('key_features')
        if key_features:
            import json
            try:
                features_list = json.loads(key_features)
            except:
                features_list = [key_features]

        result = await marketing_generator.generate_social_post(
            property_name=property_name,
            address=address,
            price=price,
            bedrooms=bedrooms,
            bathrooms=bathrooms,
            property_type=property_type,
            key_features=features_list,
            description=description,
            platform=platform,
            image_url=image_url
        )

        # Enhance hashtags with curated database
        try:
            hashtag_service = get_hashtag_service()
            curated_hashtags = await hashtag_service.get_hashtags(
                property_type=property_type,
                location=address,
                features=features_list,
                platform=platform,
                max_hashtags=15
            )

            # Merge AI-generated and curated hashtags (AI first, then curated)
            ai_hashtags = result.get("hashtags", [])
            all_hashtags = ai_hashtags.copy()

            # Add curated hashtags not already present
            for tag in curated_hashtags.get("hashtags", []):
                tag_lower = tag.lower()
                if not any(t.lower() == tag_lower for t in all_hashtags):
                    all_hashtags.append(tag)

            # Limit based on platform
            if platform.lower() == "twitter":
                all_hashtags = all_hashtags[:3]
            elif platform.lower() == "facebook":
                all_hashtags = all_hashtags[:5]
            else:  # Instagram
                all_hashtags = all_hashtags[:15]

            result["hashtags"] = all_hashtags
            result["hashtag_sources"] = {
                "ai_generated": len(ai_hashtags),
                "curated_added": len(all_hashtags) - len(ai_hashtags),
                "categories": curated_hashtags.get("categories_used", [])
            }
            result["optimization_notes"] = curated_hashtags.get("optimization_notes", "")

        except Exception as e:
            logger.warning(f"Failed to enhance hashtags: {e}")

        logger.info(f"Generated {platform} post for {property_name}")
        return result

    except Exception as e:
        logger.error(f"Failed to generate social post: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@fastapi_app.post("/marketing/hashtags")
async def get_optimized_hashtags(request: Request):
    """
    Get optimized hashtags for a property listing.

    Returns curated, location-based, and property-specific hashtags
    from a database of proven high-engagement UK property hashtags.
    """
    try:
        form_data = await request.form()
        data = dict(form_data)

        property_type = data.get('property_type')
        location = data.get('location') or data.get('address')
        target_audience = data.get('target_audience')
        features = data.get('features')
        platform = data.get('platform', 'instagram')

        # Parse features if JSON string
        features_list = None
        if features:
            import json
            try:
                features_list = json.loads(features)
            except:
                features_list = [features]

        hashtag_service = get_hashtag_service()
        result = await hashtag_service.get_hashtags(
            property_type=property_type,
            location=location,
            target_audience=target_audience,
            features=features_list,
            platform=platform,
            max_hashtags=15
        )

        # Add trending hashtags
        trending = await hashtag_service.get_trending_hashtags()
        result["trending_hashtags"] = trending

        logger.info(f"Generated {result['count']} hashtags for {property_type or 'property'} in {location or 'UK'}")
        return result

    except Exception as e:
        logger.error(f"Failed to get hashtags: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@fastapi_app.post("/api/quick-social-post", response_model=QuickSocialPostResponse)
async def generate_quick_social_post(request: QuickSocialPostRequest):
    """
    Generate 3 social media caption variants for quick posting.
    Lightweight endpoint optimized for speed - no full brochure generation.
    """
    if not claude_client or not claude_client.is_available():
        raise HTTPException(status_code=503, detail="AI generation service not available")

    try:
        # Analyze images with vision if photos provided
        image_descriptions = []
        if request.photos and len(request.photos) > 0:
            logger.info(f"Analyzing {len(request.photos)} photos for quick post")
            for i, photo_data in enumerate(request.photos[:3]):  # Analyze up to 3 photos
                try:
                    # Extract base64 data from data URL
                    if ',' in photo_data:
                        photo_data = photo_data.split(',')[1]

                    # Analyze with vision client
                    image_analysis = await vision_adapter.analyze_image(
                        image_data=photo_data,
                        prompt="Describe this property photo in detail. Identify: room type, key features, style, condition, notable elements. Be specific and descriptive."
                    )

                    if image_analysis and 'description' in image_analysis:
                        image_descriptions.append(f"Photo {i+1}: {image_analysis['description']}")
                        logger.info(f"Photo {i+1} analyzed successfully")
                except Exception as e:
                    logger.warning(f"Failed to analyze photo {i+1}: {str(e)}")
                    continue

        # Build property details string
        details = []
        details.append(f"Address: {request.address}")
        details.append(f"Price: {request.price}")
        if request.bedrooms:
            details.append(f"Bedrooms: {request.bedrooms}")
        if request.bathrooms:
            details.append(f"Bathrooms: {request.bathrooms}")
        if request.highlights:
            details.append(f"Highlights: {request.highlights}")

        # Add image analysis if available
        if image_descriptions:
            details.append(f"\nProperty Images Analysis:")
            details.extend(image_descriptions)

        property_info = "\n".join(details)

        # Platform-specific character limits and style
        platform_config = {
            "instagram": {"limit": 2200, "style": "engaging with emojis, perfect for visual content"},
            "facebook": {"limit": 400, "style": "conversational and community-focused"},
            "linkedin": {"limit": 700, "style": "professional and business-oriented"},
            "twitter": {"limit": 280, "style": "concise and impactful"}
        }

        config = platform_config.get(request.platform.lower(), platform_config["facebook"])

        # Extract location components from address for hyper-localized hashtags
        address_parts = request.address.split(',')
        town_city = address_parts[0].strip() if len(address_parts) > 0 else ""
        county = address_parts[-2].strip() if len(address_parts) > 2 else ""

        # Create prompt for 5 variants with hyper-localized hashtags
        prompt = f"""You are a property marketing expert.

CRITICAL REQUIREMENT: You MUST create EXACTLY 5 COMPLETE caption variants. Not 3, not 4, but EXACTLY 5 variants.

Property Details:
{property_info}

LOCATION CONTEXT (for hashtags):
- Town/Area: {town_city}
- County/Region: {county}
- Use these EXACT location names in hashtags (e.g., #{town_city.replace(' ', '').replace('-', '')} #{county.replace(' ', '').replace('-', '')})

Requirements:
- Platform: {request.platform.upper()} ({config['style']})
- Maximum {config['limit']} characters per caption
- MANDATORY: Create ALL 5 caption variants with these EXACT styles (DO NOT skip variant4 or variant5):

1. PREMIUM LIFESTYLE (variant1):
   - Sophisticated, lifestyle-focused narrative
   - Minimal emojis (max 2-3 tasteful ones)
   - Focus on experience and lifestyle benefits
   - Example: "Imagine waking up to panoramic views..."

2. FEATURE HIGHLIGHTS (variant2):
   - Bullet-point format with line breaks between each bullet
   - Use • for bullets, each on its OWN LINE
   - Start with attention-grabbing intro line
   - Each feature on a separate line with line break
   - Example: "Exceptional 3-bedroom residence\\n\\n• Panoramic views\\n• Modern kitchen\\n• Private garden"

3. PUNCHY & ENGAGING (variant3):
   - Short, energetic, fun
   - Strategic emoji use (4-6 emojis)
   - Conversational tone
   - Example: "Dream home alert! 🏡 3 beds, stunning views, ready now!"

4. PROFESSIONAL SALES (variant4):
   - Formal, detailed, agent-speak
   - NO emojis
   - Include all key specs
   - Professional language
   - Example: "Presenting an exceptional 3-bedroom property..."

5. STORY-DRIVEN (variant5):
   - Narrative style, emotional connection
   - Paint a picture of living there
   - Light emoji use (2-3)
   - Example: "Picture yourself hosting summer BBQs in your private garden..."

CRITICAL:
- Each caption should be complete and post-ready
- NO hashtags in the captions (we'll add those separately)
- Highlight the price prominently in ALL variants
- Stay within {config['limit']} characters

CRITICAL: Generate 8-12 HYPER-LOCALIZED, SPECIFIC hashtags:

REQUIRED HASHTAG CATEGORIES (ALL hashtags MUST start with #):
1. LOCATION (MANDATORY 2-3 tags) - Use the LOCATION CONTEXT provided above:
   - MUST include: #{town_city.replace(' ', '').replace('-', '')} (exact town/area name)
   - MUST include: #{county.replace(' ', '').replace('-', '')} or #{county.replace(' ', '').replace('-', '')}Properties
   - Optional: Nearby landmark if recognizable (e.g., #NearWinchesterCathedral)

2. PROPERTY-SPECIFIC (2-3 tags) - From highlights:
   - Key features (#PoolVilla, #PanoramicViews, #ModernKitchen)
   - Bedroom count (like #{request.bedrooms}Bedroom or #Studio)
   - Special amenities (#GymAccess, #Parking, #Balcony)

3. PROPERTY TYPE (1-2 tags):
   - Specific type (#TownHouse, #PentHouse, #Villa, #Duplex)
   - Style if evident (#ModernDesign, #Luxury, #Contemporary)

4. TARGET AUDIENCE (1 tag):
   - #FamilyHome / #InvestmentProperty / #FirstHome / #RetireHere

5. HIGH-TRAFFIC (2-3 tags):
   - #DreamHome, #PropertyForSale, #RealEstate, #HomeSweetHome

Return ONLY a JSON object with this EXACT structure:
{{
    "variant1": "caption text here",
    "variant2": "caption text here",
    "variant3": "caption text here",
    "variant4": "caption text here",
    "variant5": "caption text here",
    "hashtags": ["#ExactNeighborhood", "#CityProperty", "#SpecificFeature", "#PropertyType", "#TargetAudience", "#DreamHome", "#RealEstate", "#Investment"]
}}"""

        # Generate with Claude (increased tokens for 5 variants)
        response_text = await claude_client.generate_completion(
            prompt=prompt,
            temperature=0.8,
            max_tokens=2500
        )

        # Parse JSON response
        import re

        # Extract JSON from response
        json_match = re.search(r'\{.*\}', response_text, re.DOTALL)
        if json_match:
            json_text = json_match.group()

            # First try: parse as-is
            try:
                result = json.loads(json_text)
            except json.JSONDecodeError as e:
                logger.warning(f"Initial JSON parse failed: {e}. Attempting to fix unescaped newlines...")

                # Second try: Fix unescaped newlines inside quoted strings
                # This regex replaces actual newlines with \n only within string values
                def fix_newlines_in_strings(match):
                    """Replace literal newlines with \n escape sequences in JSON string values"""
                    string_value = match.group(0)
                    # Replace newlines with escaped version
                    fixed = string_value.replace('\n', '\\n').replace('\r', '\\r')
                    return fixed

                # Match JSON string values - use DOTALL to match across newlines
                # This pattern matches: "..." including escaped characters and literal newlines
                pattern = r'"(?:[^"\\]|\\.|[\r\n])*?"'
                json_text_fixed = re.sub(pattern, fix_newlines_in_strings, json_text, flags=re.DOTALL)

                try:
                    result = json.loads(json_text_fixed)
                    logger.info("Successfully parsed JSON after fixing newlines")
                except json.JSONDecodeError as e2:
                    logger.error(f"Still failed after fix attempt: {e2}")
                    logger.error(f"Fixed JSON text sample: {json_text_fixed[:500]}")
                    raise
        else:
            raise ValueError("Could not parse JSON from response")

        # Extract hashtags
        hashtags = result.get("hashtags", [])
        if not hashtags:
            # Generate default hashtags if none provided
            hashtags = ["#Property", "#ForSale", "#RealEstate", "#DreamHome"]

        # Create variant objects
        variants = []
        for i, key in enumerate(["variant1", "variant2", "variant3", "variant4", "variant5"], 1):
            if key in result:
                text = result[key].strip()
                variants.append(SocialPostVariant(
                    text=text,
                    character_count=len(text),
                    hashtags=hashtags
                ))

        if not variants:
            raise ValueError("No variants generated")

        # IMPORTANT: Ensure we ALWAYS return 5 variants by padding with variations
        logger.info(f"📊 DEBUG: Before padding check - have {len(variants)} variants")
        if len(variants) < 5:
            logger.warning(f"⚠️ Only generated {len(variants)} variants instead of 5 - PADDING NOW!")
            base_text = variants[0].text if variants else f"🏡 {request.address}\n💰 {request.price}\n{request.bedrooms}bed • {request.bathrooms}bath"

            # Pad to 5 variants with simple variations
            while len(variants) < 5:
                variation_num = len(variants) + 1
                logger.info(f"  → Adding variant #{variation_num}")
                if variation_num == 2:
                    # Bullet point style
                    text = f"{request.address}\n\n• {request.bedrooms} Bedrooms\n• {request.bathrooms} Bathrooms\n• £{request.price}\n\nContact us to arrange a viewing!"
                elif variation_num == 3:
                    # Punchy style
                    text = f"🏡 {request.bedrooms} bed property in {request.address.split(',')[0]}\n💰 £{request.price}\n✨ Ready to view!"
                elif variation_num == 4:
                    # Professional style
                    text = f"Presenting: {request.bedrooms}-bedroom property at {request.address}. Priced at £{request.price}. {request.bathrooms} bathrooms. Contact for viewing."
                elif variation_num == 5:
                    # Story style
                    text = f"Imagine coming home to {request.address}... {request.bedrooms} bedrooms, {request.bathrooms} bathrooms, yours for £{request.price}. Let's make it happen!"

                variants.append(SocialPostVariant(
                    text=text,
                    character_count=len(text),
                    hashtags=hashtags
                ))

        logger.info(f"✅ Final result: {len(variants)} caption variants with {len(hashtags)} hashtags for {request.platform}")

        return QuickSocialPostResponse(
            variants=variants,
            hashtags=hashtags,
            success=True
        )

    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse AI response: {str(e)}")
        logger.error(f"Response text: {response_text[:500]}")
        # Fallback: create 5 simple variants
        base_text = f"🏡 {request.address}\n💰 {request.price}\n{request.bedrooms}bed • {request.bathrooms}bath\n"
        highlights_text = request.highlights or 'Beautiful property - contact us to arrange a viewing!'

        fallback_variants = [
            SocialPostVariant(
                text=base_text + f"✨ {highlights_text}",
                character_count=0,
                hashtags=["#Property", "#ForSale", "#RealEstate", "#DreamHome"]
            ),
            SocialPostVariant(
                text=f"{request.address}\n\n• {request.bedrooms} Bedrooms\n• {request.bathrooms} Bathrooms\n• £{request.price}\n\nContact us to arrange a viewing!",
                character_count=0,
                hashtags=["#Property", "#ForSale", "#RealEstate", "#DreamHome"]
            ),
            SocialPostVariant(
                text=base_text + f"🔑 {highlights_text}\n\nDon't miss this opportunity!",
                character_count=0,
                hashtags=["#Property", "#ForSale", "#RealEstate", "#DreamHome"]
            ),
            SocialPostVariant(
                text=f"Presenting: {request.bedrooms}-bedroom property at {request.address}. Priced at £{request.price}. {request.bathrooms} bathrooms. Contact for viewing.",
                character_count=0,
                hashtags=["#Property", "#ForSale", "#RealEstate", "#DreamHome"]
            ),
            SocialPostVariant(
                text=f"Imagine coming home to {request.address}... {request.bedrooms} bedrooms, {request.bathrooms} bathrooms, yours for £{request.price}. Let's make it happen!",
                character_count=0,
                hashtags=["#Property", "#ForSale", "#RealEstate", "#DreamHome"]
            )
        ]
        for variant in fallback_variants:
            variant.character_count = len(variant.text)

        logger.info("Using 5 fallback variants due to JSON parse error")
        return QuickSocialPostResponse(variants=fallback_variants, success=True)

    except Exception as e:
        logger.error(f"Failed to generate quick social post: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# USER PROFILE ENDPOINTS
# ============================================================================

@fastapi_app.get("/profile/{user_id}")
async def get_user_profile(user_id: str):
    """Get user profile by user ID."""
    if not user_profile_service:
        raise HTTPException(status_code=503, detail="User profile service not available")

    profile = user_profile_service.load_profile(user_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    return profile.to_dict()


@fastapi_app.get("/profile/by-email/{email}")
async def get_user_profile_by_email(email: str):
    """Get user profile by email address."""
    if not user_profile_service:
        raise HTTPException(status_code=503, detail="User profile service not available")

    profile = user_profile_service.load_profile_by_email(email)
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    return profile.to_dict()


@fastapi_app.post("/profile/upload-logo")
async def upload_user_logo(
    user_id: str = Form(...),
    logo: UploadFile = File(...)
):
    """Upload user agency logo."""
    if not user_profile_service:
        raise HTTPException(status_code=503, detail="User profile service not available")

    try:
        # Read logo file
        logo_data = await logo.read()

        # Save logo
        logo_path = user_profile_service.save_logo(
            user_id=user_id,
            logo_data=logo_data,
            filename=logo.filename
        )

        if not logo_path:
            raise HTTPException(status_code=500, detail="Failed to save logo")

        logger.info(f"Logo uploaded for user {user_id}: {logo_path}")

        return {
            "success": True,
            "logo_path": logo_path,
            "message": "Logo uploaded successfully"
        }

    except Exception as e:
        logger.error(f"Failed to upload logo: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@fastapi_app.post("/profile/upload-agent-photo")
async def upload_agent_photo(
    user_id: str = Form(...),
    photo: UploadFile = File(...)
):
    """Upload agent photo."""
    if not user_profile_service:
        raise HTTPException(status_code=503, detail="User profile service not available")

    try:
        # Read photo file
        photo_data = await photo.read()

        # Save photo
        photo_path = user_profile_service.save_agent_photo(
            user_id=user_id,
            photo_data=photo_data,
            filename=photo.filename
        )

        if not photo_path:
            raise HTTPException(status_code=500, detail="Failed to save photo")

        logger.info(f"Agent photo uploaded for user {user_id}: {photo_path}")

        return {
            "success": True,
            "photo_path": photo_path,
            "message": "Agent photo uploaded successfully"
        }

    except Exception as e:
        logger.error(f"Failed to upload agent photo: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@fastapi_app.post("/profile/update-branding")
async def update_user_branding(request: Request):
    """Update user branding information."""
    if not user_profile_service:
        raise HTTPException(status_code=503, detail="User profile service not available")

    try:
        data = await request.json()
        user_id = data.get("user_id")

        if not user_id:
            raise HTTPException(status_code=400, detail="user_id required")

        success = user_profile_service.update_branding(
            user_id=user_id,
            agency_name=data.get("agency_name"),
            agency_phone=data.get("agency_phone"),
            agency_email=data.get("agency_email"),
            agency_website=data.get("agency_website"),
            primary_color=data.get("primary_color"),
            secondary_color=data.get("secondary_color")
        )

        if not success:
            raise HTTPException(status_code=404, detail="Profile not found")

        logger.info(f"Branding updated for user {user_id}")

        return {
            "success": True,
            "message": "Branding updated successfully"
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to update branding: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@fastapi_app.get("/profile/{user_id}/branding")
async def get_user_branding(user_id: str):
    """Get user branding for exports."""
    if not user_profile_service:
        raise HTTPException(status_code=503, detail="User profile service not available")

    branding = user_profile_service.get_branding_for_export(user_id)
    return branding


# ============================================================================
# PROPERTY AUTOFILL ENDPOINT
# ============================================================================

@fastapi_app.get("/property/autofill/{postcode}")
async def autofill_property_data(postcode: str, address: Optional[str] = None):
    """Auto-fill property data based on postcode.

    Args:
        postcode: UK postcode (e.g., "SW1X7LY" or "SW1X 7LY")
        address: Optional full address to override

    Returns:
        Property data including EPC, council tax, size, etc.
    """
    if not property_autofill_service:
        raise HTTPException(status_code=503, detail="Property autofill service not available")

    try:
        property_data = property_autofill_service.lookup_property_data(
            postcode=postcode,
            address=address
        )

        logger.info(f"Auto-filled property data for postcode: {postcode}")

        return {
            "success": True,
            "data": property_data
        }

    except Exception as e:
        logger.error(f"Failed to autofill property data: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@fastapi_app.get("/property/council-tax-bands")
async def get_council_tax_bands():
    """Get council tax band information."""
    if not property_autofill_service:
        raise HTTPException(status_code=503, detail="Property autofill service not available")

    return property_autofill_service.get_council_tax_bands()


@fastapi_app.get("/property/epc-info/{rating}")
async def get_epc_info(rating: str):
    """Get EPC rating information.

    Args:
        rating: EPC rating (A-G)
    """
    if not property_autofill_service:
        raise HTTPException(status_code=503, detail="Property autofill service not available")

    rating = rating.upper()
    if rating not in ["A", "B", "C", "D", "E", "F", "G"]:
        raise HTTPException(status_code=400, detail="Invalid EPC rating. Must be A-G")

    return property_autofill_service.get_epc_rating_info(rating)


# ============================================================================
# WRAP APP WITH AUTH MIDDLEWARE (must be done AFTER all routes are defined)
# ============================================================================
app = BasicAuthASGIMiddleware(fastapi_app)


if __name__ == "__main__":
    import uvicorn
    import os
    print("=== STARTING SERVER ===", flush=True)
    # Railway sets PORT env variable, fall back to settings
    port = int(os.environ.get("PORT", settings.port or settings.backend_port))
    host = settings.backend_host
    print(f"Host: {host}, Port: {port}", flush=True)
    print(f"RAILWAY_ENVIRONMENT: {os.environ.get('RAILWAY_ENVIRONMENT')}", flush=True)
    uvicorn.run(
        "backend.main:app",
        host=host,
        port=port,
        reload=os.environ.get("RAILWAY_ENVIRONMENT") is None  # Only reload in dev
    )
# Trigger reload for auth system
# EPC service reload




