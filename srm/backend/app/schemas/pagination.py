from typing import Generic, List, TypeVar
from pydantic import BaseModel, Field

T = TypeVar("T")


class PaginatedResponse(BaseModel, Generic[T]):
    """Standardized envelope for paginated collections."""

    items: List[T] = Field(..., description="Page items")
    total: int = Field(..., description="Total items matching filter")
    skip: int = Field(..., description="Offset count skipped")
    limit: int = Field(..., description="Page limit requested")
    has_more: bool = Field(..., description="Flag indicating if more records exist")
