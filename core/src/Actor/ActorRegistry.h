#ifndef ACTOR_REGISTRY_H
#define ACTOR_REGISTRY_H
#include "MainDefinitions.h"

#define ACTORS

typedef enum {
    NUM_ACTORS = 1
} ActorType;

extern RVoid_PVoid actor_update_functions[NUM_ACTORS];
extern RVoid_PVoid actor_init_functions[NUM_ACTORS];

void init_actor_functions(void);

typedef enum {
    TAG_NONE,
} Tags;

#endif // ACTOR_REGISTRY_H

