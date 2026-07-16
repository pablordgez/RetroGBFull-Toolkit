---
sidebar_position: 3
title: Assets and Rendering
---

## `AssetEntry`

| Field | Type | Meaning |
| --- | --- | --- |
| `bank` | `uint8_t` | ROM bank containing the asset data. |
| `data` | `uint8_t*` | Asset data in that bank. |

## `Animation.h`

Header: `core/src/Assets/Animations/Animation.h`

### `Animation`

| Field | Type | Meaning |
| --- | --- | --- |
| `number_of_frames` | `uint8_t` | Number of frames in the animation. |
| `width`, `height` | `uint8_t` | Sprite dimensions in pixels. |
| `frame_duration` | `uint8_t` | Ticks per frame before advancing. |
| `animation_id` | `uint8_t` | Index into generated animation registries. |
| `metasprite` | `metasprite_t*` | Layout for multi-sprite animations. |

### `AnimationState`

Each actor with an active animation owns an `AnimationState`. The `Animation` describes the shared asset, while `AnimationState` stores the playback and rendering state for that particular actor.

| Field | Type | Meaning |
| --- | --- | --- |
| `speed_modifier` | `uint8_t` | Amount added to the animation timer on each update. It defaults to `1`; `0` pauses frame advancement. |
| `current_frame` | `uint8_t` | Zero-based frame currently being displayed. |
| `sprite_slot` | `uint8_t` | First hardware sprite slot allocated to this animation instance. |
| `props` | `uint8_t` | Current Game Boy sprite properties, including palette, priority, and flip flags. |
| `time_since_last_frame` | `uint8_t` | Accumulated animation ticks since the last frame change. |

The engine allocates and initializes this state when `set_actor_animation()` selects an animation, and releases it when that animation is removed or replaced. Game code can adjust fields such as `speed_modifier`, but it should not change `sprite_slot` because the animation system owns that allocation.

### Animation context

The low-level animation functions operate on the global `THIS_ANIMATION` and `THIS_ANIMATION_STATE` pointers. `set_animation_context()` copies the current `THIS_ACTOR->current_animation` and `THIS_ACTOR->animation_state` into those pointers.

Call `set_animation_context()` after selecting the target through `THIS_ACTOR` and before directly calling any function that uses the current animation context:

- `load_animation()`
- `unload_animation()`
- `set_animation_props()`
- `move_animation()`
- `update_animation()`
- `hide_animation()`

In normal game code, `load_animation()` and `unload_animation()` should remain managed by `set_actor_animation()`. The most common direct use is changing properties:

```c
THIS_ACTOR = actor;
set_animation_context();
set_animation_props(S_FLIPX, sprite_x, sprite_y);
```

Set the context again whenever `THIS_ACTOR` changes before another direct animation call. The context is global and remains pointed at the last selected actor; restoring `THIS_ACTOR` by itself does not restore `THIS_ANIMATION` or `THIS_ANIMATION_STATE`.

You do **not** need to call `set_animation_context()`:

- Before `set_actor_animation()`, because that function manages the context needed to load or unload an animation.
- For normal scene rendering through the actor draw loop, because `draw()` sets the context before updating the animation.
- When using actor movement, positioning, tags, or collision functions that do not call the low-level animation API.
- Before `init_animation_state(state)`, because it receives the state pointer explicitly.

If you call a low-level animation function immediately after `set_actor_animation()`, still set the context explicitly. `set_actor_animation()` returns early when the requested animation is already active, so relying on its internal context changes can target the wrong actor.

### Animation properties

`set_animation_props(props, x, y)` stores the properties in the current `AnimationState` and redraws the current frame at `x`, `y`. It requires the animation context described above.

The same property flags apply to single-sprite and metasprite animations. For metasprites, `S_FLIPX` and `S_FLIPY` mirror the complete metasprite layout around its pivot as well as flipping its component sprites; the remaining flags keep their normal base-property behavior.

## `AnimationRegistry.h`

Header: `core/src/Assets/Animations/AnimationRegistry.h`

### `AnimationType`

Default value in the shipped core:

- `NUMBER_OF_ANIMATIONS = 1`

### Globals

| Name | Type | Meaning |
| --- | --- | --- |
| `animations` | `const Animation* [NUMBER_OF_ANIMATIONS]` | Generated animation list. |
| `animation_data` | `const AssetEntry [NUMBER_OF_ANIMATIONS]` | Generated animation tile data. |

## `Map.h`

Header: `core/src/Assets/Map/Map.h`

### Constants

| Name | Value | Meaning |
| --- | --- | --- |
| `TILE_SIZE_BYTES` | `16` | Bytes per Game Boy tile. |
| `MAX_CHANGED_MAP_TILES` | `32` by default | Maximum tile overrides. Define this before including `Map.h` to use a different limit. |

### `Map`

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | `uint8_t` | Index into generated map registries. |
| `width`, `height` | `uint16_t` | Map dimensions in tiles. |
| `tileset` | `uint8_t*` | Tile graphics data. |
| `num_tiles` | `uint8_t` | Number of tiles in the tileset. |
| `first_tile` | `uint8_t` | First allocated tile slot in VRAM. |

### Functions

| Function | Description |
| --- | --- |
| `uint8_t register_changed_map_tile(uint8_t x, uint8_t y, uint8_t tile) BANKED;` | Stores a replacement for one background tile. Returns nonzero on success. |
| `uint8_t change_changed_map_tile(uint8_t x, uint8_t y, uint8_t tile) BANKED;` | Updates an existing tile override. Returns nonzero when an override existed at that coordinate. |
| `uint8_t delete_changed_map_tile(uint8_t x, uint8_t y) BANKED;` | Removes an existing tile override and redraws the original background tile when it is visible. Returns nonzero when an override existed. |
| `void clear_changed_map_tiles(void) BANKED;` | Removes all tile overrides and redraws the visible map area. |

### Behavior notes

- Changed map tiles use tile coordinates, not pixels. They affect background drawing only.
- Registered changes are applied immediately if the tile is visible.
- Registered changes are reapplied when background sections are redrawn, including during camera movement.
- Registering a duplicate coordinate or exceeding `MAX_CHANGED_MAP_TILES` returns `0`. Use `change_changed_map_tile()` to update an existing override.
- Replacing the scene background map clears the changed-tile list.

## `MapRegistry.h`

Header: `core/src/Assets/Map/MapRegistry.h`

### `MapType`

Default value in the shipped core:

- `NUMBER_OF_MAPS = 1`

### Globals

| Name | Type | Meaning |
| --- | --- | --- |
| `maps` | `Map* [NUMBER_OF_MAPS]` | Generated map list. |
| `map_data` | `const AssetEntry [NUMBER_OF_MAPS]` | Generated map tile data. |

## `Camera.h`

Header: `core/src/Camera/Camera.h`

### Globals

| Name | Type | Meaning |
| --- | --- | --- |
| `camera_x`, `camera_y` | `uint16_t` | Camera position in pixels. |
| `deadzone_left`, `deadzone_right` | `uint8_t` | Horizontal follow deadzone margins. |
| `deadzone_top`, `deadzone_bottom` | `uint8_t` | Vertical follow deadzone margins. |

### Behavior notes

- Camera movement streams only the newly visible tile row or column.
- Configure camera deadzones on the actor that has **Follow camera** enabled in the scene editor. The actor properties expose `Left`, `Right`, `Top`, and `Bottom` deadzone margins in pixels. Generated scene initialization writes those values into `deadzone_left`, `deadzone_right`, `deadzone_top`, and `deadzone_bottom` before marking the actor as followed, and the scene viewport preview uses the same values when drawing the screen outline.
- If no custom values are set, each deadzone margin defaults to `20` pixels.
