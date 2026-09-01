import sys
from pathlib import Path

# Ensure workspace root and apps/api are in sys.path so ml, voice, shared, services, and app are always importable
API_ROOT = Path(__file__).resolve().parent.parent
WORKSPACE_ROOT = API_ROOT.parent.parent

for _p in (str(WORKSPACE_ROOT), str(API_ROOT)):
    if _p not in sys.path:
        sys.path.insert(0, _p)
