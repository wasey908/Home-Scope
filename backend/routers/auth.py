"""Auth router: register, login, and current-user endpoints."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from database import get_db
from models import User
from schemas import RegisterRequest, LoginRequest, TokenResponse, UserResponse
from auth_utils import hash_password, verify_password, create_access_token, require_user

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register", response_model=TokenResponse)
def register(body: RegisterRequest, db: Session = Depends(get_db)):
    email = body.email.strip().lower()
    if not email or not body.password:
        raise HTTPException(status_code=400, detail="Email and password are required.")
    if len(body.password) < 4:
        raise HTTPException(status_code=400, detail="Password must be at least 4 characters.")

    existing = db.query(User).filter(User.email == email).first()
    if existing:
        raise HTTPException(status_code=400, detail="An account with this email already exists.")

    user = User(email=email, hashed_password=hash_password(body.password))
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_access_token({"sub": user.email})
    return TokenResponse(access_token=token)


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, db: Session = Depends(get_db)):
    email = body.email.strip().lower()
    if not email or not body.password:
        raise HTTPException(status_code=400, detail="Email and password are required.")

    user = db.query(User).filter(User.email == email).first()
    if not user or not verify_password(body.password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Invalid email or password.")

    token = create_access_token({"sub": user.email})
    return TokenResponse(access_token=token)


@router.get("/me", response_model=UserResponse)
def get_me(user: User = Depends(require_user)):
    return UserResponse(email=user.email, created_at=user.created_at)
