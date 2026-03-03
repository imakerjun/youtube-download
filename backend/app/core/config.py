from pathlib import Path
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    download_dir: Path = Path("/app/downloads")
    data_dir: Path = Path("/app/data")
    db_path: Path = Path("/app/data/youtube_dl.db")
    max_concurrent_downloads: int = 2

    model_config = {"env_prefix": "YTD_"}

settings = Settings()
