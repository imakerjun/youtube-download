from fastapi import WebSocket
from typing import Set

connections: Set[WebSocket] = set()

async def broadcast_progress(download_id: int, progress: float, status: str,
                             speed: float = 0, eta: int = 0):
    message = {
        "download_id": download_id,
        "progress": progress,
        "status": status,
        "speed": speed,
        "eta": eta,
    }
    dead = set()
    for ws in connections:
        try:
            await ws.send_json(message)
        except Exception:
            dead.add(ws)
    connections.difference_update(dead)
