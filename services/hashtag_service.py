"""
Hashtag Service - Provides trending and curated hashtags for social media posts
Integrates with Google Trends and maintains a curated database of proven UK property hashtags
"""
import logging
import httpx
from typing import List, Dict, Optional
from datetime import datetime

logger = logging.getLogger(__name__)


class HashtagService:
    """
    Service for generating optimized hashtags for property social media posts.

    Features:
    - Curated database of proven UK property hashtags
    - Google Trends integration for trending terms
    - Location-based hashtag suggestions
    - Property type specific hashtags
    - Audience-targeted hashtags
    """

    # Curated database of proven high-engagement UK property hashtags
    CURATED_HASHTAGS = {
        # General property hashtags (high engagement)
        "general": [
            "#PropertyForSale", "#NewListing", "#JustListed", "#HomeForSale",
            "#RealEstate", "#PropertyUK", "#UKProperty", "#DreamHome",
            "#HouseHunting", "#HomeSweetHome", "#PropertyMarket", "#MovingHome",
            "#NewHome", "#ForSale", "#OnTheMarket", "#PropertySearch"
        ],

        # Property types
        "detached": [
            "#DetachedHouse", "#DetachedHome", "#FamilyHome", "#DetachedProperty",
            "#SpaceLiving", "#GardenLovers", "#PrivateGarden"
        ],
        "semi_detached": [
            "#SemiDetached", "#SemiDetachedHouse", "#FamilyHome", "#SuburbanLiving"
        ],
        "terraced": [
            "#TerracedHouse", "#TerraceHome", "#PeriodProperty", "#CharacterHome"
        ],
        "flat": [
            "#FlatForSale", "#ApartmentForSale", "#CityLiving", "#ModernLiving",
            "#ApartmentLife", "#FlatHunting", "#CityApartment"
        ],
        "cottage": [
            "#CottageLife", "#CountryCottage", "#PeriodCottage", "#RuralLiving",
            "#CottageCore", "#CountryLiving", "#QuaintCottage", "#EnglishCottage"
        ],
        "bungalow": [
            "#Bungalow", "#BungalowLife", "#SingleStorey", "#RetirementHome",
            "#AccessibleHome", "#GroundFloorLiving"
        ],
        "penthouse": [
            "#Penthouse", "#LuxuryLiving", "#PenthouseLife", "#CityViews",
            "#LuxuryProperty", "#HighRiseLiving"
        ],
        "mansion": [
            "#MansionForSale", "#LuxuryHome", "#GrandHome", "#PrestigeProperty",
            "#LuxuryRealEstate", "#DreamMansion"
        ],

        # UK regions and cities
        "london": [
            "#LondonProperty", "#LondonHomes", "#LondonRealEstate", "#PropertyLondon",
            "#LondonLiving", "#CapitalLiving", "#LondonLife"
        ],
        "manchester": [
            "#ManchesterProperty", "#ManchesterHomes", "#PropertyManchester",
            "#ManchesterLiving", "#NorthWestProperty"
        ],
        "birmingham": [
            "#BirminghamProperty", "#BirminghamHomes", "#PropertyBirmingham",
            "#MidlandsProperty", "#BrumHomes"
        ],
        "bristol": [
            "#BristolProperty", "#BristolHomes", "#PropertyBristol",
            "#SouthWestProperty", "#BristolLiving"
        ],
        "edinburgh": [
            "#EdinburghProperty", "#EdinburghHomes", "#PropertyEdinburgh",
            "#ScotlandProperty", "#ScottishHomes"
        ],
        "leeds": [
            "#LeedsProperty", "#LeedsHomes", "#PropertyLeeds",
            "#YorkshireProperty", "#WestYorkshire"
        ],
        "liverpool": [
            "#LiverpoolProperty", "#LiverpoolHomes", "#PropertyLiverpool",
            "#MerseysideProperty"
        ],
        "cotswolds": [
            "#CotswoldsProperty", "#CotswoldsHomes", "#CotswoldLiving",
            "#CotswoldLife", "#GloucestershireProperty", "#RuralCotswolds"
        ],
        "surrey": [
            "#SurreyProperty", "#SurreyHomes", "#PropertySurrey",
            "#SurreyLiving", "#HomeCounties"
        ],
        "kent": [
            "#KentProperty", "#KentHomes", "#PropertyKent",
            "#GardenOfEngland", "#KentLiving"
        ],
        "sussex": [
            "#SussexProperty", "#SussexHomes", "#PropertySussex",
            "#EastSussex", "#WestSussex"
        ],
        "cornwall": [
            "#CornwallProperty", "#CornwallHomes", "#PropertyCornwall",
            "#CornishProperty", "#CoastalLiving"
        ],
        "devon": [
            "#DevonProperty", "#DevonHomes", "#PropertyDevon",
            "#SouthDevon", "#DevonLiving"
        ],
        "yorkshire": [
            "#YorkshireProperty", "#YorkshireHomes", "#PropertyYorkshire",
            "#NorthYorkshire", "#YorkshireLiving"
        ],
        "scotland": [
            "#ScotlandProperty", "#ScottishHomes", "#PropertyScotland",
            "#HighlandsProperty", "#ScottishLiving"
        ],
        "wales": [
            "#WalesProperty", "#WelshHomes", "#PropertyWales",
            "#WelshProperty", "#WalesLiving"
        ],

        # Target audiences
        "first_time_buyers": [
            "#FirstTimeBuyer", "#FirstHome", "#GetOnTheLadder", "#StarterHome",
            "#FirstTimeHome", "#PropertyLadder", "#FTB"
        ],
        "families": [
            "#FamilyHome", "#FamilyHouse", "#GrowingFamily", "#FamilyLiving",
            "#ChildFriendly", "#SchoolCatchment", "#FamilyFriendly"
        ],
        "investors": [
            "#PropertyInvestment", "#BTL", "#BuyToLet", "#PropertyPortfolio",
            "#InvestmentProperty", "#RentalProperty", "#PropertyInvestor"
        ],
        "downsizers": [
            "#Downsizing", "#DownsizeHome", "#RetirementProperty", "#CompactLiving",
            "#EmptyNesters", "#NextChapter"
        ],
        "luxury": [
            "#LuxuryProperty", "#PrestigeHomes", "#LuxuryRealEstate", "#PrimeProperty",
            "#ExclusiveHomes", "#HighEndProperty", "#LuxuryLiving"
        ],

        # Features
        "garden": [
            "#GardenLovers", "#OutdoorSpace", "#GardenGoals", "#GardenLife",
            "#SouthFacingGarden", "#LargeGarden"
        ],
        "parking": [
            "#Driveway", "#Garage", "#OffStreetParking", "#DoubleGarage",
            "#ParkingSpace"
        ],
        "period": [
            "#PeriodProperty", "#PeriodHome", "#CharacterProperty", "#OriginalFeatures",
            "#VictorianHome", "#GeorgianProperty", "#EdwardianHome"
        ],
        "modern": [
            "#ModernHome", "#ContemporaryLiving", "#NewBuild", "#ModernDesign",
            "#OpenPlanLiving"
        ],
        "renovation": [
            "#DoerUpper", "#RenovationProject", "#PropertyPotential", "#Fixer Upper",
            "#ProjectProperty"
        ],
        "views": [
            "#PropertyWithViews", "#CountryViews", "#SeaViews", "#RoomWithAView",
            "#PanoramicViews"
        ],

        # Seasonal
        "spring": [
            "#SpringProperty", "#SpringMarket", "#SpringMove", "#NewBeginnings"
        ],
        "summer": [
            "#SummerMove", "#SummerProperty", "#GardenSeason"
        ],
        "autumn": [
            "#AutumnMove", "#AutumnProperty", "#CozyHome"
        ],
        "winter": [
            "#WinterMove", "#NewYearNewHome", "#ChristmasMove"
        ],

        # Platform specific (Instagram performs better with these)
        "instagram_optimized": [
            "#PropertyGoals", "#HomeInspo", "#InteriorGoals", "#HouseGoals",
            "#DreamHouseGoals", "#HomeDecor", "#InteriorDesign", "#Househunters"
        ],

        # Engagement boosters
        "engagement": [
            "#PropertyTour", "#HouseTour", "#VirtualTour", "#WalkThrough",
            "#BeforeAndAfter", "#PropertyOfTheDay", "#HomeOfTheDay"
        ]
    }

    # Google Trends related keywords for property searches
    TRENDING_PROPERTY_TERMS = [
        "houses for sale", "property for sale", "homes for sale",
        "buy house", "estate agents", "rightmove", "zoopla"
    ]

    def __init__(self):
        """Initialize hashtag service"""
        self.http_client = httpx.AsyncClient(timeout=10.0)
        logger.info("HashtagService initialized with curated database")

    async def get_hashtags(
        self,
        property_type: Optional[str] = None,
        location: Optional[str] = None,
        target_audience: Optional[str] = None,
        features: Optional[List[str]] = None,
        platform: str = "instagram",
        max_hashtags: int = 15
    ) -> Dict:
        """
        Get optimized hashtags for a property listing.

        Args:
            property_type: Type of property (detached, flat, cottage, etc.)
            location: Property location (city, region, or area)
            target_audience: Target buyer type (first_time_buyers, families, investors)
            features: List of property features (garden, parking, period, etc.)
            platform: Social media platform (instagram, facebook, twitter)
            max_hashtags: Maximum number of hashtags to return

        Returns:
            Dictionary with categorized hashtags and metadata
        """
        hashtags = []
        categories_used = []

        # Always include some general hashtags
        hashtags.extend(self._get_random_from_category("general", 4))
        categories_used.append("general")

        # Add property type specific hashtags
        if property_type:
            type_key = self._normalize_property_type(property_type)
            if type_key in self.CURATED_HASHTAGS:
                hashtags.extend(self._get_random_from_category(type_key, 3))
                categories_used.append(type_key)

        # Add location-based hashtags
        if location:
            location_key = self._normalize_location(location)
            if location_key in self.CURATED_HASHTAGS:
                hashtags.extend(self._get_random_from_category(location_key, 3))
                categories_used.append(location_key)

        # Add audience-targeted hashtags
        if target_audience:
            audience_key = self._normalize_audience(target_audience)
            if audience_key in self.CURATED_HASHTAGS:
                hashtags.extend(self._get_random_from_category(audience_key, 2))
                categories_used.append(audience_key)

        # Add feature-based hashtags
        if features:
            for feature in features[:3]:  # Max 3 features
                feature_key = self._normalize_feature(feature)
                if feature_key in self.CURATED_HASHTAGS:
                    hashtags.extend(self._get_random_from_category(feature_key, 2))
                    categories_used.append(feature_key)

        # Add platform-optimized hashtags for Instagram
        if platform.lower() == "instagram":
            hashtags.extend(self._get_random_from_category("instagram_optimized", 2))
            hashtags.extend(self._get_random_from_category("engagement", 1))

        # Add seasonal hashtags
        season = self._get_current_season()
        if season in self.CURATED_HASHTAGS:
            hashtags.extend(self._get_random_from_category(season, 1))

        # Remove duplicates while preserving order
        seen = set()
        unique_hashtags = []
        for tag in hashtags:
            if tag.lower() not in seen:
                seen.add(tag.lower())
                unique_hashtags.append(tag)

        # Limit to max_hashtags
        final_hashtags = unique_hashtags[:max_hashtags]

        return {
            "hashtags": final_hashtags,
            "count": len(final_hashtags),
            "categories_used": list(set(categories_used)),
            "platform": platform,
            "optimization_notes": self._get_optimization_notes(platform, len(final_hashtags))
        }

    def _get_random_from_category(self, category: str, count: int) -> List[str]:
        """Get random hashtags from a category"""
        import random
        tags = self.CURATED_HASHTAGS.get(category, [])
        if len(tags) <= count:
            return tags.copy()
        return random.sample(tags, count)

    def _normalize_property_type(self, property_type: str) -> str:
        """Normalize property type to match category keys"""
        pt = property_type.lower()
        if "detached" in pt and "semi" not in pt:
            return "detached"
        elif "semi" in pt:
            return "semi_detached"
        elif "terrace" in pt:
            return "terraced"
        elif "flat" in pt or "apartment" in pt:
            return "flat"
        elif "cottage" in pt:
            return "cottage"
        elif "bungalow" in pt:
            return "bungalow"
        elif "penthouse" in pt:
            return "penthouse"
        elif "mansion" in pt:
            return "mansion"
        return "general"

    def _normalize_location(self, location: str) -> str:
        """Normalize location to match category keys"""
        loc = location.lower()

        # Check for major cities/regions
        location_mappings = {
            "london": "london",
            "manchester": "manchester",
            "birmingham": "birmingham",
            "bristol": "bristol",
            "edinburgh": "edinburgh",
            "leeds": "leeds",
            "liverpool": "liverpool",
            "cotswold": "cotswolds",
            "surrey": "surrey",
            "kent": "kent",
            "sussex": "sussex",
            "cornwall": "cornwall",
            "devon": "devon",
            "yorkshire": "yorkshire",
            "scotland": "scotland",
            "wales": "wales",
            "glasgow": "scotland",
            "cardiff": "wales",
            "bath": "bristol",
            "oxford": "cotswolds",
            "cambridge": "general"
        }

        for key, value in location_mappings.items():
            if key in loc:
                return value

        return "general"

    def _normalize_audience(self, audience: str) -> str:
        """Normalize audience to match category keys"""
        aud = audience.lower()
        if "first" in aud or "ftb" in aud:
            return "first_time_buyers"
        elif "famil" in aud:
            return "families"
        elif "invest" in aud:
            return "investors"
        elif "downsize" in aud or "retire" in aud:
            return "downsizers"
        elif "luxury" in aud or "premium" in aud:
            return "luxury"
        return "general"

    def _normalize_feature(self, feature: str) -> str:
        """Normalize feature to match category keys"""
        feat = feature.lower()
        if "garden" in feat:
            return "garden"
        elif "parking" in feat or "garage" in feat or "driveway" in feat:
            return "parking"
        elif "period" in feat or "character" in feat or "victorian" in feat or "georgian" in feat:
            return "period"
        elif "modern" in feat or "contemporary" in feat or "new build" in feat:
            return "modern"
        elif "renovation" in feat or "project" in feat or "potential" in feat:
            return "renovation"
        elif "view" in feat:
            return "views"
        return "general"

    def _get_current_season(self) -> str:
        """Get current season for seasonal hashtags"""
        month = datetime.now().month
        if month in [3, 4, 5]:
            return "spring"
        elif month in [6, 7, 8]:
            return "summer"
        elif month in [9, 10, 11]:
            return "autumn"
        else:
            return "winter"

    def _get_optimization_notes(self, platform: str, hashtag_count: int) -> str:
        """Get platform-specific optimization notes"""
        if platform.lower() == "instagram":
            if hashtag_count < 10:
                return "Consider adding more hashtags (Instagram allows up to 30, optimal is 11-15)"
            elif hashtag_count <= 15:
                return "Optimal hashtag count for Instagram engagement"
            else:
                return "Good hashtag coverage"
        elif platform.lower() == "twitter":
            if hashtag_count > 3:
                return "Twitter performs better with 1-3 hashtags"
            return "Good for Twitter"
        elif platform.lower() == "facebook":
            if hashtag_count > 5:
                return "Facebook posts perform better with fewer hashtags (3-5)"
            return "Good for Facebook"
        return "Hashtags ready"

    async def get_trending_hashtags(self, location: str = "UK") -> List[str]:
        """
        Get trending property hashtags (simulated - would integrate with real API)

        In production, this would call Google Trends API or similar.
        """
        # Simulated trending hashtags based on typical UK property market trends
        trending = [
            "#PropertyMarket2026",
            "#UKHousingMarket",
            "#MortgageRates",
            "#PropertyPrices",
            "#HousingCrisis",
            "#FirstTimeBuyerHelp"
        ]

        # Add seasonal trending
        season = self._get_current_season()
        if season == "spring":
            trending.extend(["#SpringMoving", "#PropertySpring"])
        elif season == "winter":
            trending.extend(["#NewYearNewHome", "#2026Property"])

        return trending

    async def close(self):
        """Close HTTP client"""
        await self.http_client.aclose()


# Singleton instance
_hashtag_service: Optional[HashtagService] = None


def get_hashtag_service() -> HashtagService:
    """Get or create hashtag service singleton"""
    global _hashtag_service
    if _hashtag_service is None:
        _hashtag_service = HashtagService()
    return _hashtag_service
