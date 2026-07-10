from pydantic import BaseModel, EmailStr
from app.models.user import Role

class UserRegister(BaseModel):
    email: EmailStr
    password: str
    full_name: str

class UserOut(BaseModel):
    id: str
    email: str
    full_name: str
    role: Role

    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
