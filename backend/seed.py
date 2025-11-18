# backend/seed.py
from db import engine, SessionLocal
from models import Level, Base

Base.metadata.create_all(bind=engine)

def seed_levels():
    db = SessionLocal()

    db.query(Level).delete()

    levels_data = [
        # level_number, title, description, seconds_limit
        (1, "Draw a quick flower", "Sketch a flower and show it.", 30),
        (1, "Find something blue", "Show any blue object.", 30),
        (1, "Stand on one foot", "Take a picture balancing on one foot.", 25),
        (1, "Make a shadow shape", "Use your hand to create a shadow.", 40),
        (1, "Arrange 3 items in a line", "Place 3 random objects in a straight line.", 25),

        (2, "Stack three objects", "Stack 3 objects safely.", 45),
        (2, "Fold a paper airplane", "Make a simple paper airplane.", 60),
        (2, "Build a tiny tower", "Construct a small tower using anything.", 60),
        (2, "Make a smiley face", "Arrange objects into a smiley face.", 60),
        (2, "Create a color gradient", "Arrange objects from light → dark.", 75),

        (3, "Draw your hand", "Sketch your hand outline.", 90),
        (3, "Mini pillow fort", "Build a tiny fort from cushions.", 120),
        (3, "Spell a word with objects", "Use items to form a 3+ letter word.", 120),
        (3, "Symmetry challenge", "Arrange items symmetrically.", 120),
        (3, "Face made of objects", "Create a face using only objects.", 120),

        (4, "Tallest safe tower", "Build your tallest stable stack.", 150),
        (4, "Scene recreation", "Recreate a simple movie/meme scene.", 180),
        (4, "Object mandala", "Make a circular geometric pattern.", 180),
        (4, "Invent a product", "Sketch a fake invention.", 180),
        (4, "Mini obstacle path", "Arrange objects into a visible path.", 180),

        (5, "Domino chain", "Create a small domino-style chain.", 240),
        (5, "Wearable art", "Create some wearable accessory.", 240),
        (5, "Room corner makeover", "Visibly tidy or improve a small area.", 240),
        (5, "Full-page doodle", "Fill a whole page with doodles.", 300),
        (5, "Creative creature", "Draw or construct a creature w/ 3+ features.", 300),
    ]

    for lvl, title, desc, secs in levels_data:
        db.add(Level(
            level_number=lvl,
            title=title,
            description=desc,
            seconds_limit=secs,
        ))

    db.commit()
    db.close()
    print("Seeded levels successfully.")

if __name__ == "__main__":
    seed_levels()
