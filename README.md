# LineSim

Draw lines, center-rectangles and circles on an A4 page. Lines show length and angle live and keep their labels, so you can screenshot the page. Everything is stored in real page millimetres, so zoom and window size never change the numbers.
<img width="734" height="486" alt="image" src="https://github.com/user-attachments/assets/33704ee6-e825-482d-a128-325d179e052b" />

## How to use

1. Open https://roboz1005.github.io/LineSim/ in Chrome on the tablet.
2. Chrome menu → **Install app** (or use the Install button under ⚙).

## Quick use

- Pen or mouse draws; one finger pans, two fingers pinch-zoom (turn on **Draw with finger** under ⚙ if needed).
- **Scale & unit** sets the scale (paper : real) and the unit shown in every label and in the page's top-right note. **Pages**: use ◀ ▶ ＋ 🗑 in the toolbar. Every page has its own drawing, undo history, scale, unit and orientation (a new page starts with the current page's settings). Tap the chip in a page's top-left corner to change that page's scale; the chip is not part of Snip or Hide UI screenshots.
- **Angle number** = the wedge the arc shows, between the dashed horizontal at the line's start and the line (0–90°).
- **Step mode** (Snap menu): choose **Length**, **Angle** or **Both**. The line's end moves in whole steps of the length step (in your unit) and/or the angle step at the start point. Snapping onto existing points still wins, so you can join lines.
- **Track lines** (Snap menu): dotted guides run horizontally/vertically through every point and along existing lines; the cursor snaps onto them. Snapping to a track line turns step mode off for that move.
- **Line style**: pick continuous or dashed next to the width buttons.
- **Edit a value**: tap a line, tap Length or Angle in the left panel, type with the right-hand keypad (no system keyboard) and press **OK**. Joints and horizontal/vertical lines stay intact; every length/angle that is **shown** stays fixed, hidden ones and the other between-line angles flex. If a shown value would have to break, you get a message: hide one to let it flex. **Parent / child**: the line a new line's **start** snaps onto becomes its parent (one parent can have many children). Editing a line never moves or changes its parents; the line and its children follow, and relations to other lines are kept. **Handle**: the selected line shows an orange handle at its end; drag it along the line to extend or retract it; the angle stays put (follows Length step if on). Same rules as typing a length. The left panel shows Parent/Children; the parent is outlined in blue. Physical-keyboard typing (digits, `.`, Backspace, Enter, Tab) works too, without any on-screen keyboard. The same keypad types into the Snap/Scale number boxes.
- **Erase**: tap a shape, or drag across shapes, to delete the nearest one under the pen. Undo brings it back.
- **Every label is tappable**: tap a length, an angle or a between-line angle to hide it; tap the faint dot (visible only while the UI shows) to bring it back. It stays that way until you tap again.
- **Measure → Hide new lengths & angles** starts new lines with everything hidden; the live readout while drawing still shows. **Angle color** sets one fixed color for all angles; lengths keep the line's color.
- **Snip**: drag a box (or tap **Page**); the area is copied to the clipboard as a clean PNG (no toolbar or ghost dots). If the browser blocks the clipboard it opens the share sheet or saves a file.
- **Hide UI** goes fullscreen for a clean screenshot. Tap the faint circle in the bottom-right corner to return.
