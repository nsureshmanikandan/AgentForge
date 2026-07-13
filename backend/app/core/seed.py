from sqlalchemy import select
from app.database import AsyncSessionLocal
from app.models.user import User, Role
from app.core.security import hash_password

ADMIN_EMAIL = "admin@agentforge.ai"
ADMIN_PASSWORD = "admin123"
ADMIN_NAME = "Admin"


async def seed_admin():
    async with AsyncSessionLocal() as db:
        existing = await db.scalar(select(User).where(User.email == ADMIN_EMAIL))
        if not existing:
            user = User(
                email=ADMIN_EMAIL,
                hashed_password=hash_password(ADMIN_PASSWORD),
                full_name=ADMIN_NAME,
                role=Role.ADMIN,
            )
            db.add(user)
            await db.commit()
            print(f"[seed] Admin user created: {ADMIN_EMAIL} / {ADMIN_PASSWORD}")
        else:
            # Always sync password and role so credentials stay consistent
            existing.hashed_password = hash_password(ADMIN_PASSWORD)
            existing.role = Role.ADMIN
            await db.commit()
            print(f"[seed] Admin credentials synced: {ADMIN_EMAIL} / {ADMIN_PASSWORD}")
