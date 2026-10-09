import sys

import fastapi
import httpx
import pydantic
import uvicorn  # noqa: F401

print("deps OK", sys.version.split()[0], "fastapi", fastapi.__version__)
