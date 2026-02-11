#include "Actor.h"

Actor* THIS_ACTOR;

void init_actor(Actor* actor){
    
    
}

void set_tag(ActorTags tag, uint8_t index){
    if(index < 5){
        THIS_ACTOR->tags[index] = tag;
    }
}