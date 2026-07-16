#pragma bank 255
#include "Animation.h"
#include "AnimationRegistry.h"
#include "AnimationTiles.h"

Animation* THIS_ANIMATION;
AnimationState* THIS_ANIMATION_STATE;

SpaceManager sprite_space_manager;
SpaceManager sprite_tile_manager;

#if SPRITES_8X16_ENABLED
#define ANIMATION_SPRITE_HEIGHT 16
#define ANIMATION_TILES_PER_SPRITE 2
#else
#define ANIMATION_SPRITE_HEIGHT 8
#define ANIMATION_TILES_PER_SPRITE 1
#endif

static void move_animation_metasprite(uint8_t base_tile, uint8_t x, uint8_t y) NONBANKED{
    uint8_t flip = THIS_ANIMATION_STATE->props & (S_FLIPX | S_FLIPY);
    uint8_t base_props = THIS_ANIMATION_STATE->props & (uint8_t)~(S_FLIPX | S_FLIPY);

    switch(flip){
        case S_FLIPX:
            move_metasprite_flipx(THIS_ANIMATION->metasprite, base_tile, base_props, THIS_ANIMATION_STATE->sprite_slot, x, y);
            break;
        case S_FLIPY:
            move_metasprite_flipy(THIS_ANIMATION->metasprite, base_tile, base_props, THIS_ANIMATION_STATE->sprite_slot, x, y);
            break;
        case S_FLIPX | S_FLIPY:
            move_metasprite_flipxy(THIS_ANIMATION->metasprite, base_tile, base_props, THIS_ANIMATION_STATE->sprite_slot, x, y);
            break;
        default:
            move_metasprite_ex(THIS_ANIMATION->metasprite, base_tile, base_props, THIS_ANIMATION_STATE->sprite_slot, x, y);
            break;
    }
}

void init_animation_system(void) BANKED{
    init_space_manager(&sprite_space_manager, 40);
    init_space_manager(&sprite_tile_manager, 128);
}



void init_animation_state(AnimationState* animation_state) BANKED{ 
    animation_state->speed_modifier = 1;
    animation_state->current_frame = 0; 
    animation_state->props = 0; 
    animation_state->time_since_last_frame = 0;
}

uint8_t load_animation(uint8_t x, uint8_t y) NONBANKED{
    const AssetEntry* entry = &animation_data[THIS_ANIMATION->animation_id];
    uint8_t prev_bank = _current_bank;
    uint8_t sprite_count = ((THIS_ANIMATION->width + 7u) >> 3) * ((THIS_ANIMATION->height + (ANIMATION_SPRITE_HEIGHT - 1u)) / ANIMATION_SPRITE_HEIGHT);
    uint8_t frame_tile_count = sprite_count * ANIMATION_TILES_PER_SPRITE;
    uint8_t animation_tile_count = frame_tile_count * THIS_ANIMATION->number_of_frames;

    SWITCH_ROM(entry->bank);
    THIS_ANIMATION_STATE->sprite_slot = register_space(&sprite_space_manager, sprite_count);
    if(THIS_ANIMATION_STATE->sprite_slot == SPACE_MANAGER_INVALID_SLOT){
        SWITCH_ROM(prev_bank);
        return 0;
    }
    if(animation_loaded[THIS_ANIMATION->animation_id] == 0){
        animation_tiles[THIS_ANIMATION->animation_id] = register_space(&sprite_tile_manager, animation_tile_count);
        if(animation_tiles[THIS_ANIMATION->animation_id] == SPACE_MANAGER_INVALID_SLOT){
            remove_spaces(&sprite_space_manager, THIS_ANIMATION_STATE->sprite_slot, sprite_count);
            SWITCH_ROM(prev_bank);
            return 0;
        }
        animation_loaded[THIS_ANIMATION->animation_id]++;
        set_sprite_data(animation_tiles[THIS_ANIMATION->animation_id], animation_tile_count, entry->data);
        if(THIS_ANIMATION->width <= 8 && THIS_ANIMATION->height <= ANIMATION_SPRITE_HEIGHT){
            set_sprite_tile(THIS_ANIMATION_STATE->sprite_slot, animation_tiles[THIS_ANIMATION->animation_id]);
            set_sprite_prop(THIS_ANIMATION_STATE->sprite_slot, THIS_ANIMATION_STATE->props);
            move_sprite(THIS_ANIMATION_STATE->sprite_slot, x, y);
        } else{
            move_animation_metasprite(animation_tiles[THIS_ANIMATION->animation_id], x, y);
        }
    
    } else{
        animation_loaded[THIS_ANIMATION->animation_id]++;
    }
    SWITCH_ROM(prev_bank);
    return 1;

}

void move_animation(uint8_t x, uint8_t y) NONBANKED{
    if(THIS_ANIMATION->width <= 8 && THIS_ANIMATION->height <= ANIMATION_SPRITE_HEIGHT){
        move_sprite(THIS_ANIMATION_STATE->sprite_slot, x, y);
    } else{
        const AssetEntry* entry = &animation_data[THIS_ANIMATION->animation_id];
        uint8_t prev_bank = _current_bank;
        SWITCH_ROM(entry->bank);
        move_animation_metasprite(animation_tiles[THIS_ANIMATION->animation_id], x, y);
        SWITCH_ROM(prev_bank);
    }
}

void set_animation_props(uint8_t props, uint8_t x, uint8_t y) NONBANKED{
    if(THIS_ANIMATION == NULL || THIS_ANIMATION_STATE == NULL){
        return;
    }

    THIS_ANIMATION_STATE->props = props;

    if(THIS_ANIMATION->width <= 8 && THIS_ANIMATION->height <= ANIMATION_SPRITE_HEIGHT){
        set_sprite_prop(THIS_ANIMATION_STATE->sprite_slot, props);
        move_sprite(THIS_ANIMATION_STATE->sprite_slot, x, y);
    } else{
        const AssetEntry* entry = &animation_data[THIS_ANIMATION->animation_id];
        uint8_t prev_bank = _current_bank;
        uint8_t sprite_count = ((THIS_ANIMATION->width + 7u) >> 3) * ((THIS_ANIMATION->height + (ANIMATION_SPRITE_HEIGHT - 1u)) / ANIMATION_SPRITE_HEIGHT);
        uint8_t frame_tile_count = sprite_count * ANIMATION_TILES_PER_SPRITE;
        SWITCH_ROM(entry->bank);
        move_animation_metasprite(
            animation_tiles[THIS_ANIMATION->animation_id] + (THIS_ANIMATION_STATE->current_frame * frame_tile_count),
            x,
            y
        );
        SWITCH_ROM(prev_bank);
    }
}

void update_animation(uint8_t x, uint8_t y) NONBANKED{
    THIS_ANIMATION_STATE->time_since_last_frame += 1 * THIS_ANIMATION_STATE->speed_modifier;
    if(THIS_ANIMATION_STATE->time_since_last_frame >= THIS_ANIMATION->frame_duration){
        THIS_ANIMATION_STATE->current_frame++;
        THIS_ANIMATION_STATE->time_since_last_frame = 0;
    }
    if(THIS_ANIMATION_STATE->current_frame >= THIS_ANIMATION->number_of_frames){
        THIS_ANIMATION_STATE->current_frame = 0;
    }
    if(THIS_ANIMATION->width <= 8 && THIS_ANIMATION->height <= ANIMATION_SPRITE_HEIGHT){
        set_sprite_tile(THIS_ANIMATION_STATE->sprite_slot, animation_tiles[THIS_ANIMATION->animation_id] + (THIS_ANIMATION_STATE->current_frame * ANIMATION_TILES_PER_SPRITE));
        move_sprite(THIS_ANIMATION_STATE->sprite_slot, x, y); 
    } 
    else{
        const AssetEntry* entry = &animation_data[THIS_ANIMATION->animation_id];
        uint8_t prev_bank = _current_bank;
        uint8_t sprite_count = ((THIS_ANIMATION->width + 7u) >> 3) * ((THIS_ANIMATION->height + (ANIMATION_SPRITE_HEIGHT - 1u)) / ANIMATION_SPRITE_HEIGHT);
        uint8_t frame_tile_count = sprite_count * ANIMATION_TILES_PER_SPRITE;
        SWITCH_ROM(entry->bank);
        move_animation_metasprite(animation_tiles[THIS_ANIMATION->animation_id] + (THIS_ANIMATION_STATE->current_frame * frame_tile_count), x, y);
        SWITCH_ROM(prev_bank);
    }   
}

void unload_animation(void) BANKED{
    uint8_t sprite_count = ((THIS_ANIMATION->width + 7u) >> 3) * ((THIS_ANIMATION->height + (ANIMATION_SPRITE_HEIGHT - 1u)) / ANIMATION_SPRITE_HEIGHT);
    uint8_t animation_tile_count = sprite_count * ANIMATION_TILES_PER_SPRITE * THIS_ANIMATION->number_of_frames;

    remove_spaces(&sprite_space_manager, THIS_ANIMATION_STATE->sprite_slot, sprite_count);
    animation_loaded[THIS_ANIMATION->animation_id]--;
    if(animation_loaded[THIS_ANIMATION->animation_id] > 0){
        free(THIS_ANIMATION_STATE);
        return;
    }
    remove_spaces(&sprite_tile_manager, animation_tiles[THIS_ANIMATION->animation_id], animation_tile_count);
    free(THIS_ANIMATION_STATE);
}

void hide_animation(void) NONBANKED{
    if(THIS_ANIMATION->width <= 8 && THIS_ANIMATION->height <= ANIMATION_SPRITE_HEIGHT){
        hide_sprite(THIS_ANIMATION_STATE->sprite_slot);
    }
    else{
        const AssetEntry* entry = &animation_data[THIS_ANIMATION->animation_id];
        uint8_t prev_bank = _current_bank;
        SWITCH_ROM(entry->bank);
        hide_metasprite(THIS_ANIMATION->metasprite, THIS_ANIMATION_STATE->sprite_slot);
        SWITCH_ROM(prev_bank);
    }
}
