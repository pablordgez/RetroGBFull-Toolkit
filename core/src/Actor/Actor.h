#ifndef ACTOR_H
#define ACTOR_H
#include "ActorRegistry.h"
#include "Animation.h"
#include <string.h>
#include <stdint.h>
typedef struct Actor {
    ActorType type;
    ActorTags tags[5];
    Animation* current_animation;
    AnimationState* animation_state;
    uint16_t x; uint16_t y;
    
} Actor;

void init_actor(Actor* actor);
void set_tag(ActorTags tag, uint8_t index);
void set_animation(Animation* animation);
void set_animation_context(Actor* actor);
void draw();

extern Actor* THIS_ACTOR;

#endif // ACTOR_H