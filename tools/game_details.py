"""Compile optional display text from the harvester's ScreenScraper response."""
import re


def metadata(game, regions=('us', 'wor', 'eu', 'jp')):
    def text(value):
        if isinstance(value, dict):
            value = value.get('text', '')
        if not isinstance(value, (str, int)):
            return ''
        return re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f]', '', str(value)).strip()[:8192]

    def items(value):
        return [i for i in value if isinstance(i, dict)] if isinstance(value, list) else []

    def english(value):
        ordered = sorted(items(value),
                         key=lambda i: str(i.get('langue', '')).lower() not in ('en', 'eng'))
        return next((text(i) for i in ordered if text(i)), '')

    def regional(value):
        def rank(item):
            region = str(item.get('region', '')).lower()
            return regions.index(region) if region in regions else len(regions)
        return next((text(i) for i in sorted(items(value), key=rank) if text(i)), '')

    if not isinstance(game, dict):
        game = {}
    result = {'version': 1, 'source': 'ScreenScraper · https://www.screenscraper.fr/'}
    result['title'] = regional(game.get('noms'))[:256]
    result['description'] = english(game.get('synopsis'))
    for field, key in [('developer', 'developpeur'), ('publisher', 'editeur'), ('players', 'joueurs')]:
        result[field] = text(game.get(key))[:256]
    result['genre'] = ', '.join(dict.fromkeys(filter(None,
        (english(g.get('noms')) for g in items(game.get('genres'))))))[:256]
    date = regional([d for d in items(game.get('dates')) if re.match(r'^\d{4}', text(d))])
    result['year'] = date[:4]
    return {k: v for k, v in result.items() if v}
