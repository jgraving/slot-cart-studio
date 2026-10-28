# 🎨 Cart Studio for slot.sp

**[Open Cart Studio](https://jakegraving.com/slot.sp/studio/)** · **[slot.sp](https://jakegraving.com/slot.sp/)** · **[User guide](https://jakegraving.com/slot.sp/features/cart-studio/)**

Find artwork for your games, design cartridge labels and choose colors and finishes. Preview your changes before saving them to the card.

- **Real labels or logos.** Look up existing artwork, or bring your own PNG.
- **Clean scan edges.** Rounded black or white scanner borders are cleared using the handheld’s preprocessing. Transparent label corners stay transparent when saved.
- **Matching cartridges.** The current slot.sp moulds, textured plastic and clear-shell interiors are used for previews.
- **Your colors.** Adjust the label background, cartridge color and finish.
- **Save your way.** Chrome and Edge can write to the SD card. Folder import also lets you export a ZIP.
- **Runs on your device.** This is a static website: game files, labels and edits stay on your device. Studio never uploads your files or stores them on a server. Game databases and artwork are downloaded as needed.

Choose the top folder of your card—the one containing `Games` and `Labels`. Make your changes, save, safely eject the card and restart slot.sp to load the artwork.

## Development

The app is built into the slot.sp GitHub Pages website from a pinned revision of this repository. Its renderer repository and revision are pinned separately in `slot.repo` and `slot.ref`. The workflow runs the native rendering and file-handling tests, builds the WebAssembly app, and uploads `cart-studio-web` for review. It does not deploy to the upstream domain or use upstream Cloudflare credentials.

To build locally, check out the repository named in `slot.repo` beside this one as `../slot` at the revision in `slot.ref`, then run:

```sh
cargo test --locked
node --test web/*.test.mjs
wasm-pack build --release --target web --no-typescript --out-dir web/pkg
cp LICENSE web/LICENSE
```

Logo lookup uses the CORS-enabled libretro sources by default where available. Missing label/logo choices open a local PNG picker; explicit single-cart choices do not silently switch styles. An optional scanned-label collection can be selected with `?art=https://your-art-host/`; that host must allow the Studio origin through CORS.

The web theme uses the self-hosted Google Sans Flex from the slot.sp website. See the renderer's font licenses for its preview text.

## Credits & license

Adapted by Jake Graving from **[Cart Studio by Brandon T. Kowalski](https://github.com/BrandonKowalski/slot-cart-studio)**. GPL-3.0-or-later; see [LICENSE](LICENSE).

Game names and CRCs: [libretro-database](https://github.com/libretro/libretro-database), CC BY-SA 4.0. Logos: [ScreenScraper](https://www.screenscraper.fr/), CC BY-NC-SA 4.0. Original artwork credits remain in the app.

Game Boy is a trademark of Nintendo. This project is not affiliated with Nintendo.

### Style several cartridges

Choose **Select carts**, pick any cartridges (across system tabs if needed), then choose a shell color, finish, or both. **Select this system** selects the current tab. **Apply to selected** preserves each cartridge's outline and label, and each cart's editor can undo its change. Write to card or export the ZIP when ready.
