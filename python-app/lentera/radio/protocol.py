import re
import math

def raw_value(s, key):
    # Match the exact raw number text to reproduce the ESP32 FNV-1a ACK token.
    match = re.search(r'"' + re.escape(key) + r'"\s*:\s*(null|-?(?:\d+)(?:\.\d+)?(?:[eE][+-]?\d+)?)', s)
    return match.group(1) if match else ""


def ack_token(raw, msg):
    canonical = "|".join([
        str(msg.get("message_id", "")),
        str(msg.get("node_pengirim", "")),
        raw_value(raw, "victim_count"),
        raw_value(raw, "latitude"),
        raw_value(raw, "longitude"),
        raw_value(raw, "location_accuracy"),
        str(msg.get("location_source", "")),
    ])
    h = 2166136261
    for b in canonical.encode("utf-8"):
        h = ((h ^ b) * 16777619) & 0xFFFFFFFF
    return f"{h:08X}"


def validate_sos(obj):
    if not isinstance(obj, dict) or obj.get("type") != "SOS_REPORT":
        return False
    if not str(obj.get("message_id", "")).startswith("LNT-"):
        return False
    if not str(obj.get("node_pengirim", "")).startswith("NODE-"):
        return False
    count = obj.get("victim_count")
    if type(count) is not int or count < 1:
        return False
    source = obj.get("location_source")
    if source == "PHONE_GPS":
        try:
            lat, lon, acc = float(obj["latitude"]), float(obj["longitude"]), float(obj["location_accuracy"])
            return -90 <= lat <= 90 and -180 <= lon <= 180 and math.isfinite(acc) and 0 <= acc
        except (ValueError, TypeError, KeyError):
            return False
    if source == "UNAVAILABLE":
        return obj.get("latitude") is None and obj.get("longitude") is None
    return False


def backend_payload(obj, node_id="POSKO-01"):
    return {
        "message_id": obj["message_id"],
        "status": obj.get("status", "Baru"),
        "node_penerima": node_id,
        "node_pengirim": obj["node_pengirim"],
        "latitude": obj.get("latitude"),
        "longitude": obj.get("longitude"),
        "victim_count": obj["victim_count"],
        "location_accuracy": obj.get("location_accuracy"),
        "location_source": obj["location_source"],
    }
