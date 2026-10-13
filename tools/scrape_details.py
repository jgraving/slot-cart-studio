#!/usr/bin/env python3
"""Run an installed Skyscraper and convert its fresh export to optional Slot sidecars."""
import argparse
import getpass
import io
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import warnings
import xml.etree.ElementTree as ET

PLATFORMS = {'GB': ('gb', {'.gb', '.gbc'}), 'GBC': ('gbc', {'.gb', '.gbc'}), 'GBA': ('gba', {'.gba'})}
FIELDS = {'name': 'title', 'desc': 'description', 'developer': 'developer',
          'publisher': 'publisher', 'genre': 'genre', 'players': 'players'}


def ini_string(value):
    if any(ord(c) < 32 for c in value):
        raise ValueError('Account details must not contain control characters')
    return '"' + value.replace('\\', '\\\\').replace('"', '\\"') + '"'


def write_config(path, username, password):
    if not username or ':' in username or not password:
        raise ValueError('Enter a username without a colon and a nonempty password')
    content = ('[main]\nthreads=1\ncacheScreenshots=false\ncacheWheels=false\n'
               'cacheMarquees=false\ncacheTextures=false\nvideos=false\n'
               '[screenscraper]\nuserCreds=' + ini_string(username + ':' + password) + '\n')
    # The caller owns a private temporary directory; never put secrets on the SD card.
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'w', encoding='utf-8') as file:
        file.write(content)


def roms(card, platform):
    folder = card / 'Games' / platform
    extensions = PLATFORMS[platform][1]
    found = sorted((p for p in folder.iterdir() if p.is_file() and not p.is_symlink()
                    and not p.name.startswith('.') and p.suffix.lower() in extensions),
                   key=lambda p: p.name) if folder.is_dir() else []
    identities = set()
    for path in found:
        key = path.stem.casefold()
        if key in identities:
            raise ValueError(f'{platform}: multiple ROMs have the same filename stem')
        if any(ord(c) < 32 for c in path.name) or '\\' in path.name:
            raise ValueError(f'{platform}: unsupported character in a ROM filename')
        identities.add(key)
    return found


def safe_output(root, relative):
    path = root / relative
    # Refuse redirects through symlinks, including those inside the card.
    if any(p.is_symlink() for p in [path, *path.parents] if p != root.parent):
        raise ValueError('Output path contains a symlink')
    if not path.resolve().is_relative_to(root.resolve()):
        raise ValueError('Output path escapes destination')
    path.parent.mkdir(parents=True, exist_ok=True)
    return path


def png_image(path):
    from PIL import Image
    if path.stat().st_size > 8 * 1024 * 1024:
        raise ValueError('Artwork exceeds 8 MB')
    with warnings.catch_warnings():
        warnings.simplefilter('error', Image.DecompressionBombWarning)
        with Image.open(path) as image:
            if max(image.size) > 8192:
                raise ValueError('Artwork dimensions exceed 8192 pixels')
            image = image.convert('RGBA')
            image.thumbnail((720, 720))
            output = io.BytesIO()
            image.save(output, format='PNG')
            return output.getvalue()


def create_file(path, body):
    # Exclusive creation preserves hand-edited metadata and artwork on repeat runs.
    with path.open('xb') as file:
        try:
            file.write(body)
        except BaseException:
            path.unlink(missing_ok=True)
            raise


def convert_export(export, input_folder, allowed_roms, output, platform):
    """Read only the freshly generated export; never match by friendly display title."""
    xml_path = export / 'gamelist.xml'
    if not xml_path.is_file():
        raise ValueError('Skyscraper produced no export; check account access or try again after the quota resets')
    if xml_path.stat().st_size > 32 * 1024 * 1024:
        raise ValueError('Scraper export is too large')
    raw = xml_path.read_text(encoding='utf-8-sig')
    if '<!DOCTYPE' in raw.upper() or '<!ENTITY' in raw.upper():
        raise ValueError('Unsupported scraper export')
    tree = ET.fromstring(raw)
    if tree.tag != 'gameList':
        raise ValueError('Unsupported scraper export root')
    allowed = {p.resolve(): p.stem for p in allowed_roms}
    saved = skipped = 0
    for game in tree.findall('game'):
        identity = game.findtext('path', '')
        if not identity:
            continue
        path = Path(identity)
        path = path if path.is_absolute() else input_folder / path
        stem = allowed.get(path.resolve())
        if stem is None:
            continue
        dest = safe_output(output, Path('Metadata') / platform / (stem + '.json'))
        if dest.exists():
            skipped += 1
            continue
        data = {'version': 1}
        for tag, key in FIELDS.items():
            text = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f]', '', game.findtext(tag, '')).strip()
            if text:
                data[key] = text[:8192 if key == 'description' else 256]
        date = game.findtext('releasedate', '')
        if re.match(r'^\d{4}', date):
            data['year'] = date[:4]
        # Our artwork recipe exports the cover only. Skyscraper uses thumbnail for it.
        artwork = game.findtext('thumbnail', '')
        if artwork:
            src = Path(artwork)
            src = src if src.is_absolute() else input_folder / src
            if not src.resolve().is_relative_to(export.resolve()):
                raise ValueError('Scraper artwork points outside its export folder')
            if src.is_file():
                relative = Path('Artwork') / platform / (stem + '.png')
                target = safe_output(output, relative)
                try:
                    image = png_image(src)
                except (OSError, ValueError, Warning):
                    print(f'{platform}: skipped unreadable artwork for {stem}')
                else:
                    if not target.exists():
                        create_file(target, image)
                    data['box_art'] = relative.as_posix()
        if len(data) == 1:
            continue
        data['source'] = 'ScreenScraper via Skyscraper · https://www.screenscraper.fr/'
        create_file(dest, (json.dumps(data, ensure_ascii=False, indent=2) + '\n').encode('utf-8'))
        saved += 1
    return saved, skipped


def run_scraper(command):
    # Provider errors can contain authenticated URLs; do not persist or relay raw logs.
    result = subprocess.run(command, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    if result.returncode:
        raise RuntimeError('Skyscraper stopped. Check your login, network and account quota; '
                           'rerun to reuse cached downloads. Raw logs were not saved.')


def collect(card, output, executable, config, cache, platforms, offline=False, limit=None):
    counts = [0, 0]
    for platform in platforms:
        games = roms(card, platform)
        if limit:
            games = games[:limit]
        if not games:
            continue
        with tempfile.TemporaryDirectory(prefix='slot-export-') as directory:
            export = Path(directory)
            artwork = export / 'artwork.xml'
            artwork.write_text('<artwork><output type="cover" width="720" height="720">'
                               '<layer resource="cover" width="440" height="560" align="center" valign="middle">'
                               '<gamebox/></layer></output></artwork>', encoding='utf-8')
            include = export / 'roms.txt'
            include.write_text(''.join(str(p.resolve()) + '\n' for p in games), encoding='utf-8')
            source = (card / 'Games' / platform).resolve()
            base = [executable, '-p', PLATFORMS[platform][0], '-c', str(config),
                    '-i', str(source), '-g', str(export), '-o', str(export / 'media'),
                    '-d', str(cache / platform), '-f', 'emulationstation',
                    '-a', str(artwork), '-l', '8192', '--lang', 'en',
                    '--includefrom', str(include), '--flags', 'unattend,onlymissing,nosubdirs']
            if not offline:
                print(f'{platform}: gathering details for up to {len(games)} games (cached games are reused)…', flush=True)
                run_scraper(base + ['-s', 'screenscraper'])
            print(f'{platform}: exporting cached details…', flush=True)
            run_scraper(base)
            saved, skipped = convert_export(export, source, games, output, platform)
            counts[0] += saved
            counts[1] += skipped
    return counts


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--card', type=Path, required=True, help='SD card root containing Games/GB, GBC or GBA')
    parser.add_argument('--output', type=Path, help='optional staging folder; default: card root')
    parser.add_argument('--platform', choices=PLATFORMS, help='default: all supported folders')
    parser.add_argument('--limit', type=int, help='only the first N ROMs per platform, for a trial')
    parser.add_argument('--offline', action='store_true', help='export this helper’s existing cache without login or scraping')
    parser.add_argument('--skyscraper', default='Skyscraper', help='installed Skyscraper executable')
    parser.add_argument('--cache', type=Path, default=Path.home() / '.cache' / 'slot-cart-studio', help='persistent local download cache')
    args = parser.parse_args()
    if args.limit is not None and args.limit < 1:
        parser.error('--limit must be positive')
    if not (args.card / 'Games').is_dir():
        parser.error('--card must point to the card root containing Games')
    executable = shutil.which(args.skyscraper)
    if not executable:
        parser.error('Install Skyscraper first: https://gemba.github.io/skyscraper/INSTALLATION/')
    try:
        import PIL  # Fail before login or any download if conversion dependencies are missing.
    except ImportError:
        parser.error('Install Pillow first: python3 -m pip install Pillow')
    card = args.card.resolve()
    output = (args.output or card).resolve()
    cache = args.cache.expanduser().resolve()
    if cache.is_relative_to(card):
        parser.error('Keep the download cache on your computer, outside the SD card')
    platforms = [args.platform] if args.platform else list(PLATFORMS)
    if not any(roms(card, p) for p in platforms):
        parser.error('No supported games found in the selected platform folders')
    with tempfile.TemporaryDirectory(prefix='slot-login-') as directory:
        config = Path(directory) / 'config.ini'
        if args.offline:
            config.write_text('[main]\nthreads=1\n', encoding='utf-8')
        else:
            if not sys.stdin.isatty():
                raise ValueError('Run in an interactive terminal so the password can be entered privately')
            print('Your normal ScreenScraper account is used by the installed Skyscraper.')
            username = input('ScreenScraper username: ').strip()
            password = getpass.getpass('ScreenScraper password (hidden): ')
            write_config(config, username, password)
            del password
        saved, skipped = collect(card, output, executable, config, cache, platforms, args.offline, args.limit)
    print(f'Done: {saved} games written, {skipped} existing metadata files preserved. Output: {output}')
    print('Open the card in Cart Studio to review details. The handheld needs a compatible details reader.')


if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        print('\nStopped. Cached downloads can be reused next time.')
        raise SystemExit(130)
    except (OSError, ValueError, RuntimeError, ET.ParseError) as error:
        print(f'Could not finish: {error}')
        raise SystemExit(1)
