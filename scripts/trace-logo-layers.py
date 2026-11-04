# Traces the logo alpha masks into smooth vector paths so the
# logo stays crisp at any output size.
#
#   pip install potracer pillow numpy opencv-python-headless
#   python3 scripts/trace-logo-layers.py
#
# Reads src/assets/logo-layers/{core,fringeA,fringeB,sil}.png and
# writes src/assets/logo-layers/paths.json (with the logo bounds). Path coordinates are in
# layer pixels (the same space as the PNGs).
import json
import sys
from pathlib import Path

import cv2
import numpy as np
import potrace
from PIL import Image

UPSCALE = 4
LAYERS = ['core', 'fringeA', 'fringeB', 'sil']

folder = Path(__file__).resolve().parent.parent / 'src' / 'assets' / 'logo-layers'


def trace_mask(alpha: np.ndarray) -> str:
	height, width = alpha.shape
	big = cv2.resize(alpha, (width * UPSCALE, height * UPSCALE), interpolation=cv2.INTER_CUBIC)
	big = cv2.GaussianBlur(big, (0, 0), 1.2)
	solid = big > 127
	bitmap = potrace.Bitmap(~solid)
	path = bitmap.trace(turdsize=12, alphamax=1.0, opticurve=True, opttolerance=0.5)

	def point(p):
		return f'{p.x / UPSCALE:.2f} {p.y / UPSCALE:.2f}'

	parts = []
	for curve in path:
		parts.append(f'M{point(curve.start_point)}')
		for segment in curve.segments:
			if segment.is_corner:
				parts.append(f'L{point(segment.c)}L{point(segment.end_point)}')
				continue
			parts.append(f'C{point(segment.c1)} {point(segment.c2)} {point(segment.end_point)}')
		parts.append('Z')
	return ''.join(parts)


result = {}
bounds = {}
for name in LAYERS:
	alpha = np.array(Image.open(folder / f'{name}.png').convert('RGBA'))[..., 3]
	result[name] = trace_mask(alpha)
	if name == 'sil':
		rows, cols = np.where(alpha > 100)
		bounds = {'left': int(cols.min()), 'right': int(cols.max()), 'top': int(rows.min()), 'bottom': int(rows.max())}
	print(name, len(result[name]), file=sys.stderr)

result['bounds'] = bounds
(folder / 'paths.json').write_text(json.dumps(result, separators=(',', ':')))
