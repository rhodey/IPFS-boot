# syntax=docker/dockerfile:1
FROM alpine:3.22@sha256:49340b346798875b5592e5d420241f2f9cfba5f47e62ebb1446a1b34734e898f AS alpine

FROM alpine AS kubo
ARG TARGETARCH
RUN apk add --no-cache curl
RUN <<'EOF'
set -eu

# Keep the version and release checksums together when updating Kubo.
version=0.32.0
case "$TARGETARCH" in
  amd64) checksum=f0a5afe5b7618b15610d52a5b2318e3fd09e0b2d9ada203e06fbe4ce7141a8d280e2ac26b6a7362e6a40efced707000eb1f4d4f4d11a08a46f5b7b27caf7b832 ;;
  arm64) checksum=7a1fa43a0324a930caccea070f210436fee5c6b67b3415770d4798f9021ca6702940108fdca0c337636c4564d9d7c9d2cad65cb82e2d904b3df52472025f548e ;;
  *) echo "Unsupported Kubo architecture: $TARGETARCH" >&2; exit 1 ;;
esac

archive="kubo_v${version}_linux-$TARGETARCH.tar.gz"
cd /tmp
curl --fail --location --show-error --silent --retry 2 \
  --connect-timeout 15 --max-time 120 \
  "https://github.com/ipfs/kubo/releases/download/v${version}/${archive}" -o "$archive"
printf '%s  %s\n' "$checksum" "$archive" | sha512sum -c -
tar -xzf "$archive" kubo/ipfs
install -m 755 kubo/ipfs /usr/local/bin/ipfs
rm -rf "$archive" kubo
EOF

FROM node:24-alpine3.22@sha256:191c9f0080fcbbc6547a85dc0ff7988072214a355aabdc1d2ec55a7dae5eea8a AS build
WORKDIR /app
COPY package/package.json package/package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund
COPY package/ ./
RUN npm run build

# Running the image only exports the already-built app and calculates its CID.
FROM alpine
# The AMD64 Kubo release uses the glibc loader.
RUN apk add --no-cache gcompat
COPY --from=kubo /usr/local/bin/ipfs /usr/local/bin/ipfs
RUN ipfs version
COPY --from=build /app/dist /app/dist
COPY --chmod=755 <<'EOF' /usr/local/bin/export-dist
#!/bin/sh
set -eu

# Remove obsolete output, including dotfiles, before exporting this build.
mkdir -p /root/dist
find /root/dist -mindepth 1 -maxdepth 1 -exec rm -rf {} +
cp -R /app/dist/. /root/dist/
ipfs init >/dev/null
cid=$(ipfs --offline add -Qr /root/dist)
echo "CIDv0 = $cid"
echo "CIDv1 = $(ipfs cid base32 "$cid")"
EOF
ENV IPFS_PATH=/tmp/ipfs
CMD ["export-dist"]
