# ActiLens brand assets

This directory is the source of truth for the ActiLens product identity.

## Files

- `svg/mark.svg` — primary standalone mark.
- `svg/mark-white.svg` — inverse single-color mark.
- `svg/mark-mono.svg` — dark single-color mark.
- `svg/lockup.svg` — horizontal mark + wordmark for light surfaces.
- `svg/lockup-inverse.svg` — horizontal white lockup.
- `svg/app-icon.svg` — rounded-square application icon and raster export source.

Runtime copies live next to the applications that consume them so builds do not depend on cross-workspace asset traversal.

## Core palette

| Token | Value |
| --- | --- |
| Cyan | `#39C6FF` |
| Blue | `#1769FF` |
| Indigo | `#3C32EE` |
| Violet | `#7B2CF2` |
| Highlight violet | `#B45CFF` |
| Wordmark navy | `#0B1D51` |

The mark represents **Acti + Lens**: the folded A communicates activity/motion; the circular focus point and curved fold communicate lens, observation, and focus.

Keep the aspect ratio and clear space. Do not redraw, rotate, add glows/shadows, or change individual gradient stops in product code. At small sizes prefer the square app icon. Raster installer/browser exports must be rendered from `svg/app-icon.svg`, never from screenshots or concept art.
