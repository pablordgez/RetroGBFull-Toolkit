#ifndef ACTOR_H
#define ACTOR_H
#include "ActorRegistry.h"
#include "Assets/Animations/Animation.h"
#include <string.h>
#include <stdint.h>
#include <stdlib.h>
typedef struct Actor {
    ActorType type;
    ActorTags tags[5];
    Animation* current_animation;
    AnimationState* animation_state;
    uint16_t x; uint16_t y;
    
} Actor;

void init_actor(Actor* actor);
void set_tag(ActorTags tag, uint8_t index);
void set_actor_animation(Animation* animation);
void set_animation_context(void);
void draw(void);
void move_actor(uint16_t x, uint16_t y);

extern Actor* THIS_ACTOR;

#endif // ACTOR_H