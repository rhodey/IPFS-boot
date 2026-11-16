# IPFS-boot

Publish IPFS webapps which require user consent to update.

**Think about: crypto texting apps, crypto-wallets, crypto-exchanges see:**

+ [IPFS-boot-react](https://github.com/rhodey/IPFS-boot-react)
+ [IPFS-boot-choo](https://github.com/rhodey/IPFS-boot-choo)

## How this works

1. Deploy a smaller version of React hot-code-reloading (bootloader (immutable))
2. Point the bootloader to a .json URL which has a list of app versions
3. Users visit your app using the bootloader CID/hash/address (immutable)
4. Devs push new versions to the .json URL and users accept/reject (mutable)

It is intended that you share the sources of your fork of IPFS-boot and
IPFS-boot-react or IPFS-boot-choo. The sources allow users to build and see the
IPFS CID (a hash) you publish is the same as what they get from source. The CID of
IPFS-boot will be the URL of your app, the CID of each update to your app
(-react, -choo) goes in versions.json, and the bootloader polls this file.

The bootloader only gets published once but app updates (accepted) load JS/CSS
which can restyle it.

## Demos

If you click "boot!" without reading: you can return to boot list
anytime by add #boot to the url:

+ React https://bafybeihq2h235llbpc5aaityfacxszl2oxujvyw2zwhdrbvfoi6ytynuty.ipfs.dweb.link
+ Choo https://bafybeifhc32ghpylhfhkmf4kbxlx6ixwj4vbvwki3c6eku2hlwznxue5fm.ipfs.dweb.link

## Dev

[http://localhost:8080](http://localhost:8080/) will serve the bootloader.
Style/change to your liking:

```
npm --prefix package/ ci
npm --prefix package/ run dev
```

## Build

Build/package the bootloader for IPFS then print v0 and v1 CIDs:

```
docker buildx build --load -t ipfs-boot .
docker run --rm -i -v ./dist:/root/dist ipfs-boot
```

## Pin

Read [PIN.md](/PIN.md) to configure IPFS pinning then:

```
docker buildx build --load -f Dockerfile.pin -t ipfs-pin .
docker run --rm -i -v ./dist:/root/dist:ro --env-file .env ipfs-pin pin-dist --boot
> CIDv0 = QmZau6Y778BfWJi9R5DRFiUTcHnfAFw9DqCqd4w5GQYh4v
> CIDv1 = bafybeifhc32ghpylhfhkmf4kbxlx6ixwj4vbvwki3c6eku2hlwznxue5fm
> Cloudflare: uploaded 9 blocks.
> Cloudflare: uploaded bootloader website files.
> Filebase: uploaded CAR.
> done: https://pub-daf36e7ba4504fa99be07f38a5333717.r2.dev/index.html
```

Your bootloader is now live and discoverable with v0 and v1 CIDs,
see: [gateways](https://ipfs.github.io/public-gateway-checker/).

See: [FAQ - What to do before prod?](https://github.com/rhodey/IPFS-boot/blob/2.0.0/FAQ.md#what-to-do-before-prod)

## License

MIT
