sudo := "$(docker info > /dev/null 2>&1 || echo 'sudo')"

build:
    {{sudo}} docker buildx build --platform=linux/amd64 -t ipfs-boot .
    {{sudo}} docker run --rm -i --platform=linux/amd64 -v ./dist:/root/dist ipfs-boot

pin:
    {{sudo}} docker run --rm -i --platform=linux/amd64 -v /tmp/w3access:/root/.config/w3access -v ./dist:/root/dist --env-file .env ipfs-pin

wasm:
    {{sudo}} docker buildx build --platform=linux/amd64 -f Dockerfile.wasm -t ipfs-wasm .
    {{sudo}} docker run --rm -i --platform=linux/amd64 -v ./dist:/root/dist ipfs-wasm

fastwasm:
    cd rust && rustup target add wasm32-unknown-emscripten
    cd rust && cargo build --target=wasm32-unknown-emscripten --release
    mkdir -p dist/
    cp rust/target/wasm32-unknown-emscripten/release/nitro_wasm.js dist/
    cp rust/target/wasm32-unknown-emscripten/release/nitro_wasm.wasm dist/

dev:
    npm --prefix javascript/ install
    npm --prefix javascript/ run dev
