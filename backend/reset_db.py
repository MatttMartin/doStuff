# reset_db.py

from db import Base, engine, SessionLocal
import models   # <-- THIS MUST BE HERE

def reset():
    print("Dropping all tables…")
    Base.metadata.drop_all(bind=engine)

    print("Creating all tables…")
    Base.metadata.create_all(bind=engine)

    print("Done!")

if __name__ == "__main__":
    reset()
