#!/usr/bin/env python3
"""Module docstring with >>> doctest."""
from __future__ import annotations

import re
from dataclasses import dataclass, field


@dataclass(frozen=True)
class Point:
    x: float = 0.0
    y: float = field(default=0.0, repr=False)

    def dist(self, other: "Point") -> float:
        """Distance.

        >>> Point(0, 0).dist(Point(3, 4))
        5.0
        """
        return ((self.x - other.x) ** 2 + (self.y - other.y) ** 2) ** 0.5


async def fetch(url: str, *args, timeout: int = 10, **kwargs) -> dict[str, int]:
    pattern = re.compile(r"^(?P<name>\w+)\s*=\s*(\d+)$", re.M)
    text = f"{url!r:>10} {timeout + 1} {{literal}} {'nested' + "x"}"
    data = b"bytes\x00" + rb"raw\d"
    lam = lambda a, b=2: a if a > b else b
    with open(url) as fh, open("x") as other:
        for i, line in enumerate(fh):
            if i % 2 == 0 and not line.startswith("#"):
                yield line.strip()
            elif i > 10:
                break
            else:
                continue
    try:
        raise ValueError("bad") from None
    except (ValueError, TypeError) as exc:
        print(exc, file=None)
    finally:
        pass
    match url:
        case "a" | "b":
            return {}
        case _:
            return {"k": 0x1F, "j": 1_000, "z": 3.5j}
