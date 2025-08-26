# IPFS-boot
Publish IPFS webapps which require user consent to update, see:
+ [IPFS-boot-react](https://github.com/rhodey/IPFS-boot-react)
+ [IPFS-boot-choo](https://github.com/rhodey/IPFS-boot-choo)
+ [IPFS-boot-cloudflare](https://github.com/rhodey/IPFS-boot-cloudflare)

## How this works
This repo contains a sort of web bootloader, you will style this repo as you like and then you will publish this repo and your app to IPFS. Your app is a fork of IPFS-boot-react or IPFS-boot-choo. You will host a file versions.json on any http server and inside this file an array of items describe versions of your app which users choose from.

It is intended that you share the source of your fork of IPFS-boot and IPFS-boot-react or IPFS-boot-choo. The sources allow users to build and see the IPFS CID (a hash) you publish is the same as what they get from source. The CID of IPFS-boot will be the URL of your app, the CID of each version of your app goes in versions.json, and the bootloader polls this file.

The bootloader only gets published once but your app updates can include CSS which styles the bootloader. This all actually works, and it works offline(!), give it a try.

## Build
The aim is reproducible builds so docker is involved
```
docker buildx build --platform=linux/amd64 -t ipfs-boot .
docker run --rm -i --platform=linux/amd64 -v ./dist:/root/dist ipfs-boot
```

## Pin
Read [the guide](https://github.com/rhodey/IPFS-boot/blob/master/PIN.md) on choosing an IPFS pin service then
```
cp example.env .env
docker buildx build --platform=linux/amd64 -f Dockerfile.pin -t ipfs-pin .
docker run --rm -i --platform=linux/amd64 -v ./dist:/root/dist --env-file .env ipfs-pin
> CIDv0 = QmWZRw7fcviCYdk1JeWdrp611su474bXtMNnGrBa1DxZE8
> CIDv1 = bafybeid2eom3gwxknthadjdtywn7zpisteivmgbxtyjctr2pan4flcgnce
> upload: ../dist.car to s3://bucket-name/bafybeid2eom3gwxknthadjdtywn7zpisteivmgbxtyjctr2pan4flcgnce
> done: https://bafybeid2eom3gwxknthadjdtywn7zpisteivmgbxtyjctr2pan4flcgnce.ipfs.dweb.link
```

Your bootloader is now live and discoverable with v0 and v1 CIDs, see [gateways](https://ipfs.github.io/public-gateway-checker/)

## Dev
[http://localhost:8080](http://localhost:8080/) for quicker iterations on the bootloader
```
npm --prefix javascript/ install
npm --prefix javascript/ run dev
```

## Why is Rust involved
You may be wondering about the rust/ dir or dist/nitro_wasm.wasm. The Rust allows IPFS-boot to support [attestation](https://en.wikipedia.org/wiki/Trusted_Computing#Remote_attestation) with AWS Nitro servers, so reproducible __clients and servers__, see:
+ [lock.host](https://github.com/rhodey/lock.host)
+ [lock.host-node](https://github.com/rhodey/lock.host-node)
+ [lock.host-python](https://github.com/rhodey/lock.host-python)

Two files nitro_wasm.js and nitro_wasm.wasm are checked into source within javascript/assets/, these are tested by [github actions](https://github.com/rhodey/IPFS-boot/actions) and to build from source do:
```
docker buildx build --platform=linux/amd64 -f Dockerfile.wasm -t ipfs-wasm .
docker run --rm -i --platform=linux/amd64 -v ./dist:/root/dist ipfs-wasm
sha256sum javascript/assets/nitro_wasm.wasm
sha256sum dist/nitro_wasm.wasm
```

[Velo.xyz](https://velo.xyz) and [nijynot](https://github.com/nijynot) my coworker are due thanks for some AWS Nitro contributions

## Where is demo
Please if you want to style the default bootloader, open a PR ^.^

If you clicked "boot!" without reading: you can return to boot list anytime by add #boot to the url

+ react https://bafybeicalfyyfcmhrkv66fczkkwikql3rlnsu6nc76h3nipujkgqa73k54.ipfs.dweb.link
+ choo https://bafybeid2eom3gwxknthadjdtywn7zpisteivmgbxtyjctr2pan4flcgnce.ipfs.dweb.link

## FAQ
[FAQ](https://github.com/rhodey/IPFS-boot/blob/master/FAQ.md)

## License
MIT - Copyright 2025 - mike@rhodey.org
