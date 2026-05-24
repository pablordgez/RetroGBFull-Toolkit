#ifndef ACTOR_REGISTRY_H
#define ACTOR_REGISTRY_H
#include "MainDefinitions.h"

#define ACTORS

typedef enum {
    NUM_ACTORS = 1
} ActorType;

extern FAR_PTR actor_update_functions[NUM_ACTORS];
extern FAR_PTR actor_init_functions[NUM_ACTORS];

void init_actor_functions(void);

#define _ACTOR(name) \
    BANKREF_EXTERN(name##_bankref) \
    void Actor_Update_##name(void) BANKED; \
    void Actor_Init_##name(void) BANKED;
ACTORS
#undef _ACTOR

typedef enum {
    TAG_NONE,
} Tags;

#endif // ACTOR_REGISTRY_H

