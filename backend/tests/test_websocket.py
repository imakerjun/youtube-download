import pytest
from httpx import ASGITransport, AsyncClient
from starlette.testclient import TestClient
from app.main import app

def test_websocket_connect():
    client = TestClient(app)
    with client.websocket_connect("/ws/progress") as ws:
        # Connection should succeed
        from app.ws.progress import connections, broadcast_progress
        # Just verify the connection works by closing gracefully
        pass
