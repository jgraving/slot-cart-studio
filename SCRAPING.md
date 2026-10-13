# Get game descriptions and box artwork

Each user runs the installed [Skyscraper](https://gemba.github.io/skyscraper/)
with their own normal ScreenScraper account. This helper handles the export to
Slot; no developer account, server, other handheld OS or public metadata mirror
is needed. It does not install or modify Skyscraper.

## First run

1. Install Skyscraper using its [platform instructions](https://gemba.github.io/skyscraper/INSTALLATION/).
   On macOS these include Homebrew dependencies; this first version is a command-line
   helper, not a packaged Mac app. Python 3.10 or newer is required.
2. In this repository, create a Python environment once:

   ```sh
   python3 -m venv .venv
   .venv/bin/python -m pip install Pillow
   ```

3. Insert your card and run a small trial (replace `GAMES` with its mounted name):

   ```sh
   .venv/bin/python tools/scrape_details.py --card /Volumes/GAMES --limit 10
   ```

   Enter your normal ScreenScraper username and password at the prompts. The
   password is hidden. The helper runs GB, GBC and GBA folders that contain games.
   `--limit 10` means up to ten games **per platform**. Add `--platform GBA` to
   try only one platform. Use `--skyscraper /path/to/Skyscraper` if it is not on PATH.

4. Open the card in this fork of Cart Studio to preview the results under
   **Box art & game details**. Omit `--limit 10` on the next run to collect the rest.

The command adds `Metadata/<platform>/<ROM stem>.json` and
`Artwork/<platform>/<ROM stem>.png`. Existing metadata and artwork are preserved;
it does not rename ROMs or change labels, saves, emulator settings or System.
Missing descriptions or images remain optional. Old firmware continues using
its existing cartridge view. Displaying these details on the handheld requires
a separate firmware change.

To preview without writing to the card, add `--output "$HOME/Downloads/slot-details"`.
Merge the generated Metadata and Artwork folders into the card afterwards.
To update a previously exported game's details, edit it in Studio; the helper
intentionally does not replace your edits on repeat runs.

## Downloads, accounts and privacy

The helper runs the stock ScreenScraper module inside Skyscraper. It does not
copy application credentials, call ScreenScraper directly, or publish downloaded
content. Each user uses their own account and its limits. Only selected card
ROMs are processed, one worker at a time. Skyscraper identifies games through
its normal lookup mechanism; this is not an upload of ROM files.

Downloads are cached locally under `~/.cache/slot-cart-studio` and reused on
repeat runs. Keep this directory to avoid unnecessary requests. `--offline`
regenerates exports from that cache without a login or network scraping step.
A stopped run can be retried; existing cached games are skipped when scraping.
A partially cached game can lack artwork; this version does not force-refresh
existing cache entries automatically.

The helper passes the login through an owner-readable temporary configuration
file on your computer, never in command-line arguments, the SD card, the website
or GitHub. It removes that temporary directory on normal completion, errors and
Ctrl-C. This is **not encrypted storage** and abrupt termination can leave a
file behind. There is no persistent “remember me” feature in this version.
Skyscraper's raw console output is suppressed because provider errors may contain
authenticated URLs. The helper reports platform progress and a general error if
Skyscraper exits unsuccessfully. It does not save a debug log.

## Artwork and conversion

Skyscraper fetches the cover and uses its documented `gamebox` effect to render
an optional 3D-style box. These are generated box illustrations, not scans of the
original spine. The helper converts the result to PNG within 720 × 720 pixels.

For interoperability it asks Skyscraper for a fresh standard XML export inside
a temporary directory, then immediately converts that to Slot JSON and PNG.
Users do not manage or import an OS gamelist, and no EmulationStation installation
is needed. Only paths corresponding to the selected ROM files are accepted.
Artwork must resolve inside the fresh export directory. No internal Skyscraper
cache files are edited.

## Development checks

```sh
python3 -m unittest discover -s tools -p 'test_scrape_details.py'
```

Tests cover path matching, conversion, preserving existing files, credential-file
permissions/escaping, artwork boundaries, invalid XML, and online/offline command
orchestration with a mocked scraper. A real account scrape and macOS installation
still require user testing; these tests alone do not establish provider approval
of any particular redistribution or automated-hosting arrangement.
