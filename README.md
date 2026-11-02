# LineSim

Draw lines, center-rectangles and circles on an A4 page. Lines show length and angle live and keep their labels, so you can screenshot the page and paste it into Samsung Notes. Everything is stored in real page millimetres, so zoom and window size never change the numbers.

## Deploy (GitHub Pages)

1. Create a repo and put these files in its root (keep the `icons/` folder).
2. Repo → **Settings → Pages → Deploy from a branch → `main` / root**.
3. Open `https://<user>.github.io/<repo>/` in Chrome on the tablet.
4. Chrome menu → **Install app** (or use the Install button under ⚙).

All paths are relative, so it works from a repo sub-path.

## Releasing an update

Bump `CACHE_VERSION` in `sw.js`. The new version loads the next time the app is opened.

## Quick use

- Pen or mouse draws; one finger pans, two fingers pinch-zoom (turn on **Draw with finger** under ⚙ if needed).
- **Scale & unit** sets the scale (paper : real) and the unit shown in every label and in the page's top-right note.
- **Angle number** = the wedge the arc shows, between the dashed horizontal at the line's start and the line (0–90°).
- **Step mode** (Snap menu): the line's end moves in whole steps of the length step (in your unit) and angle step. Snapping onto existing points still wins, so you can join lines.
- **Erase**: tap a shape, or drag across shapes, to delete the nearest one under the pen. Undo brings it back.
- Tap a between-line angle to hide it; tap the faint dot to bring it back.
- **Hide UI** goes fullscreen for a clean screenshot. Tap the faint circle in the bottom-right corner to return.
