---
sidebar_position: 1
title: Game Manager and Scenes
---

## `GameManager.h`

Header: `core/src/GameManager/GameManager.h`

### `GameManager`

| Field | Type | Meaning |
| --- | --- | --- |
| `current_scene` | `Scene*` | Active scene. |
| `pending_scene` | `Scene*` | Queued scene, applied after the current update step. |

### Globals

| Name | Type | Meaning |
| --- | --- | --- |
| `THIS_GAME_MANAGER` | `GameManager*` | Active game manager for scene changes. |

### Functions

| Function | Description |
| --- | --- |
| `void set_scene(Scene* scene);` | Replaces the current scene immediately. |
| `void set_scene_deferred(Scene* scene);` | Queues a scene change for after the current update. |

### Behavior notes

- `set_scene()` frees any different queued scene before replacing the active one.
- `set_scene_deferred()` ignores `NULL`.
- Prefer `set_scene_deferred()` from actor update code so the current frame can finish cleanly.

## `Scene.h`

Header: `core/src/Scene/Scene.h`

### `Scene`

| Field | Type | Meaning |
| --- | --- | --- |
| `actors` | `Actor**` | Actor list owned by the scene. |
| `num_actors` | `uint8_t` | Number of actors in the list. |
| `type` | `SceneType` | Generated scene type. |
| `map` | `Map*` | Active background map. |
| `window` | `Map*` | Active window map. |

### Globals

| Name | Type | Meaning |
| --- | --- | --- |
| `THIS_SCENE` | `Scene*` | Current scene global used by some scene functions. |

### Functions

| Function | Description |
| --- | --- |
| `void add_actor(Actor* actor) BANKED;` | Appends an actor to `THIS_SCENE`. On allocation failure it destroys the actor. |
| `void remove_actor(Actor* actor) BANKED;` | Removes and destroys an actor from `THIS_SCENE`. |
| `void get_actors_by_tag(Tags tag, Actor* result[], uint8_t result_limit, uint8_t* out_count) BANKED;` | Collects matching actors from `THIS_SCENE` up to `result_limit`. |
| `void set_scene_map(Map* map) BANKED;` | Replaces the current background map on `THIS_SCENE`. |
| `void set_scene_window(Map* map) BANKED;` | Replaces the current window map and updates window visibility. |

### Behavior notes

- Scenes own their actors. `remove_actor()` destroys the actor it removes.
- `set_scene_map()` clears any changed-map-tile overrides before loading the replacement background map.
- Actors with `followed != 0` drive the camera during the scene update.

## `SceneRegistry.h`

Header: `core/src/Scene/SceneRegistry.h`

### Generated macro list

| Name | Meaning |
| --- | --- |
| `SCENES` | Scene type list generated into a managed block in `SceneRegistry.h`. The default placeholder contains `SampleScene`. |

### `SceneType`

The enum is generated from `SCENES` and always ends with `NUM_SCENES`.

Default values in the shipped core:

- `_SampleScene`
- `NUM_SCENES`

### Functions

| Function | Description |
| --- | --- |
| `struct Scene* create_scene(SceneType type) BANKED;` | Allocates the concrete scene struct for `type`, sets `scene->type`, and returns it as `Scene*`. Returns `NULL` for invalid types or allocation failure. Scene initialization still happens in `set_scene()`. |

### Behavior notes

- `create_scene()` is core registry logic that uses the generated `SCENES` list, so it knows the correct `sizeof(...)` for each scene wrapper or scene script type.
- `create_scene()` does not change `THIS_SCENE`. The game manager updates the current scene context when `set_scene()` installs and initializes the returned scene.
- Do not reuse one scene pointer across multiple scene changes. Scenes are mutable live instances and are owned by the game manager after `set_scene()` or `set_scene_deferred()`.

## `SampleScene.h`

Header: `core/src/CustomScenes/SampleScene.h`

### `SampleScene`

| Field | Type | Meaning |
| --- | --- | --- |
| `base` | `Scene` | Embedded base scene record. |

This is the default scene type shipped with the core. Project scenes follow the same pattern by embedding `Scene`.
