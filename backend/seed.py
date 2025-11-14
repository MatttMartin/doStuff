# backend/seed.py
from .db import engine, SessionLocal
from .models import Level, Base

Base.metadata.create_all(bind=engine)

def seed_levels():
    db = SessionLocal()
    if db.query(Level).count() > 0:
        print("Levels already exist. Skipping.")
        db.close()
        return

    levels = [
        Level(title="Drink a glass of water", description="Hydrate now.", category="physical", difficulty=1, seconds_limit=30),
        Level(title="Wave at a neighbor", description="Say hi to someone nearby.", category="social", difficulty=2, seconds_limit=45),
        Level(title="Two-minute tidy", description="Clean one small area.", category="time", difficulty=3, seconds_limit=120),
        Level(title="10 push-ups", description="Modify on knees if needed.", category="physical", difficulty=4, seconds_limit=90),
    ]
    db.add_all(levels)
    db.commit()
    db.close()
    print("Seeded levels.")
    
if __name__ == "__main__":
    seed_levels()
