"""Compatibility launcher for the Python/Waitress backend."""
from lentera.backend import create_app, serve
from lentera.config import Config

if __name__ == "__main__":
    serve(Config.load())
