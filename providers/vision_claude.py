"""
Claude vision provider using Anthropic's Claude API with vision capabilities.
"""
from typing import Dict, List, Optional
import logging
import anthropic
import base64
import os

logger = logging.getLogger(__name__)

# Vision model options - Sonnet is best balance of quality/cost for property photos
VISION_MODELS = {
    "haiku": "claude-3-5-haiku-20241022",      # Cheapest, may hallucinate
    "sonnet": "claude-sonnet-4-20250514",       # Best value - recommended
    "opus": "claude-opus-4-20250514",           # Best quality, expensive
}


class VisionClaudeClient:
    """
    Claude vision client that uses Anthropic's API for image analysis.

    Uses Claude's multimodal capabilities to analyze property images and extract
    features, room types, finishes, and generate captions.
    """

    def __init__(self, api_key: str = None, rate_limiter=None, model: str = None):
        """
        Initialize Claude vision client.

        Args:
            api_key: Anthropic API key
            rate_limiter: Optional GlobalRateLimiter instance for rate limiting
            model: Vision model to use (haiku/sonnet/opus) - defaults to VISION_MODEL env var or sonnet
        """
        self.api_key = api_key or os.getenv('ANTHROPIC_API_KEY')
        if not self.api_key:
            raise ValueError("ANTHROPIC_API_KEY is required for Claude vision")

        self.client = anthropic.Anthropic(api_key=self.api_key)
        self.rate_limiter = rate_limiter

        # Get model from parameter, env var, or default to sonnet
        model_key = model or os.getenv('VISION_MODEL', 'sonnet').lower()
        self.model = VISION_MODELS.get(model_key, VISION_MODELS['sonnet'])

        logger.info(f"Initialized Claude vision client with model: {self.model}")

    async def analyze_image(self, image_bytes: bytes, filename: str) -> Dict:
        """
        Analyze property image using Claude's vision API.

        Args:
            image_bytes: Raw image data
            filename: Image filename (for metadata)

        Returns:
            Structured analysis dict
        """
        logger.debug(f"Claude analyzing: {filename}")

        # Encode image to base64
        image_base64 = base64.b64encode(image_bytes).decode('utf-8')

        # Determine media type from filename
        media_type = self._get_media_type(filename)

        # Create the vision analysis prompt
        prompt = self._build_analysis_prompt()

        try:
            # Apply global rate limiting if available
            if self.rate_limiter:
                await self.rate_limiter.wait_if_needed()
                logger.debug(f"Rate limiter enforced for {filename}")

            # Call Claude with vision using configured model
            message = self.client.messages.create(
                model=self.model,
                max_tokens=1024,
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "image",
                                "source": {
                                    "type": "base64",
                                    "media_type": media_type,
                                    "data": image_base64,
                                },
                            },
                            {
                                "type": "text",
                                "text": prompt
                            }
                        ],
                    }
                ],
            )

            # Parse Claude's response
            response_text = message.content[0].text
            analysis = self._parse_claude_response(response_text, filename)

            # Validate the response - check for hallucination indicators
            analysis = self._validate_analysis(analysis, filename)

            logger.debug(f"Successfully analyzed {filename}: {analysis['room_type']}")
            return analysis

        except Exception as e:
            logger.error(f"Claude vision analysis failed for {filename}: {str(e)}")
            # Return minimal analysis that flags the image needs manual review
            return self._fallback_analysis(filename, error=str(e))

    def _get_media_type(self, filename: str) -> str:
        """Determine media type from filename extension."""
        filename_lower = filename.lower()
        if filename_lower.endswith('.png'):
            return "image/png"
        elif filename_lower.endswith(('.jpg', '.jpeg')):
            return "image/jpeg"
        elif filename_lower.endswith('.webp'):
            return "image/webp"
        elif filename_lower.endswith('.gif'):
            return "image/gif"
        else:
            return "image/jpeg"  # Default

    def _build_analysis_prompt(self) -> str:
        """Build the prompt for Claude to analyze the property image with JSON output."""
        return """Analyze this property photograph and identify SPECIFIC PHYSICAL FEATURES visible in the image.

You MUST respond with ONLY valid JSON in this exact format:
{
  "room_type": "kitchen|bedroom|bathroom|living_room|dining_room|garden|exterior|hallway|office|garage|other",
  "detected_features": ["feature1", "feature2"],
  "finishes": ["finish1", "finish2"],
  "light_level": "bright|moderate|dim",
  "view_hint": "garden_view|street_view|park_view|null",
  "interior": true|false,
  "orientation_hint": "north_facing|south_facing|east_facing|west_facing|front_aspect|rear_aspect|null",
  "caption": "8-20 word property caption describing what you see"
}

VALID FEATURES (only list if ACTUALLY VISIBLE):
- Structural: fireplace, bay_window, sash_windows, french_doors, bifold_doors, skylights, exposed_beams, conservatory
- Outdoor: garden, driveway, garage, parking, patio, balcony, terrace, decking, swimming_pool
- Kitchen: kitchen_island, breakfast_bar, range_cooker, integrated_appliances
- Bedroom: ensuite, walk_in_wardrobe, fitted_wardrobes

VALID FINISHES (only list if ACTUALLY VISIBLE):
- Floors: hardwood_floors, marble_flooring, porcelain_tiles, carpet
- Surfaces: granite_countertops, quartz_worktops, wooden_worktops
- Appliances: stainless_steel_appliances, integrated_appliances
- Lighting: recessed_lighting, pendant_lighting, chandeliers

CRITICAL RULES:
1. Only list features/finishes you can ACTUALLY SEE - do not guess or assume
2. If uncertain, leave arrays empty []
3. NEVER use subjective terms like: well_presented, modern, attractive, stunning, beautiful, quality, excellent
4. Caption must describe VISIBLE elements only
5. Respond with ONLY the JSON object, no other text"""

    def _parse_claude_response(self, response_text: str, filename: str) -> Dict:
        """Parse Claude's JSON response into a dict."""
        import json
        import re

        # Default result structure
        result = {
            "filename": filename,
            "room_type": "other",
            "detected_features": [],
            "finishes": [],
            "light_level": "moderate",
            "view_hint": None,
            "interior": True,
            "orientation_hint": None,
            "suggested_caption": ""
        }

        try:
            # Try to extract JSON from the response (in case there's extra text)
            json_match = re.search(r'\{[\s\S]*\}', response_text)
            if json_match:
                json_str = json_match.group()
                parsed = json.loads(json_str)

                # Map parsed values to result
                if 'room_type' in parsed:
                    result['room_type'] = str(parsed['room_type']).lower()
                if 'detected_features' in parsed and isinstance(parsed['detected_features'], list):
                    result['detected_features'] = [str(f).strip() for f in parsed['detected_features'] if f]
                if 'finishes' in parsed and isinstance(parsed['finishes'], list):
                    result['finishes'] = [str(f).strip() for f in parsed['finishes'] if f]
                if 'light_level' in parsed:
                    result['light_level'] = str(parsed['light_level']).lower()
                if 'view_hint' in parsed:
                    vh = parsed['view_hint']
                    result['view_hint'] = None if vh in [None, 'null', 'none'] else str(vh).lower()
                if 'interior' in parsed:
                    result['interior'] = bool(parsed['interior'])
                if 'orientation_hint' in parsed:
                    oh = parsed['orientation_hint']
                    result['orientation_hint'] = None if oh in [None, 'null', 'none'] else str(oh).lower()
                if 'caption' in parsed:
                    result['suggested_caption'] = str(parsed['caption'])

                logger.debug(f"Successfully parsed JSON response for {filename}")
            else:
                logger.warning(f"No JSON found in response for {filename}, falling back to text parsing")
                result = self._parse_text_response(response_text, filename, result)

        except json.JSONDecodeError as e:
            logger.warning(f"JSON parse error for {filename}: {e}, falling back to text parsing")
            result = self._parse_text_response(response_text, filename, result)

        return result

    def _parse_text_response(self, response_text: str, filename: str, result: Dict) -> Dict:
        """Fallback text parser for non-JSON responses."""
        lines = response_text.strip().split('\n')

        for line in lines:
            line = line.strip()
            if ':' not in line:
                continue

            key, value = line.split(':', 1)
            key = key.strip().lower().replace('"', '').replace("'", "")
            value = value.strip().strip('"').strip("'")

            if 'room_type' in key:
                result['room_type'] = value.lower()
            elif 'detected_features' in key or 'features' in key:
                result['detected_features'] = [f.strip().strip('"') for f in value.split(',') if f.strip()]
            elif 'finishes' in key:
                result['finishes'] = [f.strip().strip('"') for f in value.split(',') if f.strip()]
            elif 'light_level' in key:
                result['light_level'] = value.lower()
            elif 'view_hint' in key:
                result['view_hint'] = None if value.lower() in ['none', 'null'] else value.lower()
            elif 'interior' in key:
                result['interior'] = value.lower() == 'true'
            elif 'orientation' in key:
                result['orientation_hint'] = None if value.lower() in ['none', 'null'] else value.lower()
            elif 'caption' in key:
                result['suggested_caption'] = value

        return result

    def _validate_analysis(self, analysis: Dict, filename: str) -> Dict:
        """
        Validate the analysis to catch hallucinations and generic responses.
        """
        # List of generic/hallucinated terms that indicate poor analysis
        HALLUCINATION_INDICATORS = [
            "well_presented", "well presented", "modern_finish", "attractive",
            "quality", "excellent", "beautiful", "stunning", "lovely",
            "nice", "good condition", "immaculate", "pristine"
        ]

        # Check detected features for hallucinations
        valid_features = []
        for feature in analysis.get('detected_features', []):
            feature_lower = feature.lower()
            if not any(indicator in feature_lower for indicator in HALLUCINATION_INDICATORS):
                valid_features.append(feature)

        # If all features were hallucinated, flag for manual review
        if not valid_features and analysis.get('detected_features'):
            logger.warning(f"Possible hallucination detected for {filename} - features looked generic")
            analysis['needs_review'] = True
            analysis['detected_features'] = []

        analysis['detected_features'] = valid_features

        # Validate caption isn't generic
        caption = analysis.get('suggested_caption', '').lower()
        if any(indicator in caption for indicator in HALLUCINATION_INDICATORS):
            # Generate a more honest caption based on room type
            room_type = analysis.get('room_type', 'room')
            analysis['suggested_caption'] = f"Property {room_type.replace('_', ' ')}"
            analysis['needs_review'] = True

        return analysis

    def _fallback_analysis(self, filename: str, error: str = None) -> Dict:
        """
        Fallback analysis if Claude API fails.
        Returns honest minimal data instead of hallucinated content.
        """
        logger.warning(f"Using fallback analysis for {filename}" + (f": {error}" if error else ""))

        return {
            "filename": filename,
            "room_type": "other",
            "detected_features": [],  # Empty - don't hallucinate features
            "finishes": [],
            "light_level": "moderate",
            "view_hint": None,
            "interior": True,
            "orientation_hint": None,
            "suggested_caption": "Property photograph",  # Honest minimal caption
            "needs_review": True,  # Flag that this needs manual review
            "analysis_error": error
        }
