"""HomeScope FastAPI backend entry point."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database import create_tables
from routers import auth, scenarios, scoring, preferences, routing, ml_admin

app = FastAPI(
    title="HomeScope API",
    description="Backend API for the HomeScope home-location ranking wizard",
    version="1.0.0",
)

# CORS — allow the Vite dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:8080",
        "http://localhost:5173",
        "http://127.0.0.1:8080",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth.router)
app.include_router(scenarios.router)
app.include_router(scoring.router)
app.include_router(preferences.router)
app.include_router(routing.router)
app.include_router(ml_admin.router)


@app.on_event("startup")
def on_startup():
    """Create database tables on startup."""
    create_tables()


@app.get("/api/health")
def health_check():
    return {"status": "ok", "service": "homescope-api"}
