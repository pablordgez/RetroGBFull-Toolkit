#ifndef ACTOR_REGISTRY_H
#define ACTOR_REGISTRY_H
#include "../MainDefinitions.h"
#define ACTORS \
    _ACTOR(Player) \

#define _ACTOR(name) name,
typedef enum {
    ACTORS
    NUM_ACTORS
} ActorType;
#undef _ACTOR

extern RVoid_PVoid actor_update_functions[NUM_ACTORS];
extern RVoid_PVoid actor_init_functions[NUM_ACTORS];

void init_actor_functions(void);

#define _ACTOR(name) \
    void Update_##name(void); \
    void Init_##name(void);
ACTORS
#undef _ACTOR

#endif // ACTOR_REGISTRY_H


