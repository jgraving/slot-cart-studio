import unittest
from game_details import metadata

class DetailsTests(unittest.TestCase):
    def test_optional_and_english_fields(self):
        result = metadata({'synopsis': [{'langue': 'fr', 'text': 'FR'}, {'langue': 'en', 'text': 'English'}], 'developpeur': {'text': 'Nintendo'}, 'dates': [{'text': '2004-01-01'}], 'genres': [{'noms': [{'langue': 'en', 'text': 'Adventure'}]}]})
        self.assertEqual(result['description'], 'English')
        self.assertEqual(result['developer'], 'Nintendo')
        self.assertEqual(result['year'], '2004')
        self.assertEqual(result['genre'], 'Adventure')
    def test_bad_or_absent_fields_are_optional(self):
        self.assertNotIn('description', metadata({'synopsis': None, 'dates': [None]}))
        self.assertEqual(metadata({})['version'], 1)

    def test_titles_and_dates_follow_the_rom_region(self):
        game = {'noms': [{'region': 'us', 'text': 'US title'}, {'region': 'jp', 'text': 'JP title'}],
                'dates': [{'region': 'us', 'text': '2002-01-01'}, {'region': 'jp', 'text': '2001-12-01'}]}
        result = metadata(game, ('jp', 'us'))
        self.assertEqual(result['title'], 'JP title')
        self.assertEqual(result['year'], '2001')

    def test_malformed_optional_values_and_text_limits(self):
        result = metadata({'synopsis': [None, {'langue': None, 'text': 'x' * 9000}],
                           'noms': 'invalid', 'dates': [None, {'text': 'unknown'}]})
        self.assertEqual(len(result['description']), 8192)
        self.assertNotIn('title', result)
        self.assertNotIn('year', result)
        self.assertEqual(metadata(None)['version'], 1)

if __name__ == '__main__':
    unittest.main()
