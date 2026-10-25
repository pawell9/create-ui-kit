# Figma MCP gotchas (observed in production)

Each item cost at least one failed iteration on a real kit. `figma-use` covers the generic Plugin API rules; these are the ones it does not, or that bit hardest.

## Connection
The official Figma MCP is the remote server `https://mcp.figma.com/mcp` (http), present either through the official Figma plugin or as an entry in `mcpServers` of `~/.claude.json`. Missing tools or a failing `whoami` → stop and tell the user. Edit `~/.claude.json` only with their consent; an existing `figma` entry is shown, never overwritten. After a change the user restarts Claude Code; the first file call opens the Figma OAuth page (Allow Access to the right workspace). The skill installs nothing on its own.

## Which read tool
| Need | Tool |
|---|---|
| structure, sizes, ids of a frame; view-only files | `get_metadata` (XML, cheap; per frame, not per page) |
| facts across many frames, exact props of a node | `use_figma` + `audit.js` (aggregates within budget) |
| what it looks like | `get_screenshot` per node |
| enabled libraries / their components | `get_libraries`, then `search_design_system` |
| code for implementation | `get_design_context` — code-oriented and heavy, needs the `figma-design-to-code` skill; not used for building or verifying the kit |

## Calls and output
- **Atomicity.** A call that throws is rolled back entirely. A call that returns an error object after some mutations keeps them. So: all checks first, then mutations; after the first mutation, let exceptions propagate.
- **Budget.** Keep each result ≤ 15 KB measured in UTF-8 bytes; Cyrillic is 2 bytes per character, so `string.length` underestimates. Return aggregates and ids, never node dumps; page with a cursor.
- **Layout settles after the call.** Sizes read in the call that mutated can be pre-layout. Verify geometry in a separate read-only call.
- **Page context** resets to the first page on every call. Scripts that create nodes call `await figma.setCurrentPageAsync(target)` once, right after the guard. Reading other pages by id works without switching (`await page.loadAsync()` before reading its children).
- There is no version-history API in `use_figma` (`saveVersionHistoryAsync` is absent from its typings): restore points are versions the user saves.
- `use_figma` needs edit access to the file. View-only files can only be read through `get_metadata` and `get_screenshot`.

## Fonts
- The remote MCP does not see fonts installed on the user's machine. It sees the Figma catalog and fonts uploaded to the user's Figma account, team or org. A missing font → ask the user to upload it (Settings → Account → Fonts), then re-check. Never substitute.
- **Same family name, different metrics**: the catalog version of a font can lay text out ~10 % wider than the designer's local version. Check before building: render one source text with the same properties in a temp node and compare its width with the source node. Mismatch → the user uploads their version.
- Editing existing text (corrections): load the fonts the node has now — `node.getStyledTextSegments(['fontName'])` — not the fonts you plan to set.
- Load every font a script touches in every call, before the first mutation: `await Promise.all(fonts.map(f => figma.loadFontAsync(f)))`, aborting on failure. Style names come from `listAvailableFontsAsync` ("SemiBold" ≠ "Semi Bold").

## Text
- **Cap-height trim.** If the sources use `leadingTrim = 'CAP_HEIGHT'`, put it into the Text Styles. Setting `leadingTrim` on a node after `setTextStyleIdAsync` detaches the style (`textStyleId` becomes `''`). Apply the style and leave trim alone; verify `textStyleId` after writing.
- With cap-height trim, descenders (Cyrillic Д Ц Щ, Latin g p y, commas) render outside the text box. Any clipping parent cuts them → wrappers around text keep `clipsContent = false`.
- Any local override of a style property (e.g. `textCase`) detaches the style. Need a variant of a style (file names in original case) → create a separate style.
- Text Style ids look like `S:<key>,` — the trailing comma is part of the id; without it the style is silently not applied.
- A Text Style carries no color; bind the text fill to a Variable.
- **Variable modes do not switch Text Styles.** A component whose text size differs between breakpoints needs a `Breakpoint` variant with the right style in each variant; a mode on the parent changes sizes and radii only. Components left without it caused wrong text sizes in every T/M composition.
- An instance whose layout looks stale after a mode change relaxes when its text property is set again (set another value, then the original).

## Components and properties
- **`clone()` of a variant drops `componentPropertyReferences`** on the copied layers. After cloning, relink every TEXT/BOOLEAN/INSTANCE_SWAP reference and check them (`qa.js` reports `PROP_UNBOUND`). Variants added later (Hover, Error) are where this goes missing.
- Add component properties on the COMPONENT_SET, then reference them from layers of every variant: `layer.componentPropertyReferences = { characters: key }` (key as returned by `addComponentProperty`, e.g. `Label#12:3`).
- Nested instances hidden by a boolean are absent from `findAll` on an instance until the boolean is enabled.
- Expose nested instances users must edit (`isExposedInstance = true`) — no Detach needed.
- The opacity of a variable-bound paint does not reach instances. Tints → a separate layer with node opacity.
- Manual resize switches Hug to Fixed. Containers that must grow (forms with error messages) use Hug + `minHeight`.
- `layoutPositioning = 'ABSOLUTE'` inside auto layout only for overlays: focus rings, dropdown lists, decoration. Record each in the ledger.
- Complex shapes (chamfered buttons, dashed outlines with cut corners) are copied, not approximated: read the source `vectorNetwork`, `strokes`, `strokeWeight`, `strokeAlign`, `dashPattern`, `strokeCap`, `strokeJoin` and recreate them with `setVectorNetworkAsync` on the target page. `clone()` of a source node is off-limits: the clone appears on the source page.

## Variables
- Set `scopes` at creation. A binding outside scope works but the variable disappears from pickers. Fill on frames → `FRAME_FILL`; on shapes → `SHAPE_FILL`; text → `TEXT_FILL`; strokes → `STROKE_COLOR`; radius → `CORNER_RADIUS`; sizes → `WIDTH_HEIGHT`; gaps/padding → `GAP`.
- Each `Breakpoint` variant pins its mode: `variant.setExplicitVariableModeForCollection(sizeCollection, modeId)`. Unpinned variants inherit whatever the parent frame has.
- `cornerRadius` is bound per corner: `topLeftRadius`, `topRightRadius`, `bottomLeftRadius`, `bottomRightRadius`.
- `setBoundVariableForPaint` returns a new paint; assign it back into a new `fills` array.
- Service-only variables: `hiddenFromPublishing = true`. Components and styles whose names start with `_` are not published.
- Pre-existing collections in the client file stay untouched unless G2 says otherwise.

## Screenshots
- `get_screenshot` per node id, `maxDimension` ~1600 for a chapter, ~800 for a component set. A whole UI Kit page is unreadable at any size.
- Light-colored icons and labels vanish on a light documentation scene — every screenshot review looks for invisible elements.
