"""Rebuild both sets of reviewed clipping paths."""
import runpy
import sys
from pathlib import Path

if len(sys.argv) > 1:
    sys.path.insert(0, sys.argv[1])
for filename in ["mask-fnaf1.py", "mask-fnaf4.py"]:
    script = Path(__file__).with_name(filename)
    sys.argv = [str(script)]
    runpy.run_path(str(script), run_name="__main__")
