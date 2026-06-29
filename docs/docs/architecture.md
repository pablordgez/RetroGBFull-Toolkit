---
sidebar_position: 2
title: Architecture and Conventions
---

This page explains the conventions used across the engine core. If you are writing gameplay code against the runtime, read this first.

## Public entry surface

### `ScriptEnvironment.h`

`ScriptEnvironment.h` is the main include that all user scripts automatically included. It pulls in:

- `MainDefinitions.h`
- actor, scene, collision, animation, map, music, text, interrupt, and save-data headers
- common GBDK and C standard-library headers used by scripts

## Runtime conventions

### Context globals

Functions with many parameters push parameters onto the stack, which is slower. This can be a problem on functions that are frequently called, and for that reason many engine functions rely on a current state global variable instead of receiving it as a parameter. If a function that you expect to receive a parameter isn't receiving it, it's very likely that it uses a global variable. The exported global variables are:

- `THIS_GAME_MANAGER`
- `THIS_SCENE`
- `THIS_ACTOR`
- `THIS_COLLIDER`
- `OTHER_COLLIDER`
- `THIS_ANIMATION`
- `THIS_ANIMATION_STATE`
- `THIS_MAP`

For example, `draw()` does not take an `Actor*`; it uses `THIS_ACTOR`.

### Banked and nonbanked functions

The engine uses GBDK banking attributes throughout the public API:

- `BANKED`: in a switchable ROM bank. Usually can be called transparently as GBDK handles the bank switching
- `NONBANKED`: always available without bank switching

Generated scene and actor code is registered through far pointers and dispatched with `FAR_CALL`.

### Generated registries

There are some registries where user-created resources are injected at build time:

- Managed blocks in `SceneRegistry.h` define the project `SCENES` macro list, while the surrounding core file owns the `SceneType` enum and `create_scene()` factory.
- Managed blocks in `ActorRegistry.h` define the project `ACTORS` and `ACTOR_TAGS` macro lists, while the surrounding core file owns the `ActorType` enum, the `Tags` enum, and `create_actor()` factory.
- Asset registries expose generated arrays for maps, animations, and songs.

The shipped core includes placeholder values such as `NUMBER_OF_MAPS = 1` and default registry blocks. Real projects replace or extend those blocks through generated code.

Scenes and actors are live mutable objects, so their registries do not expose reusable instance arrays like maps or animations. Use the generated factory functions to create a fresh instance with the correct concrete struct size.

## `MainDefinitions.h`

### Macros

| Macro | Purpose |
| --- | --- |
| `AUPDATE`, `AINIT` | Build generated actor update/init symbol names from `FILE_NAME`. |
| `SUPDATE`, `SINIT` | Build generated scene update/init symbol names from `FILE_NAME`. |
| `ID` | Builds an underscore-prefixed symbol name from `FILE_NAME`. |
| `SCREEN_WIDTH`, `SCREEN_HEIGHT` | Screen resolution: `160 x 144`. |
| `STACK_SIZE` | Fixed traversal stack size used by actor hierarchy movement. |
| `COLLISION_CALLBACKS_EVERY_FRAME` | Enables collision callback scanning in `update_game()`. |
| `UPDATE_COORD_SAFE(pos, delta)` | Applies movement clamping the final position above 0. |

### Function pointer typedefs

| Typedef | Meaning |
| --- | --- |
| `RVoid_PVoid` | `void (*)(void)` |
| `RVoid_PVoid_BANKED` | `void (*)(void) BANKED` |
| `RUInt8_PVoid` | `uint8_t (*)(void)` |

### Boolean-style constants

`false` and `true` are defined as `0` and `1`.

## Coordinate model

The runtime uses more than one coordinate space:

- Actor and collider positions are subpixel coordinates with a ratio of 1:16. This means, in order to move something 1px in the screen, it must be moved 16 coordinates
- Maps are in tile coordinates (1 tile coordinate is 8 pixels)
- The camera is in pixel coordinates, which it translates to tile coordinates for map scrolling

Note that:
- Subpixel coordinates are, by default, represented with decimals in the GUI to display them as screen coordinates. This is not the case in the core, where larger integers are used instead of decimals. To calculate core coordinates, multiply GUI coordinates by 16. It's possible to adjust preferences to display core coordinates in the GUI.
- In the GUI, by default, coordinates for actors or colliders that are children of actors are represented as relative to their parent. This is again only a convention and they are transformed to global coordinates when building. It's possible to adjust preferences to always display absolute coordinates.

## Boot order

`main.c` initializes the runtime in this order:

1. actor function registry
2. scene function registry
3. animation system
4. map system
5. interrupt manager
6. window visibility system
7. text system
8. save-data load
9. `GameManager`
10. starting scene instantiation

After that, the engine enables interrupts, turns on the display layers, and enters the main `update_game()` loop.
