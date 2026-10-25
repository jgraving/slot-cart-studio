# 🎨 Cart Studio for slot.sp

**[Open Cart Studio](https://jakegraving.com/slot.sp/studio/)** · **[slot.sp](https://jakegraving.com/slot.sp/)** · **[User guide](https://jakegraving.com/slot.sp/features/cart-studio/)**

Find artwork for your games, design cartridge labels and choose colors and finishes. Preview your changes before saving them to the card.

- **Real labels or logos.** Look up existing artwork, or bring your own PNG.
- **Your colors.** Adjust the label background, cartridge color and finish.
- **Save your way.** Chrome and Edge can write to the SD card. Folder import also lets you export a ZIP.
- **Local game files.** Games are read in the browser; artwork is downloaded from the configured sources.

Choose the top folder of your card—the one containing `Games` and `Labels`. Make your changes, save, safely eject the card and restart slot.sp to load the artwork.

## Development

The app is built into the slot.sp GitHub Pages website from a pinned revision of this repository. Its renderer source is pinned separately in `slot.ref`. The workflow runs the native rendering and file-handling tests, builds the WebAssembly app, and uploads `cart-studio-web` for review. It does not deploy to the upstream domain or use upstream Cloudflare credentials.

To build locally, check out the renderer repository beside this one as `../slot` at the revision in `slot.ref`, then run:

```sh
cargo test --locked
node --test web/*.test.mjs
wasm-pack build --release --target web --no-typescript --out-dir web/pkg
cp LICENSE web/LICENSE
```

The web theme uses the self-hosted Google Sans Flex from the slot.sp website. See the renderer's font licenses for its preview text.

## Credits & license

Adapted by Jake Graving from **[Cart Studio by Brandon T. Kowalski](https://github.com/BrandonKowalski/slot-cart-studio)**. GPL-3.0-or-later; see [LICENSE](LICENSE).

Game names and CRCs: [libretro-database](https://github.com/libretro/libretro-database), CC BY-SA 4.0. Logos: [ScreenScraper](https://www.screenscraper.fr/), CC BY-NC-SA 4.0. Original artwork credits remain in the app.

Game Boy is a trademark of Nintendo. This project is not affiliated with Nintendo.
