"""Logging utilities — sanitizers for untrusted input."""


def sanitize(value: str) -> str:
    """Strip control characters that enable log injection (newlines, carriage returns, ANSI escapes)."""
    return value.replace("\n", "").replace("\r", "").replace("\x1b", "")
