"""Compatibility launcher: python lora_receiver.py [--simulate]."""
import sys
from lentera.__main__ import main

if __name__ == "__main__":
    sys.argv.insert(1, "receiver")
    main()
