"""Shared psycopg2 connection helper for Python services writing to PostgreSQL."""
import os
import psycopg2
import psycopg2.extras

_conn = None

def get_conn():
    global _conn
    if _conn is None or _conn.closed:
        _conn = psycopg2.connect(
            os.environ["DATABASE_URL"],
            cursor_factory=psycopg2.extras.RealDictCursor,
        )
    return _conn
