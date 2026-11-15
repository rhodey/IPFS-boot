# IPFS-boot

Publish IPFS webapps which require user consent to update.

**Think about: crypto texting apps, crypto-wallets, crypto-exchanges see:**

+ [IPFS-boot-react](https://github.com/rhodey/IPFS-boot-react)
+ [IPFS-boot-choo](https://github.com/rhodey/IPFS-boot-choo)
+ [IPFS-boot-cloudflare](https://github.com/rhodey/IPFS-boot-cloudflare)

## How this works

1. Deploy a smaller version of React hot-code-reloading (bootloader (immutable))
2. Point the bootloader to a .json URL which has a list of app versions
3. Users visit your app using the bootloader CID/hash/address (immutable)
4. Devs push new versions to the .json URL and users accept/reject (mutable)

It is intended that you share the sources of your fork of IPFS-boot and IPFS-boot-react or IPFS-boot-choo. The sources allow users to build and see the IPFS CID (a hash) you publish is the same as what they get from source. The CID of IPFS-boot will be the URL of your app, the CID of each update to your app (-react, -choo) goes in versions.json, and the bootloader polls this file.

The bootloader only gets published once but app updates (accepted) load JS/CSS which can restyle it.

## Build

The aim is reproducible builds so docker is involved

```
docker buildx build --platform=linux/amd64 -t ipfs-boot .
docker run --rm -i --platform=linux/amd64 -v ./dist:/root/dist ipfs-boot
```

## Pin

Read [the guide](/PIN.md) on choosing an IPFS pin service then

```
cp example.env .env
docker buildx build --platform=linux/amd64 -f Dockerfile.pin -t ipfs-pin .
docker run --rm -i --platform=linux/amd64 -v ./dist:/root/dist --env-file .env ipfs-pin
> CIDv0 = QmQcFZUsp47bckyJTwzL6mr4HWNrGvdnRW6Z95jJbxC5bF
> CIDv1 = bafybeibbwz7bew6l3e5lsgneebvhfe63qclvhygkmh6ba7nk566a4qdy7i
> upload: ../dist.car to s3://bucket-name/bafybeibbwz7bew6l3e5lsgneebvhfe63qclvhygkmh6ba7nk566a4qdy7i
> done: https://bafybeibbwz7bew6l3e5lsgneebvhfe63qclvhygkmh6ba7nk566a4qdy7i.ipfs.dweb.link
```

Your bootloader is now live and discoverable with v0 and v1 CIDs, see [gateways](https://ipfs.github.io/public-gateway-checker/)

## Dev

[http://localhost:8080](http://localhost:8080/) for quicker iterations on the bootloader

```
npm --prefix javascript/ install
npm --prefix javascript/ run dev
```

## Where is demo

Please if you want to style the bootloader, open a PR ^.^

If you clicked "boot!" without reading: you can return to boot list anytime by add #boot to the url

+ react https://bafybeifehbm2um54qvfifprtbkgbt25ndkq6k26zjlbe33t2j62gdjwn2m.ipfs.dweb.link
+ choo https://bafybeibbwz7bew6l3e5lsgneebvhfe63qclvhygkmh6ba7nk566a4qdy7i.ipfs.dweb.link

## FAQ
[FAQ](/FAQ.md)

## License
MIT
