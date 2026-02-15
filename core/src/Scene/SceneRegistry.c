#include "SceneRegistry.h"

RVoid_PVoid scene_init_state_functions[NUM_SCENES]; 
RVoid_PVoid scene_update_functions[NUM_SCENES];

#define _SCENE(name) \
    scene_init_state_functions[_##name] = scene_init_state_##name; \
    scene_update_functions[_##name] = scene_update_##name; 

void init_scene_functions(void){ 
    SCENES 
} 
#undef _SCENE