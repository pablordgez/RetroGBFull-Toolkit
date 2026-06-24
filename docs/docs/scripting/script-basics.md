---
sidebar_position: 1
title: Script Basics
---

Scripts are C files that add behavior to your game. RetroGBFull Toolkit creates the basic file structure for you.

## Script kinds

| Kind | Folder | Use it for |
| --- | --- | --- |
| Actor Script | `src/CustomActors` | Player, enemies, moving objects, pickups, and other actor behavior. |
| Scene Script | `src/CustomScenes` | Scene setup and scene-wide logic. |
| General Script | `src/Scripts` | Shared helper functions used by other scripts. |

Each script also has a `.h` header file. Put shared function declarations there when another script needs to call them.

## Main functions

| Function | Where | When it runs |
| --- | --- | --- |
| `AINIT` | Actor scripts | Once when the actor is created. |
| `AUPDATE` | Actor scripts | Every frame while the actor is active. |
| `SINIT` | Scene scripts | Once when the scene is created. |
| `SUPDATE` | Scene scripts | Every frame while the scene is active. |

Actor scripts usually start like this:

```c
void AINIT(void) BANKED{
    Hero* self = (Hero*) THIS_ACTOR;
    init_actor(&self->base);
}

void AUPDATE(void) BANKED{

}
```

Scene scripts usually start like this:

```c
void SINIT(void) BANKED{
    Room* scene = (Room*) THIS_SCENE;
    init_scene(&scene->base);
}

void SUPDATE(void) BANKED{
    update_actors();
    draw_actors();
}
```

Keep the default `init_actor()`, `init_scene()`, `update_actors()`, and `draw_actors()` calls unless you have a reason to replace them.

## Current object globals

Many engine functions use the current object instead of taking it as a parameter.

| Global | Meaning |
| --- | --- |
| `THIS_ACTOR` | The actor currently being initialized, updated, or edited. |
| `THIS_SCENE` | The active scene. |
| `THIS_COLLIDER` | The collider currently being checked. |
| `OTHER_COLLIDER` | The other collider in the current collision callback. |

For example, `move_actor(16, 0)` moves `THIS_ACTOR`.

In most cases these globals are set automatically by the core. For example, the loop that calls the update functions for actors sets THIS_ACTOR before calling its update function.

## Function conventions

- Use `void FunctionName(void)` for functions you want to attach as collision callbacks.
- Use `static` for helper functions that are only used inside one `.c` file.
- By default, functions without an explicit `BANKED` or `NONBANKED` qualifier are saved as `BANKED` by the editor. You can turn this off from preferences.
- If another script calls your function, add its declaration to the script header.

Example callback:

```c
void OnTouchCoin(void) BANKED{
    // This can be selected as a collision callback.
}
```

Example helper:

```c
static uint8_t is_moving_left(uint8_t keys){
    return keys & J_LEFT;
}
```

## Included headers

Scripts include `ScriptEnvironment.h`. This gives you the main engine headers, generated resource registries, GBDK input helpers, and common C headers.

Most scripts do not need extra includes.
