#pragma bank 255
#include "Animation.h"
#include "AnimationRegistry.h"
#include "AnimationTiles.h"

Animation* THIS_ANIMATION;
AnimationState* THIS_ANIMATION_STATE;

SpaceManager sprite_space_manager;
SpaceManager sprite_tile_manager;

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

void load_animation(uint8_t x, uint8_t y) NONBANKED{
    const AssetEntry* entry = &animation_data[THIS_ANIMATION->animation_id];
    uint8_t prev_bank = _current_bank;
    SWITCH_ROM(entry->bank);
    THIS_ANIMATION_STATE->sprite_slot = register_space(&sprite_space_manager, THIS_ANIMATION->width * THIS_ANIMATION->height / 64);
    if(animation_loaded[THIS_ANIMATION->animation_id] == 0){
        animation_loaded[THIS_ANIMATION->animation_id]++;
        animation_tiles[THIS_ANIMATION->animation_id] = register_space(&sprite_tile_manager, THIS_ANIMATION->width * THIS_ANIMATION->height / 64);
        set_sprite_data(animation_tiles[THIS_ANIMATION->animation_id], THIS_ANIMATION->width * THIS_ANIMATION->height * THIS_ANIMATION->number_of_frames / 64, entry->data);
        if(THIS_ANIMATION->width == 8 && THIS_ANIMATION->height == 8){
            set_sprite_tile(THIS_ANIMATION_STATE->sprite_slot, animation_tiles[THIS_ANIMATION->animation_id]);
            move_sprite(THIS_ANIMATION_STATE->sprite_slot, x, y);
        } else{
            move_metasprite_ex(THIS_ANIMATION->metasprite, animation_tiles[THIS_ANIMATION->animation_id], THIS_ANIMATION_STATE->props, THIS_ANIMATION_STATE->sprite_slot, x, y);
        }
    
    } else{
        animation_loaded[THIS_ANIMATION->animation_id]++;
    }
    SWITCH_ROM(prev_bank);

}

void move_animation(uint8_t x, uint8_t y) NONBANKED{
    if(THIS_ANIMATION->width == 8 && THIS_ANIMATION->height == 8){
        move_sprite(THIS_ANIMATION_STATE->sprite_slot, x, y);
    } else{
        move_metasprite_ex(THIS_ANIMATION->metasprite, animation_tiles[THIS_ANIMATION->animation_id], THIS_ANIMATION_STATE->props, THIS_ANIMATION_STATE->sprite_slot, x, y);
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
    if(THIS_ANIMATION->width == 8 && THIS_ANIMATION->height == 8){ 
        set_sprite_tile(THIS_ANIMATION_STATE->sprite_slot, animation_tiles[THIS_ANIMATION->animation_id] + THIS_ANIMATION_STATE->current_frame);
        move_sprite(THIS_ANIMATION_STATE->sprite_slot, x, y); 
    } 
    else{ 
        move_metasprite_ex(THIS_ANIMATION->metasprite, animation_tiles[THIS_ANIMATION->animation_id] + (THIS_ANIMATION_STATE->current_frame * THIS_ANIMATION->width * THIS_ANIMATION->height / 64), THIS_ANIMATION_STATE->props, THIS_ANIMATION_STATE->sprite_slot, x, y);
    }   
}

void unload_animation(void) BANKED{
    remove_spaces(&sprite_space_manager, THIS_ANIMATION_STATE->sprite_slot, (THIS_ANIMATION->width * THIS_ANIMATION->height) >> 6);
    animation_loaded[THIS_ANIMATION->animation_id]--;
    if(animation_loaded[THIS_ANIMATION->animation_id] > 0){
        free(THIS_ANIMATION_STATE);
        return;
    }
    remove_spaces(&sprite_tile_manager, animation_tiles[THIS_ANIMATION->animation_id], (THIS_ANIMATION->width * THIS_ANIMATION->height * THIS_ANIMATION->number_of_frames) >> 6);
    free(THIS_ANIMATION_STATE);
}

void hide_animation(void) NONBANKED{
    if(THIS_ANIMATION->width == 8 && THIS_ANIMATION->height == 8){
        hide_sprite(THIS_ANIMATION_STATE->sprite_slot);
    }
    else{
        hide_metasprite(THIS_ANIMATION->metasprite, THIS_ANIMATION_STATE->sprite_slot);
    }
}
