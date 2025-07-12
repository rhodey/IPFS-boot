# IPFS-boot
## FAQ

### How are updates booted
The HTML, CSS, and JS of your app is dynamically added to the HTML DOM, what is being done is very similar to how "hot reload" works when developing angular or react. Take a look at [javascript/src/index.js](https://github.com/rhodey/IPFS-boot/blob/master/javascript/src/index.js) it is only 350 lines.

### What are some examples of attestation
+ [Signal uses attestation](https://signal.org/blog/private-contact-discovery/) to provide private contact discovery
+ [Attest.link](https://attest.link) is a domain I bought to do something with headless browsers and screenshots
+ There is a lot of room in this space and I am not keen to give up all ideas

### How to exclude attestation code from the build
Comment out the nitro_wasm.js import in javascript/index.html and remove require('./attest.js') from javascript/src/index.js (default)

### Why is IPFS-boot written with choo
You dont need to write your app with [choo](https://github.com/choojs/choo) but you might enjoy it, choo is preferred because it has low barrier to entry.

### How to style IPFS-boot in an app update
The HTML and CSS which IPFS-boot uses can be seen in [javascript/src/view.js](https://github.com/rhodey/IPFS-boot/blob/master/javascript/src/view.js) and [javascript/assets/style.css](https://github.com/rhodey/IPFS-boot/blob/master/javascript/assets/style.css)

Include in your update /_static/boot.css with rules which target the HTML elements

### What to do before prod
Search [javascript/src/index.js](https://github.com/rhodey/IPFS-boot/blob/master/javascript/src/index.js) and [javascript/src/sw.js](https://github.com/rhodey/IPFS-boot/blob/master/javascript/src/sw.js) for "todo"

### Downsides
This could have been figured out sooner!

[bybit loses 1.5B](https://news.ycombinator.com/item?id=43140754), [brave removes ipfs](https://news.ycombinator.com/item?id=41381593), [cloudflare shuts down gateway](https://blog.cloudflare.com/cloudflares-public-ipfs-gateways-and-supporting-interplanetary-shipyard/)

### License
MIT - Copyright 2025 - mike@rhodey.org
