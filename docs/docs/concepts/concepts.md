---
sidebar_position: 1
title: Concepts
---

This page explains the main words used by RetroGBFull Toolkit. It is for readers who are new to game development.

## Game structure

| Concept | Meaning |
| --- | --- |
| Scene | One place or state in the game, like a room, a menu, or a battle screen. A scene owns its actors and maps. |
| Actor | A thing inside a scene. A player, enemy, door, item, or invisible trigger can all be actors. |
| Actor script | Code that belongs to one kind of actor. It decides what that actor does when it is created and each frame. |
| Scene script | Code that belongs to a scene. It usually sets up scene-wide behavior and updates the actors in the scene. |
| General script | Shared code that can be called from other scripts. |

## Visual resources

| Concept | Meaning |
| --- | --- |
| Sprite | A moving image, usually used by actors. Sprites can have several animation frames. |
| Animation | The playback settings for a sprite: frames, size, and speed. |
| Tileset | A set of small 8x8 pixel drawings used to build maps. |
| Tilemap | A grid made from tiles. It is usually the scene background. |
| Window | A tilemap drawn on the Game Boy window layer. It is useful for UI, dialogue boxes, and HUD areas. |
| Camera | The view into the scene. If a scene is larger than the screen, the camera decides which part is visible. |

## Actors and collisions

| Concept | Meaning |
| --- | --- |
| Position | Where an actor or collider is in the scene. Actor movement uses 16 subpixels per screen pixel, which means that there is one coordinate per pixel on the screen. Check [Coordinate model](../architecture#coordinate-model) for some notes on this. |
| Collider | An invisible box used to detect touches and blocks. |
| Blocking collider | A collider that stops actor movement. |
| Collision callback | A script function that runs when two colliders touch. |
| Collision exit callback | A script function that runs when two colliders stop touching. |
| Tag | A label used to find or filter actors and colliders, such as `TAG_PLAYER` or `TAG_ENEMY`. |
| Child actor | An actor attached to another actor. Moving the parent also moves the child. |

## How a scene runs

1. The scene is created.
2. Its scene script setup function runs.
3. Actors are created and added to the scene.
4. Every frame, scene and actor update functions run.
5. Actors are drawn, input is read, music updates, and collision callbacks can run.

You usually work at the scene and actor level. The engine handles the lower-level Game Boy details for you.
