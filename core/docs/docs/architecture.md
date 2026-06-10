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

There are some registries were the user created resources are injected at build time:

- `SceneRegistry.h` exposes the `SCENES` macro list and the `SceneType` enum.
- `ActorRegistry.h` exposes the `ACTORS` macro list, the `ActorType` enum, and the `Tags` enum.
- Asset registries expose generated arrays for maps, animations, and songs.

The shipped core includes placeholder values such as `NUMBER_OF_MAPS = 1` and `NUM_ACTORS = 1`. Real projects replace or extend those through generated code.

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

- actor and collider positions are subpixel coordinates with a ratio of 1:16
- maps are in tile coordinates
- the camera is in pixel coordinates, which it translates to tile coordinates for map scrolling

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