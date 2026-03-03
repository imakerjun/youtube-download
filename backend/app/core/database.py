import aiosqlite
from pathlib import Path
from datetime import datetime, timezone

class Database:
    def __init__(self, db_path: Path):
        self.db_path = db_path
        self.db: aiosqlite.Connection | None = None

    async def init(self):
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self.db = await aiosqlite.connect(self.db_path)
        self.db.row_factory = aiosqlite.Row
        await self.db.execute("""
            CREATE TABLE IF NOT EXISTS downloads (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                url TEXT NOT NULL,
                video_id TEXT NOT NULL,
                title TEXT NOT NULL,
                channel TEXT NOT NULL DEFAULT '',
                duration INTEGER NOT NULL DEFAULT 0,
                thumbnail_url TEXT NOT NULL DEFAULT '',
                format_id TEXT NOT NULL DEFAULT '',
                file_path TEXT,
                file_size INTEGER,
                status TEXT NOT NULL DEFAULT 'pending',
                progress REAL NOT NULL DEFAULT 0,
                error_message TEXT,
                created_at TEXT NOT NULL,
                completed_at TEXT
            )
        """)
        await self.db.commit()

    async def close(self):
        if self.db:
            await self.db.close()

    async def create_download(self, *, url: str, video_id: str, title: str,
                              channel: str, duration: int, thumbnail_url: str,
                              format_id: str) -> int:
        now = datetime.now(timezone.utc).isoformat()
        cursor = await self.db.execute(
            """INSERT INTO downloads (url, video_id, title, channel, duration,
               thumbnail_url, format_id, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (url, video_id, title, channel, duration, thumbnail_url, format_id, now),
        )
        await self.db.commit()
        return cursor.lastrowid

    async def get_download(self, download_id: int) -> dict | None:
        cursor = await self.db.execute(
            "SELECT * FROM downloads WHERE id = ?", (download_id,)
        )
        row = await cursor.fetchone()
        return dict(row) if row else None

    async def update_download(self, download_id: int, **fields) -> None:
        if not fields:
            return
        set_clause = ", ".join(f"{k} = ?" for k in fields)
        values = list(fields.values()) + [download_id]
        await self.db.execute(
            f"UPDATE downloads SET {set_clause} WHERE id = ?", values
        )
        await self.db.commit()

    async def list_downloads(self, limit: int = 50, offset: int = 0) -> list[dict]:
        cursor = await self.db.execute(
            "SELECT * FROM downloads ORDER BY created_at DESC LIMIT ? OFFSET ?",
            (limit, offset),
        )
        rows = await cursor.fetchall()
        return [dict(r) for r in rows]
