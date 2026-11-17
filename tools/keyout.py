#!/usr/bin/env python3
"""Chroma-key a flat green studio portrait into a feathered RGBA cutout.

usage: keyout.py in.png out.png
"""
import sys
import numpy as np
from PIL import Image, ImageFilter
import cv2

SRC, DST = sys.argv[1], sys.argv[2]
im = Image.open(SRC).convert('RGB')
a = np.asarray(im).astype(np.float32) / 255.0
H, W = a.shape[:2]

r, g, b = a[..., 0], a[..., 1], a[..., 2]
# how much greener than the other channels the pixel is
greenness = g - np.maximum(r, b)

# background estimate from the border ring
border = np.concatenate([a[0:12].reshape(-1, 3), a[-12:].reshape(-1, 3),
                         a[:, 0:12].reshape(-1, 3), a[:, -12:].reshape(-1, 3)])
bg = np.median(border, axis=0)
print('border rgb', np.round(bg, 3))

# alpha ramps from 1 (not green) to 0 (pure key green)
alpha = np.clip(1.0 - (greenness - 0.045) / 0.10, 0.0, 1.0)

# secondary test: distance from the key colour, catches soft green glow
dist = np.linalg.norm(a - bg[None, None, :], axis=2)
alpha = np.minimum(alpha, np.clip((dist - 0.10) / 0.16, 0.0, 1.0))

# grabCut removes everything that is not the person (shadows / light spills on
# the screen that are not green at all), while the greenness ramp above keeps
# the silhouette edge soft and feathered.
bgr = (np.clip(a, 0, 1) * 255).astype(np.uint8)[:, :, ::-1]
gcmask = np.zeros((H, W), np.uint8)
rect = (8, 8, W - 16, H - 16)
bgm = np.zeros((1, 65), np.float64)
fgm = np.zeros((1, 65), np.float64)
cv2.grabCut(bgr, gcmask, rect, bgm, fgm, 6, cv2.GC_INIT_WITH_RECT)
fg = ((gcmask == cv2.GC_FGD) | (gcmask == cv2.GC_PR_FGD)).astype(np.float32)
fg = cv2.GaussianBlur(fg, (0, 0), 1.4)
alpha = np.minimum(alpha, np.clip(fg, 0, 1))

# keep the interior opaque: flood the background from the border so any green
# reflection inside the figure (rare) does not punch holes
mask = (alpha < 0.5).astype(np.uint8)
n, lab, stats, _ = cv2.connectedComponentsWithStats(mask, 8)
keep = np.zeros_like(mask)
for i in range(1, n):
    x, y, w, h, area = stats[i]
    touches = x <= 2 or y <= 2 or x + w >= W - 2 or y + h >= H - 2
    if touches and area > 500:
        keep[lab == i] = 1
alpha = np.where(keep == 0, 1.0, alpha)

# close pinholes, then feather the edge
a8 = (alpha * 255).astype(np.uint8)
a8 = cv2.morphologyEx(a8, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
a8 = cv2.GaussianBlur(a8, (0, 0), 1.1)

# un-premultiply the green screen back out of the soft edge so hair and
# shoulders do not keep a green fringe
af = np.clip(alpha, 0.0, 1.0)[..., None]
a_safe = np.maximum(af, 0.12)
F = (a - bg[None, None, :] * (1.0 - af)) / a_safe
F = np.where(af > 0.02, np.clip(F, 0.0, 1.0), a)

# despill: clamp green to the local max of red/blue
fr, fg_, fb = F[..., 0], F[..., 1], F[..., 2]
maxrb = np.maximum(fr, fb)
spill = np.clip(fg_ - maxrb * 1.015, 0, 1)
fg_ = fg_ - spill * 0.95
out = np.stack([fr, fg_, fb], axis=-1)

rgba = np.dstack([np.clip(out, 0, 1) * 255, a8]).astype(np.uint8)
img = Image.fromarray(rgba, 'RGBA')
# trim to content with a small margin
bbox = img.getbbox()
if bbox:
    pad = 6
    box = (max(0, bbox[0] - pad), max(0, bbox[1] - pad),
           min(W, bbox[2] + pad), min(H, bbox[3] + pad))
    img = img.crop(box)
img.save(DST)
print('saved', DST, img.size)
