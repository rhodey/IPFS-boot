# ipfs-boot
Publish IPFS webapps which require user consent to update, see:
+ [IPFS-boot](https://github.com/rhodey/IPFS-boot)
+ [IPFS-boot-react](https://github.com/rhodey/IPFS-boot-react)
+ [IPFS-boot-choo](https://github.com/rhodey/IPFS-boot-choo)

## Usage
```
npx ipfs-boot init https://github.com/user/react123 react123
npx ipfs-boot publish --cid $CID --version v0.0.1 --notes "release notes"
cat versions.json
```

Running init multiple times allows to overwrite the source code repo and app name
```
npx ipfs-boot init https://github.com/user/react1234 react1234
cat versions.json
```

## License
MIT - Copyright 2025 - mike@rhodey.org
