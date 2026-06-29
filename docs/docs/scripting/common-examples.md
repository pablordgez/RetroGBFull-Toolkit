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

## Pause and resume music

```c
static uint8_t previous_keys;

void AUPDATE(void) BANKED{
    uint8_t keys = joypad();

    if((keys & J_SELECT) && !(previous_keys & J_SELECT)) {
        pause_music();
    }

    if((keys & J_START) && !(previous_keys & J_START)) {
        resume_music();
    }

    previous_keys = keys;
}
```

`pause_music()` keeps the current song position. `stop_music()` clears it.

## Play a channel sound effect over music

```c
void PlayHitSound(void) BANKED{
    const Song* sfx = songs[hit_sfx];

    play_music_channel_sequence_banked(
        MUSIC_CHANNEL_4,
        hit_sfx_ch4_sequence,
        sfx->sequence_length,
        hit_sfx_instruments,
        sfx->speed,
        sfx->bank
    );
}
```

Use a generated music asset for the effect and pass one of its channel sequences. The newest sequence requested for a channel takes over immediately; when it finishes, that channel returns to the current music.

## Change to another scene

```c
void AUPDATE(void) BANKED{
    if(joypad() & J_START) {
        set_scene_deferred(create_scene(_new_scene_2));
    }
}
```

Use the generated scene enum value from `SceneType`. `create_scene()` allocates the scene but does not change `THIS_SCENE`; the game manager updates the current scene context when the scene is installed. `set_scene_deferred()` is preferred during updates and callbacks because it applies the change after the current update step.

## Spawn an actor

```c
void SpawnEnemy(uint16_t x, uint16_t y) BANKED{
    Actor* enemy = create_actor(_Enemy);
    if(enemy != NULL){
        Actor* previous_actor = THIS_ACTOR;
        THIS_ACTOR = enemy;
        set_actor_position(x, y);
        add_actor(enemy);
        THIS_ACTOR = previous_actor;
    }
}
```

Use the generated actor enum value from `ActorType`. `create_actor()` initializes the actor and returns it, but it restores the previous `THIS_ACTOR` before returning. Save and restore `THIS_ACTOR` around helper calls that should apply to the new actor before it is added to the scene.

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
