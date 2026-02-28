"""
User Profile Service

Manages user profiles with persistent branding, preferences, and agency information.
Stores user data in JSON files for simplicity (can be migrated to database later).
"""
import json
import os
from pathlib import Path
from typing import Optional, Dict, Any
from datetime import datetime
import base64
import hashlib


class UserProfile:
    """User profile with branding and preferences."""

    def __init__(
        self,
        user_id: str,
        email: str,
        name: str,
        agency_name: str = "Savills",
        agency_phone: str = "+44 20 7499 8644",
        agency_email: str = "info@savills.com",
        agency_website: str = "www.savills.com",
        primary_color: str = "#CD1F2A",  # Savills red
        secondary_color: str = "#FFD500",  # Savills yellow
        logo_path: Optional[str] = None,
        logo_base64: Optional[str] = None,
        agent_photo_path: Optional[str] = None,
        agent_photo_base64: Optional[str] = None,
        preferences: Optional[Dict[str, Any]] = None
    ):
        self.user_id = user_id
        self.email = email
        self.name = name
        self.agency_name = agency_name
        self.agency_phone = agency_phone
        self.agency_email = agency_email
        self.agency_website = agency_website
        self.primary_color = primary_color
        self.secondary_color = secondary_color
        self.logo_path = logo_path
        self.logo_base64 = logo_base64
        self.agent_photo_path = agent_photo_path
        self.agent_photo_base64 = agent_photo_base64
        self.preferences = preferences or {}
        self.created_at = datetime.utcnow().isoformat()
        self.updated_at = datetime.utcnow().isoformat()

    def to_dict(self) -> Dict[str, Any]:
        """Convert profile to dictionary."""
        return {
            "user_id": self.user_id,
            "email": self.email,
            "name": self.name,
            "agency_name": self.agency_name,
            "agency_phone": self.agency_phone,
            "agency_email": self.agency_email,
            "agency_website": self.agency_website,
            "primary_color": self.primary_color,
            "secondary_color": self.secondary_color,
            "logo_path": self.logo_path,
            "logo_base64": self.logo_base64,
            "agent_photo_path": self.agent_photo_path,
            "agent_photo_base64": self.agent_photo_base64,
            "preferences": self.preferences,
            "created_at": self.created_at,
            "updated_at": self.updated_at
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'UserProfile':
        """Create profile from dictionary."""
        profile = cls(
            user_id=data["user_id"],
            email=data["email"],
            name=data["name"],
            agency_name=data.get("agency_name", "Savills"),
            agency_phone=data.get("agency_phone", "+44 20 7499 8644"),
            agency_email=data.get("agency_email", "info@savills.com"),
            agency_website=data.get("agency_website", "www.savills.com"),
            primary_color=data.get("primary_color", "#CD1F2A"),
            secondary_color=data.get("secondary_color", "#FFD500"),
            logo_path=data.get("logo_path"),
            logo_base64=data.get("logo_base64"),
            agent_photo_path=data.get("agent_photo_path"),
            agent_photo_base64=data.get("agent_photo_base64"),
            preferences=data.get("preferences", {})
        )
        profile.created_at = data.get("created_at", profile.created_at)
        profile.updated_at = data.get("updated_at", profile.updated_at)
        return profile


class UserProfileService:
    """Service for managing user profiles."""

    def __init__(self, storage_dir: str = "./user_profiles"):
        """Initialize user profile service.

        Args:
            storage_dir: Directory to store user profile JSON files
        """
        self.storage_dir = Path(storage_dir)
        self.storage_dir.mkdir(exist_ok=True, parents=True)

        # Create uploads directory for logos and photos
        self.uploads_dir = self.storage_dir / "uploads"
        self.uploads_dir.mkdir(exist_ok=True, parents=True)

        # Initialize default profiles if they don't exist
        self._initialize_default_profiles()

    def _initialize_default_profiles(self):
        """Create default profiles for known users."""
        # James Smith - Savills
        james_smith_profile = UserProfile(
            user_id="james_smith",
            email="james.smith@savills.com",
            name="James Smith",
            agency_name="Savills",
            agency_phone="+44 20 7499 8644",
            agency_email="james.smith@savills.com",
            agency_website="www.savills.com",
            primary_color="#CD1F2A",  # Savills red
            secondary_color="#FFD500",  # Savills yellow
            preferences={
                "default_tone": "premium",
                "default_channel": "brochure",
                "auto_enrichment": True
            }
        )

        # Save if doesn't exist
        if not self._profile_exists("james_smith"):
            self.save_profile(james_smith_profile)

    def _profile_exists(self, user_id: str) -> bool:
        """Check if profile exists."""
        profile_path = self.storage_dir / f"{user_id}.json"
        return profile_path.exists()

    def _get_profile_path(self, user_id: str) -> Path:
        """Get path to profile file."""
        return self.storage_dir / f"{user_id}.json"

    def save_profile(self, profile: UserProfile) -> bool:
        """Save user profile to disk.

        Args:
            profile: UserProfile to save

        Returns:
            True if saved successfully
        """
        try:
            profile.updated_at = datetime.utcnow().isoformat()
            profile_path = self._get_profile_path(profile.user_id)

            with open(profile_path, 'w') as f:
                json.dump(profile.to_dict(), f, indent=2)

            return True
        except Exception as e:
            print(f"Error saving profile: {e}")
            return False

    def load_profile(self, user_id: str) -> Optional[UserProfile]:
        """Load user profile from disk.

        Args:
            user_id: User ID to load

        Returns:
            UserProfile if found, None otherwise
        """
        try:
            profile_path = self._get_profile_path(user_id)

            if not profile_path.exists():
                return None

            with open(profile_path, 'r') as f:
                data = json.load(f)

            return UserProfile.from_dict(data)
        except Exception as e:
            print(f"Error loading profile: {e}")
            return None

    def load_profile_by_email(self, email: str) -> Optional[UserProfile]:
        """Load profile by email address.

        Args:
            email: Email address to search for

        Returns:
            UserProfile if found, None otherwise
        """
        # Scan all profiles for matching email
        for profile_file in self.storage_dir.glob("*.json"):
            try:
                with open(profile_file, 'r') as f:
                    data = json.load(f)

                if data.get("email", "").lower() == email.lower():
                    return UserProfile.from_dict(data)
            except Exception:
                continue

        return None

    def update_branding(
        self,
        user_id: str,
        agency_name: Optional[str] = None,
        agency_phone: Optional[str] = None,
        agency_email: Optional[str] = None,
        agency_website: Optional[str] = None,
        primary_color: Optional[str] = None,
        secondary_color: Optional[str] = None
    ) -> bool:
        """Update user branding information.

        Args:
            user_id: User ID
            agency_name: Agency name (optional)
            agency_phone: Agency phone (optional)
            agency_email: Agency email (optional)
            agency_website: Agency website (optional)
            primary_color: Primary brand color (optional)
            secondary_color: Secondary brand color (optional)

        Returns:
            True if updated successfully
        """
        profile = self.load_profile(user_id)
        if not profile:
            return False

        if agency_name is not None:
            profile.agency_name = agency_name
        if agency_phone is not None:
            profile.agency_phone = agency_phone
        if agency_email is not None:
            profile.agency_email = agency_email
        if agency_website is not None:
            profile.agency_website = agency_website
        if primary_color is not None:
            profile.primary_color = primary_color
        if secondary_color is not None:
            profile.secondary_color = secondary_color

        return self.save_profile(profile)

    def save_logo(self, user_id: str, logo_data: bytes, filename: str) -> Optional[str]:
        """Save user logo file.

        Args:
            user_id: User ID
            logo_data: Logo file bytes
            filename: Original filename

        Returns:
            Path to saved logo file, or None if failed
        """
        try:
            # Generate unique filename
            file_hash = hashlib.md5(logo_data, usedforsecurity=False).hexdigest()[:8]
            ext = Path(filename).suffix
            safe_filename = f"{user_id}_logo_{file_hash}{ext}"

            logo_path = self.uploads_dir / safe_filename

            # Save file
            with open(logo_path, 'wb') as f:
                f.write(logo_data)

            # Update profile
            profile = self.load_profile(user_id)
            if profile:
                profile.logo_path = str(logo_path)
                # Also store as base64 for easy embedding
                profile.logo_base64 = base64.b64encode(logo_data).decode('utf-8')
                self.save_profile(profile)

            return str(logo_path)
        except Exception as e:
            print(f"Error saving logo: {e}")
            return None

    def save_agent_photo(self, user_id: str, photo_data: bytes, filename: str) -> Optional[str]:
        """Save agent photo file.

        Args:
            user_id: User ID
            photo_data: Photo file bytes
            filename: Original filename

        Returns:
            Path to saved photo file, or None if failed
        """
        try:
            # Generate unique filename
            file_hash = hashlib.md5(photo_data, usedforsecurity=False).hexdigest()[:8]
            ext = Path(filename).suffix
            safe_filename = f"{user_id}_photo_{file_hash}{ext}"

            photo_path = self.uploads_dir / safe_filename

            # Save file
            with open(photo_path, 'wb') as f:
                f.write(photo_data)

            # Update profile
            profile = self.load_profile(user_id)
            if profile:
                profile.agent_photo_path = str(photo_path)
                # Also store as base64 for easy embedding
                profile.agent_photo_base64 = base64.b64encode(photo_data).decode('utf-8')
                self.save_profile(profile)

            return str(photo_path)
        except Exception as e:
            print(f"Error saving agent photo: {e}")
            return None

    def get_branding_for_export(self, user_id: str) -> Dict[str, Any]:
        """Get branding information formatted for export requests.

        Args:
            user_id: User ID

        Returns:
            Dictionary with branding information compatible with BrandingOptions schema
        """
        profile = self.load_profile(user_id)

        if not profile:
            # Return default Savills branding
            return {
                "agency_name": "Savills",
                "phone": "+44 20 7499 8644",
                "email": "info@savills.com",
                "primary_color": "#CD1F2A",
                "secondary_color": "#FFD500",
                "logo_path": None
            }

        return {
            "agency_name": profile.agency_name,
            "phone": profile.agency_phone,
            "email": profile.agency_email,
            "primary_color": profile.primary_color,
            "secondary_color": profile.secondary_color,
            "logo_path": profile.logo_path,
            "logo_base64": profile.logo_base64
        }

    def update_preferences(self, user_id: str, preferences: Dict[str, Any]) -> bool:
        """Update user preferences.

        Args:
            user_id: User ID
            preferences: Dictionary of preferences to update

        Returns:
            True if updated successfully
        """
        profile = self.load_profile(user_id)
        if not profile:
            return False

        profile.preferences.update(preferences)
        return self.save_profile(profile)

    def get_all_profiles(self) -> list[UserProfile]:
        """Get all user profiles.

        Returns:
            List of all UserProfile objects
        """
        profiles = []
        for profile_file in self.storage_dir.glob("*.json"):
            try:
                with open(profile_file, 'r') as f:
                    data = json.load(f)
                profiles.append(UserProfile.from_dict(data))
            except Exception:
                continue
        return profiles
