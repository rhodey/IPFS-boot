sudo := "$(docker info > /dev/null 2>&1 || echo 'sudo')"

build:
    {{sudo}} docker buildx build --load -t ipfs-boot .
    {{sudo}} docker run --rm -i -v ./dist:/root/dist ipfs-boot

prep-pin:
    {{sudo}} docker buildx build --load -f Dockerfile.pin -t ipfs-pin .

pin: prep-pin
    {{sudo}} docker run --rm -i -v ./dist:/root/dist:ro --env-file .env ipfs-pin

dev:
    npm --prefix javascript/ ci
    npm --prefix javascript/ run dev
