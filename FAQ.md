# IPFS-boot FAQ

### Is IPFS alive?

I'm going to be honest with you: its kind of dead. If someone steps up and hosts a no-nonsense public gateway
that's really all thats needed but the money incentive is not there rn. IPFS-boot is a proven concept that can
work with any content-addressable technology and I've got ears open for the next best thing. TBH: assuming users
are willing to install, Tailscale may be the next gateway to secure front-end apps.

### How are updates booted?

The HTML, CSS, and JS of your app is dynamically added to the HTML DOM, what is being done is very
similar to how "hot reload" works when developing React. Take a look at [package/src/index.js](/package/src/index.js)
it is only 350 lines.

### Why is IPFS-boot written with choo?

You dont need to write your app with [choo](https://github.com/choojs/choo) but you might enjoy it,
choo is my favorite.

### What to do before prod?

Search [package/src/index.js](/package/src/index.js) and [package/src/sw.js](/package/src/sw.js)
for "todo" (about 5 items).

Then: [IPFS-boot-react](https://github.com/rhodey/IPFS-boot-react) or [IPFS-boot-choo](https://github.com/rhodey/IPFS-boot-choo).

### Downsides?

This could have been figured out sooner!

[bybit hacked](https://news.ycombinator.com/item?id=43140754), [polymarket hacked](https://www.securityweek.com/polymarket-returns-3-9-million-to-traders-as-debugbear-cites-dns-hijack/).

### License

MIT
