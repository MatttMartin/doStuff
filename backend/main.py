# backend/main.py
from typing import Optional
from uuid import UUID, uuid4
from datetime import datetime
import secrets
import os

from fastapi import FastAPI, UploadFile, File, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from sqlalchemy.orm import Session

# Local project imports
from db import SessionLocal, Base, engine
import models
from models import Level, Run, RunStep, User  # ensure User exists in models.py

from supabase import create_client


# ---------------------------------------------------
# FastAPI App + CORS
# ---------------------------------------------------
app = FastAPI()

origins = os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")
origins = [o.strip() for o in origins if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Auto-create tables
Base.metadata.create_all(bind=engine)


# ---------------------------------------------------
# DB Dependency (FastAPI style)
# ---------------------------------------------------
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ---------------------------------------------------
# Health
# ---------------------------------------------------
@app.get("/health")
def health():
    return {"ok": True}


# ---------------------------------------------------
# LEVELS
# ---------------------------------------------------
@app.get("/levels")
def get_levels(db: Session = Depends(get_db)):
    rows = db.query(Level).all()
    return [
        {
            "id": r.id,
            "title": r.title,
            "description": r.description,
            "category": r.category,
            "difficulty": r.difficulty,
            "seconds_limit": r.seconds_limit,
        }
        for r in rows
    ]


# ---------------------------------------------------
# RUNS + STEPS
# ---------------------------------------------------
class RunCreate(BaseModel):
    user_id: UUID
    caption: Optional[str] = None
    public: bool = True


class StepCreate(BaseModel):
    level_id: int
    completed: bool = True
    proof_url: Optional[str] = None


@app.post("/runs")
def create_run(run: RunCreate, db: Session = Depends(get_db)):
    """
    Creates a run, ensuring user exists first.
    """

    # Make sure user exists (fixes FK error)
    user = db.query(User).filter(User.id == run.user_id).first()
    if not user:
        new_user = User(id=run.user_id,
                        username=run.user_id)
        db.add(new_user)
        db.commit()

    # Create run
    db_run = Run(
        id=uuid4(),
        user_id=run.user_id,
        caption=run.caption,
        public=run.public,
        finished_at=None,
    )

    db.add(db_run)
    db.commit()
    db.refresh(db_run)
    return {"id": str(db_run.id), "started_at": db_run.started_at}


@app.post("/runs/{run_id}/steps")
def add_step(run_id: UUID, payload: StepCreate, db: Session = Depends(get_db)):
    run = db.query(Run).filter(Run.id == run_id).first()
    if not run:
        raise HTTPException(status_code=404, detail="run not found")

    step = RunStep(
        run_id=run_id,
        level_id=payload.level_id,
        completed=payload.completed,
        proof_url=payload.proof_url,
        completed_at=datetime.utcnow(),
    )

    db.add(step)
    db.commit()
    db.refresh(step)

    return {"id": str(step.id)}



# ---------------------------------------------------
# RUN LIST FOR USER
# ---------------------------------------------------
@app.get("/runs/by-user/{user_id}")
def list_runs_for_user(user_id: UUID, db: Session = Depends(get_db)):
    runs = (
        db.query(Run)
        .filter(Run.user_id == user_id)
        .order_by(Run.started_at.desc())
        .all()
    )

    result = []
    for r in runs:
        steps_completed = (
            db.query(RunStep)
            .filter(RunStep.run_id == r.id, RunStep.completed == True)
            .count()
        )

        result.append(
            {
                "id": str(r.id),
                "caption": r.caption,
                "public": bool(r.public),
                "created_at": r.started_at.isoformat()
                if r.started_at else None,
                "steps_completed": steps_completed,
            }
        )

    return result


# ---------------------------------------------------
# SUPABASE UPLOAD
# ---------------------------------------------------
def _supabase():
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise RuntimeError("Supabase env not set")
    return create_client(url, key)


MAX_BYTES = 5 * 1024 * 1024
ALLOWED = {"image/jpeg", "image/png", "image/webp"}


@app.post("/upload")
async def upload_proof(file: UploadFile = File(...)):
    if file.content_type not in ALLOWED:
        raise HTTPException(status_code=415, detail="Only jpg/png/webp allowed")

    data = await file.read()
    if len(data) > MAX_BYTES:
        raise HTTPException(status_code=413, detail="Max 5MB")

    ext = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}[file.content_type]
    ymd = datetime.utcnow().strftime("%Y/%m")
    name = secrets.token_hex(16) + f".{ext}"
    path = f"{ymd}/{name}"

    sb = _supabase()
    bucket = os.getenv("SUPABASE_BUCKET", "proofs")

    sb.storage.from_(bucket).upload(
        path,
        data,
        {"content-type": file.content_type},
    )

    public_url = sb.storage.from_(bucket).get_public_url(path)
    return {"path": path, "url": public_url}
