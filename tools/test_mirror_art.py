from io import BytesIO
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from PIL import Image
from mirror_art import art_paths, optimized_png, mirror

class MirrorTests(unittest.TestCase):
    def png(self):
        out=BytesIO();Image.new('RGBA',(40,20),(10,20,30,0)).save(out,format='PNG');return out.getvalue()
    def test_native_size_and_transparency_survive(self):
        image=Image.open(BytesIO(optimized_png(self.png()))).convert('RGBA')
        self.assertEqual(image.size,(40,20));self.assertEqual(image.getpixel((0,0))[3],0)
    def test_paths_cannot_escape_the_mirror(self):
        for path in ['../secret.png','/secret.png','https://evil.invalid/a.png']:
            with self.assertRaises(ValueError):art_paths({'x':{'support-texture':path}})
    def test_index_is_published_only_after_every_image(self):
        raw=json.dumps({'x':{'support-texture':'GBA/support-texture/x.png'}}).encode()
        with tempfile.TemporaryDirectory() as folder:
            target=Path(folder)
            with patch('mirror_art.download',side_effect=ValueError('offline')):
                with self.assertRaises(ValueError):mirror(target,raw)
            self.assertFalse((target/'index.json').exists())
            with patch('mirror_art.download',return_value=self.png()):mirror(target,raw)
            self.assertTrue((target/'GBA/support-texture/x.png').is_file())
            self.assertEqual(json.loads((target/'index.json').read_text())['x']['support-texture'],'GBA/support-texture/x.png')
