#include "ActorRegistry.h"
#include "Actor.h"
#include <stdlib.h>

// BEGIN GENERATED ACTOR REGISTRY INCLUDES
// END GENERATED ACTOR REGISTRY INCLUDES

FAR_PTR actor_update_functions[ACTOR_REGISTRY_FUNCTION_COUNT] = {0};
FAR_PTR actor_init_functions[ACTOR_REGISTRY_FUNCTION_COUNT] = {0};

void init_actor_functions(void){
#if ACTOR_REGISTRY_HAS_ACTORS
#define _ACTOR(name) \
    actor_update_functions[_##name] = TO_FAR_PTR(Actor_Update_##name, BANK(name##_bankref)); \
    actor_init_functions[_##name] = TO_FAR_PTR(Actor_Init_##name, BANK(name##_bankref));
    ACTORS
#undef _ACTOR
#endif
}

struct Actor* create_actor(ActorType type) BANKED{
#if ACTOR_REGISTRY_HAS_ACTORS
    struct Actor* actor = NULL;
    struct Actor* previous_actor = NULL;

    if(type >= NUM_ACTORS){
        return NULL;
    }

    switch(type){
#define _ACTOR(name) \
        case _##name: \
            actor = (struct Actor*) malloc(sizeof(name)); \
            break;
        ACTORS
#undef _ACTOR
        default:
            return NULL;
    }

    if(actor == NULL){
        return NULL;
    }

    actor->type = type;
    previous_actor = THIS_ACTOR;
    THIS_ACTOR = actor;
    FAR_CALL(actor_init_functions[type], RVoid_PVoid_BANKED);
    THIS_ACTOR = previous_actor;
    return actor;
#else
    (void)type;
    return NULL;
#endif
}
