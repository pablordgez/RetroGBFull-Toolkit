#include "Actor.h"

Actor* THIS_ACTOR;

void init_actor(Actor* actor){
    
    
}

void set_tag(ActorTags tag, uint8_t index){
    if(index < 5){
        THIS_ACTOR->tags[index] = tag;
    }
}

void set_animation(Animation* animation){ 
    THIS_ACTOR->current_animation = animation;
    THIS_ACTOR->animation_state = malloc(sizeof(AnimationState));
    set_animation_context(THIS_ACTOR); 
    init_animation_state(THIS_ACTOR->animation_state);
    load_animation(THIS_ACTOR->x >> 4, THIS_ACTOR->y >> 4);

} 

void set_animation_context(Actor* actor){ 
    THIS_ANIMATION = actor->current_animation; 
    THIS_ANIMATION_STATE = actor->animation_state; 
}

void draw(){
    set_animation_context(THIS_ACTOR);
    update_animation(THIS_ACTOR->x >> 4, THIS_ACTOR->y >> 4);
}