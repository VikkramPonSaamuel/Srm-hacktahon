import hashlib
import json
import os
import re
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

from app.core.exceptions import BadRequestError

MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024  # 5 MB
MAX_DATA_SIZE_BYTES = 1 * 1024 * 1024   # 1 MB

SUPPORTED_ASSET_TYPES = {
    "logo",
    "brand_image",
    "website_text_sample",
    "color_palette",
    "font_info",
    "app_identifier",
    "social_profile",
}

HEX_COLOR_REGEX = re.compile(r"^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$")
BUNDLE_ID_REGEX = re.compile(r"^[a-zA-Z0-9_\.]+$")
DANGEROUS_SVG_PATTERNS = re.compile(r"(<script|javascript:|onload=|onerror=|<\!entity)", re.IGNORECASE)


class AssetStorageAdapter:
    """Secure asset storage manager that validates content magic bytes,

    enforces size constraints, sanitizes data, and prevents path traversal.
    """

    def __init__(self, base_dir: Optional[str] = None) -> None:
        if base_dir:
            self.base_path = Path(base_dir).resolve()
        else:
            # Default to backend/uploads/brand_assets outside web root
            self.base_path = Path(os.getcwd()).resolve() / "uploads" / "brand_assets"

        self.base_path.mkdir(parents=True, exist_ok=True)

    def validate_and_store(
        self,
        asset_id: str,
        asset_type: str,
        content: bytes,
        declared_content_type: Optional[str] = None,
        custom_metadata: Optional[Dict[str, Any]] = None,
    ) -> Tuple[str, str, str, int, Dict[str, Any]]:
        """Validates asset content and stores it safely.

        Returns: (storage_path, file_hash, detected_mime_type, file_size_bytes, metadata)
        """
        if asset_type not in SUPPORTED_ASSET_TYPES:
            raise BadRequestError(
                f"Unsupported asset type '{asset_type}'. "
                f"Supported types are: {', '.join(sorted(SUPPORTED_ASSET_TYPES))}."
            )

        if not content or len(content) == 0:
            raise BadRequestError("Asset content cannot be empty.")

        file_size = len(content)
        file_hash = hashlib.sha256(content).hexdigest()
        metadata: Dict[str, Any] = custom_metadata.copy() if custom_metadata else {}

        # 1. Size restriction
        if asset_type in ("logo", "brand_image"):
            if file_size > MAX_IMAGE_SIZE_BYTES:
                raise BadRequestError(
                    f"Asset exceeds maximum allowed image size of {MAX_IMAGE_SIZE_BYTES // (1024 * 1024)}MB."
                )
        else:
            if file_size > MAX_DATA_SIZE_BYTES:
                raise BadRequestError(
                    f"Asset exceeds maximum allowed data size of {MAX_DATA_SIZE_BYTES // (1024 * 1024)}MB."
                )

        # 2. Content & Magic Byte Inspection
        detected_mime, safe_ext = self._inspect_content(asset_type, content, metadata)

        # 3. Secure file storage (UUID-based name to prevent directory traversal and overwrite attacks)
        safe_filename = f"{asset_id}_{file_hash[:12]}{safe_ext}"
        target_path = self.base_path / safe_filename

        try:
            with open(target_path, "wb") as f:
                f.write(content)
        except Exception as e:
            raise BadRequestError(f"Failed to persist asset content: {e}")

        metadata["file_hash"] = file_hash
        metadata["detected_mime"] = detected_mime

        return str(target_path), file_hash, detected_mime, file_size, metadata

    def _inspect_content(
        self,
        asset_type: str,
        content: bytes,
        metadata: Dict[str, Any],
    ) -> Tuple[str, str]:
        """Inspects magic bytes and deep content, rejecting malicious or mismatched data."""
        if asset_type in ("logo", "brand_image"):
            # Check PNG
            if content.startswith(b"\x89PNG\r\n\x1a\n"):
                return "image/png", ".png"

            # Check JPEG
            if content.startswith(b"\xff\xd8\xff"):
                return "image/jpeg", ".jpg"

            # Check WebP
            if content.startswith(b"RIFF") and b"WEBP" in content[8:16]:
                return "image/webp", ".webp"

            # Check SVG
            decoded_text = ""
            try:
                decoded_text = content.decode("utf-8", errors="ignore").strip()
            except Exception:
                decoded_text = ""

            if (decoded_text.startswith("<?xml") or "<svg" in decoded_text.lower()) and "</svg>" in decoded_text.lower():
                if DANGEROUS_SVG_PATTERNS.search(decoded_text):
                    raise BadRequestError(
                        "SVG content contains dangerous executable tags, scripts, or entity declarations."
                    )
                return "image/svg+xml", ".svg"

            raise BadRequestError(
                "Uploaded image format is not recognized or supported. "
                "Only valid PNG, JPEG, WebP, and secure SVG files are permitted."
            )

        elif asset_type == "color_palette":
            try:
                data = json.loads(content.decode("utf-8"))
            except Exception:
                raise BadRequestError("Color palette must be valid JSON encoding a list of hex color codes.")

            colors = data if isinstance(data, list) else data.get("colors", [])
            if not isinstance(colors, list) or len(colors) == 0:
                raise BadRequestError("Color palette JSON must contain a non-empty list of colors.")

            for color in colors:
                if not isinstance(color, str) or not HEX_COLOR_REGEX.match(color):
                    raise BadRequestError(f"Invalid hex color '{color}'. Must be in #RGB or #RRGGBB format.")

            metadata["colors_count"] = len(colors)
            return "application/json", ".json"

        elif asset_type == "font_info":
            try:
                data = json.loads(content.decode("utf-8"))
            except Exception:
                raise BadRequestError("Font info must be valid JSON specifying font families and attributes.")

            if not isinstance(data, dict) or "font_family" not in data:
                raise BadRequestError("Font info JSON must specify at least 'font_family'.")

            metadata["font_family"] = data["font_family"]
            return "application/json", ".json"

        elif asset_type == "app_identifier":
            try:
                data = json.loads(content.decode("utf-8"))
            except Exception:
                raise BadRequestError("App identifier asset must be valid JSON.")

            if not isinstance(data, dict) or not ("package_name" in data or "bundle_id" in data):
                raise BadRequestError("App identifier JSON must specify 'package_name' or 'bundle_id'.")

            identifier = data.get("package_name") or data.get("bundle_id")
            if not BUNDLE_ID_REGEX.match(identifier):
                raise BadRequestError(f"Invalid app identifier '{identifier}'.")

            metadata["identifier"] = identifier
            return "application/json", ".json"

        elif asset_type == "social_profile":
            try:
                data = json.loads(content.decode("utf-8"))
            except Exception:
                raise BadRequestError("Social profile asset must be valid JSON.")

            if not isinstance(data, dict) or not ("platform" in data and "handle" in data):
                raise BadRequestError("Social profile JSON must specify 'platform' and 'handle'.")

            metadata["platform"] = data["platform"]
            metadata["handle"] = data["handle"]
            return "application/json", ".json"

        elif asset_type == "website_text_sample":
            try:
                text_content = content.decode("utf-8").strip()
            except UnicodeDecodeError:
                raise BadRequestError("Website text sample must be valid UTF-8 text.")

            if len(text_content) < 10:
                raise BadRequestError("Website text sample must contain at least 10 characters.")

            if "<script" in text_content.lower() or "javascript:" in text_content.lower():
                raise BadRequestError("Website text sample contains disallowed script tags.")

            metadata["sample_length"] = len(text_content)
            return "text/plain", ".txt"

        raise BadRequestError(f"Unhandled asset type: {asset_type}")
