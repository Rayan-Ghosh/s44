"""
Device Feature Extractor for S40 Fraud Shield.

Computes device integrity & physical mobility risk features:
1. New device flag & device age in days.
2. IP novelty & location distance (Haversine formula in km).
3. Impossible travel velocity (km/h between successive transactions).
4. OS/Browser change detection flags.
5. Device account count (multiple user accounts using same hardware).
"""

import math
from typing import Dict, Any, List, Tuple


def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Calculates physical distance in kilometers between two GPS coordinates
    using the Haversine formula.
    """
    R = 6371.0  # Earth radius in kilometers
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    
    a = (
        math.sin(dlat / 2.0) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(dlon / 2.0) ** 2
    )
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return R * c


class DeviceFeatureExtractor:
    """
    Extracts device and network security features from transaction payload
    and user hardware history.
    """

    FEATURE_NAMES = [
        "new_device",
        "device_age_days",
        "ip_novelty",
        "location_distance_km",
        "impossible_travel_speed_kmh",
        "os_change",
        "browser_change",
        "device_account_count",
    ]

    def extract_features(
        self, transaction: Dict[str, Any], user_profile: Dict[str, Any]
    ) -> Dict[str, float]:
        """
        Computes device-level risk metrics.

        Args:
            transaction: Current transaction payload containing device_id, ip, lat, lon, os, etc.
            user_profile: User profile containing known_devices, last_lat, last_lon, last_timestamp.

        Returns:
            Dict containing device risk features.
        """
        device_id = str(transaction.get("device_id", ""))
        known_devices = user_profile.get("known_devices", [])
        
        # 1. Device Novelty & Age
        if not device_id or device_id not in known_devices:
            new_device = 1.0
            device_age_days = float(transaction.get("device_age_days", 0.0))
        else:
            new_device = 0.0
            device_age_days = float(transaction.get("device_age_days", user_profile.get("device_age_days", 180.0)))

        # 2. IP Novelty
        current_ip = str(transaction.get("ip_address", ""))
        known_ips = user_profile.get("known_ips", [])
        ip_novelty = 1.0 if (current_ip and current_ip not in known_ips) else 0.0

        # 3. Location Distance (Haversine)
        curr_lat = float(transaction.get("lat", user_profile.get("last_lat", 20.2961)))
        curr_lon = float(transaction.get("lon", user_profile.get("last_lon", 85.8245)))
        
        last_lat = float(user_profile.get("last_lat", curr_lat))
        last_lon = float(user_profile.get("last_lon", curr_lon))
        
        distance_km = haversine_distance(last_lat, last_lon, curr_lat, curr_lon)

        # 4. Impossible Travel Velocity (distance / time delta in hours)
        time_delta_hours = float(transaction.get("hours_since_last_txn", 1.0))
        time_delta_hours = max(time_delta_hours, 0.01)  # avoid div by zero
        
        travel_speed_kmh = distance_km / time_delta_hours

        # 5. OS & Browser Changes
        curr_os = str(transaction.get("os", "Android"))
        last_os = str(user_profile.get("primary_os", "Android"))
        os_change = 1.0 if curr_os != last_os else 0.0

        curr_browser = str(transaction.get("browser", "Chrome"))
        last_browser = str(user_profile.get("primary_browser", "Chrome"))
        browser_change = 1.0 if curr_browser != last_browser else 0.0

        # 6. Accounts registered on device
        account_count = float(transaction.get("device_account_count", user_profile.get("device_account_count", 1.0)))

        return {
            "new_device": float(new_device),
            "device_age_days": float(device_age_days),
            "ip_novelty": float(ip_novelty),
            "location_distance_km": float(distance_km),
            "impossible_travel_speed_kmh": float(travel_speed_kmh),
            "os_change": float(os_change),
            "browser_change": float(browser_change),
            "device_account_count": float(account_count),
        }
