#include "Actor.h"

Actor* THIS_ACTOR;

void init_actor(Actor* actor){
    actor->current_animation = NULL;
    
}

void set_tag(ActorTags tag, uint8_t index){
    if(index < 5){
        THIS_ACTOR->tags[index] = tag;
    }
}

void set_actor_animation(Animation* animation){
    if(animation == THIS_ACTOR->current_animation){
        return;
    }
    
    if(THIS_ACTOR->current_animation != NULL){
        set_animation_context();
        unload_animation();
    }
    THIS_ACTOR->current_animation = animation;
    THIS_ACTOR->animation_state = malloc(sizeof(AnimationState));
    set_animation_context();
    init_animation_state(THIS_ACTOR->animation_state);
    load_animation(THIS_ACTOR->x >> 4, THIS_ACTOR->y >> 4);

} 

void set_animation_context(void){ 
    THIS_ANIMATION = THIS_ACTOR->current_animation; 
    THIS_ANIMATION_STATE = THIS_ACTOR->animation_state; 
}

void draw(void){
    set_animation_context();
    uint8_t draw_x = THIS_ACTOR->x >> 4;
    uint8_t draw_y = THIS_ACTOR->y >> 4;
    update_animation(draw_x, draw_y);
}

void move_actor(uint16_t x, uint16_t y){
    THIS_ACTOR->x = x;
    THIS_ACTOR->y = y;
}