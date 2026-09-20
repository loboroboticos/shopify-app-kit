# Redirect URI policy

The redirect URI is where the authorization code goes. Every relaxation here is a way to send a code to someone
else, so the rules are few and checked everywhere.

## Parse as a URL

A redirect URI is accepted only if `new URL(value)` parses it and yields a scheme of `http:` or `https:`, no
username or password, and no fragment. String comparison against a stored value happens after parsing and
normalisation (lower-cased hostname, default port dropped), never on the raw string, so `HTTPS://Example.com/`
and `https://example.com/` are the same URI and `https://example.com/#x` is rejected.

Rule: one `parseRedirectUri` function returns a normalised URL or throws; every check below calls it.

## Loopback bypasses the host allowlist

A loopback host (`localhost`, `127.0.0.1`, `[::1]`; the brackets are part of the hostname `new URL` returns for
an IPv6 literal, so compare against `[::1]`, not `::1`) is allowed over `http` or `https` and is exempt from
the host allowlist. RFC 8252 §7.3 explains why: a native client listens on an ephemeral port chosen per run, so
the registered URI and the presented URI differ in port and the server must compare host and path only for
loopback. Any other host must match exactly, port included.

Rule: loopback is matched by hostname and path with the port ignored; nothing else ignores the port.

## Every other host is https and allowlisted

A non-loopback redirect URI must be `https:` and, when `MCP_ALLOWED_REDIRECT_HOSTS` is set, its hostname must
be in that comma-separated list. The comparison is on the hostname alone, so an allowlist entry that carries a
port or a path never matches anything; the startup check rejects such entries. When the variable is unset the
server logs a warning at startup and accepts any https host, which is acceptable for a development instance
and is the reason the warning exists.

Rule: production sets `MCP_ALLOWED_REDIRECT_HOSTS`; the deploy checklist (`release` skill) carries the line.

## Validate at every step, never reflect to an unmatched URI

The policy runs at registration (the URIs stored), at authorize (the presented `redirect_uri` must equal one of
the client's stored URIs after normalisation), at consent (the same check on the values carried through the
sign-in round trip), and at the token endpoint (the `redirect_uri` in the token request must equal the one the
code was issued for). Defence in depth: a bug in one stage is caught by the next. The authorize endpoint in
particular must never redirect an error to a `redirect_uri` it has not first matched against the registered
client: an unmatched URI gets a rendered error page, not a redirect, because a redirect with `error=` is still
an open redirect.

Rule: the four call sites share one function; a tripwire asserts each endpoint file calls it.

Sources: app-2 (contributor guide: redirect-URI rules, loopback handling); app-3 (ADR series: MCP auth substrate).
