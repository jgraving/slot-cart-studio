#!/usr/bin/env python3
"""Build a static, same-origin copy of Studio's public artwork (never user files)."""
import argparse
from concurrent.futures import ThreadPoolExecutor
from hashlib import sha256
from io import BytesIO
import json
from pathlib import Path, PurePosixPath
import shutil
import time
import subprocess
from PIL import Image

SOURCE = 'https://art.slot-cfw.fyi/'
VERSION = 1
MEDIA = ('support-texture', 'wheel')

def download(url):
    return subprocess.check_output(['curl','--fail','--silent','--show-error','--location','--retry-all-errors','--retry','8','--retry-delay','1','--retry-max-time','180','--connect-timeout','15','--max-time','45',url])

def art_paths(index):
    paths = set()
    for entry in index.values():
        for kind in MEDIA:
            name = entry.get(kind)
            if not name: continue
            path = PurePosixPath(name)
            if path.is_absolute() or '..' in path.parts or ':' in name or not name.endswith('.png'):
                raise ValueError(f'Invalid artwork path: {name}')
            paths.add(name)
    return sorted(paths)

def optimized_png(data):
    # Keep native dimensions and transparency. A palette bounds the photographic
    # scans' storage cost without resizing them or touching anyone's custom PNGs.
    with Image.open(BytesIO(data)) as image:
        if image.format != 'PNG' or image.width * image.height > 16_000_000:
            raise ValueError('Expected a bounded PNG scan')
        image = image.convert('RGBA')
        output = BytesIO()
        image.quantize(colors=256, method=Image.Quantize.FASTOCTREE).save(output, format='PNG', optimize=True)
        result = output.getvalue()
        return result if len(result) < len(data) else data

def mirror(target, raw, sample=0):
    target.mkdir(parents=True, exist_ok=True)
    catalog = json.loads(raw)
    if sample:
        catalog = dict(list(catalog.items())[:sample])
    digest = sha256(json.dumps(catalog, sort_keys=True).encode()).hexdigest()
    marker = {'source_sha256': digest, 'version': VERSION}
    paths = art_paths(catalog)
    complete = target / 'mirror-info.json'
    cached = json.loads(complete.read_text()) if complete.exists() else None
    if cached != marker:
        # A new catalog can reuse existing immutable, checksum-addressed files.
        def one(name):
            path = target / name
            if path.is_file(): return
            data = optimized_png(download(SOURCE + name))
            path.parent.mkdir(parents=True, exist_ok=True)
            temporary = path.with_suffix('.tmp')
            temporary.write_bytes(data)
            temporary.replace(path)
        with ThreadPoolExecutor(max_workers=8) as pool:
            for i, _ in enumerate(pool.map(one, paths), 1):
                if i % 500 == 0: print(f'Mirrored {i}/{len(paths)} images', flush=True)
    missing = [name for name in paths if not (target / name).is_file()]
    if missing: raise ValueError(f'Missing mirrored images: {missing[:3]}')
    size = sum((target / name).stat().st_size for name in paths)
    if size > 750 * 1024 * 1024:
        raise ValueError(f'Artwork exceeds the static-site size budget: {size} bytes')
    # Publish the index only once every image is present; a partial set never deploys.
    (target / 'index.json').write_text(json.dumps(catalog, separators=(',', ':')) + '\n')
    complete.write_text(json.dumps(marker) + '\n')
    print(f'{len(catalog)} entries, {len(paths)} images, {size / 1024 / 1024:.1f} MiB')

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('target', type=Path)
    parser.add_argument('--catalog', type=Path)
    parser.add_argument('--sample', type=int, default=0)
    parser.add_argument('--catalog-only', action='store_true')
    parser.add_argument('--copy-to', type=Path)
    args = parser.parse_args()
    raw = args.catalog.read_bytes() if args.catalog and args.catalog.exists() else download(SOURCE + 'index.json')
    if args.catalog_only:
        args.target.parent.mkdir(parents=True, exist_ok=True)
        args.target.write_bytes(raw)
        print(sha256(raw).hexdigest())
        return
    mirror(args.target, raw, args.sample)
    if args.copy_to:
        shutil.copytree(args.target, args.copy_to, dirs_exist_ok=True)

if __name__ == '__main__': main()
