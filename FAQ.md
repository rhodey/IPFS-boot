# IPFS-boot FAQ

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
