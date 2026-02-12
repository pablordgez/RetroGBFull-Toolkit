#ifndef ANIMATION_H
#define ANIMATION_H
#include <stdint.h>
#include <gb/gb.h>
#include <gb/metasprites.h>
#include "AnimationRegistry.h"
typedef struct {
    uint8_t number_of_frames;
    uint8_t width;
    uint8_t height;
    uint8_t start_tile;
    uint8_t frame_duration;

    uint8_t already_loaded;
    

    metasprite_t* metasprite;
} Animation;


typedef struct {
    uint8_t speed_modifier;
    uint8_t current_frame;
    uint8_t sprite_slot;
    uint8_t props;
    uint8_t time_since_last_frame;
} AnimationState;

Animation* THIS_ANIMATION;
AnimationState* THIS_ANIMATION_STATE;


void init_animation(Animation* animation, uint8_t number_of_frames, uint8_t frame_duration, uint8_t width, uint8_t height, metasprite_t* metasprite);
void init_animation_state(AnimationState* animation_state);
void load_animation(uint8_t x, uint8_t y);
void move_animation(uint8_t x, uint8_t y);
void update_animation(uint8_t x, uint8_t y);
#endif /* ANIMATION_H */