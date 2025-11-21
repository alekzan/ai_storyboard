"""FastAPI application setup for AI Storyboard Maker."""

from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware

from .settings import get_settings
from .schemas import (
    ScriptIngestionRequest,
    ScriptIngestionResponse,
    CharacterGenerationRequest,
    CharacterGenerationResponse,
    ShotGenerationRequest,
    ShotGenerationResponse,
    ShotRefineRequest,
    ShotRefineResponse,
    ShotEditRequest,
    ShotEditResponse,
)
from .services import (
    ScriptIngestionService,
    CharacterGenerationService,
    ShotGenerationService,
    ShotRefinementService,
    ShotEditService,
)


def create_app() -> FastAPI:
    settings = get_settings()

    app = FastAPI(
        title="AI Storyboard Maker API",
        version="0.1.0",
        description="Backend services for converting scripts into storyboard assets.",
    )

    ingestion_service = ScriptIngestionService()
    character_generation_service = CharacterGenerationService()
    shot_generation_service = ShotGenerationService()
    shot_refinement_service = ShotRefinementService()
    shot_edit_service = ShotEditService()

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/health", tags=["system"])
    def healthcheck():
        """Simple readiness probe for deployment checks."""

        settings = get_settings()
        return {
            "status": "ok",
            "environment": settings.environment,
            "bria_configured": settings.bria_configured,
            "llm_configured": settings.llm_configured,
        }

    @app.post(
        "/script",
        response_model=ScriptIngestionResponse,
        tags=["pipeline"],
        status_code=status.HTTP_201_CREATED,
    )
    def ingest_script(payload: ScriptIngestionRequest):
        if not payload.script.strip():
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Script cannot be empty")
        return ingestion_service.ingest_script(script=payload.script, style=payload.style)

    @app.post(
        "/characters/generate",
        response_model=CharacterGenerationResponse,
        tags=["pipeline"],
        status_code=status.HTTP_201_CREATED,
    )
    def generate_characters(payload: CharacterGenerationRequest):
        return character_generation_service.generate(payload)

    @app.post(
        "/shots/generate",
        response_model=ShotGenerationResponse,
        tags=["pipeline"],
        status_code=status.HTTP_201_CREATED,
    )
    def generate_shots(payload: ShotGenerationRequest):
        return shot_generation_service.generate(payload)

    @app.post(
        "/shots/refine",
        response_model=ShotRefineResponse,
        tags=["pipeline"],
        status_code=status.HTTP_201_CREATED,
    )
    def refine_shot(payload: ShotRefineRequest):
        return shot_refinement_service.refine(payload)

    @app.post(
        "/shots/edit",
        response_model=ShotEditResponse,
        tags=["pipeline"],
        status_code=status.HTTP_201_CREATED,
    )
    def edit_shot(payload: ShotEditRequest):
        return shot_edit_service.edit(payload)

    return app


app = create_app()
