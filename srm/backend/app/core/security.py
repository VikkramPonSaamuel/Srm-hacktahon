from enum import Enum
from typing import Optional
from fastapi import Depends, Header

from app.core.config import settings
from app.core.exceptions import ForbiddenError, UnauthorizedError


class UserRole(str, Enum):
    VIEWER = "viewer"
    OPERATOR = "operator"
    ADMIN = "admin"


ROLE_HIERARCHY = {
    UserRole.VIEWER: 1,
    UserRole.OPERATOR: 2,
    UserRole.ADMIN: 3,
}


class AuthenticatedUser:
    """Represents an authenticated principal with assigned role and scopes."""

    def __init__(
        self,
        username: str,
        role: UserRole,
        api_key: Optional[str] = None,
        user_id: Optional[str] = None,
    ) -> None:
        self.username = username
        self.role = role
        self.api_key = api_key
        self.user_id = user_id or username

    def has_role(self, required_role: UserRole) -> bool:
        """Evaluates whether user meets or exceeds the required role in hierarchy."""
        return ROLE_HIERARCHY.get(self.role, 0) >= ROLE_HIERARCHY.get(required_role, 0)


def get_current_user(
    x_api_key: Optional[str] = Header(None, alias="X-API-Key"),
    authorization: Optional[str] = Header(None, alias="Authorization"),
    x_role: Optional[str] = Header(None, alias="X-Role"),
    x_user_id: Optional[str] = Header(None, alias="X-User-Id"),
) -> AuthenticatedUser:
    """
    Resolves the authenticated user from API Key or Bearer Token.
    When AUTH_ENABLED is False (dev/test default), unauthenticated requests
    seamlessly receive an admin principal, while explicit keys, X-Role, or X-User-Id are still honored.
    """
    token: Optional[str] = None
    if x_api_key:
        token = x_api_key.strip()
    elif authorization:
        parts = authorization.strip().split()
        if len(parts) == 2 and parts[0].lower() == "bearer":
            token = parts[1]
        elif len(parts) == 1:
            token = parts[0]

    # In dev mode when authentication is not enforced:
    if not settings.AUTH_ENABLED:
        if token == settings.ADMIN_API_KEY or x_role == "admin":
            return AuthenticatedUser(x_user_id or "dev-admin", UserRole.ADMIN, token, user_id=x_user_id)
        elif token == settings.OPERATOR_API_KEY or x_role == "operator":
            return AuthenticatedUser(x_user_id or "dev-operator", UserRole.OPERATOR, token, user_id=x_user_id)
        elif token == settings.VIEWER_API_KEY or x_role == "viewer":
            return AuthenticatedUser(x_user_id or "dev-viewer", UserRole.VIEWER, token, user_id=x_user_id)
        # Default unauthenticated dev access:
        return AuthenticatedUser(x_user_id or "dev-admin", UserRole.ADMIN, None, user_id=x_user_id)

    # When authentication is enforced:
    if not token:
        raise UnauthorizedError(
            message="Authentication required: missing X-API-Key or Authorization Bearer header."
        )

    if token == settings.ADMIN_API_KEY:
        return AuthenticatedUser(x_user_id or "admin-user", UserRole.ADMIN, token, user_id=x_user_id)
    elif token == settings.OPERATOR_API_KEY:
        return AuthenticatedUser(x_user_id or "operator-user", UserRole.OPERATOR, token, user_id=x_user_id)
    elif token == settings.VIEWER_API_KEY:
        return AuthenticatedUser(x_user_id or "viewer-user", UserRole.VIEWER, token, user_id=x_user_id)
    else:
        raise UnauthorizedError(message="Invalid API key or authentication token.")


def require_role(min_role: UserRole):
    """FastAPI dependency factory enforcing a minimum role level."""

    def role_checker(user: AuthenticatedUser = Depends(get_current_user)) -> AuthenticatedUser:
        if not user.has_role(min_role):
            raise ForbiddenError(
                message=(
                    f"Access denied: role '{user.role.value}' does not have sufficient permissions. "
                    f"Requires at least '{min_role.value}' role."
                )
            )
        return user

    return role_checker
