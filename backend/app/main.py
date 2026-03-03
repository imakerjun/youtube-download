from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.core.database import Database

db = Database(settings.db_path)

@asynccontextmanager
async def lifespan(app: FastAPI):
    await db.init()
    yield
    await db.close()

app = FastAPI(title="YouTube Downloader", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/health")
async def health():
    return {"status": "ok"}
