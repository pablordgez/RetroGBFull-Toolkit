---
sidebar_position: 2
title: Actors and Collisions
---

## `Actor.h`

Header: `core/src/Actor/Actor.h`

### `PhysicsMode`

| Value | Meaning |
| --- | --- |
| `HIGH_PERF` | Fast correction against the first blocking collision. |
| `BALANCED` | Checks nearby blockers before resolving movement. |
| `HIGH_FIDELITY` | Splits movement into smaller balanced steps. |

### `Actor`

| Field | Type | Meaning |
| --- | --- | --- |
| `type` | `ActorType` | Generated actor kind. |
| `tags` | `Tags[5]` | Tags used by scene queries and collision filters. |
| `current_animation` | `Animation*` | Current animation, or `NULL`. |
| `animation_state` | `AnimationState*` | Animation playback state, or `NULL`. |
| `x`, `y` | `uint16_t` | World position, using subpixel coordinates with a ratio of 16:1. |
| `collider` | `Collider*` | Optional owned collider. |
| `child` | `Actor*` | First child in the actor hierarchy. |
| `sibling` | `Actor*` | Next sibling in the actor hierarchy. |
| `parent` | `Actor*` | Parent actor, if any. |
| `physics_mode` | `PhysicsMode` | Movement collision mode. |
| `followed` | `uint8_t` | Nonzero when the camera follows this actor. |

### Globals

| Name | Type | Meaning |
| --- | --- | --- |
| `THIS_ACTOR` | `Actor*` | Actor used by the current actor function. |

### Functions

| Function | Description |
| --- | --- |
| `void set_tag(Tags tag, uint8_t index) BANKED;` | Writes a tag into `THIS_ACTOR->tags[index]` when `index < 5`. |
| `void set_actor_animation(Animation* animation) NONBANKED;` | Replaces the current animation and its playback state. |
| `void move_actor(int16_t dx, int16_t dy) BANKED;` | Moves `THIS_ACTOR` and its children using `physics_mode`. |
| `void set_actor_position(uint16_t x, uint16_t y) BANKED;` | Moves `THIS_ACTOR` and its children to a new position. Check [Coordinate model](../architecture#coordinate-model) for important notes on absolute movement. |
| `void attach_child(Actor* child) BANKED;` | Appends `child` to the end of `THIS_ACTOR`'s child list. |
| `void detach_child(Actor* child) BANKED;` | Removes `child` from `THIS_ACTOR`'s child list. |
| `void set_collider(Collider* collider) BANKED;` | Replaces the current collider. The new collider starts with no callbacks, so add them after attaching it. |

### Behavior notes

- Actors own their colliders. Replacing or destroying an actor frees the collider it holds.
- Movement also applies to child actors.

## `ActorRegistry.h`

Header: `core/src/Actor/ActorRegistry.h`

### Generated macro list

| Name | Meaning |
| --- | --- |
| `ACTORS` | Generated actor type list. The default placeholder is empty. |

### `ActorType`

Default value in the shipped core:

- `NUM_ACTORS = 1`

Project code generation adds real actor type entries before `NUM_ACTORS`.

### `Tags`

Default value in the shipped core:

- `TAG_NONE`

Projects extend this enum and reuse it for actor tags and collider tags.

## `Collider.h`

Header: `core/src/Collisions/Collider.h`

### `CollisionCallback`

`typedef FAR_PTR CollisionCallback;`

Inside a callback, use `THIS_COLLIDER` and `OTHER_COLLIDER` to inspect the collision pair.

### `Collider`

| Field | Type | Meaning |
| --- | --- | --- |
| `x`, `y` | `uint16_t` | World position. |
| `type` | `uint8_t` | Collider kind, usually from `ColliderType`. |
| `id` | `uint8_t` | Active collision slot. |
| `is_blocking` | `uint8_t` | Nonzero when the collider blocks movement. |
| `width`, `height` | `uint16_t` | Collider bounds. |
| `tags` | `Tags[5]` | Five tag slots used by filtered collision queries. |
| `on_collision` | `CollisionCallback[MAX_COLLISION_CALLBACKS]` | Collision callbacks. |
| `on_collision_exit` | `CollisionCallback[MAX_COLLISION_CALLBACKS]` | Exit callbacks. |
| `num_collision_callbacks` | `uint8_t` | Number of valid collision callbacks. |
| `num_collision_exit_callbacks` | `uint8_t` | Number of valid exit callbacks. |

### Globals

| Name | Type | Meaning |
| --- | --- | --- |
| `THIS_COLLIDER` | `Collider*` | Active collider for the current check or callback. |
| `OTHER_COLLIDER` | `Collider*` | Other collider in the current check or callback. |

## `BoxCollider.h`

Header: `core/src/Collisions/BoxCollider.h`

### `BoxCollider`

| Field | Type | Meaning |
| --- | --- | --- |
| `base` | `Collider` | Embedded collider base record. |

This is the only collider shape currently supported.

## `CollisionManager.h`

Header: `core/src/Collisions/CollisionManager.h`

### Functions

| Function | Description |
| --- | --- |
| `void set_collision_callback(Collider* collider, CollisionCallback callback) BANKED;` | Appends a collision callback if there is capacity. |
| `void set_collision_exit_callback(Collider* collider, CollisionCallback callback) BANKED;` | Appends an exit callback if there is capacity. |
| `void check_collisions(Collider* out[], uint8_t max_collisions, uint8_t* num_collisions) BANKED;` | Collects colliders overlapping `THIS_COLLIDER`. |
| `void check_collisions_with_tags(Collider* out[], uint8_t max_collisions, uint8_t* num_collisions, Tags tag) BANKED;` | Same as `check_collisions()`, but only for colliders carrying `tag`. |
| `void check_blocking_collisions(Collider* out[], uint8_t max_collisions, uint8_t* num_collisions) BANKED;` | Collects blocking colliders overlapping `THIS_COLLIDER`. |
| `void check_blocking_collisions_with_tags(Collider* out[], uint8_t max_collisions, uint8_t* num_collisions, Tags tag) BANKED;` | Same as `check_blocking_collisions()`, but only for colliders carrying `tag`. |

### Behavior notes

- Active colliders are capped by `MAX_ACTIVE_COLLIDERS`.
- Callback arrays are capped by `MAX_COLLISION_CALLBACKS`.
- Collision query functions only collect overlaps. Collision and exit callbacks are dispatched by `run_collision_callbacks()`, which is called from `update_game()` when `COLLISION_CALLBACKS_EVERY_FRAME` is enabled.

## `ColliderRegistry.h`

Header: `core/src/Collisions/ColliderRegistry.h`

### Constants

| Name | Value | Meaning |
| --- | --- | --- |
| `MAX_ACTIVE_COLLIDERS` | `20` | Maximum active colliders. |
| `MAX_COLLISION_CALLBACKS` | `4` | Maximum callbacks stored per enter or exit array. |
| `MAX_COLLISION_STATE_BYTES` | `(((MAX_ACTIVE_COLLIDERS * MAX_ACTIVE_COLLIDERS) + 7) / 8)` | Storage for active collision pairs. |

### `ColliderType`

| Value | Meaning |
| --- | --- |
| `BOX_COLLIDER` | Axis-aligned box collider. |
| `NUM_COLLIDER` | Number of collider kinds. |
