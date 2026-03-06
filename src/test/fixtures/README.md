# Test TLS Fixtures

These certificates are **test-only** and are used exclusively by the
`fetchWithCerts.test.ts` suite to simulate an SSL environment where the
server's CA is absent from the operating system's trust store.

## Contents

| File | Purpose |
|---|---|
| `test-ca.pem` | Self-signed root CA certificate (PEM) |
| `test-ca-key.pem` | Private key for the test CA (PEM) |
| `test-server-cert.pem` | Server certificate signed by `test-ca.pem`; SAN: `127.0.0.1`, `localhost` |
| `test-server-key.pem` | Private key for the server certificate |

## Security

These are **not** production secrets.  The CA and server key are committed
intentionally so that the test suite can regenerate or replace the fixtures
without requiring external tooling.

## Regenerating

```bash
# Generate test CA
openssl req -x509 -newkey rsa:2048 \
  -keyout src/test/fixtures/test-ca-key.pem \
  -out src/test/fixtures/test-ca.pem \
  -sha256 -days 3650 -nodes \
  -subj "/CN=Test CA for google-java-format-for-vs-code"

# Generate server key
openssl genrsa -out src/test/fixtures/test-server-key.pem 2048

# Generate CSR
openssl req -new \
  -key src/test/fixtures/test-server-key.pem \
  -out /tmp/test-server-csr.pem \
  -subj "/CN=localhost"

# Sign server cert with test CA (valid for 127.0.0.1 and localhost)
openssl x509 -req \
  -in /tmp/test-server-csr.pem \
  -CA src/test/fixtures/test-ca.pem \
  -CAkey src/test/fixtures/test-ca-key.pem \
  -CAcreateserial \
  -out src/test/fixtures/test-server-cert.pem \
  -days 3650 -sha256 \
  -extfile <(echo "subjectAltName=IP:127.0.0.1,DNS:localhost")
```
