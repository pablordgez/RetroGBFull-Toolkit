---
sidebar_position: 2
title: Common Script Examples
---

These examples are small on purpose. Replace names like `hero`, `battle_theme`, and `TAG_PLAYER` with the identifiers generated for your project.

## Move an actor with the D-pad

```c
void AUPDATE(void) BANKED{
    uint8_t keys = joypad();

    if(keys & J_LEFT) {
        move_actor(-16, 0);
    }
    if(keys & J_RIGHT) {
        move_actor(16, 0);
    }
    if(keys & J_UP) {
        move_actor(0, -16);
    }
    if(keys & J_DOWN) {
        move_actor(0, 16);
    }
}
```

Actor movement uses 16 subpixels per pixel, so `16` means one screen pixel.

## React once to a button press

```c
static uint8_t previous_keys;

void AUPDATE(void) BANKED{
    uint8_t keys = joypad();

    if((keys & J_A) && !(previous_keys & J_A)) {
        // Run once when A is pressed.
    }

    previous_keys = keys;
}
```

## Set an actor animation

```c
void AINIT(void) BANKED{
    Hero* self = (Hero*) THIS_ACTOR;
    init_actor(&self->base);

    set_actor_animation(animations[hero]);
}
```

Use the sprite resource identifier inside `animations[...]`.

## Play music when a scene starts

```c
void SINIT(void) BANKED{
    Room* scene = (Room*) THIS_SCENE;
    init_scene(&scene->base);

    play_song(songs[battle_theme], 1);
}
```

Use the music resource identifier inside `songs[...]`. The second value is whether the song should loop.

## Draw text

```c
static TextHandle* label;

void SINIT(void) BANKED{
    Room* scene = (Room*) THIS_SCENE;
    init_scene(&scene->base);

    label = create_text_handle();
    draw_text(label, TEXT_LAYER_WINDOW, 1, 1, "Hello");
}
```

Keep the handle if you want to move, update, or remove the text later.

## Change one map tile

```c
void OpenDoor(void) BANKED{
    register_changed_map_tile(10, 6, 4);
}
```

The first two values are tile coordinates, not pixels. The last value is the tile number to draw.

## Find actors by tag

```c
Actor* players[4];
uint8_t player_count = 0;

void SUPDATE(void) BANKED{
    get_actors_by_tag(TAG_PLAYER, players, 4, &player_count);

    if(player_count > 0) {
        // players[0] is the first actor with TAG_PLAYER.
    }

    update_actors();
    draw_actors();
}
```

Tags are useful when one script needs to find actors without knowing their exact names.

## Use a collision callback

```c
void OnEnemyHit(void) BANKED{
    if(OTHER_COLLIDER != NULL) {
        // This runs when this collider touches another collider.
    }
}
```

Attach this function to a collider in the scene editor.
