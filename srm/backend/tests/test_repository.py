from sqlalchemy import Integer, String
from sqlalchemy.orm import Mapped, mapped_column, Session
from app.db.base import Base, TimestampMixin
from app.repositories.base import BaseRepository


class SampleEntity(Base, TimestampMixin):
    __tablename__ = "sample_entities"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(50), nullable=False)


def test_base_repository_crud(db_session: Session):
    """Verify generic repository CRUD capabilities."""
    SampleEntity.__table__.create(bind=db_session.bind, checkfirst=True)
    repo = BaseRepository(SampleEntity, db_session)

    # 1. Create
    item = repo.create(SampleEntity(name="Transaction Alpha"))
    assert item.id is not None
    assert item.name == "Transaction Alpha"
    assert item.created_at is not None

    # 2. Get by ID
    fetched = repo.get(item.id)
    assert fetched is not None
    assert fetched.name == "Transaction Alpha"

    # 3. Get all
    all_items = repo.get_all()
    assert len(all_items) == 1

    # 4. Delete
    repo.delete(fetched)
    assert repo.get(item.id) is None
