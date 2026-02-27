#ifndef ANIMATION_H
#define ANIMATION_H
#include <stdint.h>
#include <gb/gb.h>
#include <gb/metasprites.h>

typedef struct {
    uint8_t number_of_frames;
    uint8_t width;
    uint8_t height;
    uint8_t frame_duration;
    uint8_t animation_id;
    

    metasprite_t* metasprite;
} Animation;


typedef struct {
    uint8_t speed_modifier;
    uint8_t current_frame;
    uint8_t sprite_slot;
    uint8_t props;
    uint8_t time_since_last_frame;
} AnimationState;

extern Animation* THIS_ANIMATION;
extern AnimationState* THIS_ANIMATION_STATE;

void init_animation_system(void) BANKED;
void init_animation_state(AnimationState* animation_state) BANKED;
void load_animation(uint8_t x, uint8_t y) NONBANKED;
void unload_animation(void) BANKED;
void move_animation(uint8_t x, uint8_t y) NONBANKED;
void update_animation(uint8_t x, uint8_t y) NONBANKED;
void hide_animation(void) NONBANKED;
#endif /* ANIMATION_H */