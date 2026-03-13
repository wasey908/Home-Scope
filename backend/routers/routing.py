"""Routing & Geocoding proxy router — calls Google APIs server-side."""

from datetime import datetime, timezone, timedelta
from typing import Optional
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
import httpx

from database import get_db
from models import GeocodeCache, DirectionsCache
from schemas import (
    GeocodeRequest, GeocodeResponse,
    DirectionRequest, DirectionBatchRequest, DirectionResponse,
    RouteResult, TransitStep,
)
from config import get_settings

router = APIRouter(prefix="/api", tags=["routing"])

settings = get_settings()
CACHE_TTL_HOURS = 24
METERS_TO_MILES = 0.000621371


# ─── Geocoding ──────────────────────────────────────────────────────

@router.post("/geocode", response_model=GeocodeResponse)
async def geocode_address(body: GeocodeRequest, db: Session = Depends(get_db)):
    address_key = body.address.strip().lower()

    # Check cache
    cached = db.query(GeocodeCache).filter(GeocodeCache.address_key == address_key).first()
    if cached:
        ttl_cutoff = datetime.now(timezone.utc) - timedelta(hours=CACHE_TTL_HOURS * 30)  # 30 days for geocode
        if cached.fetched_at > ttl_cutoff:
            return GeocodeResponse(lat=cached.lat, lng=cached.lng, formattedAddress=cached.formatted_address)

    # Call Google Geocoding API
    params = {
        "address": body.address,
        "key": settings.GOOGLE_MAPS_API_KEY,
    }
    async with httpx.AsyncClient() as client:
        resp = await client.get("https://maps.googleapis.com/maps/api/geocode/json", params=params)
        data = resp.json()

    if data.get("status") != "OK" or not data.get("results"):
        raise Exception(f"Geocoding failed: {data.get('status')}")

    result = data["results"][0]
    loc = result["geometry"]["location"]
    formatted = result["formatted_address"]

    # Save to cache
    if cached:
        cached.lat = loc["lat"]
        cached.lng = loc["lng"]
        cached.formatted_address = formatted
        cached.fetched_at = datetime.now(timezone.utc)
    else:
        cached = GeocodeCache(
            address_key=address_key,
            lat=loc["lat"],
            lng=loc["lng"],
            formatted_address=formatted,
        )
        db.add(cached)
    db.commit()

    return GeocodeResponse(lat=loc["lat"], lng=loc["lng"], formattedAddress=formatted)


# ─── Directions ─────────────────────────────────────────────────────

TIME_WINDOWS_CONFIG = {
    "weekday_peak_8am": {"hour": 8, "weekday": True},
    "weekday_offpeak_11am": {"hour": 11, "weekday": True},
    "saturday_midday": {"hour": 12, "weekday": False},
}


def _get_departure_timestamp(time_window: str) -> int:
    config = TIME_WINDOWS_CONFIG.get(time_window, {"hour": 8, "weekday": True})
    now = datetime.now(timezone.utc)

    if config["weekday"]:
        # Find next weekday
        d = now + timedelta(days=1)
        while d.weekday() >= 5:  # 5=Saturday, 6=Sunday
            d += timedelta(days=1)
    else:
        # Find next Saturday
        d = now + timedelta(days=1)
        while d.weekday() != 5:
            d += timedelta(days=1)

    d = d.replace(hour=config["hour"], minute=0, second=0, microsecond=0)
    return int(d.timestamp())


def _make_cache_key(req: DirectionRequest) -> str:
    return (
        f"{req.originLat:.5f},{req.originLng:.5f}|"
        f"{req.destLat:.5f},{req.destLng:.5f}|"
        f"{req.mode}|{req.timeWindow}"
    )


def _parse_transit_steps(legs: list) -> tuple[list, int, int]:
    """Parse transit steps from Google Directions API response.
    Returns: (steps, transferCount, walkingDurationSec)
    """
    steps = []
    walking_duration_sec = 0
    transit_legs = 0

    if not legs or not legs[0].get("steps"):
        return steps, 0, 0

    for step in legs[0]["steps"]:
        if step.get("travel_mode") == "WALKING":
            walking_duration_sec += step.get("duration", {}).get("value", 0)
            steps.append({
                "type": "walking",
                "durationSec": step.get("duration", {}).get("value", 0),
                "distanceMeters": step.get("distance", {}).get("value", 0),
                "instruction": (step.get("html_instructions") or "").replace("<[^>]*>", ""),
            })
        elif step.get("travel_mode") == "TRANSIT":
            transit_legs += 1
            td = step.get("transit_details", {})
            steps.append({
                "type": "transit",
                "durationSec": step.get("duration", {}).get("value", 0),
                "distanceMeters": step.get("distance", {}).get("value", 0),
                "lineName": (td.get("line", {}).get("short_name") or
                             td.get("line", {}).get("name") or "Unknown"),
                "vehicleType": td.get("line", {}).get("vehicle", {}).get("type", "BUS"),
                "departureStop": td.get("departure_stop", {}).get("name"),
                "arrivalStop": td.get("arrival_stop", {}).get("name"),
                "numStops": td.get("num_stops"),
                "headsign": td.get("headsign"),
            })

    transfer_count = max(0, transit_legs - 1)
    return steps, transfer_count, walking_duration_sec


async def _fetch_direction(req: DirectionRequest, db: Session) -> Optional[dict]:
    """Fetch a single direction from Google Directions API."""
    cache_key = _make_cache_key(req)

    # Check cache
    cached = db.query(DirectionsCache).filter(DirectionsCache.cache_key == cache_key).first()
    if cached:
        ttl_cutoff = datetime.now(timezone.utc) - timedelta(hours=CACHE_TTL_HOURS)
        if cached.fetched_at > ttl_cutoff:
            result = cached.result_json
            result["homeId"] = req.homeId
            result["placeId"] = req.placeId
            return result

    departure_time = _get_departure_timestamp(req.timeWindow)

    params = {
        "origin": f"{req.originLat},{req.originLng}",
        "destination": f"{req.destLat},{req.destLng}",
        "mode": req.mode,
        "departure_time": str(departure_time),
        "key": settings.GOOGLE_MAPS_API_KEY,
    }

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                "https://maps.googleapis.com/maps/api/directions/json",
                params=params,
                timeout=15.0,
            )
            data = resp.json()
    except Exception as e:
        print(f"Directions fetch error: {e}")
        return None

    if data.get("status") != "OK" or not data.get("routes"):
        print(f"Directions failed: {data.get('status')} for {req.mode} {req.timeWindow}")
        return None

    route = data["routes"][0]
    leg = route["legs"][0]

    steps, transfer_count, walking_duration_sec = [], 0, 0
    if req.mode == "transit":
        steps, transfer_count, walking_duration_sec = _parse_transit_steps(route["legs"])
    elif req.mode == "walking":
        walking_duration_sec = leg.get("duration", {}).get("value", 0)

    result = {
        "homeId": req.homeId,
        "placeId": req.placeId,
        "mode": req.mode,
        "timeWindow": req.timeWindow,
        "durationSec": leg.get("duration", {}).get("value", 0),
        "distanceMeters": leg.get("distance", {}).get("value", 0),
        "steps": steps,
        "transferCount": transfer_count,
        "walkingDurationSec": walking_duration_sec,
        "summaryText": route.get("summary", ""),
        "departureTime": leg.get("departure_time", {}).get("text", ""),
        "arrivalTime": leg.get("arrival_time", {}).get("text", ""),
        "polyline": route.get("overview_polyline", {}).get("points", ""),
    }

    # Save to cache (without homeId/placeId since those are request-specific)
    cache_result = {k: v for k, v in result.items() if k not in ("homeId", "placeId")}
    if cached:
        cached.result_json = cache_result
        cached.fetched_at = datetime.now(timezone.utc)
    else:
        cached = DirectionsCache(cache_key=cache_key, result_json=cache_result)
        db.add(cached)
    db.commit()

    return result


@router.post("/directions", response_model=DirectionResponse)
async def get_directions(body: DirectionBatchRequest, db: Session = Depends(get_db)):
    results = []
    failed = 0

    for req in body.requests:
        result = await _fetch_direction(req, db)
        if result:
            results.append(RouteResult(**result))
        else:
            failed += 1
            results.append(None)

    return DirectionResponse(
        results=results,
        completedRequests=len(body.requests) - failed,
        failedRequests=failed,
    )
