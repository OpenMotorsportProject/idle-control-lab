"""Read the installed app's WebKitGTK accessibility tree under a virtual display."""
import time
import pyatspi


def names(node, depth=0):
    yield node.name
    if depth < 18:
        for i in range(node.childCount):
            try:
                yield from names(node.getChildAtIndex(i), depth + 1)
            except (LookupError, RuntimeError):
                continue


deadline = time.monotonic() + 60
while time.monotonic() < deadline:
    visible = set(names(pyatspi.Registry.getDesktop(0)))
    if {"Loss landscape", "Network layout", "Motion replay"} <= visible:
        print("The installed package rendered the live neural lab and network diagram.")
        break
    time.sleep(1)
else:
    raise SystemExit(f"Missing lab controls. Observed: {visible}")
