# IPFS-boot

## How to pin

There are two priorities:

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

+ [Signup here](https://dash.cloudflare.com/sign-up)
+ Type "R2" in the console search bar
+ Add a credit card which will be billed if you go over [free tier](https://developers.cloudflare.com/r2/pricing/#free-tier)
+ Create a bucket and enable CORS "*"
+ Manage API tokens > Create API token > Object Read & Write

```
cp example.env .env
(enter values for api, access, secret)
```

## Filebase

+ [Signup here](https://console.filebase.com/signup?ref=210b7456eadf)
+ At time of writing you can stay free tier
+ "Buckets" -> Create Bucket -> Storage Type IPFS -> Import None
+ "Access Keys" -> S3 Compatible API -> Access tokens

```
(edit .env)
(enter values for bucket, access, secret)
```

## License

MIT
