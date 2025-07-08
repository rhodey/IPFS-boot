# IPFS-boot

## Chain of trust
The file root.zip is a copy of what is in Amazon docs [here](https://docs.aws.amazon.com/enclaves/latest/user/verify-root.html#validation-process)

The file root.pem is the only file in the zip, if you want to test it:

```
curl https://aws-nitro-enclaves.amazonaws.com/AWS_NitroEnclaves_Root-G1.zip > /tmp/root.zip
unzip /tmp/root.zip -d /tmp/root.dir
sha256sum /tmp/root.dir/root.pem
sha256sum javascript/assets/root.pem
```

The [main README](https://github.com/rhodey/IPFS-boot#why-is-rust-involved) explains how nitro_wasm.js and nitro_wasm.wasm may be created

### License
MIT - Copyright 2025 - mike@rhodey.org
