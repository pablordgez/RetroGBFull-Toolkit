---
sidebar_position: 4
title: Text and Window
---

## `Text.h`

Header: `core/src/Assets/Text/Text.h`

### `TextLayer`

| Value | Meaning |
| --- | --- |
| `TEXT_LAYER_BACKGROUND` | Draw on the background layer. |
| `TEXT_LAYER_WINDOW` | Draw on the window layer. |

### `TextHandle`

| Field | Type | Meaning |
| --- | --- | --- |
| `active` | `uint8_t` | Nonzero when the handle has visible text. |
| `layer` | `uint8_t` | Target layer. |
| `x`, `y` | `uint8_t` | Text position in tiles. |
| `tilemap_y` | `uint8_t` | Window tilemap row used for drawing. |
| `width`, `height` | `uint8_t` | Bounding rectangle in tiles. |
| `saved_tiles_valid` | `uint8_t` | Nonzero when saved tiles can be restored. |
| `first_tile` | `uint8_t` | First allocated tile slot. |
| `tile_count` | `uint8_t` | Number of allocated tiles. |
| `text_bank` | `uint8_t` | ROM bank containing the string. |
| `saved_tiles` | `uint8_t*` | Tile backup. |
| `text` | `const unsigned char*` | Current string. |

### `TextMetrics`

| Field | Type | Meaning |
| --- | --- | --- |
| `tile_count` | `uint8_t` | Tiles needed for the string. |
| `x`, `y` | `uint8_t` | Render position. |
| `width`, `height` | `uint8_t` | Bounding rectangle in tiles. |

### Functions

| Function | Description |
| --- | --- |
| `void init_text_handle(TextHandle* handle) BANKED;` | Zero-initializes a caller-owned handle. |
| `TextHandle* create_text_handle(void) BANKED;` | Allocates and initializes a new handle. |
| `void destroy_text_handle(TextHandle* handle) BANKED;` | Removes active text, then frees the handle. |
| `void remove_text(TextHandle* handle) BANKED;` | Restores overwritten tiles and frees tile slots. |
| `uint8_t move_text(TextHandle* handle, uint8_t x, uint8_t y) BANKED;` | Redraws an active handle at a new position. |
| `uint8_t update_text(TextHandle* handle, const unsigned char* text);` | Redraws an active handle with new text at the same layer and tile position. Returns nonzero on success. |
| `void clear_all_text(void) BANKED;` | Removes every active text handle. |
| `void text_set_font(uint8_t font_index) BANKED;` | Selects the font for future draw and measure calls. |
| `void text_set_colors(uint8_t fg, uint8_t bg) BANKED;` | Changes VWF foreground and background colors. |


### Behavior notes

- Up to 8 text handles can be active at once.

## `WindowVisibility.h`

Header: `core/src/Window/WindowVisibility.h`

### Constants

| Name | Value | Meaning |
| --- | --- | --- |
| `WINDOW_VISIBILITY_OWNER_SCENE` | `1U` | Owner ID for scene window maps. |
| `WINDOW_VISIBILITY_OWNER_TEXT` | `2U` | Owner ID reserved for window-layer text. |
| `WINDOW_VISIBILITY_MAX_BANDS` | `8U` | Maximum visibility bands before merging. |

### Functions

| Function | Description |
| --- | --- |
| `void window_visibility_clear_owner(uint8_t owner) BANKED;` | Removes every visibility band associated with `owner`. |
| `uint8_t window_visibility_add_band(uint8_t owner, uint8_t start_ly, uint8_t end_ly) BANKED;` | Adds one visible screen band for the owner. Returns nonzero on success. |
| `uint8_t window_visibility_apply(void) BANKED;` | Merges all bands and applies window visibility. |

### Behavior notes

- Bands are expressed in screen scanlines, not tile rows.
- `window_visibility_apply()` hides the window if there are no active bands.
- Overlapping or touching bands are merged.
