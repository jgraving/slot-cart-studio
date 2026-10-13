"""Which media a cart still needs. Run from tools/: python3 -m unittest test_harvest"""

import tempfile
import unittest
from pathlib import Path

import harvest


class TodoFor(unittest.TestCase):
    def test_look_is_skipped_once_recorded_unless_relooked(self):
        root = Path(tempfile.mkdtemp())
        (root / 'wheel').mkdir()
        (root / 'wheel' / 'AAAA0000.png').write_bytes(b'x')
        index = {'AAAA0000': {'look': {'ground': '000000', 'band': None, 'sure': True, 'by': 'analysis'}}}
        wanted = ['wheel', 'look']
        self.assertEqual(harvest.todo_for('AAAA0000', wanted, index, root, relook=False), [])
        self.assertEqual(harvest.todo_for('AAAA0000', wanted, index, root, relook=True), ['look'])
        self.assertEqual(harvest.todo_for('BBBB1111', wanted, index, root, relook=False), ['wheel', 'look'])


    def test_metadata_resumes_from_json_without_disturbing_label_media(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'metadata').mkdir()
            (root / 'metadata' / 'AAAA0000.json').write_text('{"version":1}')
            wanted = ['metadata', 'box-3D']
            self.assertEqual(harvest.todo_for('AAAA0000', wanted, {}, root, False), ['box-3D'])
            self.assertEqual(harvest.todo_for('BBBB1111', wanted, {}, root, False), wanted)
            self.assertEqual(harvest.todo_for('AAAA0000', wanted, {}, root, False, redo=True), wanted)


class WriteIndex(unittest.TestCase):
    def test_the_index_is_compact_and_sorted(self):
        path = Path(tempfile.mkdtemp()) / 'index.json'
        harvest.write_index(path, {'BBBB1111': {'wheel': 'GB/wheel/BBBB1111.png'}, 'AAAA0000': {'look': None}})
        self.assertEqual(
            path.read_text(),
            '{"AAAA0000":{"look":null},"BBBB1111":{"wheel":"GB/wheel/BBBB1111.png"}}',
        )


class RegionsFor(unittest.TestCase):
    def test_a_dump_prefers_its_own_region(self):
        self.assertEqual(harvest.regions_for('Metroid Fusion (USA)'), ('us', 'wor', 'eu', 'jp'))
        self.assertEqual(harvest.regions_for('Metroid Fusion (USA, Australia)'), ('us', 'wor', 'eu', 'jp'))
        self.assertEqual(harvest.regions_for('Metroid Fusion (Japan)'), ('jp', 'us', 'wor', 'eu'))
        self.assertEqual(harvest.regions_for('Metroid Fusion (Europe) (En,Fr,De,Es,It)'), ('eu', 'us', 'wor', 'jp'))
        self.assertEqual(harvest.regions_for('Pokemon - Gelbe Edition (Germany)'), ('de', 'eu', 'us', 'wor', 'jp'))
        self.assertEqual(harvest.regions_for('Tetris (World) (Rev 1)'), ('wor', 'us', 'eu', 'jp'))
        self.assertEqual(harvest.regions_for('E60EC183'), ('us', 'wor', 'eu', 'jp'))

    def test_pick_follows_the_order_it_is_given(self):
        medias = [{'type': 'wheel', 'region': 'us', 'url': 'u'}, {'type': 'wheel', 'region': 'jp', 'url': 'j'}]
        self.assertEqual(harvest.pick(medias, 'wheel')['url'], 'u')
        self.assertEqual(harvest.pick(medias, 'wheel', harvest.regions_for('X (Japan)'))['url'], 'j')
        self.assertEqual(harvest.pick(medias, 'wheel', harvest.regions_for('X (France)'))['url'], 'u')


class Redo(unittest.TestCase):
    def test_redo_asks_for_every_media_again(self):
        root = Path(tempfile.mkdtemp())
        (root / 'wheel').mkdir()
        (root / 'wheel' / 'AAAA0000.png').write_bytes(b'x')
        index = {'AAAA0000': {'look': {'ground': '000000', 'band': None, 'sure': True, 'by': 'analysis'}}}
        self.assertEqual(harvest.todo_for('AAAA0000', ['wheel', 'look'], index, root, relook=False, redo=True), ['wheel', 'look'])


class MetadataHarvest(unittest.TestCase):
    def test_end_to_end_collection_and_resume(self):
        import contextlib
        import io
        import json
        from unittest.mock import patch
        with tempfile.TemporaryDirectory() as directory, contextlib.ExitStack() as stack:
            stack.enter_context(patch('sys.argv', ['harvest', '--dat', 'GB', '--out', directory,
                                                  '--media', 'metadata,box-3D']))
            stack.enter_context(patch.object(harvest, 'creds', return_value={}))
            stack.enter_context(patch.object(harvest, 'check_systems', return_value={'GB': 9}))
            stack.enter_context(patch.object(harvest, 'quota', return_value={
                'per_day': 100, 'today': 0, 'per_min': 60, 'threads': 1}))
            stack.enter_context(patch.object(harvest, 'dat_entries', return_value={'AAAA0000': 'Game (USA)'}))
            call = stack.enter_context(patch.object(harvest, 'call', return_value={'response': {'jeu': {
                'noms': [{'region': 'us', 'text': 'Game'}],
                'synopsis': [{'langue': 'en', 'text': 'Description'}],
                'medias': [{'type': 'box-3D', 'region': 'us', 'url': 'https://example.invalid/box'}]}}}))
            png = b'\x89PNG\r\n\x1a\n' + b'fixture'
            stack.enter_context(patch.object(harvest, 'fetch', return_value=png))
            stack.enter_context(patch.object(harvest.time, 'sleep'))
            stack.enter_context(contextlib.redirect_stdout(io.StringIO()))
            harvest.main()
            root = Path(directory)
            index = json.loads((root / 'index.json').read_text())
            entry = index['AAAA0000']
            self.assertEqual(json.loads((root / entry['metadata']).read_text())['description'], 'Description')
            self.assertEqual((root / entry['box-3D']).read_bytes(), png)
            harvest.main()
            self.assertEqual(call.call_count, 1)
            # A failed match must not leave a JSON file that suppresses retries.
            stack.enter_context(patch.object(harvest, 'dat_entries', return_value={'BBBB1111': 'Missing'}))
            call.return_value = {'response': {}}
            harvest.main()
            self.assertFalse((root / 'GB/metadata/BBBB1111.json').exists())
            self.assertNotIn('BBBB1111', json.loads((root / 'index.json').read_text()))


if __name__ == '__main__':
    unittest.main()
