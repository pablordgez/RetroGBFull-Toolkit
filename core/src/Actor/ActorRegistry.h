#ifndef ACTOR_REGISTRY_H
#define ACTOR_REGISTRY_H
#include "MainDefinitions.h"
#define ACTORS \
    _ACTOR(Player) \
    _ACTOR(Ball) \

#define _ACTOR(name) _##name,
typedef enum {
    ACTORS
    NUM_ACTORS
} ActorType;
#undef _ACTOR

extern RVoid_PVoid actor_update_functions[NUM_ACTORS];
extern RVoid_PVoid actor_init_functions[NUM_ACTORS];

void init_actor_functions(void);

#define _ACTOR(name) \
    void Actor_Update_##name(void); \
    void Actor_Init_##name(void);
ACTORS
#undef _ACTOR

typedef enum {
    TAG_PLAYER,
} Tags;

#endif // ACTOR_REGISTRY_H


