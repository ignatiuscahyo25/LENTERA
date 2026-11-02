#!/usr/bin/env python3
"""LENTERA Raspberry Pi 4: SX1278/Ra-02 SPI receiver and backend bridge.

Only run after confirming wiring and fitting a 433 MHz antenna.
Dependencies: spidev, RPi.GPIO (on compatible Raspberry Pi OS).
Backend Python stays on http://127.0.0.1:4000/api/reports.
"""
import json
import time

spidev = None
GPIO = None

SPI_BUS = 0
SPI_DEVICE = 0       # GPIO8 / physical 24 / CE0
RESET_BCM = 25       # physical 22
DIO0_BCM = 24        # physical 18; wired but reception uses IRQ polling
FREQUENCY_HZ = 433_000_000
SYNC_WORD = 0x34
SPREADING_FACTOR = 7
BANDWIDTH_BITS = 0x70  # 125 kHz on SX127x
CODING_RATE_BITS = 0x02  # 4/5, RegModemConfig1 CR bits = 001
PREAMBLE_LEN = 8
TX_POWER_DBM = 17
POLL_INTERVAL_S = 0.01
ACK_DELAY_S = 0.08

# Semtech SX127x registers
FIFO = 0x00
OP_MODE = 0x01
FRF_MSB = 0x06
PA_CONFIG = 0x09
LNA = 0x0C
FIFO_ADDR_PTR = 0x0D
FIFO_TX_BASE_ADDR = 0x0E
FIFO_RX_BASE_ADDR = 0x0F
FIFO_RX_CURRENT_ADDR = 0x10
IRQ_FLAGS_MASK = 0x11
IRQ_FLAGS = 0x12
RX_NB_BYTES = 0x13
PKT_SNR_VALUE = 0x19
PKT_RSSI_VALUE = 0x1A
MODEM_CONFIG1 = 0x1D
MODEM_CONFIG2 = 0x1E
PREAMBLE_MSB = 0x20
PREAMBLE_LSB = 0x21
PAYLOAD_LENGTH = 0x22
MODEM_CONFIG3 = 0x26
SYNC_WORD_REG = 0x39
DIO_MAPPING1 = 0x40
VERSION = 0x42
PA_DAC = 0x4D

LONG_RANGE = 0x80
SLEEP = 0x00
STANDBY = 0x01
TX = 0x03
RX_CONTINUOUS = 0x05
RX_DONE = 0x40
PAYLOAD_CRC_ERROR = 0x20
TX_DONE = 0x08

spi = None


def write_reg(addr, value):
    spi.xfer2([addr | 0x80, value & 0xFF])


def read_reg(addr):
    return spi.xfer2([addr & 0x7F, 0x00])[1]


def read_fifo(count):
    return bytes(spi.xfer2([FIFO] + [0] * count)[1:])


def set_mode(mode):
    write_reg(OP_MODE, LONG_RANGE | mode)
    if mode in (SLEEP, STANDBY):
        time.sleep(0.01)


def start_rx():
    set_mode(STANDBY)
    write_reg(FIFO_ADDR_PTR, 0)
    write_reg(IRQ_FLAGS, 0xFF)
    set_mode(RX_CONTINUOUS)


def setup_radio():
    global spi, spidev, GPIO
    import spidev
    import RPi.GPIO as GPIO
    GPIO.setwarnings(False)
    GPIO.setmode(GPIO.BCM)
    GPIO.setup(RESET_BCM, GPIO.OUT, initial=GPIO.HIGH)
    GPIO.setup(DIO0_BCM, GPIO.IN)
    GPIO.output(RESET_BCM, GPIO.LOW)
    time.sleep(0.02)
    GPIO.output(RESET_BCM, GPIO.HIGH)
    time.sleep(0.05)

    spi = spidev.SpiDev()
    spi.open(SPI_BUS, SPI_DEVICE)
    spi.max_speed_hz = 500_000
    spi.mode = 0
    version = read_reg(VERSION)
    if version != 0x12:
        raise RuntimeError(
            f"SX1278 tidak terbaca (RegVersion=0x{version:02X}, perlu 0x12). "
            "Periksa 3.3V, GND, NSS, MOSI, MISO, SCK, dan RST."
        )
    set_mode(SLEEP)
    frf = int(FREQUENCY_HZ * (1 << 19) / 32_000_000)
    write_reg(FRF_MSB, (frf >> 16) & 0xFF)
    write_reg(FRF_MSB + 1, (frf >> 8) & 0xFF)
    write_reg(FRF_MSB + 2, frf & 0xFF)
    write_reg(FIFO_TX_BASE_ADDR, 0)
    write_reg(FIFO_RX_BASE_ADDR, 0)
    write_reg(LNA, read_reg(LNA) | 0x03)
    write_reg(MODEM_CONFIG1, BANDWIDTH_BITS | CODING_RATE_BITS | 0x00)
    write_reg(MODEM_CONFIG2, (SPREADING_FACTOR << 4))  # CRC off
    write_reg(MODEM_CONFIG3, 0x04)  # AGC auto on, low data rate optimize off
    write_reg(PREAMBLE_MSB, 0)
    write_reg(PREAMBLE_LSB, PREAMBLE_LEN)
    write_reg(SYNC_WORD_REG, SYNC_WORD)
    write_reg(DIO_MAPPING1, 0x00)
    write_reg(IRQ_FLAGS_MASK, 0x00)
    write_reg(PA_DAC, 0x84)
    write_reg(PA_CONFIG, 0x80 | (TX_POWER_DBM - 2))  # PA_BOOST, 17 dBm
    start_rx()
    print("[RADIO] SX1278 OK (RegVersion=0x12), 433 MHz, SF7, BW125k, CR4/5, sync 0x34", flush=True)


def read_packet():
    flags = read_reg(IRQ_FLAGS)
    if not (flags & RX_DONE):
        return None
    if flags & PAYLOAD_CRC_ERROR:
        print("[RADIO] CRC error", flush=True)
        write_reg(IRQ_FLAGS, 0xFF)
        return None
    size = read_reg(RX_NB_BYTES)
    addr = read_reg(FIFO_RX_CURRENT_ADDR)
    write_reg(FIFO_ADDR_PTR, addr)
    payload = read_fifo(size)
    rssi = read_reg(PKT_RSSI_VALUE) - 164  # approximate HF port RSSI offset
    write_reg(IRQ_FLAGS, 0xFF)
    return payload, rssi


def send_ack(message_id, sender, token):
    obj = {"type": "SOS_ACK", "message_id": message_id, "target_node": sender,
           "token": token, "status": "RECEIVED"}
    buf = json.dumps(obj, separators=(",", ":")).encode("utf-8")
    if len(buf) > 255:
        return
    time.sleep(ACK_DELAY_S)
    set_mode(STANDBY)
    write_reg(FIFO_ADDR_PTR, 0)
    for b in buf:
        write_reg(FIFO, b)
    write_reg(PAYLOAD_LENGTH, len(buf))
    write_reg(IRQ_FLAGS, 0xFF)
    set_mode(TX)
    end = time.monotonic() + 3.0
    success = False
    while time.monotonic() < end:
        if read_reg(IRQ_FLAGS) & TX_DONE:
            success = True
            break
        time.sleep(0.005)
    print(f"[ACK] {'TX OK' if success else 'TX timeout'} {message_id}", flush=True)
    start_rx()
    return success


class SX1278:
    def open(self):
        setup_radio()

    def read(self):
        return read_packet()

    def ack(self, message_id, sender, token):
        if not send_ack(message_id, sender, token):
            raise OSError("Radio ACK TX timeout")

    def close(self):
        try:
            if spi is not None:
                try:
                    set_mode(SLEEP)
                finally:
                    spi.close()
        finally:
            if GPIO is not None:
                GPIO.cleanup([RESET_BCM, DIO0_BCM])
