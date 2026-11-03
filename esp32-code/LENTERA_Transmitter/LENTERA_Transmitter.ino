// LENTERA transmitter aligned to FINAL_OFFLINE reference.
// FIELD + relay; Pi SX1278 receiver owns backend persistence.
// LENTERA FINAL: HTTP captive guidance -> copy HTTPS address -> keep Wi-Fi connected.
// IMPORTANT: trusted certificate in lentera_certs.h required for geolocation; iOS CNA redirect not guaranteed.
#include "esp_http_server.h"
#include "esp_https_server.h"
#include <lwip/sockets.h>
#include "lentera_certs.h"

#include <WiFi.h>
#include <WebServer.h>
#include <DNSServer.h>
#include <HTTPClient.h>

#include <SPI.h>
#include <LoRa.h>
#include "cJSON.h"
#include "esp_arduino_version.h"
#include <errno.h>
#include <limits.h>

#include "esp_wifi.h"
#if __has_include("esp_wifi_ap_get_sta_list.h")
#include "esp_wifi_ap_get_sta_list.h"
typedef wifi_sta_mac_ip_list_t LenteraStaList;
#define lenteraGetStaListWithIP esp_wifi_ap_get_sta_list_with_ip
#else
#include "esp_netif_sta_list.h"
typedef esp_netif_sta_list_t LenteraStaList;
#define lenteraGetStaListWithIP esp_netif_get_sta_list
#endif

#include <stdlib.h>
#include <math.h>

// =====================================================
// LENTERA UNIFIED TRANSCEIVER + RELAY + ACK
//
// SATU CODE UNTUK SEMUA ESP32.
//
// Core 0:
// - WiFi
// - Captive Portal
// - Backend HTTP
//
// Core 1:
// - LoRa RX
// - LoRa TX
// - Relay
// - ACK end-to-end POSKO/backend -> FIELD
//
// SX1278 HALF-DUPLEX:
// RX -> TX -> kembali RX
// =====================================================


// =====================================================
// ROLE
// =====================================================

enum NodeRole {
  ROLE_FIELD,
  ROLE_GATEWAY
};


// ESP POSKO yang sudah kita identifikasi.
const String GATEWAY_NODE_ID =
  "NODE-34F726470968";


// Ditentukan otomatis saat boot.
NodeRole NODE_ROLE =
  ROLE_FIELD;


// =====================================================
// WIFI FIELD
// =====================================================

const char* AP_SSID =
  "LENTERA-SOS";

const char* AP_PASSWORD =
  "";

const int MAX_CLIENTS =
  5;


// =====================================================
// WIFI POSKO
// =====================================================

const char* POSKO_SSID =
  "LENTERA-POSKO";

const char* POSKO_PASSWORD =
  "lentera123";


// =====================================================
// BACKEND
// =====================================================

const char* SERVER_URL =
  "http://192.168.137.1:4000/api/reports";


// =====================================================
// LORA PIN
// =====================================================

#define LORA_SS    5
#define LORA_RST   14
#define LORA_DIO0  26


// =====================================================
// LORA CONFIG
// =====================================================

#define LORA_FREQUENCY 433E6
#define LORA_SYNC_WORD 0x34

#define LORA_SF        7
#define LORA_BW        125E3
#define LORA_CR        5
#define LORA_PREAMBLE  8

#define LORA_TX_POWER  17


// =====================================================
// GLOBAL NODE ID
// =====================================================

String deviceId =
  "";

String localNodeId =
  "";

const String defaultStatus =
  "Baru";


// =====================================================
// LORA STATE
// =====================================================

volatile bool loraReady =
  false;


// =====================================================
// FREERTOS
// =====================================================

TaskHandle_t networkTaskHandle =
  nullptr;

TaskHandle_t radioTaskHandle =
  nullptr;


// =====================================================
// RADIO TX QUEUE
//
// LoRa SX127x maksimal 255 byte.
// Buffer 256 = payload + null terminator.
// =====================================================

#define MAX_RADIO_PAYLOAD 256


struct RadioTxRequest {

  char payload[
    MAX_RADIO_PAYLOAD
  ];

  uint16_t delayMs;
};


QueueHandle_t radioTxQueue =
  nullptr;


// =====================================================
// Local reports are tracked independently in pendingAcks.
// =====================================================

// BACKEND QUEUE
// =====================================================

#define MAX_BACKEND_PAYLOAD 512


struct BackendQueueItem {

  char payload[
    MAX_BACKEND_PAYLOAD
  ];
};


QueueHandle_t backendQueue =
  nullptr;


const int MAX_BACKEND_QUEUE =
  20;


// =====================================================
// DNS + SERVER
// FIELD ONLY
// =====================================================

const byte DNS_PORT =
  53;

DNSServer dnsServer;

WebServer server(
  80
);

// HTTPS SERVER - FIELD ONLY
httpd_handle_t httpsServer = nullptr;

// =====================================================
// WIFI POSKO
// =====================================================

unsigned long lastWiFiAttempt =
  0;


const unsigned long WIFI_RETRY_INTERVAL =
  30000;


const unsigned long WIFI_STATUS_PRINT_INTERVAL =
  5000;


// =====================================================
// BACKEND RETRY
// =====================================================

unsigned long lastBackendAttempt =
  0;


const unsigned long BACKEND_RETRY_INTERVAL =
  2000;


// =====================================================
// ACK STATE
//
// ACK = konfirmasi end-to-end bahwa laporan sudah
// diterima backend melalui gateway/POSKO.
//
// FIELD menyimpan sampai 8 transaksi SOS terpisah (hingga 5 HP terhubung).
// Status ini dibaca halaman hasil melalui /ackStatus.
// =====================================================

SemaphoreHandle_t ackStateMutex =
  nullptr;


const int MAX_PENDING_ACKS = 8;
struct PendingAck {
  bool used, waiting, received, failed;
  char messageId[32];
  char token[9];
  char payload[256];
  uint8_t attempts;
  uint32_t startedAt, nextAttemptAt;
};
PendingAck pendingAcks[MAX_PENDING_ACKS] = {};
const unsigned long ACK_WAIT_TIMEOUT_MS = 35000;

// =====================================================

// ANTI DUPLICATE RADIO
//
// Karena relay meneruskan payload yang sama persis,
// payload sama dalam 5 detik dianggap duplicate.
//
// Ini mencegah paket muter:
// A -> B -> C -> A -> B -> ...
// =====================================================

const int RECENT_PACKET_COUNT =
  20;


const unsigned long DUPLICATE_WINDOW_MS =
  5000;


struct RecentPacket {

  String payload;

  unsigned long time;

  bool used;
};


RecentPacket recentPackets[
  RECENT_PACKET_COUNT
];


int recentPacketIndex =
  0;


// Session release intentionally disabled: LENTERA never deauthenticates clients.

// =====================================================
// PRINT HELPER
// =====================================================

void printStatus(
  const String& tag,
  const String& message
) {

  Serial.print(
    "["
  );

  Serial.print(
    tag
  );

  Serial.print(
    "] "
  );

  Serial.println(
    message
  );
}


// =====================================================
// TIME HELPER
// =====================================================

bool timeReached(
  unsigned long now,
  unsigned long target
) {

  return
    (long)(
      now -
      target
    ) >= 0;
}


// =====================================================
// RELAY DELAY HELPER
//
// Delay berbeda untuk setiap ESP.
// Tujuannya mengurangi kemungkinan beberapa relay
// transmit pada waktu yang sama.
// =====================================================

uint16_t getRelayDelayMs() {

  uint32_t hashValue =
    5381;


  for (
    int i = 0;
    i <
      localNodeId.length();
    i++
  ) {

    hashValue =
      (
        (
          hashValue <<
          5
        ) +
        hashValue
      ) +
      (uint8_t)
      localNodeId.charAt(
        i
      );
  }


  // 120 - 399 ms
  return
    120 +
    (
      hashValue %
      280
    );
}


// =====================================================
// MAC HELPERS
// =====================================================

void copyMac(
  uint8_t destination[6],
  const uint8_t source[6]
) {

  memcpy(
    destination,
    source,
    6
  );
}


bool sameMac(
  const uint8_t a[6],
  const uint8_t b[6]
) {

  return
    memcmp(
      a,
      b,
      6
    ) ==
    0;
}


String macToString(
  const uint8_t mac[6]
) {

  char buffer[13];


  snprintf(
    buffer,
    sizeof(buffer),
    "%02X%02X%02X%02X%02X%02X",
    mac[0],
    mac[1],
    mac[2],
    mac[3],
    mac[4],
    mac[5]
  );


  return String(
    buffer
  );
}


// =====================================================
// ESP32 DEVICE ID
// =====================================================

String getESP32DeviceId() {

  uint64_t chipId =
    ESP.getEfuseMac();


  char buffer[13];


  snprintf(
    buffer,
    sizeof(buffer),
    "%04X%08X",
    (uint16_t)(
      chipId >>
      32
    ),
    (uint32_t)
    chipId
  );


  return String(
    buffer
  );
}


// =====================================================
// JSON STRING VALUE
// =====================================================

String getJsonStringValue(
  const String& json,
  const String& key
) {

  String pattern =
    "\"" +
    key +
    "\":\"";


  int start =
    json.indexOf(
      pattern
    );


  if (
    start ==
    -1
  ) {

    return "";
  }


  start +=
    pattern.length();


  int end =
    json.indexOf(
      "\"",
      start
    );


  if (
    end ==
    -1
  ) {

    return "";
  }


  return
    json.substring(
      start,
      end
    );
}


// =====================================================
// JSON RAW VALUE
// =====================================================

String getJsonRawValue(
  const String& json,
  const String& key
) {

  String pattern =
    "\"" +
    key +
    "\":";


  int start =
    json.indexOf(
      pattern
    );


  if (
    start ==
    -1
  ) {

    return "";
  }


  start +=
    pattern.length();


  while (
    start <
      json.length() &&
    (
      json.charAt(
        start
      ) ==
        ' ' ||
      json.charAt(
        start
      ) ==
        '\t'
    )
  ) {

    start++;
  }


  int comma =
    json.indexOf(
      ",",
      start
    );


  int brace =
    json.indexOf(
      "}",
      start
    );


  int end =
    -1;


  if (
    comma !=
      -1 &&
    brace !=
      -1
  ) {

    end =
      min(
        comma,
        brace
      );

  } else if (
    comma !=
    -1
  ) {

    end =
      comma;

  } else if (
    brace !=
    -1
  ) {

    end =
      brace;
  }


  if (
    end ==
    -1
  ) {

    return "";
  }


  String value =
    json.substring(
      start,
      end
    );


  value.trim();


  return value;
}


// =====================================================
// NUMERIC CHECK
// =====================================================

bool isNumericValue(
  String value
) {

  value.trim();


  if (
    value.length() ==
      0 ||
    value ==
      "null"
  ) {

    return false;
  }


  char* endPointer =
    nullptr;


  strtod(
    value.c_str(),
    &endPointer
  );


  if (
    endPointer ==
    value.c_str()
  ) {

    return false;
  }


  return
    *endPointer ==
    '\0';
}


// =====================================================
// PARSE NUMBER
// =====================================================

bool parseNumber(
  String input,
  double& value
) {

  input.trim();


  if (
    input.length() ==
    0
  ) {

    return false;
  }


  char* endPointer =
    nullptr;


  value =
    strtod(
      input.c_str(),
      &endPointer
    );


  if (
    endPointer ==
    input.c_str()
  ) {

    return false;
  }


  if (
    *endPointer !=
    '\0'
  ) {

    return false;
  }


  if (
    !isfinite(
      value
    )
  ) {

    return false;
  }


  return true;
}


// =====================================================
// ACK TOKEN
//
// Token 8 digit hex dibuat dari isi penting laporan.
// SOS LoRa tidak ditambah field baru sehingga payload
// yang sudah mendekati batas 255 byte tetap aman.
// =====================================================

uint32_t fnv1a32(
  const String& input
) {

  uint32_t hashValue =
    2166136261UL;


  for (
    int i = 0;
    i <
      input.length();
    i++
  ) {

    hashValue ^=
      (uint8_t)
      input.charAt(
        i
      );


    hashValue *=
      16777619UL;
  }


  return hashValue;
}


String makeAckToken(
  const String& payload
) {

  String canonical =
    getJsonStringValue(
      payload,
      "message_id"
    ) +
    "|" +
    getJsonStringValue(
      payload,
      "node_pengirim"
    ) +
    "|" +
    getJsonRawValue(
      payload,
      "victim_count"
    ) +
    "|" +
    getJsonRawValue(
      payload,
      "latitude"
    ) +
    "|" +
    getJsonRawValue(
      payload,
      "longitude"
    ) +
    "|" +
    getJsonRawValue(
      payload,
      "location_accuracy"
    ) +
    "|" +
    getJsonStringValue(
      payload,
      "location_source"
    );


  uint32_t hashValue =
    fnv1a32(
      canonical
    );


  char token[9];


  snprintf(
    token,
    sizeof(token),
    "%08lX",
    (unsigned long)
      hashValue
  );


  return String(
    token
  );
}


// =====================================================
// ACK STATE HELPERS
// =====================================================

// Per-report state is shared by HTTP, HTTPS and the radio task.
int findAckSlot(const String& messageId, const String& token) {
  for (int i = 0; i < MAX_PENDING_ACKS; ++i) {
    if (pendingAcks[i].used && messageId == pendingAcks[i].messageId &&
        token == pendingAcks[i].token) return i;
  }
  return -1;
}

bool setPendingAck(const String& messageId, const String& token, const String& payload) {
  if (!ackStateMutex || messageId.length() >= 32 || token.length() != 8 ||
      payload.length() > 255 ||
      xSemaphoreTake(ackStateMutex, pdMS_TO_TICKS(250)) != pdTRUE) return false;
  int slot = -1;
  for (int i = 0; i < MAX_PENDING_ACKS; ++i) {
    if (pendingAcks[i].used && messageId == pendingAcks[i].messageId) {
      if (pendingAcks[i].waiting) {
        // Do not let a second update overwrite this phone's in-flight report.
        bool same = token == pendingAcks[i].token && payload == pendingAcks[i].payload;
        xSemaphoreGive(ackStateMutex);
        return same;
      }
      slot = i;
      break;
    }
  }
  if (slot < 0) {
    for (int i = 0; i < MAX_PENDING_ACKS; ++i) {
      if (!pendingAcks[i].used) { slot = i; break; }
    }
  }
  if (slot < 0) {
    // Reuse the oldest completed slot; never evict an active report.
    uint32_t oldestAge = 0;
    for (int i = 0; i < MAX_PENDING_ACKS; ++i) {
      uint32_t age = millis() - pendingAcks[i].startedAt;
      if (!pendingAcks[i].waiting && (slot < 0 || age > oldestAge)) {
        oldestAge = age; slot = i;
      }
    }
  }
  if (slot >= 0) {
    PendingAck& item = pendingAcks[slot];
    memset(&item, 0, sizeof(item));
    item.used = item.waiting = true;
    item.startedAt = item.nextAttemptAt = millis();
    messageId.toCharArray(item.messageId, sizeof(item.messageId));
    token.toCharArray(item.token, sizeof(item.token));
    payload.toCharArray(item.payload, sizeof(item.payload));
  }
  xSemaphoreGive(ackStateMutex);
  return slot >= 0;
}

bool markAckReceived(const String& messageId, const String& token) {
  if (!ackStateMutex || xSemaphoreTake(ackStateMutex, pdMS_TO_TICKS(250)) != pdTRUE) return false;
  int slot = findAckSlot(messageId, token);
  if (slot >= 0) {
    pendingAcks[slot].waiting = false;
    pendingAcks[slot].received = true;
    pendingAcks[slot].failed = false;
  }
  xSemaphoreGive(ackStateMutex);
  return slot >= 0;
}

String getAckStatusJson(const String& messageId, const String& token) {
  if (!ackStateMutex || xSemaphoreTake(ackStateMutex, pdMS_TO_TICKS(250)) != pdTRUE)
    return "{\"status\":\"BUSY\"}";
  int slot = findAckSlot(messageId, token);
  const char* status = "UNKNOWN";
  if (slot >= 0) {
    PendingAck& item = pendingAcks[slot];
    if (item.received) status = "RECEIVED";
    else if (item.failed) status = "TIMEOUT";
    else status = "WAITING";
  }
  String result = String("{\"status\":\"") + status + "\"}";
  xSemaphoreGive(ackStateMutex);
  return result;
}

bool parseVictimCount(String input, int& count) {
  input.trim();
  if (input.isEmpty()) return false;
  for (size_t i = 0; i < input.length(); ++i)
    if (input[i] < '0' || input[i] > '9') return false;
  errno = 0;
  char* end = nullptr;
  long value = strtol(input.c_str(), &end, 10);
  if (errno == ERANGE || end == input.c_str() || *end || value < 1 || value > INT_MAX) return false;
  count = (int)value;
  return true;
}

bool jsonStringIs(const cJSON* obj, const char* key, const char* expected) {
  const cJSON* v = cJSON_GetObjectItemCaseSensitive(obj, key);
  return cJSON_IsString(v) && v->valuestring && strcmp(v->valuestring, expected) == 0;
}

bool jsonStringStarts(const cJSON* obj, const char* key, const char* prefix) {
  const cJSON* v = cJSON_GetObjectItemCaseSensitive(obj, key);
  return cJSON_IsString(v) && v->valuestring && strncmp(v->valuestring, prefix, strlen(prefix)) == 0;
}

cJSON* parseRadioJson(const String& payload) {
  if (payload.isEmpty() || payload.length() > 255 ||
      memchr(payload.c_str(), '\0', payload.length())) return nullptr;
  cJSON* obj = cJSON_ParseWithOpts(payload.c_str(), nullptr, true);
  if (!cJSON_IsObject(obj)) { cJSON_Delete(obj); return nullptr; }
  return obj;
}

bool validateAckPayload(const String& payload) {
  cJSON* obj = parseRadioJson(payload);
  const cJSON* token = cJSON_GetObjectItemCaseSensitive(obj, "token");
  bool ok = jsonStringIs(obj, "type", "SOS_ACK") &&
    jsonStringStarts(obj, "message_id", "LNT-") &&
    jsonStringStarts(obj, "target_node", "NODE-") &&
    jsonStringIs(obj, "status", "RECEIVED") &&
    cJSON_IsString(token) && token->valuestring && strlen(token->valuestring) == 8;
  if (ok) {
    for (int i = 0; i < 8; ++i) {
      char b = token->valuestring[i];
      if (!((b >= '0' && b <= '9') || (b >= 'A' && b <= 'F'))) ok = false;
    }
  }
  cJSON_Delete(obj);
  return ok;
}

bool validateSOSPayload(const String& payload) {
  cJSON* obj = parseRadioJson(payload);
  const cJSON* count = cJSON_GetObjectItemCaseSensitive(obj, "victim_count");
  bool ok = jsonStringIs(obj, "type", "SOS_REPORT") &&
    jsonStringStarts(obj, "message_id", "LNT-") &&
    jsonStringStarts(obj, "node_pengirim", "NODE-") && cJSON_IsNumber(count) &&
    isfinite(count->valuedouble) && count->valuedouble >= 1 &&
    count->valuedouble <= INT_MAX && floor(count->valuedouble) == count->valuedouble;
  // Python requires an actual JSON integer, not 2.0 or 2e0.
  String countText = getJsonRawValue(payload, "victim_count");
  for (size_t i = 0; i < countText.length(); ++i)
    if (countText[i] < '0' || countText[i] > '9') ok = false;
  const cJSON* lat = cJSON_GetObjectItemCaseSensitive(obj, "latitude");
  const cJSON* lon = cJSON_GetObjectItemCaseSensitive(obj, "longitude");
  const cJSON* acc = cJSON_GetObjectItemCaseSensitive(obj, "location_accuracy");
  if (jsonStringIs(obj, "location_source", "PHONE_GPS")) {
    ok = ok && cJSON_IsNumber(lat) && cJSON_IsNumber(lon) && cJSON_IsNumber(acc) &&
      isfinite(lat->valuedouble) && isfinite(lon->valuedouble) && isfinite(acc->valuedouble) &&
      lat->valuedouble >= -90 && lat->valuedouble <= 90 &&
      lon->valuedouble >= -180 && lon->valuedouble <= 180 &&
      acc->valuedouble >= 0 && acc->valuedouble <= 1e9;
  } else {
    ok = ok && jsonStringIs(obj, "location_source", "UNAVAILABLE") &&
      cJSON_IsNull(lat) && cJSON_IsNull(lon);
  }
  cJSON_Delete(obj);
  return ok;
}

String buildAckPayload(
  const String& backendPayload
) {

  String messageId =
    getJsonStringValue(
      backendPayload,
      "message_id"
    );


  String targetNode =
    getJsonStringValue(
      backendPayload,
      "node_pengirim"
    );


  String token =
    makeAckToken(
      backendPayload
    );


  if (
    !messageId.startsWith(
      "LNT-"
    ) ||
    !targetNode.startsWith(
      "NODE-"
    ) ||
    token.length() !=
      8
  ) {

    return "";
  }


  String ack =
    "{";


  ack +=
    "\"type\":\"SOS_ACK\",";


  ack +=
    "\"message_id\":\"" +
    messageId +
    "\",";


  ack +=
    "\"target_node\":\"" +
    targetNode +
    "\",";


  ack +=
    "\"token\":\"" +
    token +
    "\",";


  ack +=
    "\"status\":\"RECEIVED\"";


  ack +=
    "}";


  return ack;
}


// =====================================================
// DUPLICATE CHECK
// =====================================================

bool isDuplicatePayload(
  const String& payload
) {

  unsigned long now =
    millis();


  for (
    int i = 0;
    i <
      RECENT_PACKET_COUNT;
    i++
  ) {

    if (
      !recentPackets[
        i
      ].used
    ) {

      continue;
    }


    if (
      (
        now -
        recentPackets[i].time
      ) >
      DUPLICATE_WINDOW_MS
    ) {

      continue;
    }


    if (
      recentPackets[i].payload ==
      payload
    ) {

      return true;
    }
  }


  return false;
}


// =====================================================
// REMEMBER PAYLOAD
// =====================================================

void rememberPayload(
  const String& payload
) {

  recentPackets[
    recentPacketIndex
  ].payload =
    payload;


  recentPackets[
    recentPacketIndex
  ].time =
    millis();


  recentPackets[
    recentPacketIndex
  ].used =
    true;


  recentPacketIndex++;


  if (
    recentPacketIndex >=
    RECENT_PACKET_COUNT
  ) {

    recentPacketIndex =
      0;
  }
}


// =====================================================
// VALIDATE SOS
// =====================================================



String convertToBackendPayload(
  const String& payload
) {

  String messageId =
    getJsonStringValue(
      payload,
      "message_id"
    );


  String status =
    getJsonStringValue(
      payload,
      "status"
    );


  String nodePengirim =
    getJsonStringValue(
      payload,
      "node_pengirim"
    );


  String latitude =
    getJsonRawValue(
      payload,
      "latitude"
    );


  String longitude =
    getJsonRawValue(
      payload,
      "longitude"
    );


  String victimCount =
    getJsonRawValue(
      payload,
      "victim_count"
    );


  String accuracy =
    getJsonRawValue(
      payload,
      "location_accuracy"
    );


  String locationSource =
    getJsonStringValue(
      payload,
      "location_source"
    );


  if (
    latitude.length() ==
    0
  ) {

    latitude =
      "null";
  }


  if (
    longitude.length() ==
    0
  ) {

    longitude =
      "null";
  }


  if (
    accuracy.length() ==
    0
  ) {

    accuracy =
      "null";
  }


  String json =
    "{";


  json +=
    "\"message_id\":\"" +
    messageId +
    "\",";


  json +=
    "\"status\":\"" +
    status +
    "\",";


  json +=
    "\"node_penerima\":\"" +
    localNodeId +
    "\",";


  json +=
    "\"node_pengirim\":\"" +
    nodePengirim +
    "\",";


  json +=
    "\"latitude\":" +
    latitude +
    ",";


  json +=
    "\"longitude\":" +
    longitude +
    ",";


  json +=
    "\"victim_count\":" +
    victimCount +
    ",";


  json +=
    "\"location_accuracy\":" +
    accuracy +
    ",";


  json +=
    "\"location_source\":\"" +
    locationSource +
    "\"";


  json +=
    "}";


  return json;
}


// =====================================================
// BACKEND QUEUE ADD
// =====================================================

bool enqueueBackendPayload(
  const String& payload
) {

  if (
    backendQueue ==
    nullptr
  ) {

    return false;
  }


  if (
    payload.length() >=
    MAX_BACKEND_PAYLOAD
  ) {

    printStatus(
      "QUEUE",
      "Payload terlalu panjang"
    );

    return false;
  }


  BackendQueueItem item;


  memset(
    &item,
    0,
    sizeof(item)
  );


  payload.toCharArray(
    item.payload,
    MAX_BACKEND_PAYLOAD
  );


  if (
    xQueueSend(
      backendQueue,
      &item,
      0
    ) !=
    pdTRUE
  ) {

    printStatus(
      "QUEUE",
      "Backend queue penuh"
    );

    return false;
  }


  Serial.print(
    "[QUEUE] Pending: "
  );


  Serial.println(
    uxQueueMessagesWaiting(
      backendQueue
    )
  );


  return true;
}


// =====================================================
// POST BACKEND
// =====================================================

bool postToBackend(
  const String& payload
) {

  if (
    WiFi.status() !=
    WL_CONNECTED
  ) {

    return false;
  }


  WiFiClient client;

  HTTPClient http;


  http.setTimeout(
    5000
  );


  http.setReuse(
    false
  );


  http.useHTTP10(
    true
  );


  if (
    !http.begin(
      client,
      SERVER_URL
    )
  ) {

    printStatus(
      "HTTP",
      "http.begin gagal"
    );

    return false;
  }


  http.addHeader(
    "Content-Type",
    "application/json"
  );


  http.addHeader(
    "Connection",
    "close"
  );


  Serial.println(
    "[HTTP] POST /api/reports"
  );


  int code =
    http.POST(
      payload
    );


  String response =
    "";


  if (
    code >
    0
  ) {

    response =
      http.getString();
  }


  http.end();


  if (
    code >=
      200 &&
    code <
      300
  ) {

    Serial.print(
      "[HTTP] Success | Code: "
    );


    Serial.println(
      code
    );


    if (
      response.length() >
      0
    ) {

      Serial.print(
        "[HTTP] Response: "
      );


      Serial.println(
        response
      );
    }


    return true;
  }


  Serial.print(
    "[HTTP] Failed | Code: "
  );


  Serial.println(
    code
  );


  if (
    response.length() >
    0
  ) {

    Serial.println(
      response
    );
  }


  return false;
}


// =====================================================
// PROCESS BACKEND QUEUE
// =====================================================
// Forward declaration
bool queueRadioPayloadAsync(
    const String& payload,
    uint16_t delayMs
);

void processBackendQueue() {

  if (
    NODE_ROLE !=
    ROLE_GATEWAY
  ) {

    return;
  }


  if (
    WiFi.status() !=
    WL_CONNECTED
  ) {

    return;
  }


  if (
    millis() -
    lastBackendAttempt <
    BACKEND_RETRY_INTERVAL
  ) {

    return;
  }


  BackendQueueItem item;


  if (
    xQueuePeek(
      backendQueue,
      &item,
      0
    ) !=
    pdTRUE
  ) {

    return;
  }


  lastBackendAttempt =
    millis();


  String payload =
    String(
      item.payload
    );


  if (
    postToBackend(
      payload
    )
  ) {

    xQueueReceive(
      backendQueue,
      &item,
      0
    );


    printStatus(
      "DONE",
      "Masuk backend/database"
    );


    // ACK hanya dibuat SETELAH backend membalas 2xx.
    // Jadi ACK berarti laporan sudah benar-benar
    // diterima sisi POSKO/backend, bukan sekadar LoRa RX.
    String ackPayload =
      buildAckPayload(
        payload
      );


    if (
      ackPayload.length() >
      0
    ) {

      if (
        queueRadioPayloadAsync(
          ackPayload,
          80
        )
      ) {

        Serial.print(
          "[ACK] Queued -> "
        );


        Serial.println(
          getJsonStringValue(
            ackPayload,
            "target_node"
          )
        );

      } else {

        printStatus(
          "ACK",
          "Gagal masuk radio TX queue"
        );
      }
    }


    Serial.print(
      "[QUEUE] Remaining: "
    );


    Serial.println(
      uxQueueMessagesWaiting(
        backendQueue
      )
    );

  } else {

    printStatus(
      "QUEUE",
      "Backend belum tersedia"
    );
  }
}


// =====================================================
// WIFI GATEWAY CONNECT
//
// PENTING:
//
// Tidak memakai WiFi.reconnect()
// ketika driver masih mencoba connect.
//
// Retry selalu diawali WiFi.disconnect()
// agar tidak muncul:
// "sta is connecting, cannot set config"
// =====================================================

void startPoskoWiFi() {

  if (
    NODE_ROLE !=
    ROLE_GATEWAY
  ) {

    return;
  }


  Serial.print(
    "[WiFi] Connecting: "
  );


  Serial.println(
    POSKO_SSID
  );


  WiFi.mode(
    WIFI_STA
  );


  WiFi.persistent(
    false
  );


  WiFi.setSleep(
    false
  );


  // Kita kelola retry sendiri.
  WiFi.setAutoReconnect(
    false
  );


  // Bersihkan konfigurasi AP lama.
  WiFi.disconnect(
    false,
    true
  );


  delay(
    300
  );


  WiFi.begin(
    POSKO_SSID,
    POSKO_PASSWORD
  );


  lastWiFiAttempt =
    millis();
}


// =====================================================
// MAINTAIN POSKO WIFI
// =====================================================

void maintainPoskoWiFi() {

  if (
    NODE_ROLE !=
    ROLE_GATEWAY
  ) {

    return;
  }


  static bool previousConnected =
    false;


  static unsigned long lastStatusPrint =
    0;


  wl_status_t status =
    WiFi.status();


  bool connected =
    status ==
    WL_CONNECTED;


  // ===================================================
  // BARU CONNECT
  // ===================================================

  if (
    connected &&
    !previousConnected
  ) {

    Serial.println();


    Serial.println(
      "=============================="
    );


    Serial.println(
      "[WiFi] CONNECTED"
    );


    Serial.print(
      "[WiFi] SSID    : "
    );


    Serial.println(
      WiFi.SSID()
    );


    Serial.print(
      "[WiFi] IP      : "
    );


    Serial.println(
      WiFi.localIP()
    );


    Serial.print(
      "[WiFi] Gateway : "
    );


    Serial.println(
      WiFi.gatewayIP()
    );


    Serial.print(
      "[WiFi] RSSI    : "
    );


    Serial.print(
      WiFi.RSSI()
    );


    Serial.println(
      " dBm"
    );


    Serial.println(
      "=============================="
    );
  }


  // ===================================================
  // KONEKSI PUTUS
  // ===================================================

  if (
    !connected &&
    previousConnected
  ) {

    printStatus(
      "WiFi",
      "Disconnected"
    );


    lastWiFiAttempt =
      millis();
  }


  previousConnected =
    connected;


  if (
    connected
  ) {

    return;
  }


  // ===================================================
  // PRINT STATUS
  // ===================================================

  if (
    millis() -
    lastStatusPrint >=
    WIFI_STATUS_PRINT_INTERVAL
  ) {

    lastStatusPrint =
      millis();


    Serial.print(
      "[WiFi] Waiting for "
    );


    Serial.print(
      POSKO_SSID
    );


    Serial.print(
      " | status="
    );


    Serial.println(
      (int)
      status
    );
  }


  // ===================================================
  // RETRY AMAN
  //
  // Hentikan proses lama terlebih dahulu,
  // tunggu 500 ms,
  // baru WiFi.begin lagi.
  // ===================================================

  if (
    millis() -
    lastWiFiAttempt >=
    WIFI_RETRY_INTERVAL
  ) {

    printStatus(
      "WiFi",
      "Connect timeout - restart connection"
    );


    WiFi.disconnect(
      false,
      false
    );


    vTaskDelay(
      pdMS_TO_TICKS(
        500
      )
    );


    WiFi.begin(
      POSKO_SSID,
      POSKO_PASSWORD
    );


    lastWiFiAttempt =
      millis();
  }
}


// =====================================================
// FIND CLIENT MAC BY IP
// =====================================================

bool findClientMacByIP(
  IPAddress targetIP,
  uint8_t outputMac[6]
) {

  wifi_sta_list_t wifiList;

  LenteraStaList ipList;


  memset(
    &wifiList,
    0,
    sizeof(wifiList)
  );


  memset(
    &ipList,
    0,
    sizeof(ipList)
  );


  if (
    esp_wifi_ap_get_sta_list(
      &wifiList
    ) !=
    ESP_OK
  ) {

    return false;
  }


  if (
    wifiList.num ==
    0
  ) {

    return false;
  }


  if (
    lenteraGetStaListWithIP(
      &wifiList,
      &ipList
    ) !=
    ESP_OK
  ) {

    return false;
  }


  for (
    int i = 0;
    i <
      ipList.num;
    i++
  ) {

    uint32_t raw =
      ipList.sta[i].ip.addr;


    IPAddress stationIP(
      (uint8_t)(
        raw &
        0xFF
      ),
      (uint8_t)(
        (
          raw >>
          8
        ) &
        0xFF
      ),
      (uint8_t)(
        (
          raw >>
          16
        ) &
        0xFF
      ),
      (uint8_t)(
        (
          raw >>
          24
        ) &
        0xFF
      )
    );


    if (
      stationIP ==
      targetIP
    ) {

      copyMac(
        outputMac,
        ipList.sta[i].mac
      );


      return true;
    }
  }


  return false;
}


// =====================================================
// CURRENT CLIENT IDENTITY
// =====================================================

bool getCurrentClientIdentity(
  uint8_t outputMac[6],
  String& reportId
) {

  IPAddress clientIP =
    server.client()
      .remoteIP();


  // Saat captive portal Android baru terbuka,
  // tabel IP -> MAC kadang belum langsung siap.
  // Tunggu maksimal ~2 detik, tetapi normalnya
  // akan berhasil pada percobaan pertama.
  for (
    int attempt = 0;
    attempt <
      20;
    attempt++
  ) {

    if (
      findClientMacByIP(
        clientIP,
        outputMac
      )
    ) {

      reportId =
        "LNT-" +
        macToString(
          outputMac
        );


      return true;
    }


    delay(
      100
    );
  }


  reportId =
    "";


  return false;
}

bool getClientIdentityFromIP(
  IPAddress clientIP,
  uint8_t outputMac[6],
  String& reportId
) {

  for (int attempt = 0; attempt < 5; attempt++) {

    if (findClientMacByIP(clientIP, outputMac)) {

      reportId = "LNT-" + macToString(outputMac);

      return true;
    }

    delay(100);
  }

  reportId = "";
  return false;
}

// =====================================================
// NO CACHE
// =====================================================

void sendNoCacheHeaders() {

  server.sendHeader(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, max-age=0"
  );


  server.sendHeader(
    "Pragma",
    "no-cache"
  );


  server.sendHeader(
    "Expires",
    "-1"
  );
}


// =====================================================
// IDENTITY ERROR PAGE
// =====================================================

String getIdentityErrorPage() {

  return R"rawliteral(
<!DOCTYPE html>

<html lang="id">

<head>

<meta charset="UTF-8">

<meta
name="viewport"
content="width=device-width,initial-scale=1.0">

<title>LENTERA</title>

<style>

body{
margin:0;
padding:24px;
background:#f8fafc;
font-family:Arial,sans-serif;
color:#0f172a;
}

.card{
max-width:420px;
margin:40px auto;
background:white;
padding:24px;
border-radius:24px;
text-align:center;
box-shadow:0 15px 35px rgba(0,0,0,.10);
}

.error{
color:#991b1b;
background:#fef2f2;
border:2px solid #fecaca;
border-radius:18px;
padding:18px;
line-height:1.6;
}

a{
display:block;
background:#00193c;
color:white;
padding:15px;
border-radius:14px;
text-decoration:none;
margin-top:20px;
font-weight:800;
}

</style>

</head>

<body>

<div class="card">

<div class="error">

<b>
Perangkat belum dapat diidentifikasi.
</b>

<br><br>

Pastikan perangkat masih terhubung ke
LENTERA-SOS lalu coba kembali.

</div>

<a href="/">
COBA LAGI
</a>

</div>

</body>

</html>
)rawliteral";
}


// =====================================================
// PORTAL PAGE
// =====================================================

String getPortalPage(
  String reportId,
  bool updateMode
) {

  String title =
    updateMode
      ? "Perbarui Jumlah Korban"
      : "Butuh Bantuan?";


  String description =
    updateMode
      ? "Masukkan jumlah korban terbaru untuk memperbarui laporan bantuan Anda."
      : "Masukkan jumlah orang yang membutuhkan pertolongan, lalu kirim laporan kepada tim penyelamat.";


  String info =
    updateMode
      ? "Laporan dari perangkat ini akan diperbarui tanpa membuat ID baru."
      : "Masukkan jumlah korban yang membutuhkan bantuan saat ini agar tim SAR dapat menyesuaikan penanganan.";


  String buttonText =
    updateMode
      ? "PERBARUI LAPORAN"
      : "KIRIM SOS";


  String html =
R"rawliteral(
<!DOCTYPE html>

<html lang="id">

<head>

<meta charset="UTF-8">

<meta
http-equiv="Cache-Control"
content="no-store, no-cache, must-revalidate, max-age=0">

<meta
name="viewport"
content="width=device-width, initial-scale=1.0">

<title>LENTERA SOS</title>

<style>
*{box-sizing:border-box}
body{margin:0;min-height:100vh;background:#00193c;padding:16px;font-family:Arial,Helvetica,sans-serif;color:#0f172a}
.wrapper{max-width:430px;margin:10px auto 30px}
.brand{text-align:center;color:white;margin:0 0 19px}
.logo{width:58px;height:58px;border-radius:18px;background:#d90429;color:white;display:flex;align-items:center;justify-content:center;font-size:38px;font-weight:900;margin:0 auto 10px}
.brand h1{font-size:29px;margin:0;font-weight:900}
.card{background:white;border-radius:23px;padding:23px 21px;box-shadow:0 15px 36px #0002}
.connected{display:flex;justify-content:space-between;gap:12px;align-items:center;font-size:13px;color:#526078;border-bottom:1px solid #e2e8f0;padding:4px 0 14px;margin-bottom:16px}
.connected:before{content:'Status jaringan';color:#64748b}.connected{font-weight:700;color:#08795c}
.title{text-align:center;color:#00193c;font-size:25px;font-weight:900;margin:12px 0 9px}
.description{text-align:center;color:#64748b;font-size:14px;line-height:1.55;margin:0 0 18px}
.info{display:none}
.report{border-top:1px solid #e2e8f0;padding:15px 0;display:flex;align-items:center;justify-content:space-between;gap:8px}
.reportLabel{font-size:13px;color:#64748b;font-weight:400}
.reportId{font-size:12px;font-weight:700;color:#0f172a;text-align:right;overflow-wrap:anywhere}
.location{padding:15px 0;border-top:1px solid #e2e8f0;border-bottom:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:19px}
.locationTitle{font-size:13px;color:#64748b;flex:0 0 auto}
.locationStatus{font-size:13px;text-align:right;line-height:1.5;font-weight:600;color:#0f172a;overflow-wrap:anywhere}
.inputCard{margin-bottom:16px}
label{display:block;color:#00193c;font-weight:700;font-size:14px;margin-bottom:11px}
input[type=number]{width:100%;border:1.5px solid #cbd5e1;border-radius:12px;padding:16px;font-size:18px;font-weight:700;color:#0f172a}
button{display:block;width:100%;background:#d90429;border:0;border-radius:13px;color:white;padding:17px;font-size:17px;font-weight:800;cursor:pointer}
button:disabled{opacity:.65}
.card:after{content:'Pastikan HP tetap terhubung ke Wi-Fi LENTERA-SOS selama mengirim laporan.';display:block;font-size:12px;line-height:1.5;color:#64748b;text-align:center;margin-top:15px}

</style>

</head>

<body>

<div class="wrapper">

<div class="brand">

<div class="logo">
!
</div>

<h1>
LENTERA
</h1>

</div>

<div class="card">

<div class="connected">

Terhubung ke jaringan darurat
LENTERA-SOS

</div>
)rawliteral";


  html +=
    "<div class='title'>" +
    title +
    "</div>";


  html +=
    "<div class='description'>" +
    description +
    "</div>";


  html +=
    "<div class='info'>" +
    info +
    "</div>";


  html +=
    "<div class='report'>"
    "<div class='reportLabel'>"
    "ID Laporan"
    "</div>"
    "<div class='reportId'>" +
    reportId +
    "</div>"
    "</div>";


  html +=
R"rawliteral(

<div class="location">

<div class="locationTitle">
Lokasi HP
</div>

<div
class="locationStatus"
id="locationStatus">

Mendeteksi lokasi HP...

</div>

</div>


<form
id="sosForm"
action="/sendSOS"
method="POST"
onsubmit="return submitSOS(event);">


<input
type="hidden"
id="latitude"
name="latitude">


<input
type="hidden"
id="longitude"
name="longitude">


<input
type="hidden"
id="accuracy"
name="accuracy">


<input
type="hidden"
id="locationSource"
name="location_source"
value="UNAVAILABLE">
)rawliteral";


  if (
    updateMode
  ) {

    html +=
      "<input "
      "type='hidden' "
      "name='is_update' "
      "value='1'>";
  }


  html +=
R"rawliteral(

<div class="inputCard">

<label for="jumlah">

Jumlah orang / korban
yang membutuhkan bantuan

</label>

<input
id="jumlah"
name="jumlah"
type="number"
min="1"
required
placeholder="Contoh: 1 / 2 / 3">

</div>
)rawliteral";


  html +=
    "<button "
    "id='sendButton' "
    "type='submit'>" +
    buttonText +
    "</button>";


  html +=
R"rawliteral(

</form>

</div>

</div>


<script>

let sending=false;
let gpsPending=null;


function clearLocation(){

document.getElementById(
"latitude"
).value="";

document.getElementById(
"longitude"
).value="";

document.getElementById(
"accuracy"
).value="";

document.getElementById(
"locationSource"
).value="UNAVAILABLE";

}


function requestCurrentLocation(){
  if(gpsPending) return gpsPending;
  gpsPending = new Promise(async function(resolve){
    const status=document.getElementById("locationStatus");
    clearLocation();
    if(!window.isSecureContext || !navigator.geolocation){
      status.innerText="GPS memerlukan HTTPS tepercaya dan izin lokasi browser.";
      gpsPending=null;
      resolve(false);
      return;
    }
    status.innerText="Mengambil lokasi GPS asli HP...";
    function positionOnce(options, maximumWait){
      return new Promise(function(done){
        let finished=false;
        const timer=setTimeout(function(){
          if(finished)return;
          finished=true;
          done(null);
        },maximumWait);
        try {
          navigator.geolocation.getCurrentPosition(function(p){
            if(finished)return;
            finished=true;
            clearTimeout(timer);
            done(p);
          },function(){
            if(finished)return;
            finished=true;
            clearTimeout(timer);
            done(null);
          },options);
        } catch(e){
          if(!finished){finished=true;clearTimeout(timer);done(null);}
        }
      });
    }
    let position=await positionOnce({
      enableHighAccuracy:true,timeout:12000,maximumAge:15000
    },14000);
    if(!position){
      status.innerText="GPS akurasi tinggi belum tersedia. Mencoba lokasi alternatif...";
      position=await positionOnce({
        enableHighAccuracy:false,timeout:8000,maximumAge:60000
      },10000);
    }
    if(!position){
      clearLocation();
      status.innerText="GPS belum tersedia. Coba kembali atau kirim SOS tanpa GPS jika darurat.";
      gpsPending=null;
      resolve(false);
      return;
    }
    const lat=position.coords.latitude.toFixed(6);
    const lon=position.coords.longitude.toFixed(6);
    const acc=Number(position.coords.accuracy||0).toFixed(1);
    document.getElementById("latitude").value=lat;
    document.getElementById("longitude").value=lon;
    document.getElementById("accuracy").value=acc;
    document.getElementById("locationSource").value="PHONE_GPS";
    status.innerText="Lokasi ditemukan: "+lat+", "+lon+" (akurasi ±"+Math.round(position.coords.accuracy||0)+" m)";
    resolve(true);
  });
  return gpsPending;
}


async function submitSOS(
event
){

event.preventDefault();


if(sending){
return false;
}


sending=true;


const button=
document.getElementById(
"sendButton"
);


button.disabled=true;

button.innerText=
"MENGAMBIL LOKASI...";


// Tunggu hasil GPS (maksimal kira-kira 24 detik), jangan kirim diam-diam tanpa lokasi.
const haveLocation = await requestCurrentLocation();
if (!haveLocation) {
  if (!window.confirm("GPS asli HP belum tersedia. Kirim SOS DARURAT tanpa koordinat?")) {
    sending=false;
    button.disabled=false;
    button.innerText="KIRIM SOS";
    return false;
  }
}


button.innerText=
"MENGIRIM SOS...";


document.getElementById(
"sosForm"
).submit();


return false;
}


window.addEventListener(
"load",
function(){

requestCurrentLocation();

}
);

</script>

</body>

</html>
)rawliteral";


  return html;
}


// =====================================================
// RESULT PAGE
// =====================================================

String getResultPage(bool queued, String reportId, int victimCount, bool updateMode,
                     bool locationAvailable, String latitude, String longitude,
                     String accuracy, String ackToken) {
  String html = R"LNT(<!DOCTYPE html><html lang="id"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>LENTERA SOS</title>
<style>body{font-family:Arial;background:#00193c;color:#0f172a;padding:20px}
.card{max-width:440px;margin:24px auto;background:white;border-radius:20px;padding:24px;line-height:1.6}
.pending{color:#a16207}.received{color:#16803d}.timeout{color:#a16207}
a{display:block;margin-top:20px;padding:14px;background:#00193c;color:white;text-align:center;border-radius:12px;text-decoration:none}
.id{overflow-wrap:anywhere;font-family:monospace}</style></head><body><div class="card"><h1 id="title">)LNT";
  html += queued ? "MENUNGGU KONFIRMASI POSKO" : "LAPORAN BELUM MASUK ANTREAN";
  html += "</h1><p>ID laporan: <span class='id'>" + reportId + "</span></p><p>Jumlah korban: <b>" + String(victimCount) + "</b></p>";
  if (locationAvailable) html += "<p>Lokasi: " + latitude + ", " + longitude + "<br>Akurasi &plusmn;" + accuracy + " m</p>";
  else html += "<p>Koordinat HP belum tersedia. Laporan tidak memakai koordinat dummy.</p>";
  if (queued) {
    html += "<p id='ackCard' class='pending' data-message-id='" + reportId + "' data-token='" + ackToken + "'>Laporan masuk antrean radio. Menunggu ACK backend, maksimal sekitar 35 detik.</p>";
    html += R"LNT(<script>
const card=document.getElementById('ackCard');let running=false,finished=false;
async function checkAck(){if(running||finished)return;running=true;try{
const response=await fetch('/ackStatus?message_id='+encodeURIComponent(card.dataset.messageId)+'&token='+encodeURIComponent(card.dataset.token)+'&_='+Date.now(),{cache:'no-store'});
if(!response.ok)throw new Error('HTTP '+response.status);const data=await response.json();
if(data.status==='RECEIVED'){finished=true;card.className='received';card.textContent='ACK cocok: backend posko telah mengonfirmasi penyimpanan laporan.';document.getElementById('title').textContent='LAPORAN DITERIMA POSKO';}
else if(data.status==='TIMEOUT'){finished=true;card.className='timeout';card.textContent='Penerimaan belum terkonfirmasi. Laporan mungkin sudah tersimpan. Coba lagi dengan ID yang sama.';document.getElementById('title').textContent='PENERIMAAN BELUM TERKONFIRMASI';}
else if(data.status==='UNKNOWN'){finished=true;card.className='timeout';card.textContent='Transaksi tidak tersedia atau ESP32 telah restart. Periksa posko, lalu coba lagi dengan ID yang sama.';}
}catch(e){card.textContent='Koneksi ke ESP32 terputus. Sambungkan kembali ke LENTERA-SOS untuk memeriksa status.';}finally{running=false;}}
setInterval(checkAck,700);checkAck();</script>)LNT";
  } else html += "<p>Radio belum siap, antrean penuh, atau laporan lain dari HP ini masih diproses. Tunggu dan coba lagi.</p>";
  html += "<a href='/update'>PERBARUI / COBA LAGI</a><p>Tetap terhubung ke LENTERA-SOS untuk melihat status. ACK tidak berarti tim SAR sudah diberangkatkan.</p></div></body></html>";
  return html;
}

// Radio task owns every LoRa and recent-packet-cache operation.
bool sendOneLoRaPacket(const String& payload) {
  if (payload.isEmpty() || payload.length() > 255 || LoRa.beginPacket(false) != 1) return false;
  if (LoRa.write((const uint8_t*)payload.c_str(), payload.length()) != payload.length()) {
    LoRa.idle(); return false;
  }
  if (LoRa.endPacket(true) != 1) return false;
  uint32_t started = millis();
  while (LoRa.beginPacket(false) == 0) {
    if ((uint32_t)(millis() - started) >= 3000UL) {
      LoRa.idle(); return false;
    }
    vTaskDelay(pdMS_TO_TICKS(1));
  }
  return true;
}

bool queueRadioPayloadAsync(const String& payload, uint16_t delayMs) {
  if (!loraReady || payload.isEmpty() || payload.length() > 255) return false;
  RadioTxRequest request = {};
  payload.toCharArray(request.payload, sizeof(request.payload));
  request.delayMs = delayMs;
  return xQueueSend(radioTxQueue, &request, 0) == pdTRUE;
}

bool sendSOSViaLoRa(const String& reportId, int victimCount, bool locationAvailable,
                   const String& latitude, const String& longitude,
                   const String& accuracy, String& ackToken) {
  if (!loraReady || victimCount < 1) return false;
  const String lat = locationAvailable ? latitude : String("null");
  const String lon = locationAvailable ? longitude : String("null");
  const String acc = locationAvailable ? accuracy : String("null");
  const String source = locationAvailable ? "PHONE_GPS" : "UNAVAILABLE";
  // Keep status for compatibility with the reference gateway; Pi also accepts it.
  String payload = String("{\"type\":\"SOS_REPORT\",\"message_id\":\"") + reportId +
    "\",\"status\":\"Baru\",\"node_pengirim\":\"" + localNodeId +
    "\",\"latitude\":" + lat + ",\"longitude\":" + lon +
    ",\"victim_count\":" + String(victimCount) + ",\"location_accuracy\":" + acc +
    ",\"location_source\":\"" + source + "\"}";
  if (!validateSOSPayload(payload)) {
    printStatus("SOS", "Payload tidak valid / melebihi 255 byte");
    return false;
  }
  ackToken = makeAckToken(payload);
  bool queued = setPendingAck(reportId, ackToken, payload);
  Serial.println(String("[SOS] JSON: ") + payload);
  Serial.printf("[SOS] ID=%s token=%s bytes=%u %s\n", reportId.c_str(), ackToken.c_str(),
    (unsigned)payload.length(), queued ? "QUEUED - belum ACK" : "BUSY / queue penuh");
  return queued;  // This means queued, never backend success.
}

bool servicePendingReports() {
  static int cursor = 0;
  if (xSemaphoreTake(ackStateMutex, pdMS_TO_TICKS(10)) != pdTRUE) return false;
  int slot = -1;
  PendingAck request = {};
  uint32_t now = millis();
  for (int n = 0; n < MAX_PENDING_ACKS; ++n) {
    int i = (cursor + n) % MAX_PENDING_ACKS;
    PendingAck& item = pendingAcks[i];
    if (!item.used || !item.waiting) continue;
    if ((uint32_t)(now - item.startedAt) >= ACK_WAIT_TIMEOUT_MS ||
        (item.attempts >= 3 && timeReached(now, item.nextAttemptAt))) {
      item.waiting = false; item.failed = true;
      Serial.printf("[ACK] TIMEOUT ID=%s token=%s; penyimpanan belum terkonfirmasi\n", item.messageId, item.token);
      continue;
    }
    if (!timeReached(now, item.nextAttemptAt)) continue;
    ++item.attempts;
    slot = i; request = item; cursor = (i + 1) % MAX_PENDING_ACKS;
    break;
  }
  xSemaphoreGive(ackStateMutex);
  if (slot < 0) return false;
  String payload(request.payload);
  rememberPayload(payload);
  bool sent = sendOneLoRaPacket(payload);
  LoRa.receive();  // RX immediately; no blind duplicate TX after 200 ms.
  Serial.printf("[LoRa] ID=%s attempt=%u TX=%s; RX aktif\n", request.messageId,
    request.attempts, sent ? "OK" : "FAILED");
  if (xSemaphoreTake(ackStateMutex, pdMS_TO_TICKS(250)) == pdTRUE) {
    PendingAck& item = pendingAcks[slot];
    if (strcmp(item.messageId, request.messageId) == 0 && strcmp(item.token, request.token) == 0) {
      item.nextAttemptAt = millis() + (sent ? 8000UL : 0UL) + 250UL + esp_random() % 501;
    }
    xSemaphoreGive(ackStateMutex);
  }
  return true;
}

void handleReceivedACK(const String& incoming, int rssi) {
  if (!validateAckPayload(incoming)) return;
  String mid = getJsonStringValue(incoming, "message_id");
  String target = getJsonStringValue(incoming, "target_node");
  String token = getJsonStringValue(incoming, "token");
  // A repeated own ACK must still confirm a new manual resend of identical data.
  if (target == localNodeId) {
    bool matched = markAckReceived(mid, token);
    Serial.printf("[ACK] ID=%s target=%s token=%s RSSI=%d %s\n", mid.c_str(),
      target.c_str(), token.c_str(), rssi, matched ? "RECEIVED - konfirmasi backend" : "IGNORED - transaksi tidak cocok");
    return;
  }
  if (NODE_ROLE == ROLE_GATEWAY || isDuplicatePayload(incoming)) return;
  rememberPayload(incoming);
  queueRadioPayloadAsync(incoming, getRelayDelayMs());
}

void radioTask(void* parameter) {
  Serial.printf("[RTOS] Radio task Core %d\n", xPortGetCoreID());
  if (loraReady) LoRa.receive();
  RadioTxRequest relay = {};
  bool relayPending = false;
  bool lastWasRelay = false;
  uint32_t relayAt = 0, quietUntil = millis();
  for (;;) {
    if (loraReady) {
      int packetSize = LoRa.parsePacket();
      if (packetSize > 0) {
        String incoming;
        incoming.reserve(packetSize);
        while (LoRa.available()) incoming += (char)LoRa.read();
        int rssi = LoRa.packetRssi();
        String type = getJsonStringValue(incoming, "type");
        if (type == "SOS_ACK") handleReceivedACK(incoming, rssi);
        else if (type == "SOS_REPORT") handleReceivedSOS(incoming, rssi);
        LoRa.receive();
      }
      if (!relayPending && xQueueReceive(radioTxQueue, &relay, 0) == pdTRUE) {
        relayPending = true; relayAt = millis() + relay.delayMs;
      }
      if (timeReached(millis(), quietUntil)) {
        // Forward a received ACK/report promptly, then serve local reports fairly.
        if (!lastWasRelay && relayPending && timeReached(millis(), relayAt)) {
          sendOneLoRaPacket(String(relay.payload));
          LoRa.receive(); relayPending = false;
          lastWasRelay = true;
          quietUntil = millis() + 500;
        } else if (servicePendingReports()) {
          lastWasRelay = false;
          quietUntil = millis() + 500;
        } else if (relayPending && timeReached(millis(), relayAt)) {
          sendOneLoRaPacket(String(relay.payload));
          LoRa.receive(); relayPending = false;
          lastWasRelay = true;
          quietUntil = millis() + 500;
        }
      }
    }
    vTaskDelay(pdMS_TO_TICKS(2));
  }
}

void handleReceivedSOS(
  const String& incoming,
  int rssi
) {

  Serial.println();


  Serial.println(
    "=============================="
  );


  Serial.println(
    "[SOS] PACKET RECEIVED"
  );


  Serial.print(
    "[LoRa] RSSI: "
  );


  Serial.println(
    rssi
  );


  Serial.print(
    "[LoRa] JSON: "
  );


  Serial.println(
    incoming
  );


  if (
    !validateSOSPayload(
      incoming
    )
  ) {

    printStatus(
      "RX",
      "Payload ditolak"
    );

    return;
  }


  if (
    isDuplicatePayload(
      incoming
    )
  ) {

    printStatus(
      "RX",
      "Duplicate TX / relay ignored"
    );

    return;
  }


  // Tandai SEBELUM relay.
  // Kalau paket yang sama kembali,
  // langsung dibuang.
  rememberPayload(
    incoming
  );


  String messageId =
    getJsonStringValue(
      incoming,
      "message_id"
    );


  String senderNode =
    getJsonStringValue(
      incoming,
      "node_pengirim"
    );


  String victimCount =
    getJsonRawValue(
      incoming,
      "victim_count"
    );


  String locationSource =
    getJsonStringValue(
      incoming,
      "location_source"
    );


  Serial.print(
    "[SOS] ID     : "
  );


  Serial.println(
    messageId
  );


  Serial.print(
    "[SOS] Node   : "
  );


  Serial.println(
    senderNode
  );


  Serial.print(
    "[SOS] Korban : "
  );


  Serial.println(
    victimCount
  );


  Serial.print(
    "[LOC] Source : "
  );


  Serial.println(
    locationSource
  );


  // ===================================================
  // GATEWAY -> BACKEND
  // ===================================================

  if (
    NODE_ROLE ==
    ROLE_GATEWAY
  ) {

    String backendPayload =
      convertToBackendPayload(
        incoming
      );


    if (
      enqueueBackendPayload(
        backendPayload
      )
    ) {

      printStatus(
        "RX",
        "Laporan masuk backend queue"
      );
    }


    return;
  }


  // ===================================================
  // FIELD / RELAY
  //
  // MENERIMA -> RELAY -> KEMBALI RX
  // ===================================================

  if (
    senderNode ==
    localNodeId
  ) {

    printStatus(
      "RELAY",
      "Paket kembali ke node asal - ignored"
    );

    return;
  }


  uint16_t relayDelay =
    getRelayDelayMs();


  if (
    queueRadioPayloadAsync(
      incoming,
      relayDelay
    )
  ) {

    Serial.print(
      "[RELAY] Paket diteruskan | delay "
    );


    Serial.print(
      relayDelay
    );


    Serial.println(
      " ms"
    );

  } else {

    printStatus(
      "RELAY",
      "Gagal masuk TX queue"
    );
  }
}


// =====================================================
// HANDLE RECEIVED ACK
// CORE 1
//
// ACK berjalan balik melalui relay.
// - Kalau target = node ini -> ACK dikonsumsi.
// - Kalau bukan target -> diteruskan.
// - Gateway tidak meneruskan ACK yang kembali.
// =====================================================

void startFieldAccessPoint() {

  if (
    NODE_ROLE !=
    ROLE_FIELD
  ) {

    return;
  }


  WiFi.mode(
    WIFI_AP
  );


  WiFi.setSleep(
    false
  );


  if (
    strlen(
      AP_PASSWORD
    ) >=
    8
  ) {

    WiFi.softAP(
      AP_SSID,
      AP_PASSWORD,
      1,
      0,
      MAX_CLIENTS
    );

  } else {

    WiFi.softAP(
      AP_SSID,
      NULL,
      1,
      0,
      MAX_CLIENTS
    );
  }

  // Tunggu AP/DHCP aktif sebelum meminta DHCP Captive Portal.
  delay(500);
#if ESP_ARDUINO_VERSION >= ESP_ARDUINO_VERSION_VAL(3, 3, 0)
  bool dhcpPortalOK = WiFi.AP.enableDhcpCaptivePortal();
#else
  bool dhcpPortalOK = false;  // Older cores still use DNS and HTTP captive probes.
#endif
  Serial.println(dhcpPortalOK ? "[DHCP CAPTIVE] ENABLED" : "[DHCP CAPTIVE] FAILED (HTTP probe masih aktif)");

  Serial.print(
    "[AP] Aktif: "
  );


  Serial.println(
    AP_SSID
  );


  Serial.print(
    "[AP] IP: "
  );


  Serial.println(
    WiFi.softAPIP()
  );
}


// =====================================================
// WEB HANDLERS
// =====================================================

// Halaman HTTP hanya untuk captive portal; SOS/GPS hanya melalui HTTPS.
String getHTTPEntryPage() {
  // Portal only gives guidance. HTTPS SOS stays in the existing browser service.
  // The address below is intentionally plain text, never a hyperlink.
  return R"LENTERAHTTP(<!DOCTYPE html>
<html lang="id"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Cache-Control" content="no-store">
<title>LENTERA SOS - Panduan Darurat</title>
<style>
*{box-sizing:border-box}body{margin:0;min-height:100vh;background:#0a2144;color:#17253e;font-family:Arial,Helvetica,sans-serif;padding:17px}
.card{width:100%;max-width:430px;margin:12px auto;background:#fff;border-radius:23px;padding:23px 21px;box-shadow:0 12px 35px #0003}
.top{text-align:center}.mark{font-size:38px;line-height:1}.top h1{font-size:30px;margin:8px 0;color:#102447}
.connected{margin:14px 0 17px;color:#08795c;background:#edf9f4;border-radius:12px;padding:12px;font-size:13px;font-weight:700;text-align:center}
h2{font-size:21px;margin:9px 0 10px;color:#102447}p{line-height:1.48;margin:8px 0 13px;font-size:14px}
.instruction{font-weight:700;margin-top:18px}
button{border:0;border-radius:13px;background:#0a2144;color:white;padding:16px;width:100%;font-size:16px;font-weight:800;cursor:pointer}
.note{font-size:12px;color:#526078;margin:12px 0;line-height:1.5}.important{background:#fff5df;border:1px solid #ecc26b;border-radius:13px;padding:12px 13px;margin-top:13px;font-size:13px;line-height:1.5}
.important strong{color:#825000}.closing{text-align:center;font-size:12px;color:#64748b;margin-top:14px;line-height:1.5}
</style></head><body><main class="card">
<div class="top"><div class="mark">&#128680;</div><h1>LENTERA SOS</h1></div>
<div class="connected">&#128246; Terhubung ke jaringan bantuan</div>
<h2>Butuh pertolongan?</h2>
<p>Jauhi tempat berbahaya dan cari lokasi yang aman jika memungkinkan.</p>
<p class="instruction">Untuk meminta bantuan:</p>
<p>Tekan <b>SALIN ALAMAT lentera-sos.com</b>, lalu buka aplikasi internet di HP Anda (Safari, Google, Chrome, dan lainnya).</p>
<button id="copy" type="button" onclick="copyAddress()">SALIN ALAMAT</button>
<p class="note">Pastikan HP tetap terhubung ke Wi-Fi <b>LENTERA-SOS</b> sampai permintaan bantuan selesai dikirim.</p>
<div class="important" id="important" style="display:none"><strong>PENTING</strong><div>Alamat sudah tersalin. Tutup halaman ini menggunakan tombol tutup atau kembali pada HP Anda. Jika muncul pilihan koneksi, pilih opsi untuk <b>tetap terhubung meskipun tanpa internet</b> agar Wi-Fi LENTERA-SOS tidak terputus.</div></div>
<div class="closing" id="closing" style="display:none"></div>
</main><script>
function copiedSuccessfully(){
 var btn=document.getElementById('copy');btn.disabled=true;
 btn.textContent='✓ ALAMAT DISALIN';
 document.getElementById('important').style.display='block';
 document.getElementById('closing').style.display='none';
}
function copyAddress(){
 var value='https://lentera-sos.com/';
 var box=document.createElement('textarea');box.value=value;
 box.setAttribute('readonly','');box.style.position='fixed';box.style.top='0';box.style.left='0';box.style.opacity='0';
 document.body.appendChild(box);box.focus();box.select();box.setSelectionRange(0,value.length);
 var ok=false;try{ok=document.execCommand('copy');}catch(e){}document.body.removeChild(box);
 if(ok){copiedSuccessfully();return;}
 if(navigator.clipboard&&navigator.clipboard.writeText){
   navigator.clipboard.writeText(value).then(copiedSuccessfully).catch(copyFailed);
 }else{copyFailed();}
}
function copyFailed(){
 var el=document.getElementById('closing');el.style.display='block';el.textContent='Penyalinan otomatis tidak tersedia. Ketik lentera-sos.com secara manual di browser HP.';
 document.getElementById('copy').textContent='COBA SALIN LAGI';
}
</script></body></html>)LENTERAHTTP";
}

// DIAGNOSTIK SEMENTARA: hanya membuktikan klik HTTP diterima ESP32.
// Tidak mengubah LoRa, payload SOS, backend, ataupun ACK.
void handleClickTest() {
  Serial.print("[CLICK TEST] HTTP request diterima dari ");
  Serial.println(server.client().remoteIP());
  sendNoCacheHeaders();
  server.send(200, "text/html; charset=utf-8", R"LENTERATEST(<!DOCTYPE html>
<html lang="id"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>LENTERA - Tes Klik</title></head>
<body style="font-family:Arial;text-align:center;padding:32px">
<h2>TES 1 BERHASIL</h2>
<p>ESP32 menerima klik HTTP. Tombol berfungsi.</p>
<p>TES 2: coba buka HTTPS menggunakan tautan berikut.</p>
<p><a style="display:block;background:#d90429;color:white;padding:22px;border-radius:14px;text-decoration:none" href="https://lentera-sos.com/">COBA BUKA HTTPS</a></p>
<p>Jika setelah diklik tetap di sini, kemungkinan navigasi HTTPS dibatasi atau sertifikat tidak dipercaya.</p>
<p><a href="/">Kembali</a></p>
</body></html>)LENTERATEST");
}

void handleRoot() {
  // Tidak bergantung pada IP/MAC saat captive assistant membuka halaman.
  sendNoCacheHeaders();
  server.send(200,"text/html; charset=utf-8",getHTTPEntryPage());
}

void handleUpdate() {
  sendNoCacheHeaders();
  server.sendHeader("Location","https://lentera-sos.com/update",true);
  server.send(302,"text/plain","Buka halaman HTTPS LENTERA untuk memperbarui laporan.");
}

// =====================================================
// SEND SOS HANDLER
// =====================================================

void handleSendSOS() {

  uint8_t clientMac[6];

  String reportId;


  if (
    !getCurrentClientIdentity(
      clientMac,
      reportId
    )
  ) {

    sendNoCacheHeaders();


    server.send(
      503,
      "text/html",
      getIdentityErrorPage()
    );


    return;
  }


  int victimCount;
  if (!parseVictimCount(server.arg("jumlah"), victimCount)) {
    sendNoCacheHeaders();
    server.send(400, "text/plain; charset=utf-8", "Jumlah korban harus bilangan bulat 1..2147483647.");
    return;
  }

  bool updateMode =
    server.hasArg(
      "is_update"
    ) &&
    server.arg(
      "is_update"
    ) ==
    "1";


  String latitude =
    "";


  String longitude =
    "";


  String accuracy =
    "";


  String locationSource =
    "UNAVAILABLE";


  if (
    server.hasArg(
      "latitude"
    )
  ) {

    latitude =
      server.arg(
        "latitude"
      );


    latitude.trim();
  }


  if (
    server.hasArg(
      "longitude"
    )
  ) {

    longitude =
      server.arg(
        "longitude"
      );


    longitude.trim();
  }


  if (
    server.hasArg(
      "accuracy"
    )
  ) {

    accuracy =
      server.arg(
        "accuracy"
      );


    accuracy.trim();
  }


  if (
    server.hasArg(
      "location_source"
    )
  ) {

    locationSource =
      server.arg(
        "location_source"
      );


    locationSource.trim();
  }


  bool locationAvailable =
    false;


  if (
    locationSource ==
    "PHONE_GPS"
  ) {

    double latValue;

    double lonValue;

    double accValue;


    bool validLat =
      parseNumber(
        latitude,
        latValue
      );


    bool validLon =
      parseNumber(
        longitude,
        lonValue
      );


    bool validAcc =
      parseNumber(
        accuracy,
        accValue
      );


    if (
      validLat &&
      validLon &&
      validAcc &&
      latValue >=
        -90.0 &&
      latValue <=
        90.0 &&
      lonValue >=
        -180.0 &&
      lonValue <=
        180.0 &&
      accValue >= 0.0 && accValue <= 1e9
    ) {

      locationAvailable =
        true;


      latitude =
        String(
          latValue,
          6
        );


      longitude =
        String(
          lonValue,
          6
        );


      accuracy =
        String(
          accValue,
          1
        );
    }
  }


  String ackToken =
    "";


  bool success =
    sendSOSViaLoRa(
      reportId,
      victimCount,
      locationAvailable,
      latitude,
      longitude,
      accuracy,
      ackToken
    );


  sendNoCacheHeaders();


  server.send(
    200,
    "text/html",
    getResultPage(
      success,
      reportId,
      victimCount,
      updateMode,
      locationAvailable,
      latitude,
      longitude,
      accuracy,
      ackToken
    )
  );


  if (
    success
  ) {

    printStatus(
      "SOS",
      "Masuk antrean radio; menunggu ACK backend"
    );


    // Sesi dibiarkan aktif agar status ACK dan pembaruan tidak terputus.

  } else {

    printStatus(
      "SOS",
      "Gagal dikirim"
    );
  }
}


// =====================================================
// ACK STATUS ENDPOINT
//
// Dipanggil halaman hasil setiap ~700 ms.
// Tidak membutuhkan internet.
// =====================================================

void handleAckStatus() {

  String messageId =
    "";


  String token =
    "";


  if (
    server.hasArg(
      "message_id"
    )
  ) {

    messageId =
      server.arg(
        "message_id"
      );
  }


  if (
    server.hasArg(
      "token"
    )
  ) {

    token =
      server.arg(
        "token"
      );
  }


  sendNoCacheHeaders();


  server.send(
    200,
    "application/json",
    getAckStatusJson(
      messageId,
      token
    )
  );
}


// =====================================================
// CAPTIVE PORTAL REDIRECT
//
// Dipakai oleh Android, iOS, Windows, dan request lain
// yang dipakai OS untuk mengecek apakah jaringan punya
// akses internet.
//
// PENTING:
// - Selalu redirect ke URL HTTP ABSOLUT ESP32.
// - Jangan bergantung pada identifikasi MAC di route probe.
//   Identifikasi perangkat dilakukan saat halaman "/" dibuka.
// - Body redirect tidak dikosongkan agar lebih kompatibel.
// =====================================================

// Probe iOS / Android / Windows: balas halaman captive langsung.
// Tidak menunggu redirect, tidak memerlukan identifikasi MAC,
// tidak menyentuh HTTPS, GPS, LoRa, backend, atau ACK.
void sendCaptiveGuideDirect(const char* probeType) {
  Serial.print("[PORTAL] ");
  Serial.print(probeType);
  Serial.print(" probe: ");
  Serial.print(server.uri());
  Serial.println(" -> HTTP 200 panduan langsung");
  sendNoCacheHeaders();
  server.sendHeader("Connection", "close");
  server.send(200, "text/html; charset=utf-8", getHTTPEntryPage());
}

void handleCaptivePortal() {

  String portalUrl =
    "http://" +
    WiFi.softAPIP().toString() +
    "/";


  Serial.print(
    "[PORTAL] Probe: "
  );


  Serial.print(
    server.hostHeader()
  );


  Serial.print(
    server.uri()
  );


  Serial.print(
    " -> "
  );


  Serial.println(
    portalUrl
  );


  sendNoCacheHeaders();


  server.sendHeader(
    "Location",
    portalUrl,
    true
  );


  server.sendHeader(
    "Connection",
    "close"
  );


  String body =
    String(
      "<!DOCTYPE html>"
      "<html>"
      "<head>"
      "<meta charset='UTF-8'>"
      "<meta name='viewport' "
      "content='width=device-width,initial-scale=1.0'>"
      "<title>LENTERA SOS</title>"
      "</head>"
      "<body>"
      "<p>Membuka LENTERA SOS...</p>"
      "<p><a href='"
    ) +
    portalUrl +
    "'>Buka portal</a></p>"
    "</body>"
    "</html>";


  server.send(
    302,
    "text/html",
    body
  );
}

void handleAndroidCaptivePortal() {

  String portalUrl =
    "http://" +
    WiFi.softAPIP().toString() +
    "/";


  Serial.print(
    "[ANDROID] Captive portal probe: "
  );


  Serial.println(
    server.uri()
  );


  // Android mengharapkan HTTP 204 jika internet tersedia.
  // Dengan sengaja kita balas 200 HTML sehingga Android
  // mendeteksi jaringan sebagai captive portal.
  //
  // Halaman probe TIDAK langsung memakai identitas MAC.
  // Setelah captive webview dibuka, browser diarahkan
  // ke root ESP32 dengan sedikit delay agar tabel IP/MAC
  // sudah siap.
  sendNoCacheHeaders();


  server.sendHeader(
    "Connection",
    "close"
  );


  String body =
    String(
      "<!DOCTYPE html>"
      "<html lang='id'>"
      "<head>"
      "<meta charset='UTF-8'>"
      "<meta name='viewport' "
      "content='width=device-width,initial-scale=1.0'>"
      "<meta http-equiv='refresh' content='1;url="
    ) +
    portalUrl +
    "'>"
    "<title>LENTERA SOS</title>"
    "</head>"
    "<body style='font-family:Arial,sans-serif;"
    "padding:24px;text-align:center'>"
    "<h2>LENTERA SOS</h2>"
    "<p>Membuka portal darurat...</p>"
    "<p><a href='" +
    portalUrl +
    "'>Buka LENTERA SOS</a></p>"
    "<script>"
    "setTimeout(function(){"
    "window.location.replace('" +
    portalUrl +
    "');"
    "},500);"
    "</script>"
    "</body>"
    "</html>";


  server.send(
    200,
    "text/html",
    body
  );
}


// =====================================================
// NOT FOUND
// =====================================================

void handleNotFound() {

  handleCaptivePortal();
}

// =====================================================
// HTTPS LENTERA FIELD: same SOS/ACK and LoRa business logic
// HTTP: captive portal guidance only
// HTTPS: GPS-enabled form, SOS, updates and ACK
// =====================================================


IPAddress httpsClientIP(httpd_req_t* req) {
  IPAddress ip(0, 0, 0, 0);

  int fd = httpd_req_to_sockfd(req);
  if (fd < 0) return ip;

  struct sockaddr_storage addr = {};
  socklen_t len = sizeof(addr);

  if (getpeername(fd, (struct sockaddr*)&addr, &len) != 0) {
    Serial.println("[HTTPS DEBUG] getpeername gagal");
    return ip;
  }

  Serial.printf("[HTTPS DEBUG] family=%d\n", addr.ss_family);

  if (addr.ss_family == AF_INET) {
    const struct sockaddr_in* a =
      (const struct sockaddr_in*)&addr;

    const uint8_t* b =
      (const uint8_t*)&a->sin_addr.s_addr;

    ip = IPAddress(b[0], b[1], b[2], b[3]);

  } else if (addr.ss_family == AF_INET6) {
    const struct sockaddr_in6* a =
      (const struct sockaddr_in6*)&addr;

    const uint8_t* b =
      (const uint8_t*)&a->sin6_addr;

    // IPv4-mapped IPv6: ::ffff:192.168.4.x
    bool mapped = true;

    for (int i = 0; i < 10; i++) {
      if (b[i] != 0) {
        mapped = false;
        break;
      }
    }

    if (b[10] != 0xFF || b[11] != 0xFF) {
      mapped = false;
    }

    if (mapped) {
      ip = IPAddress(b[12], b[13], b[14], b[15]);
    } else {
      Serial.println(
        "[HTTPS DEBUG] Native IPv6, bukan IPv4-mapped"
      );
    }
  }

  Serial.print("[HTTPS DEBUG] Client IP=");
  Serial.println(ip);

  return ip;
}

void httpsReply(
  httpd_req_t* req,
  const char* code,
  const char* mime,
  const String& content
) {
  httpd_resp_set_status(req, code);
  httpd_resp_set_type(req, mime);
  httpd_resp_set_hdr(
    req,
    "Cache-Control",
    "no-store, no-cache, must-revalidate, max-age=0"
  );
  httpd_resp_send(
    req,
    content.c_str(),
    content.length()
  );
}

String httpsUrlDecode(const String& input) {
  String result;
  result.reserve(input.length());

  for (size_t i = 0; i < input.length(); i++) {
    char c = input[i];

    if (c == '+') {
      result += ' ';
    } else if (c == '%' && i + 2 < input.length()) {
      char x = input[i + 1];
      char y = input[i + 2];

      int hi =
        (x >= '0' && x <= '9') ? x - '0' :
        (x >= 'A' && x <= 'F') ? x - 'A' + 10 :
        (x >= 'a' && x <= 'f') ? x - 'a' + 10 : -1;

      int lo =
        (y >= '0' && y <= '9') ? y - '0' :
        (y >= 'A' && y <= 'F') ? y - 'A' + 10 :
        (y >= 'a' && y <= 'f') ? y - 'a' + 10 : -1;

      if (hi >= 0 && lo >= 0) {
        result += (char)(hi * 16 + lo);
        i += 2;
      } else {
        result += c;
      }
    } else {
      result += c;
    }
  }

  return result;
}

String httpsFormValue(const String& body,const String& key){
  String pattern=key+"=";
  int start=0;
  while(start<(int)body.length()){
    int end=body.indexOf('&',start);
    if(end<0)end=body.length();
    if(body.startsWith(pattern,start))return httpsUrlDecode(body.substring(start+pattern.length(),end));
    start=end+1;
  }
  return "";
}

bool httpsReadBody(httpd_req_t* req,String& body){
  // Guard against very large POST bodies exhausting ESP32 heap.
  if(req->content_len<=0 || req->content_len>2048)return false;
  body.reserve(req->content_len+1);
  int remaining=req->content_len;
  char buffer[256];
  while(remaining>0){
    int want=remaining<(int)sizeof(buffer)?remaining:sizeof(buffer);
    int n=httpd_req_recv(req,buffer,want);
    if(n==HTTPD_SOCK_ERR_TIMEOUT)continue;
    if(n<=0)return false;
    body.concat(buffer,n);
    remaining-=n;
  }
  return true;
}

esp_err_t handleHTTPSRoot(httpd_req_t* req){
  uint8_t mac[6];String reportId;
  if(!getClientIdentityFromIP(httpsClientIP(req),mac,reportId)){
    Serial.print("[HTTPS] IP/MAC belum cocok: "); Serial.println(httpsClientIP(req));
    httpsReply(req,"503 Service Unavailable","text/html",getIdentityErrorPage());
    return ESP_OK;
  }
  httpsReply(req,"200 OK","text/html",getPortalPage(reportId,false));
  return ESP_OK;
}

esp_err_t handleHTTPSUpdate(httpd_req_t* req){
  uint8_t mac[6];String reportId;
  if(!getClientIdentityFromIP(httpsClientIP(req),mac,reportId)){
    Serial.print("[HTTPS] IP/MAC belum cocok: "); Serial.println(httpsClientIP(req));
    httpsReply(req,"503 Service Unavailable","text/html",getIdentityErrorPage());
    return ESP_OK;
  }
  httpsReply(req,"200 OK","text/html",getPortalPage(reportId,true));
  return ESP_OK;
}

esp_err_t handleHTTPSAck(httpd_req_t* req){
  char query[256]={0};char mid[80]={0},token[32]={0};
  if(httpd_req_get_url_query_str(req,query,sizeof(query))==ESP_OK){
    httpd_query_key_value(query,"message_id",mid,sizeof(mid));
    httpd_query_key_value(query,"token",token,sizeof(token));
  }
  httpsReply(req,"200 OK","application/json",getAckStatusJson(String(mid),String(token)));
  return ESP_OK;
}

esp_err_t handleHTTPSSendSOS(httpd_req_t* req){
  uint8_t mac[6];String reportId;
  if(!getClientIdentityFromIP(httpsClientIP(req),mac,reportId)){
    Serial.print("[HTTPS] IP/MAC belum cocok: "); Serial.println(httpsClientIP(req));
    httpsReply(req,"503 Service Unavailable","text/html",getIdentityErrorPage());
    return ESP_OK;
  }
  String body;
  if(!httpsReadBody(req,body)){
    httpsReply(req,"400 Bad Request","text/plain","Data SOS tidak valid");
    return ESP_OK;
  }
  int victimCount;
  if(!parseVictimCount(httpsFormValue(body,"jumlah"),victimCount)){
    httpsReply(req,"400 Bad Request","text/plain","Jumlah korban tidak valid");
    return ESP_OK;
  }
  bool updateMode=httpsFormValue(body,"is_update")=="1";
  String lat=httpsFormValue(body,"latitude");
  String lon=httpsFormValue(body,"longitude");
  String accuracy=httpsFormValue(body,"accuracy");
  String source=httpsFormValue(body,"location_source");
  lat.trim();lon.trim();accuracy.trim();
  bool locationAvailable=false;
  if(source=="PHONE_GPS"){
    double a,b,c;
    if(parseNumber(lat,a)&&parseNumber(lon,b)&&parseNumber(accuracy,c)
      &&a>=-90.0&&a<=90.0&&b>=-180.0&&b<=180.0&&c>=0.0&&c<=1e9){
      locationAvailable=true;
      lat=String(a,6);lon=String(b,6);accuracy=String(c,1);
    }
  }
  String ackToken;
  bool success=sendSOSViaLoRa(reportId,victimCount,locationAvailable,lat,lon,accuracy,ackToken);
  httpsReply(req,"200 OK","text/html",getResultPage(success,reportId,victimCount,updateMode,locationAvailable,lat,lon,accuracy,ackToken));
  if(success){
    printStatus("SOS","Masuk antrean radio via HTTPS; menunggu ACK backend");
    // Jangan deauth klien setelah SOS. Tunggu ACK dan pembaruan.
  }else printStatus("SOS","Gagal dikirim melalui HTTPS");
  return ESP_OK;
}

void startLenteraHTTPS(){
  if(NODE_ROLE!=ROLE_FIELD || httpsServer!=nullptr)return;
  httpd_ssl_config_t config=HTTPD_SSL_CONFIG_DEFAULT();
  config.port_secure=443;
  config.httpd.stack_size=8192;
  config.httpd.max_uri_handlers=8;
  config.httpd.max_open_sockets=2;
  config.httpd.keep_alive_enable=false;
  config.httpd.recv_wait_timeout=5;
  config.httpd.send_wait_timeout=5;
  config.httpd.lru_purge_enable=true;
  config.servercert=(const uint8_t*)LENTERA_CERT;
  config.servercert_len=sizeof(LENTERA_CERT);
  config.prvtkey_pem=(const uint8_t*)LENTERA_KEY;
  config.prvtkey_len=sizeof(LENTERA_KEY);
  if(httpd_ssl_start(&httpsServer,&config)!=ESP_OK){
    Serial.println("[HTTPS] FAILED");
    httpsServer=nullptr;
    return;
  }
  httpd_uri_t root={};
  root.uri="/";root.method=HTTP_GET;root.handler=handleHTTPSRoot;
  httpd_uri_t update={};
  update.uri="/update";update.method=HTTP_GET;update.handler=handleHTTPSUpdate;
  httpd_uri_t send={};
  send.uri="/sendSOS";send.method=HTTP_POST;send.handler=handleHTTPSSendSOS;
  httpd_uri_t ack={};
  ack.uri="/ackStatus";ack.method=HTTP_GET;ack.handler=handleHTTPSAck;
  bool ok=(httpd_register_uri_handler(httpsServer,&root)==ESP_OK);
  ok=(httpd_register_uri_handler(httpsServer,&update)==ESP_OK)&&ok;
  ok=(httpd_register_uri_handler(httpsServer,&send)==ESP_OK)&&ok;
  ok=(httpd_register_uri_handler(httpsServer,&ack)==ESP_OK)&&ok;
  Serial.println(ok?"[HTTPS] READY - SOS GPS ACK":"[HTTPS] HANDLER REGISTER FAILED");
}

// =====================================================
// ROUTES
// =====================================================

void setupRoutes() {

  // Diagnostic click-test disabled in production portal.

  server.on(
    "/",
    HTTP_GET,
    handleRoot
  );


  // Cadangan darurat HTTP tanpa GPS asli saat CNA menolak HTTPS.
  // HTTP SOS submission disabled: all SOS processing is via HTTPS.


  server.on(
    "/update",
    HTTP_GET,
    handleUpdate
  );


  server.on(
    "/ackStatus",
    HTTP_GET,
    handleAckStatus
  );


  // Android
  server.on(
    "/generate_204",
    HTTP_ANY,
    handleAndroidCaptivePortal
  );


  server.on(
    "/gen_204",
    HTTP_ANY,
    handleAndroidCaptivePortal
  );


  server.on(
    "/generate_204/",
    HTTP_ANY,
    handleAndroidCaptivePortal
  );


  server.on(
    "/gen_204/",
    HTTP_ANY,
    handleAndroidCaptivePortal
  );


  server.on(
    "/connectivitycheck_204",
    HTTP_ANY,
    handleAndroidCaptivePortal
  );


  server.on(
    "/check_network_status.txt",
    HTTP_ANY,
    handleAndroidCaptivePortal
  );


  server.on(
    "/mobile/status.php",
    HTTP_ANY,
    handleAndroidCaptivePortal
  );


  server.on(
    "/connectivitycheck",
    HTTP_ANY,
    handleAndroidCaptivePortal
  );


  // Apple / iOS / macOS
  server.on(
    "/hotspot-detect.html",
    HTTP_ANY,
    handleCaptivePortal
  );


  server.on(
    "/hotspotdetect.html",
    HTTP_ANY,
    handleCaptivePortal
  );


  server.on(
    "/library/test/success.html",
    HTTP_ANY,
    handleCaptivePortal
  );


  server.on(
    "/success.html",
    HTTP_ANY,
    handleCaptivePortal
  );


  // Windows
  server.on(
    "/ncsi.txt",
    HTTP_ANY,
    handleCaptivePortal
  );


  server.on(
    "/connecttest.txt",
    HTTP_ANY,
    handleCaptivePortal
  );


  server.on(
    "/redirect",
    HTTP_ANY,
    handleCaptivePortal
  );


  server.on(
    "/canonical.html",
    HTTP_ANY,
    handleCaptivePortal
  );


  server.on(
    "/success.txt",
    HTTP_ANY,
    handleCaptivePortal
  );


  server.on(
    "/fwlink",
    HTTP_ANY,
    handleCaptivePortal
  );


  server.on(
    "/wpad.dat",
    HTTP_ANY,
    handleCaptivePortal
  );


  server.onNotFound(
    handleNotFound
  );
}


// =====================================================
// NETWORK TASK
// CORE 0
// =====================================================

void networkTask(
  void* parameter
) {

  Serial.print(
    "[RTOS] Network task Core "
  );


  Serial.println(
    xPortGetCoreID()
  );


  for (;;) {

    if (
      NODE_ROLE ==
      ROLE_FIELD
    ) {

      dnsServer.processNextRequest();

      server.handleClient();


    } else {

      maintainPoskoWiFi();

      processBackendQueue();
    }


    vTaskDelay(
      pdMS_TO_TICKS(
        2
      )
    );
  }
}


// =====================================================
// SETUP LORA
// =====================================================

bool setupLoRa() {

  SPI.begin(
    18,
    19,
    23,
    LORA_SS
  );


  LoRa.setPins(
    LORA_SS,
    LORA_RST,
    LORA_DIO0
  );


  if (
    !LoRa.begin(
      LORA_FREQUENCY
    )
  ) {

    printStatus(
      "LoRa",
      "INIT FAILED"
    );


    return false;
  }


  LoRa.setSyncWord(
    LORA_SYNC_WORD
  );


  LoRa.setSpreadingFactor(
    LORA_SF
  );


  LoRa.setSignalBandwidth(
    LORA_BW
  );


  LoRa.setCodingRate4(
    LORA_CR
  );


  LoRa.setPreambleLength(
    LORA_PREAMBLE
  );


  LoRa.disableCrc();


  LoRa.setTxPower(
    LORA_TX_POWER
  );


  printStatus(
    "LoRa",
    "TX + RX ready"
  );


  return true;
}


// =====================================================
// SETUP
// =====================================================

void setup() {

  Serial.begin(
    115200
  );


  delay(
    1000
  );


  Serial.println();


  Serial.println(
    "=============================="
  );


  Serial.println(
    "LENTERA UNIFIED TRANSCEIVER"
  );


  Serial.println(
    "=============================="
  );


  Serial.println("[BUILD] LENTERA FIELD/Pi reference-aligned v2 - queued TX, strict ACK");

  deviceId =
    getESP32DeviceId();


  localNodeId =
    "NODE-" +
    deviceId;


  // ===================================================
  // ROLE NODE INI: FIELD / RELAY
  //
  // Firmware ini khusus node lapangan.
  // Begitu ESP32 mendapat power, node langsung menjadi FIELD / RELAY
  // sehingga WiFi LENTERA-SOS dapat dinyalakan otomatis.
  // ===================================================

  NODE_ROLE =
    ROLE_FIELD;


  Serial.print(
    "[DEVICE] Node: "
  );


  Serial.println(
    localNodeId
  );


  Serial.print(
    "[DEVICE] Role: "
  );


  if (
    NODE_ROLE ==
    ROLE_FIELD
  ) {

    Serial.println(
      "FIELD / RELAY"
    );

  } else {

    Serial.println(
      "GATEWAY / POSKO"
    );
  }


  // ===================================================
  // CREATE RTOS OBJECTS
  // ===================================================

  radioTxQueue =
    xQueueCreate(
      8,
      sizeof(
        RadioTxRequest
      )
    );


  backendQueue =
    xQueueCreate(
      MAX_BACKEND_QUEUE,
      sizeof(
        BackendQueueItem
      )
    );


  


  


  ackStateMutex =
    xSemaphoreCreateMutex();


  if (
    radioTxQueue ==
      nullptr ||
    backendQueue ==
      nullptr ||
    ackStateMutex ==
      nullptr
  ) {

    printStatus(
      "RTOS",
      "Gagal membuat queue/semaphore"
    );


    while (
      true
    ) {

      delay(
        1000
      );
    }
  }


  // ===================================================
  // WIFI FIELD START FIRST
  //
  // WiFi dinyalakan SEBELUM inisialisasi LoRa.
  // Jadi begitu ESP32 mendapat power dari baterai/boost converter,
  // LENTERA-SOS langsung dipancarkan tanpa menunggu LoRa berhasil init.
  // ===================================================

  startFieldAccessPoint();


  // Wildcard DNS untuk captive portal offline.
  // Semua hostname yang dicoba HP diarahkan ke ESP32.
  dnsServer.setErrorReplyCode(
    DNSReplyCode::NoError
  );


  dnsServer.start(
    DNS_PORT,
    "*",
    WiFi.softAPIP()
  );


  setupRoutes();


  server.begin();

  // PRIORITAS: tangani DNS dan HTTP segera setelah portal aktif.
  // Jangan menunggu inisialisasi TLS/LoRa sebelum HP mendapat jawaban.
  xTaskCreatePinnedToCore(
    networkTask,
    "LENTERA_NETWORK",
    8192,
    nullptr,
    1,
    &networkTaskHandle,
    0
  );

  if (networkTaskHandle == nullptr) printStatus("RTOS", "Network task gagal dibuat");
  printStatus("Portal", "DNS + HTTP ready");

  // HTTPS tetap berjalan dengan konfigurasi dan handler yang sama.
  startLenteraHTTPS();


  // ===================================================
  // LORA START AFTER WIFI
  //
  // Jika LoRa gagal init, LENTERA-SOS dan captive portal tetap hidup.
  // ===================================================

  loraReady =
    setupLoRa();


  if (
    !loraReady
  ) {

    printStatus(
      "LoRa",
      "INIT gagal - LENTERA-SOS tetap aktif"
    );
  }


  // ===================================================
  // CREATE TASKS
  // ===================================================

  // Network task sudah dibuat sebelum HTTPS dan LoRa.
  xTaskCreatePinnedToCore(
    radioTask,
    "LENTERA_RADIO",
    8192,
    nullptr,
    2,
    &radioTaskHandle,
    1
  );


  Serial.println();


  if (radioTaskHandle == nullptr) {
    loraReady = false;
    printStatus("RTOS", "Radio task gagal dibuat; SOS dinonaktifkan");
  }
  printStatus(
    "RTOS",
    "Core 0 = Network"
  );


  printStatus(
    "RTOS",
    "Core 1 = LoRa TX/RX"
  );


  printStatus(
    "STATUS",
    "Sistem siap"
  );
}


// =====================================================
// LOOP
//
// Semua pekerjaan dilakukan FreeRTOS task.
// =====================================================

void loop() {

  delay(
    1000
  );

static unsigned long lastHeapCheck = 0;

if (millis() - lastHeapCheck >= 3000) {
  lastHeapCheck = millis();

  Serial.printf(
    "[MEMORY] Free=%u | Largest=%u\n",
    ESP.getFreeHeap(),
    ESP.getMaxAllocHeap()
  );
}
}