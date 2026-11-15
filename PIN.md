# IPFS-boot

## How to pin

IMO there are two priorities:

1. host for users without IPFS browser extension.
2. host for users with IPFS browser extension.

To do this we'll use [Cloudflare R2](https://www.cloudflare.com/products/r2/)
plus [Filebase](https://console.filebase.com/signup?ref=210b7456eadf).
Even if we only care about #1 Filebase is what gets your app onto
public IPFS [gateways](https://ipfs.github.io/public-gateway-checker/)
where you don't need DNS. The way we use Cloudflare R2 its going to
serve IPFS protocol chunks for your webapp but it won't be in charge
of serving index.html. The result is Filebase gets us discovery while
Cloudflare gets us fast, reliable loading.

## Cloudflare

## Filebase

[Signup here](https://console.filebase.com/signup?ref=210b7456eadf). At
the time of writing this you can use a free account. Then "Buckets" ->
Create Bucket -> Storage Type IPFS -> Import None. Remember the bucket
name. Then "Access Keys" -> S3 Compatible API -> Access tokens.

```
cp example.env .env
(enter values for filebase bucket, access, secret)
```

## License

MIT
