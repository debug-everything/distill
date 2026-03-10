import ssl

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings

# Neon requires SSL; asyncpg needs it passed via connect_args
_ssl_context = ssl.create_default_context()
_connect_args = {"ssl": _ssl_context} if "neon" in settings.database_url else {}

engine = create_async_engine(
    settings.database_url, echo=False, pool_size=5, max_overflow=10, connect_args=_connect_args
)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def get_db() -> AsyncSession:
    async with async_session() as session:
        yield session
