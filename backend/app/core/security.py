"""Security utilities — input sanitization and SSRF protection."""

import ipaddress
import socket
from urllib.parse import urlparse


def sanitize_log(value: str) -> str:
    """Strip control characters that enable log injection (newlines, carriage returns, ANSI escapes)."""
    return value.replace("\n", "").replace("\r", "").replace("\x1b", "")


def validate_url(url: str) -> None:
    """Validate that a URL does not target internal/private network addresses (SSRF protection).

    Raises ValueError if the URL is unsafe.
    """
    parsed = urlparse(url)

    if parsed.scheme not in ("http", "https"):
        raise ValueError(f"URL scheme must be http or https, got: {parsed.scheme}")

    hostname = parsed.hostname
    if not hostname:
        raise ValueError("URL has no hostname")

    # Resolve hostname to IP and check against private/reserved ranges
    try:
        addr_info = socket.getaddrinfo(hostname, None)
    except socket.gaierror:
        raise ValueError(f"Cannot resolve hostname: {hostname}")

    for family, _, _, _, sockaddr in addr_info:
        ip = ipaddress.ip_address(sockaddr[0])
        if ip.is_private or ip.is_loopback or ip.is_reserved or ip.is_link_local:
            raise ValueError(f"URL resolves to private/reserved address: {hostname}")
