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

if __name__ == '__main__':
    unittest.main()
