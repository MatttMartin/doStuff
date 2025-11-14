# backend/main.py
from typing import Optional
from uuid import UUID
from datetime import datetime
import secrets
import os

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from db import SessionLocal, Base, engine
from models import Level, Run, RunStep

from supabase import create_client


app = FastAPI()

# Allow Vite dev server
origins = os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")
origins = [o.strip() for o in origins if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Create tables if needed
Base.metadata.create_all(bind=engine)

# --------------------------------------
# Health
# --------------------------------------
@app.get("/health")
def health():
    return {"ok": True}

# --------------------------------------
# LEVELS
# --------------------------------------
@app.get("/levels")
def get_levels():
    db = SessionLocal()
    try:
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
    finally:
        db.close()

# --------------------------------------
# RUNS + STEPS
# --------------------------------------
class RunCreate(BaseModel):
    user_id: UUID
    caption: Optional[str] = None
    public: bool = True

class StepCreate(BaseModel):
    level_id: int
    completed: bool = True
    proof_url: Optional[str] = None


@app.post("/runs")
def create_run(payload: RunCreate):
    db = SessionLocal()
    try:
        run = Run(
            user_id=payload.user_id,
            caption=payload.caption,
            public=payload.public,
        )
        db.add(run)
        db.commit()
        db.refresh(run)
        return {"id": str(run.id)}
    finally:
        db.close()


@app.post("/runs/{run_id}/steps")
def add_step(run_id: UUID, payload: StepCreate):
    db = SessionLocal()
    try:
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
        return {"id": step.id}
    finally:
        db.close()


# ---------------------------------------------------
# RUN DETAIL (merged steps + level info)
# ---------------------------------------------------
@app.get("/runs/{run_id}")
def get_run_detail(run_id: UUID):
    db = SessionLocal()
    try:
        run = db.query(Run).filter(Run.id == run_id).first()
        if not run:
            raise HTTPException(status_code=404, detail="Run not found")

        rows = (
            db.query(RunStep, Level)
            .join(Level, RunStep.level_id == Level.id)
            .filter(RunStep.run_id == run_id)
            .order_by(RunStep.completed_at.asc())
            .all()
        )

        steps = []
        for step, level in rows:
            steps.append(
                {
                    "id": step.id,
                    "level_id": level.id,
                    "level_title": level.title,
                    "proof_url": step.proof_url,
                    "completed": step.completed,
                    "completed_at": step.completed_at.isoformat()
                    if step.completed_at else None,
                }
            )

        return {
            "id": str(run.id),
            "user_id": str(run.user_id),
            "caption": run.caption,
            "public": run.public,
            "started_at": run.started_at,
            "finished_at": run.finished_at,
            "steps": steps,
        }
    finally:
        db.close()


# ---------------------------------------------------
# RUN LIST FOR USER
# ---------------------------------------------------
@app.get("/runs/by-user/{user_id}")
def list_runs_for_user(user_id: UUID):
    db = SessionLocal()
    try:
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
    finally:
        db.close()


# ---------------------------------------------------
# IMAGE UPLOAD TO SUPABASE
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
