#include "ActorRegistry.h"

FAR_PTR actor_update_functions[NUM_ACTORS] = {0};
FAR_PTR actor_init_functions[NUM_ACTORS] = {0};

#define _ACTOR(name) \
    actor_update_functions[_##name] = TO_FAR_PTR(Actor_Update_##name, BANK(name##_bankref)); \
    actor_init_functions[_##name] = TO_FAR_PTR(Actor_Init_##name, BANK(name##_bankref));

void init_actor_functions(void){
    ACTORS
}
#undef _ACTOR
