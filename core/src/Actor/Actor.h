#ifndef ACTOR_H
#define ACTOR_H
#include "ActorRegistry.h"
typedef struct Actor {
    ActorType type;
    void init(void);
} Actor;
#endif // ACTOR_H