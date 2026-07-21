"""
metadata_client.py — async PostgreSQL client for the Frame Fetching Service.

Wraps an asyncpg connection pool.  Used exclusively by the FastAPI server;
never called from the ChunkWriter or ingestion threads.
"""
import logging
from typing import Optional

import asyncpg

logger = logging.getLogger("metadata_client")

_pool: Optional[asyncpg.Pool] = None

_SELECT_SQL = """
SELECT
    chunk_id,
    byte_offset,
    payload_size,
    width,
    height,
    pixel_format
FROM frames
WHERE internal_frame_id = $1
"""

_COUNT_SQL = "SELECT COUNT(*) AS n FROM frames"


async def connect(dsn: str, min_size: int = 1, max_size: int = 5) -> None:
    """Initialise the connection pool.  Call once at server startup."""
    global _pool
    _pool = await asyncpg.create_pool(dsn, min_size=min_size, max_size=max_size)
    logger.info("metadata_client: pool connected (%d–%d conns)", min_size, max_size)


async def close() -> None:
    global _pool
    if _pool:
        await _pool.close()
        _pool = None


def is_connected() -> bool:
    return _pool is not None


async def get_frame_meta(internal_frame_id: int) -> Optional[dict]:
    """
    Return the metadata row for the given frame ID, or None if not found.
    Raises RuntimeError if the pool has not been initialised.
    """
    if _pool is None:
        raise RuntimeError("metadata_client pool not initialised — call connect() first")
    async with _pool.acquire() as conn:
        row = await conn.fetchrow(_SELECT_SQL, internal_frame_id)
    if row is None:
        return None
    return {
        "chunk_id":     row["chunk_id"],
        "byte_offset":  row["byte_offset"],
        "payload_size": row["payload_size"],
        "width":        row["width"],
        "height":       row["height"],
        "pixel_format": row["pixel_format"],
    }


async def total_frame_count() -> int:
    """Return total frames indexed. Used by /stats endpoint."""
    if _pool is None:
        raise RuntimeError("pool not initialised")
    async with _pool.acquire() as conn:
        row = await conn.fetchrow(_COUNT_SQL)
    return row["n"]
