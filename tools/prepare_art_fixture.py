"""Prepare an entirely synthetic same-origin artwork fixture for browser checks."""
import json
from pathlib import Path
import shutil
import sys

fixtures = Path(sys.argv[1])
target = Path('web/art')
if target.exists():
    shutil.rmtree(target)
(target/'fixture').mkdir(parents=True)
crc = json.loads((fixtures/'probe.json').read_text())['crc']
for source, name in [('GBA-scan.png','label.png'),('logo.png','logo.png')]:
    shutil.copyfile(fixtures/source, target/'fixture'/name)
(target/'index.json').write_text(json.dumps({crc:{
    'support-texture':'fixture/label.png', 'wheel':'fixture/logo.png'}})+'\n')
