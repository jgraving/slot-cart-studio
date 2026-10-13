"""Extract optional display text from ScreenScraper's existing game response."""

def metadata(game):
    def text(value):
        if isinstance(value, dict):
            value = value.get('text', '')
        return str(value).strip()[:8192] if isinstance(value, (str, int)) else ''
    def english(items, field='text'):
        if not isinstance(items, list):
            return ''
        ordered = sorted((i for i in items if isinstance(i, dict)),
                         key=lambda i: i.get('langue', '').lower() not in ('en', 'eng'))
        return next((text(i.get(field)) for i in ordered if text(i.get(field))), '')
    result = {'version': 1, 'source': 'ScreenScraper · https://www.screenscraper.fr/'}
    result['description'] = english(game.get('synopsis'))
    for field, key in [('developer', 'developpeur'), ('publisher', 'editeur'), ('players', 'joueurs')]:
        result[field] = text(game.get(key))[:256]
    genres = game.get('genres', [])
    if isinstance(genres, list):
        result['genre'] = ', '.join(filter(None, (english(g.get('noms')) for g in genres if isinstance(g, dict))))[:256]
    dates = game.get('dates', [])
    if isinstance(dates, list):
        result['year'] = next((text(d.get('text'))[:4] for d in dates if isinstance(d, dict) and text(d.get('text'))[:4].isdigit()), '')
    return {k: v for k, v in result.items() if v}
