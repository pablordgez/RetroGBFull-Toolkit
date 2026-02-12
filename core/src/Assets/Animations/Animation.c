#include "Animation.h"

SpaceManager sprite_space_manager;
SpaceManager sprite_tile_manager;

void init_animation(Animation* animation, uint8_t number_of_frames, uint8_t frame_duration, uint8_t width, uint8_t height, metasprite_t* metasprite){
    animation->number_of_frames = number_of_frames;
    animation->frame_duration = frame_duration;
    animation->width = width;
    animation->height = height;
    animation->metasprite = metasprite;
}

void init_animation_state(AnimationState* animation_state){ 
    animation_state->speed_modifier = 1;
    animation_state->current_frame = 0; 
    animation_state->props = 0; 
    animation_state->time_since_last_frame = 0;
}

void load_animation(uint8_t x, uint8_t y){
    const AssetEntry* entry = &animation_data[THIS_ANIMATION->start_tile];
    uint8_t prev_bank = _current_bank;
    SWITCH_ROM(entry->bank);
    THIS_ANIMATION_STATE->sprite_slot = register_space(&sprite_space_manager, THIS_ANIMATION->width * THIS_ANIMATION->height / 64);
    if(THIS_ANIMATION->already_loaded == 0){
        THIS_ANIMATION->already_loaded++;
        THIS_ANIMATION->start_tile = register_space(&sprite_tile_manager, THIS_ANIMATION->width * THIS_ANIMATION->height / 64);
        set_sprite_data(THIS_ANIMATION->start_tile, THIS_ANIMATION->width * THIS_ANIMATION->height * THIS_ANIMATION->number_of_frames / 64, entry->data);
        if(THIS_ANIMATION->width == 8 && THIS_ANIMATION->height == 8){
            set_sprite_tile(THIS_ANIMATION_STATE->sprite_slot, THIS_ANIMATION->start_tile);
            move_sprite(THIS_ANIMATION_STATE->sprite_slot, x, y);
        } else{
            move_metasprite_ex(THIS_ANIMATION->metasprite, THIS_ANIMATION->start_tile, THIS_ANIMATION_STATE->props, THIS_ANIMATION_STATE->sprite_slot, x, y);
        }
    
    } else{
        THIS_ANIMATION->already_loaded++;
    }
    SWITCH_ROM(prev_bank);

}

void move_animation(uint8_t x, uint8_t y){
    if(THIS_ANIMATION->width == 8 && THIS_ANIMATION->height == 8){
        move_sprite(THIS_ANIMATION_STATE->sprite_slot, x, y);
    } else{
        move_metasprite_ex(THIS_ANIMATION->metasprite, THIS_ANIMATION->start_tile, THIS_ANIMATION_STATE->props, THIS_ANIMATION_STATE->sprite_slot, x, y);
    }
}

void update_animation(uint8_t x, uint8_t y){
    THIS_ANIMATION_STATE->time_since_last_frame += 1 * THIS_ANIMATION_STATE->speed_modifier;
    if(THIS_ANIMATION_STATE->time_since_last_frame >= THIS_ANIMATION->frame_duration){
        THIS_ANIMATION_STATE->current_frame++;
    }
    if(THIS_ANIMATION_STATE->current_frame >= THIS_ANIMATION->number_of_frames){
        THIS_ANIMATION_STATE->current_frame = 0;
    }
    if(THIS_ANIMATION->width == 8 && THIS_ANIMATION->height == 8){ 
        set_sprite_tile(THIS_ANIMATION_STATE->sprite_slot, THIS_ANIMATION->start_tile + THIS_ANIMATION_STATE->current_frame); 
    } 
    else{ 
        move_metasprite_ex(THIS_ANIMATION->metasprite, THIS_ANIMATION->start_tile + (THIS_ANIMATION_STATE->current_frame * THIS_ANIMATION->width * THIS_ANIMATION->height / 64), THIS_ANIMATION_STATE->props, THIS_ANIMATION_STATE->sprite_slot, x, y);
    }
    
}