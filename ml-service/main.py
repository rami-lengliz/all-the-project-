from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List
import math

app = FastAPI(title="RentEverything ML Service", version="1.0.0")

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class SuggestCategoryRequest(BaseModel):
    title: Optional[str] = None
    images: Optional[List[str]] = None


class SuggestCategoryResponse(BaseModel):
    suggestedCategorySlug: str
    confidence: float


class SuggestPriceRequest(BaseModel):
    categorySlug: str
    lat: float
    lng: float
    images: Optional[List[str]] = None
    baseFields: Optional[dict] = None


class SuggestPriceResponse(BaseModel):
    suggestedPricePerDay: float


# Kelibia center coordinates
KELIBIA_CENTER_LAT = 36.8578
KELIBIA_CENTER_LNG = 11.0920


def calculate_distance(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Calculate distance in km using Haversine formula"""
    R = 6371  # Earth radius in km
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(dlng / 2) ** 2
    )
    c = 2 * math.asin(math.sqrt(a))
    return R * c


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/ml/suggest-category", response_model=SuggestCategoryResponse)
async def suggest_category(request: SuggestCategoryRequest):
    """
    Deterministic category suggestion based on keywords.
    Returns one of: accommodation, mobility, water-beach-activities
    """
    text = (request.title or "").lower()
    image_filenames = " ".join(request.images or []).lower()

    combined_text = f"{text} {image_filenames}"

    # Deterministic rules
    if any(keyword in combined_text for keyword in ["paddle", "kayak", "beach", "water", "surf", "snorkel"]):
        return SuggestCategoryResponse(
            suggestedCategorySlug="water-beach-activities",
            confidence=0.85,
        )
    
    if any(keyword in combined_text for keyword in ["scooter", "motor", "car", "bike", "bicycle", "vehicle"]):
        return SuggestCategoryResponse(
            suggestedCategorySlug="mobility",
            confidence=0.80,
        )
    
    # Default to accommodation
    return SuggestCategoryResponse(
        suggestedCategorySlug="accommodation",
        confidence=0.60,
    )


@app.post("/ml/suggest-price", response_model=SuggestPriceResponse)
async def suggest_price(request: SuggestPriceRequest):
    """
    Deterministic price suggestion based on category and location.
    Base prices: Accommodation 150 TND, Mobility 60 TND, Water & Beach Activities 30 TND
    If within 5km of Kelibia center, add 20% premium.
    """
    # Base prices by category (in TND)
    base_prices = {
        "accommodation": 150.0,
        "mobility": 60.0,
        "water-beach-activities": 30.0,
    }

    base_price = base_prices.get(request.categorySlug, 100.0)

    # Check if within 5km of Kelibia center
    distance_km = calculate_distance(
        request.lat, request.lng, KELIBIA_CENTER_LAT, KELIBIA_CENTER_LNG
    )

    if distance_km <= 5.0:
        # Peak area premium: +20%
        base_price *= 1.20

    # Round to 2 decimal places
    suggested_price = round(base_price, 2)

    return SuggestPriceResponse(suggestedPricePerDay=suggested_price)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
