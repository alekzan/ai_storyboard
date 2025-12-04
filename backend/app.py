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
    SingleShotGenerationRequest,
    SingleShotGenerationResponse,
    ShotRefineRequest,
    ShotRefineResponse,
    ShotEditRequest,
    ShotEditResponse,
    CharacterUpdateRequest,
    CharacterUpdateResponse,
    ShotUpdateRequest,
    ShotUpdateResponse,
    FixtureLoadRequest,
)
from .services import (
    ScriptIngestionService,
    CharacterGenerationService,
    ShotGenerationService,
    ShotRefinementService,
    ShotEditService,
    SessionUpdateService,
)
from .fixtures.demo_session import demo_fixture
from .session_store import session_store


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
    session_update_service = SessionUpdateService()

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
        return ingestion_service.ingest_script(
            script=payload.script, style=payload.style, openai_api_key=payload.openai_api_key
        )

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
        "/shots/generate_one",
        response_model=SingleShotGenerationResponse,
        tags=["pipeline"],
        status_code=status.HTTP_201_CREATED,
    )
    def generate_single_shot(payload: SingleShotGenerationRequest):
        return shot_generation_service.generate_single(payload)

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

    @app.post(
        "/characters/update",
        response_model=CharacterUpdateResponse,
        tags=["pipeline"],
        status_code=status.HTTP_200_OK,
    )
    def update_character(payload: CharacterUpdateRequest):
        return session_update_service.update_character(payload)

    @app.post(
        "/shots/update",
        response_model=ShotUpdateResponse,
        tags=["pipeline"],
        status_code=status.HTTP_200_OK,
    )
    def update_shot(payload: ShotUpdateRequest):
        return session_update_service.update_shot(payload)

    @app.post(
        "/debug/load_fixture",
        response_model=ScriptIngestionResponse,
        tags=["debug"],
        status_code=status.HTTP_201_CREATED,
    )
    def load_fixture(payload: FixtureLoadRequest = FixtureLoadRequest()):
        """Load a predefined script/scene/shot plan without calling the LLM (debug helper)."""

        data = demo_fixture(style=payload.style)
        session = session_store.create_session(
            script=data["script"],
            style=data["style"],
            characters=data["characters"],
            scenes=data["scenes"],
        )
        return ScriptIngestionResponse(
            session_id=session.session_id,
            style=session.style,
            script=session.script,
            characters=session.characters,
            scenes=session.scenes,
        )

    return app


app = create_app()
