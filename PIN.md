# IPFS-boot
## Where to pin
As of writing there are two suggestions
+ [Filebase](https://console.filebase.com/signup?ref=210b7456eadf) - start uploading with just email
+ [Storacha](http://storacha.network/referred?refcode=Pg7g8WLjwLKGJNgm) - wants email and card on file then start uploading

If you want to read more about IPFS pinning see [here](https://docs.ipfs.tech/how-to/work-with-pinning-services/) and [gateways](https://ipfs.github.io/public-gateway-checker/)

Storacha is a fine place to pin your __app__ but their gateway will not serve __the bootloader__ due to [csp headers](https://blog.web3.storage/posts/badbits-and-goodbits-csp-in-w3link)

## How to configure
The contents of example.env look like this
```
pin_api=
pin_token=
pin_s3_api=https://s3.filebase.com
pin_s3_bucket=abc123
pin_s3_access=abc123
pin_s3_secret=abc123
pin_storacha_email=user@email.com
pin_storacha_space=did:key:abc123
```

+ run cp example.env .env and open .env to edit
+ if pin_api is set the native ipfs upload method will be attempted (slow)
+ if pin_s3_api is set the s3 compat method will be used (fast)
+ if pin_storacha_email is set storacha will be used (fast)
+ if more than one is set they both pin = more peers

## Also
Storacha does the login by click link in email flow, to skip future logins add `/root/.config/w3access` when running the container
```
docker run --rm -i --platform=linux/amd64 \
  -v /tmp/w3access:/root/.config/w3access \
    -v ./dist:/root/dist --env-file .env ipfs-pin
```

### License
MIT - Copyright 2025 - mike@rhodey.org
