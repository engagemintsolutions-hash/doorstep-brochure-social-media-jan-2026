#!/usr/bin/env python -u
"""Simple startup script for Railway deployment."""
# Immediate print before any imports
print("SCRIPT STARTING", flush=True)
import os
import sys
sys.stdout.reconfigure(line_buffering=True)

print("=" * 50, flush=True)
print("START_SERVER.PY RUNNING", flush=True)
print(f"Python version: {sys.version}", flush=True)
print(f"Working directory: {os.getcwd()}", flush=True)
print(f"PORT env var: {os.environ.get('PORT', 'not set')}", flush=True)
print("=" * 50, flush=True)

# Get port from environment
port = int(os.environ.get("PORT", 8000))
host = "0.0.0.0"

print(f"Starting uvicorn on {host}:{port}", flush=True)

import uvicorn
uvicorn.run("backend.main:app", host=host, port=port)
