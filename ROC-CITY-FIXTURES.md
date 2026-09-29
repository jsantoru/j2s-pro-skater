# ROC City bank, railing and bench fixes

The three reported screenshots exposed a hollow bank, a railing path detached
from the concrete edge, and bench parts that rotated around different origins.

The flower plateau and both central-bank sections now have concrete retaining
faces derived from the exact boundaries of their riding surfaces. Their tops
are unchanged. A real input sequence reproduced the diagonal under-bank entry
before the fix. Besides the missing faces, the controller ignored wall impacts
at shallow angles; ROC's retaining faces, adjacent G hubbas and park furniture
now opt into shallow-angle blocking. Impact severity uses the normal component
of velocity on these surfaces. Other collision responses retain their existing
threshold, including Warehouse.

The west railing follows the actual deck outline with inset, supported feet and
shared corner posts. The raised eastern flower-deck railing is also seated on
its plateau. The curved F ledge moves one authored metre inward to clear the
railing; its shape, height, grind links and widths are preserved. Cap 2 moves
with that line without changing its identifier or goal.

Both benches are built from shared local coordinates: boards, frames, legs and
feet transform together. Their collision boxes use the same definitions. The
southern bench sits on the paved entry apron, clear of the bike path. Railing
collision uses a narrow body-clearance envelope between its three bars, leaving
the park's entry openings usable.

## Verification

- 101 ROC simulation checks pass, including 15 focused checks for the reported
  defects at 1× and 1.25×. The original diagonal input sequence never enters
  below the bank; ordinary ascents and descents still work.
- Every corner of all 32 railing feet is supported by the actual deck. Built
  bench geometry has aligned slat ends and supported feet. Approaches stop at
  fixtures, and both entry routes remain open in both directions.
- F grinds work in both directions; its original rail geometry matches after
  accounting for the intentional translation. All five caps remain collectible.
- Production browser checks cover navigation, independent saved careers,
  level switching, E and G controller grinds, touch skating and phone layouts.
  Warehouse geometry and its control screenshot remain unchanged.
- Existing camera/feel and revert tests pass after the scoped collision change.

`screenshots/roc-fixtures/before-public` captures public version 11.
`after` captures the corrected production build, with its physics report and
full simulation log. `integration`, `scale` and `layout` contain browser evidence.
Ground-level views hide the rider/HUD for inspection; they are actual rendered
game geometry. The bench moves between the before/after views.

These are game geometry and collision corrections, not new surveyed dimensions.
Physical-phone performance has not been measured; mobile checks use touch
emulation. The existing Vite bundle-size advisory remains.
