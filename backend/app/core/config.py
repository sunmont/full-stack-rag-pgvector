from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql://postgres:password@localhost:5432/ai_db"
    REDIS_URL: str = "redis://localhost:6379"
    OPENAI_API_KEY: str = ""

    class Config:
        env_file = ".env"

settings = Settings()