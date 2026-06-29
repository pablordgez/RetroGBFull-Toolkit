#ifndef ACTOR_REGISTRY_H
#define ACTOR_REGISTRY_H
#include "MainDefinitions.h"

// BEGIN GENERATED ACTOR REGISTRY ENTRIES
#define ACTOR_REGISTRY_HAS_ACTORS 0

#define ACTORS

#define ACTOR_TAGS
// END GENERATED ACTOR REGISTRY ENTRIES

#define _ACTOR(name) _##name,
typedef enum {
    ACTORS
    NUM_ACTORS
} ActorType;
#undef _ACTOR

#define ACTOR_REGISTRY_FUNCTION_COUNT ((NUM_ACTORS == 0) ? 1 : NUM_ACTORS)

struct Actor;

extern FAR_PTR actor_update_functions[ACTOR_REGISTRY_FUNCTION_COUNT];
extern FAR_PTR actor_init_functions[ACTOR_REGISTRY_FUNCTION_COUNT];

void init_actor_functions(void);
struct Actor* create_actor(ActorType type) BANKED;

#define _ACTOR(name) \
    BANKREF_EXTERN(name##_bankref) \
    void Actor_Update_##name(void) BANKED; \
    void Actor_Init_##name(void) BANKED;
ACTORS
#undef _ACTOR

typedef enum {
    TAG_NONE,
#define _TAG(name) name,
    ACTOR_TAGS
#undef _TAG
} Tags;

#endif // ACTOR_REGISTRY_H

