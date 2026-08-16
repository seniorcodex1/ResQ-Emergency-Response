import os
import math
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

import httpx

from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm

from pydantic import BaseModel, EmailStr, Field

from sqlalchemy import (
    create_engine,
    Column,
    Integer,
    String,
    Float,
    DateTime,
    Text,
)

from sqlalchemy.orm import declarative_base, sessionmaker, Session

from passlib.context import CryptContext

from jose import JWTError, jwt


# ============================================================
# CONFIGURATION
# ============================================================

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "sqlite:///./resq.db"
)

SECRET_KEY = os.getenv(
    "SECRET_KEY",
    "CHANGE_THIS_SECRET_KEY_IN_PRODUCTION"
)

ALGORITHM = "HS256"

ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24


# ============================================================
# TELEGRAM CONFIGURATION
# ============================================================

# DO NOT put the real Telegram token in this file.
# Add these values in Render Environment Variables.

TELEGRAM_BOT_TOKEN = os.getenv(
    "8976557269:AAHBCvaPiqrMIgfu8Dk13W0b700Mdy8k5fc",
    ""
)

TELEGRAM_CHAT_ID = os.getenv(
    "8145643961",
    ""
)


# ============================================================
# DATABASE
# ============================================================

connect_args = {}

if DATABASE_URL.startswith("sqlite"):
    connect_args = {
        "check_same_thread": False
    }

engine = create_engine(
    DATABASE_URL,
    connect_args=connect_args
)

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine
)

Base = declarative_base()


# ============================================================
# PASSWORD SECURITY
# ============================================================

pwd_context = CryptContext(
    schemes=["bcrypt"],
    deprecated="auto"
)

oauth2_scheme = OAuth2PasswordBearer(
    tokenUrl="login"
)


# ============================================================
# DATABASE MODELS
# ============================================================

class User(Base):

    __tablename__ = "users"

    id = Column(
        Integer,
        primary_key=True,
        index=True
    )

    name = Column(
        String(150),
        nullable=False
    )

    email = Column(
        String(255),
        unique=True,
        index=True,
        nullable=False
    )

    phone = Column(
        String(50),
        nullable=False
    )

    password_hash = Column(
        String(255),
        nullable=False
    )

    created_at = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc)
    )


class Emergency(Base):

    __tablename__ = "emergencies"

    id = Column(
        Integer,
        primary_key=True,
        index=True
    )

    incident_id = Column(
        String(50),
        unique=True,
        index=True,
        nullable=False
    )

    user_id = Column(
        Integer,
        nullable=False,
        index=True
    )

    emergency_type = Column(
        String(100),
        nullable=False
    )

    description = Column(
        Text,
        nullable=True
    )

    emergency_contact = Column(
        String(100),
        nullable=True
    )

    medical_information = Column(
        Text,
        nullable=True
    )

    latitude = Column(
        Float,
        nullable=False
    )

    longitude = Column(
        Float,
        nullable=False
    )

    status = Column(
        String(30),
        default="ACTIVE"
    )

    created_at = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc)
    )


Base.metadata.create_all(bind=engine)


# ============================================================
# FASTAPI
# ============================================================

app = FastAPI(
    title="ResQ Emergency Response API",
    description="Emergency SOS and Community Rescue API",
    version="1.0.0"
)


# ============================================================
# CORS
# ============================================================

# Your frontend:
# https://resq-emergency-response3.onrender.com
#
# Your backend:
# https://resq-emergency-response1.onrender.com
#
# The frontend must be allowed to communicate with this API.

app.add_middleware(
    CORSMiddleware,

    allow_origins=[
        "https://resq-emergency-response3.onrender.com",
        "http://127.0.0.1:5500",
        "http://localhost:5500",
        "http://127.0.0.1:3000",
        "http://localhost:3000",
    ],

    allow_credentials=False,

    allow_methods=[
        "GET",
        "POST",
        "PUT",
        "DELETE",
        "OPTIONS"
    ],

    allow_headers=[
        "Authorization",
        "Content-Type",
        "Accept"
    ],
)


# ============================================================
# DATABASE DEPENDENCY
# ============================================================

def get_db():

    db = SessionLocal()

    try:
        yield db

    finally:
        db.close()


# ============================================================
# SCHEMAS
# ============================================================

class RegisterRequest(BaseModel):

    name: str = Field(
        min_length=2,
        max_length=150
    )

    email: EmailStr

    phone: str = Field(
        min_length=5,
        max_length=50
    )

    password: str = Field(
        min_length=8,
        max_length=128
    )


class EmergencyRequest(BaseModel):

    emergency_type: str = Field(
        min_length=2,
        max_length=100
    )

    description: Optional[str] = None

    emergency_contact: Optional[str] = None

    medical_information: Optional[str] = None

    latitude: float = Field(
        ge=-90,
        le=90
    )

    longitude: float = Field(
        ge=-180,
        le=180
    )


# ============================================================
# PASSWORD FUNCTIONS
# ============================================================

def hash_password(password: str) -> str:

    return pwd_context.hash(password)


def verify_password(
    plain_password: str,
    hashed_password: str
) -> bool:

    return pwd_context.verify(
        plain_password,
        hashed_password
    )


# ============================================================
# JWT
# ============================================================

def create_access_token(user_id: int):

    expire = (
        datetime.now(timezone.utc)
        + timedelta(
            minutes=ACCESS_TOKEN_EXPIRE_MINUTES
        )
    )

    payload = {
        "sub": str(user_id),
        "exp": expire
    }

    return jwt.encode(
        payload,
        SECRET_KEY,
        algorithm=ALGORITHM
    )


# ============================================================
# AUTHENTICATED USER
# ============================================================

def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
):

    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid authentication credentials",
        headers={
            "WWW-Authenticate": "Bearer"
        }
    )

    try:

        payload = jwt.decode(
            token,
            SECRET_KEY,
            algorithms=[ALGORITHM]
        )

        user_id = payload.get("sub")

        if user_id is None:
            raise credentials_exception

    except JWTError:

        raise credentials_exception

    try:

        user_id = int(user_id)

    except (TypeError, ValueError):

        raise credentials_exception

    user = (
        db.query(User)
        .filter(User.id == user_id)
        .first()
    )

    if user is None:
        raise credentials_exception

    return user


# ============================================================
# TELEGRAM NOTIFICATION
# ============================================================

async def send_telegram_alert(
    message: str
) -> bool:

    if not TELEGRAM_BOT_TOKEN or not TELEGRAM_CHAT_ID:

        print(
            "Telegram notification skipped: "
            "Telegram environment variables are not configured."
        )

        return False

    url = (
        "https://api.telegram.org/"
        f"bot{TELEGRAM_BOT_TOKEN}/sendMessage"
    )

    payload = {
        "chat_id": TELEGRAM_CHAT_ID,
        "text": message,
        "disable_web_page_preview": False
    }

    try:

        async with httpx.AsyncClient(
            timeout=10.0
        ) as client:

            response = await client.post(
                url,
                json=payload
            )

        response.raise_for_status()

        result = response.json()

        if result.get("ok"):

            print(
                "Telegram emergency alert sent."
            )

            return True

        print(
            "Telegram API returned an unsuccessful response:",
            result
        )

        return False

    except Exception as error:

        print(
            f"Telegram notification failed: {error}"
        )

        return False


# ============================================================
# ROOT
# ============================================================

@app.get("/")
def root():

    return {
        "application": "ResQ Emergency Response System",
        "status": "online",
        "version": "1.0.0"
    }


# ============================================================
# REGISTER
# ============================================================

@app.post("/register")
def register(
    request: RegisterRequest,
    db: Session = Depends(get_db)
):

    email = request.email.lower().strip()

    existing_user = (
        db.query(User)
        .filter(User.email == email)
        .first()
    )

    if existing_user:

        raise HTTPException(
            status_code=400,
            detail="An account with this email already exists."
        )

    try:

        user = User(
            name=request.name.strip(),
            email=email,
            phone=request.phone.strip(),
            password_hash=hash_password(
                request.password
            )
        )

        db.add(user)

        db.commit()

        db.refresh(user)

        return {
            "message": "Account created successfully.",
            "user_id": user.id
        }

    except Exception as error:

        db.rollback()

        print(
            f"Registration error: {error}"
        )

        raise HTTPException(
            status_code=500,
            detail="Unable to create account."
        )


# ============================================================
# LOGIN
# ============================================================

@app.post("/login")
def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db)
):

    email = form_data.username.lower().strip()

    user = (
        db.query(User)
        .filter(User.email == email)
        .first()
    )

    if not user:

        raise HTTPException(
            status_code=401,
            detail="Incorrect email or password."
        )

    try:

        password_valid = verify_password(
            form_data.password,
            user.password_hash
        )

    except Exception as error:

        print(
            f"Password verification error: {error}"
        )

        raise HTTPException(
            status_code=500,
            detail="Unable to verify password."
        )

    if not password_valid:

        raise HTTPException(
            status_code=401,
            detail="Incorrect email or password."
        )

    token = create_access_token(
        user.id
    )

    return {
        "access_token": token,
        "token_type": "bearer"
    }


# ============================================================
# CURRENT USER
# ============================================================

@app.get("/me")
def me(
    user: User = Depends(get_current_user)
):

    return {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "phone": user.phone
    }


# ============================================================
# DISTANCE CALCULATION
# ============================================================

def distance_km(
    lat1,
    lon1,
    lat2,
    lon2
):

    earth_radius = 6371

    lat1_rad = math.radians(lat1)
    lat2_rad = math.radians(lat2)

    delta_lat = math.radians(
        lat2 - lat1
    )

    delta_lon = math.radians(
        lon2 - lon1
    )

    a = (
        math.sin(delta_lat / 2) ** 2
        +
        math.cos(lat1_rad)
        * math.cos(lat2_rad)
        * math.sin(delta_lon / 2) ** 2
    )

    c = 2 * math.atan2(
        math.sqrt(a),
        math.sqrt(1 - a)
    )

    return earth_radius * c


# ============================================================
# MAJOR INCIDENT DETECTION
# ============================================================

def detect_major_incident(
    emergency: Emergency,
    db: Session
):

    time_limit = (
        datetime.now(timezone.utc)
        - timedelta(minutes=10)
    )

    recent_reports = (
        db.query(Emergency)
        .filter(
            Emergency.created_at >= time_limit,
            Emergency.id != emergency.id
        )
        .all()
    )

    nearby_count = 0

    for report in recent_reports:

        distance = distance_km(
            emergency.latitude,
            emergency.longitude,
            report.latitude,
            report.longitude
        )

        if distance <= 0.5:

            nearby_count += 1

    return nearby_count >= 2


# ============================================================
# CREATE EMERGENCY
# ============================================================

@app.post("/emergencies")
async def create_emergency(
    request: EmergencyRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):

    incident_id = (
        "RSQ-"
        + datetime.now(
            timezone.utc
        ).strftime("%Y%m%d")
        + "-"
        + secrets.token_hex(3).upper()
    )

    emergency = Emergency(

        incident_id=incident_id,

        user_id=user.id,

        emergency_type=request.emergency_type,

        description=request.description,

        emergency_contact=request.emergency_contact,

        medical_information=request.medical_information,

        latitude=request.latitude,

        longitude=request.longitude,

        status="ACTIVE"
    )

    try:

        db.add(emergency)

        db.commit()

        db.refresh(emergency)

    except Exception as error:

        db.rollback()

        print(
            f"Emergency database error: {error}"
        )

        raise HTTPException(
            status_code=500,
            detail="Unable to save emergency report."
        )


    # ========================================================
    # MAJOR INCIDENT
    # ========================================================

    major_incident = detect_major_incident(
        emergency,
        db
    )


    # ========================================================
    # GOOGLE MAPS LOCATION
    # ========================================================

    map_url = (
        "https://www.google.com/maps/search/"
        "?api=1"
        f"&query={emergency.latitude},"
        f"{emergency.longitude}"
    )


    # ========================================================
    # TELEGRAM MESSAGE
    # ========================================================

    telegram_message = f"""
🚨 RESQ EMERGENCY ALERT 🚨

━━━━━━━━━━━━━━━━━━━━

🆔 Incident ID:
{emergency.incident_id}

👤 Name:
{user.name}

🚑 Emergency Type:
{emergency.emergency_type}

📞 User Phone:
{user.phone}

📱 Emergency Contact:
{emergency.emergency_contact or "Not provided"}

📍 GPS Coordinates:
{emergency.latitude}, {emergency.longitude}

🗺️ Google Maps:
{map_url}

🕐 Time:
{emergency.created_at.isoformat()}

📝 Description:
{emergency.description or "Not provided"}

❤️ Medical Information:
{emergency.medical_information or "Not provided"}

⚠️ Major Incident:
{"YES" if major_incident else "No"}

🔴 Status:
ACTIVE

━━━━━━━━━━━━━━━━━━━━
RESQ Emergency Response System
"""


    # ========================================================
    # SEND TELEGRAM ALERT
    # ========================================================

    telegram_sent = await send_telegram_alert(
        telegram_message
    )


    return {

        "message":
            "Emergency alert submitted.",

        "incident_id":
            incident_id,

        "major_incident_detected":
            major_incident,

        "telegram_notification_sent":
            telegram_sent,

        "created_at":
            emergency.created_at.isoformat()
    }


# ============================================================
# USER EMERGENCIES
# ============================================================

@app.get("/my-emergencies")
def get_my_emergencies(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):

    emergencies = (
        db.query(Emergency)
        .filter(
            Emergency.user_id == user.id
        )
        .order_by(
            Emergency.created_at.desc()
        )
        .all()
    )

    return [

        {
            "incident_id":
                emergency.incident_id,

            "emergency_type":
                emergency.emergency_type,

            "description":
                emergency.description,

            "latitude":
                emergency.latitude,

            "longitude":
                emergency.longitude,

            "status":
                emergency.status,

            "created_at":
                emergency.created_at.isoformat()
        }

        for emergency in emergencies

    ]