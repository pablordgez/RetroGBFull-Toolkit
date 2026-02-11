#ifndef ACTOR_H
#define ACTOR_H
#include "ActorRegistry.h"
#include <string.h>
#include <stdint.h>
typedef struct Actor {
    ActorType type;
    ActorTags tags[5];
    
} Actor;

void init_actor(Actor* actor);
void set_tag(ActorTags tag, uint8_t index);

extern Actor* THIS_ACTOR;

#endif // ACTOR_H