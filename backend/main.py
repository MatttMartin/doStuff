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

from db import SessionLocal, Base, engine
import models
from models import Level, Run, RunStep, User

from supabase import create_client
import httpx
import storage3

# Create a patched HTTP client
_patched_http_client = httpx.Client(http2=False, timeout=30.0)

# Patch storage3 internal http client (new versions)
if hasattr(storage3, "_sync"):
    try:
        storage3._sync.client.http_client = _patched_http_client
    except Exception:
        pass

# (Optional) Patch if another location is used internally
try:
    from storage3._sync.client import http_client as _http_client_ref
    _http_client_ref = _patched_http_client
except Exception:
    pass


# ------------------------------------------------------------
# FastAPI App + CORS
# ------------------------------------------------------------
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


# ------------------------------------------------------------
# DB Dependency
# ------------------------------------------------------------
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ------------------------------------------------------------
# Health
# ------------------------------------------------------------
@app.get("/health")
def health():
    return {"ok": True}


# ------------------------------------------------------------
# LEVELS
# ------------------------------------------------------------
@app.get("/levels")
def get_levels(db: Session = Depends(get_db)):
    rows = db.query(Level).order_by(Level.level_number.asc()).all()
    return [
        {
            "id": r.id,
            "title": r.title,
            "description": r.description,
            "level_number": r.level_number,
            "seconds_limit": r.seconds_limit,
        }
        for r in rows
    ]


# ------------------------------------------------------------
# RUN CREATION
# ------------------------------------------------------------
class RunCreate(BaseModel):
    user_id: UUID
    caption: Optional[str] = None
    public: bool = True


@app.post("/runs")
def create_run(payload: RunCreate, db: Session = Depends(get_db)):
    """
    Creates a new run AND initializes the first pending challenge
    (server remembers which challenge you're currently on).
    """
    # Ensure user exists
    user = db.query(User).filter(User.id == payload.user_id).first()
    if not user:
        user = User(id=payload.user_id, username=str(payload.user_id))
        db.add(user)
        db.commit()

    # Find the first level_number (e.g. 1)
    first_level_number_row = (
        db.query(Level.level_number)
        .order_by(Level.level_number.asc())
        .first()
    )
    if not first_level_number_row:
        raise HTTPException(500, "No levels configured in database.")

    first_level_number = first_level_number_row[0]

    # Pick a random starting challenge at that level_number
    first_candidates = (
        db.query(Level)
        .filter(Level.level_number == first_level_number)
        .all()
    )
    if not first_candidates:
        raise HTTPException(500, "No challenges exist for the first level.")

    import random
    first_challenge = random.choice(first_candidates)
    time_limit = first_challenge.seconds_limit or 60

    now = datetime.utcnow()

    run = Run(
        id=uuid4(),
        user_id=payload.user_id,
        caption=payload.caption,
        public=payload.public,
        pending_level_id=first_challenge.id,
        pending_started_at=now,
        pending_time_limit=time_limit,
        proof_pending=False,
        skips_used=0,
    )

    db.add(run)
    db.commit()
    db.refresh(run)

    return {
        "id": str(run.id),
        "pending_level_id": run.pending_level_id,
        "started_at": run.started_at.isoformat() if run.started_at else None,
        "pending_started_at": run.pending_started_at.isoformat() if run.pending_started_at else None,
    }


# ------------------------------------------------------------
# INTERNAL UTILS
# ------------------------------------------------------------
def pick_random_level(
    db: Session,
    level_number: int,
    exclude_id: Optional[int] = None,
) -> Optional[Level]:
    """
    Pick a random Level at a given level_number.
    Optionally exclude a given level id.
    """
    q = db.query(Level).filter(Level.level_number == level_number)
    levels = q.all()
    if not levels:
        return None

    import random

    if exclude_id and len(levels) > 1:
        others = [lvl for lvl in levels if lvl.id != exclude_id]
        if others:
            return random.choice(others)

    return random.choice(levels)


def finalize_step(
    db: Session,
    run: Run,
    level: Level,
    completed: bool,
    proof_url: Optional[str],
    skipped_whole: bool,
) -> None:
    """
    Record a single challenge attempt (completed or skipped).
    """
    step = RunStep(
        run_id=run.id,
        level_id=level.id,
        completed=completed,
        skipped_whole=skipped_whole,
        proof_url=proof_url,
        completed_at=datetime.utcnow(),
    )
    db.add(step)
    db.commit()


# ------------------------------------------------------------
# RUN STATE (canonical source for frontend)
# ------------------------------------------------------------
@app.get("/runs/{run_id}")
def get_run(run_id: UUID, db: Session = Depends(get_db)):
    """
    Canonical run state endpoint.

    Frontend uses this to:
    - Restore progress after refresh
    - Know which challenge is active
    - See skips_used, proof_pending, etc.
    """
    run = db.query(Run).filter(Run.id == run_id).first()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")

    level = None
    if run.pending_level_id:
        level = db.query(Level).filter(Level.id == run.pending_level_id).first()

    return {
        "id": str(run.id),
        "user_id": str(run.user_id),
        "caption": run.caption,
        "started_at": run.started_at.isoformat() if run.started_at else None,
        "finished_at": run.finished_at.isoformat() if run.finished_at else None,
        "public": run.public,

        "pending_level_id": run.pending_level_id,
        "pending_started_at": run.pending_started_at.isoformat() if run.pending_started_at else None,
        "pending_time_limit": run.pending_time_limit,
        "proof_pending": run.proof_pending,
        "skips_used": run.skips_used,

        "pending_level": {
            "id": level.id,
            "title": level.title,
            "description": level.description,
            "seconds_limit": level.seconds_limit,
            "level_number": level.level_number,
        } if level else None,
    }


# (Optional legacy helper – safe to keep, frontend doesn't need to use it)
@app.get("/runs/{run_id}/status")
def get_run_status(run_id: UUID, db: Session = Depends(get_db)):
    """
    Legacy 'status' view. Not required by ChallengePage, but safe to keep.
    """
    run = db.query(Run).filter(Run.id == run_id).first()
    if not run:
        raise HTTPException(404, "Run not found.")

    if run.finished_at:
        return {"finished": True}

    level = None
    if run.pending_level_id:
        level = db.query(Level).filter(Level.id == run.pending_level_id).first()

    return {
        "finished": False,
        "pending_level": {
            "id": level.id,
            "title": level.title,
            "description": level.description,
            "level_number": level.level_number,
            "seconds_limit": level.seconds_limit,
        } if level else None,
        "pending_started_at": run.pending_started_at.isoformat() if run.pending_started_at else None,
        "pending_time_limit": run.pending_time_limit,
        "skips_used": run.skips_used,
        "proof_pending": run.proof_pending,
    }


# ------------------------------------------------------------
# SUBMIT STEP RESULT (Completed or Skip) – core endpoint
# ------------------------------------------------------------
class StepSubmit(BaseModel):
    completed: bool
    skipped_whole: bool = False
    proof_url: Optional[str] = None


@app.post("/runs/{run_id}/submit-step")
def submit_step(run_id: UUID, payload: StepSubmit, db: Session = Depends(get_db)):
    """
    Handles:
    - completing the current challenge (with or without proof)
    - skipping the entire current challenge

    Rules:
    - completed = True  -> move to NEXT level_number
    - skipped_whole = True (on timeout or skip button) -> new random challenge
      on the SAME level_number (if possible)
    """
    run = db.query(Run).filter(Run.id == run_id).first()
    if not run:
        raise HTTPException(404, "Run not found.")

    if run.finished_at:
        raise HTTPException(400, "Run already finished.")

    if run.pending_level_id is None:
        raise HTTPException(400, "Run has no pending challenge.")

    # Current level
    level = db.query(Level).filter(Level.id == run.pending_level_id).first()
    if not level:
        raise HTTPException(500, "Pending level not found in database.")

    # Save the step in history
    finalize_step(
        db=db,
        run=run,
        level=level,
        completed=payload.completed,
        proof_url=payload.proof_url,
        skipped_whole=payload.skipped_whole,
    )

    # If whole-challenge skip, increment skip counter
    if payload.skipped_whole:
        run.skips_used += 1

    # Decide which level_number to go to next
    if payload.completed:
        # Success -> next level
        next_level_number = level.level_number + 1
        exclude_id = None
    else:
        # Skip / timeout -> stay on same level_number, try to pick a different challenge
        next_level_number = level.level_number
        exclude_id = level.id

    next_level = pick_random_level(db, next_level_number, exclude_id=exclude_id)

    if not next_level:
        # No more levels (or nothing at that level) -> finish run
        run.finished_at = datetime.utcnow()
        run.pending_level_id = None
        run.pending_started_at = None
        run.pending_time_limit = None
        run.proof_pending = False
        db.commit()
        return {"finished": True, "message": "Run complete — no more levels."}

    # Assign next pending challenge
    run.pending_level_id = next_level.id
    run.pending_started_at = datetime.utcnow()
    run.pending_time_limit = next_level.seconds_limit or 60
    run.proof_pending = False

    db.commit()

    return {
        "finished": False,
        "next_level_id": next_level.id,
        "next_level_number": next_level.level_number,
        "pending_started_at": run.pending_started_at.isoformat() if run.pending_started_at else None,
    }


# ------------------------------------------------------------
# MARK PROOF SCREEN ACTIVE (DONE → proof step)
# ------------------------------------------------------------
class ProofState(BaseModel):
    proof_pending: bool


@app.post("/runs/{run_id}/set-proof-state")
def set_proof_state(run_id: UUID, payload: ProofState, db: Session = Depends(get_db)):
    """
    Mark that the current challenge is on the proof screen
    (so if the user refreshes, frontend can show proof step instead of timer).
    """
    run = db.query(Run).filter(Run.id == run_id).first()
    if not run:
        raise HTTPException(404, "Run not found.")

    if run.finished_at:
        raise HTTPException(400, "Run already finished.")

    run.proof_pending = payload.proof_pending
    db.commit()

    return {"ok": True}


# ------------------------------------------------------------
# FINISH RUN MANUALLY (Give Up)
# ------------------------------------------------------------
@app.post("/runs/{run_id}/finish")
def finish_run(run_id: UUID, db: Session = Depends(get_db)):
    run = db.query(Run).filter(Run.id == run_id).first()
    if not run:
        raise HTTPException(404, "Run not found.")

    if run.finished_at is None:
        run.finished_at = datetime.utcnow()

    run.pending_level_id = None
    run.pending_started_at = None
    run.pending_time_limit = None
    run.proof_pending = False

    db.commit()
    return {"finished": True}


# ------------------------------------------------------------
# SUPABASE UPLOAD
# ------------------------------------------------------------


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

    ext_map = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}
    ext = ext_map[file.content_type]
    ymd = datetime.utcnow().strftime("%Y/%m")
    name = secrets.token_hex(16) + f".{ext}"
    path = f"{ymd}/{name}"

    sb = _supabase()
    bucket = os.getenv("SUPABASE_BUCKET", "proofs")

    try:
        # This is where timeouts / SSL issues happen sometimes
        sb.storage.from_(bucket).upload(
            path,
            data,
            {"content-type": file.content_type},
        )
    except Exception as exc:
        # Log for your backend console, but don’t crash the route
        print("Supabase upload failed:", repr(exc))
        raise HTTPException(
            status_code=502,
            detail="Failed to upload proof image. Please try again.",
        )

    public_url = sb.storage.from_(bucket).get_public_url(path)
    return {"path": path, "url": public_url}

# ------------------------------------------------------------
# GET ALL STEPS FOR A RUN (Summary)
# ------------------------------------------------------------
@app.get("/runs/{run_id}/steps")
def get_run_steps(run_id: UUID, db: Session = Depends(get_db)):
    run = db.query(Run).filter(Run.id == run_id).first()
    if not run:
        raise HTTPException(404, "Run not found")

    steps = (
        db.query(RunStep)
        .filter(RunStep.run_id == run_id)
        .order_by(RunStep.id.asc())
        .all()
    )

    out = []
    for s in steps:
        level = db.query(Level).filter(Level.id == s.level_id).first()
        out.append({
            "level_number": level.level_number if level else None,
            "title": level.title if level else None,
            "description": level.description if level else None,

            "completed": s.completed,
            "skipped_whole": s.skipped_whole,
            "proof_url": s.proof_url,
            "completed_at": s.completed_at.isoformat() if s.completed_at else None,
        })

    return {"run_id": str(run.id), "steps": out}

