#include "ActorRegistry.h"

RVoid_PVoid actor_update_functions[NUM_ACTORS];
RVoid_PVoid actor_init_functions[NUM_ACTORS];

#define _ACTOR(name) \
    actor_update_functions[_##name] = Actor_Update_##name; \
    actor_init_functions[_##name] = Actor_Init_##name;

void init_actor_functions(void){
    ACTORS
}
#undef _ACTOR