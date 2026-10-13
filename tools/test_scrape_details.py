import contextlib
import io
import json
from pathlib import Path
import stat
import tempfile
import unittest
from unittest.mock import patch
from xml.sax.saxutils import escape
from PIL import Image
import scrape_details as helper


class HelperTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()
        self.card = self.root / 'card'
        self.input = self.card / 'Games/GB'
        self.input.mkdir(parents=True)
        self.rom = self.input / 'Pokémon (USA).gb'
        self.rom.write_bytes(b'original ROM')
        self.export = self.root / 'export'
        self.export.mkdir()
        self.image = self.export / 'cover.jpg'
        Image.new('RGB', (900, 1200), 'red').save(self.image)

    def export_xml(self, rom=None, image=None):
        (self.export / 'gamelist.xml').write_text(
            '<gameList><game><path>' + escape(str(rom or self.rom)) + '</path>'
            '<name>Pokémon</name><desc>Text &amp; more</desc><releasedate>19960928T000000</releasedate>'
            '<thumbnail>' + escape(str(image or self.image)) + '</thumbnail></game></gameList>', encoding='utf-8')

    def convert(self):
        return helper.convert_export(self.export, self.input, [self.rom], self.card, 'GB')

    def test_convert_preserves_rom_and_roundtrips_slot_sidecars(self):
        self.export_xml()
        self.assertEqual(self.convert(), (1, 0))
        dest = self.card / 'Metadata/GB/Pokémon (USA).json'
        data = json.loads(dest.read_text())
        self.assertEqual(data['version'], 1)
        self.assertEqual(data['description'], 'Text & more')
        self.assertEqual(data['year'], '1996')
        with Image.open(self.card / data['box_art']) as image:
            self.assertEqual(image.format, 'PNG')
            self.assertLessEqual(max(image.size), 720)
        self.assertEqual(self.rom.read_bytes(), b'original ROM')
        dest.write_text('{"description":"my edits"}')
        self.assertEqual(self.convert(), (0, 1))
        self.assertEqual(json.loads(dest.read_text())['description'], 'my edits')

    def test_relative_rom_and_art_paths_are_resolved_from_input(self):
        import os
        self.export_xml('./' + self.rom.name, os.path.relpath(self.image, self.input))
        self.assertEqual(self.convert(), (1, 0))

    def test_rom_outside_selected_set_is_ignored(self):
        self.export_xml(self.root / self.rom.name)
        self.assertEqual(self.convert(), (0, 0))

    def test_external_art_and_entities_are_rejected(self):
        self.export_xml(image=self.rom)
        with self.assertRaises(ValueError):
            self.convert()
        (self.export / 'gamelist.xml').write_text('<!DOCTYPE x><gameList/>')
        with self.assertRaises(ValueError):
            self.convert()

    def test_missing_and_broken_art_still_exports_text(self):
        self.export_xml(image=self.export / 'missing.png')
        self.assertEqual(self.convert(), (1, 0))
        data = json.loads((self.card / 'Metadata/GB/Pokémon (USA).json').read_text())
        self.assertNotIn('box_art', data)

    def test_output_symlink_is_rejected(self):
        (self.card / 'Metadata').symlink_to(self.export, target_is_directory=True)
        self.export_xml()
        with self.assertRaises(ValueError):
            self.convert()

    def test_duplicate_stems_are_rejected(self):
        (self.input / 'Pokémon (USA).gbc').write_bytes(b'other ROM')
        with self.assertRaises(ValueError):
            helper.roms(self.card, 'GB')

    def test_login_is_private_and_escaped(self):
        path = self.root / 'config.ini'
        helper.write_config(path, 'user', 'a:b"c\\d')
        self.assertEqual(stat.S_IMODE(path.stat().st_mode), 0o600)
        self.assertIn('userCreds="user:a:b\\"c\\\\d"', path.read_text())
        with self.assertRaises(ValueError):
            helper.ini_string('pass\nword')

    def test_collection_uses_scraper_and_offline_export_without_credentials_in_argv(self):
        calls = []
        def fake_scraper(cmd):
            calls.append(cmd)
            if '-s' in cmd:
                self.assertEqual(cmd[-1], 'screenscraper')
                return
            dest = Path(cmd[cmd.index('-g') + 1])
            (dest / 'gamelist.xml').write_text('<gameList><game><path>' + escape(str(self.rom)) +
                '</path><desc>Collected by scraper</desc></game></gameList>')
            self.assertIn('<gamebox/>', Path(cmd[cmd.index('-a') + 1]).read_text())
        with patch.object(helper, 'run_scraper', side_effect=fake_scraper), contextlib.redirect_stdout(io.StringIO()):
            result = helper.collect(self.card, self.card, 'Skyscraper', self.root / 'config.ini',
                                    self.root / 'cache', ['GB'], limit=1)
            self.assertEqual(result, [1, 0])
            self.assertEqual(len(calls), 2)
            self.assertTrue(all('-u' not in cmd for cmd in calls))
            calls.clear()
            helper.collect(self.card, self.card, 'Skyscraper', self.root / 'config.ini',
                           self.root / 'cache', ['GB'], offline=True)
            self.assertEqual(len(calls), 1)
            self.assertNotIn('-s', calls[0])


if __name__ == '__main__':
    unittest.main()
