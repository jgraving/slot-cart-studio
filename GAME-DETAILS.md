# Optional box artwork and game details

This fork keeps the existing cartridge-label and shell exports unchanged. Game
information is a separate optional layer. Old slot versions can use the labels as
before and ignore the new folders. A matching device-side details reader will be
added separately; this Studio change alone does not add a screen to the handheld.

## Get metadata with a normal account

Use the [local Skyscraper helper](SCRAPING.md) to collect your own game details
and render box artwork. It needs a normal ScreenScraper account and keeps the
collection local. The custom developer-API harvester described further below
is an advanced alternative, not required for this workflow.

## Use it

1. Choose the games card in Cart Studio as usual.
2. Open a cartridge and expand **Box art & game details (optional)**.
3. Edit its title, description, developer, publisher, year, genre, player count and
   source/attribution. Box art already downloaded from libretro is available as a
   fallback. Upload a PNG, JPEG or WebP for custom or pre-rendered 3D box artwork;
   uploads become PNGs no larger than 720 pixels on either side.
4. Click **Download game details** and merge its `Metadata` and `Artwork` folders
   into the card root. The label-writing/download buttons continue to export only
   the existing label/shell format. Do not replace whole card folders.

Selecting the card again loads optional sidecars. Missing files, an unavailable
artwork server or unreadable optional data never prevents ROM/label processing.
The application does not upload your ROMs or optional text to a server. Remote art
requests use the same public thumbnail and static-art sources as the original
Studio.

## Format shared with the future device reader

The filename stem and platform identify a game; display titles do not rename ROMs.

- `Metadata/GBA/<original ROM stem>.json` (also GB/GBC)
- `Artwork/GBA/<original ROM stem>.png` (also GB/GBC)

Example:

```json
{
  "version": 1,
  "title": "Metroid Fusion",
  "description": "Your optional game description.",
  "developer": "Nintendo",
  "year": "2002",
  "source": "Your metadata source",
  "box_art": "Artwork/GBA/Metroid Fusion (USA).png"
}
```

All display fields are optional. Text is bounded (8,192 characters for a description,
1,024 for source attribution, 256 for other fields). Unknown fields are ignored on
re-export. An entirely empty game with no artwork produces no sidecars. New readers
must fall back to the existing cartridge view when metadata/artwork is missing,
malformed or unsupported, and must not trust a JSON artwork path outside these
folders. Boxes are pre-rendered images, not a 3D-engine requirement.

## Static artwork collection

The Studio can read `metadata` and `box-3D` paths from the existing checksum-indexed
static art `index.json`. Missing entries fall back to the existing libretro cover.
The public collection is not automatically populated by this PR.

The existing local harvester now supports `metadata` alongside image media:

```sh
python3 tools/harvest.py --dat all --out /path/to/art-set \
  --media wheel,look,support-texture,box-3D,metadata
```

This builds our own checksum-indexed collection directly from ScreenScraper for
GB, GBC and GBA, using the existing harvester. No-Intro DATs enumerate ROMs; they
are not the source of descriptions or artwork. Use `--card /path/to/card` instead
of `--dat all` for just your games, or add `--limit 10` for a small trial. Re-running
the same command resumes the collection and preserves existing label media.

The result is ordinary static files: `index.json`, `<platform>/metadata/<CRC>.json`
and `<platform>/box-3D/<CRC>.png`. Host the output folder on a static HTTPS host
(with CORS enabled if separate from Studio). Open Studio with
`?art=https://YOUR-HOST/art-set/` to use that collection. GitHub Pages can serve
these files; there is no runtime server or scraper in the browser. The existing
upstream art endpoint remains the default until our dataset is published.

As before, ScreenScraper credentials are provided through the existing environment
variables to the local harvester, never embedded in the website. Publish the resulting
static collection only under the provider's applicable permissions and attribution
requirements. Descriptions prefer English and omit unavailable fields.

## Verification

Install the harvester dependencies with `python3 -m pip install Pillow numpy`.
Run `npm ci --ignore-scripts && npm test` and
`python3 -m unittest discover -s tools -p 'test_*.py'`.
Tests cover legacy label/card behavior, optional/missing files, path validation,
bounded text, scraper resume behavior and metadata extraction. Browser
interaction and device rendering still need testing before release.
