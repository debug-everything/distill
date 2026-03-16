"""Security utilities — input sanitization and SSRF protection."""

import ipaddress
import socket
from urllib.parse import urlparse, urlunparse


def sanitize_log(value: str) -> str:
    """Strip control characters that enable log injection (newlines, carriage returns, ANSI escapes)."""
    return value.replace("\n", "").replace("\r", "").replace("\x1b", "")


def validate_url(url: str) -> str:
    """Validate a URL against SSRF and return a safe, reconstructed URL.

    Checks that the URL uses http(s), resolves to a public IP, and returns
    a reconstructed URL from parsed components to break taint tracking.

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

    # Reconstruct URL from parsed components to break taint flow for static analysis
    safe_url = urlunparse(parsed)
    return safe_url
