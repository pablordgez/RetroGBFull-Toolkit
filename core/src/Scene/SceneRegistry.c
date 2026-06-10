#include "SceneRegistry.h"

FAR_PTR scene_init_state_functions[NUM_SCENES]; 
FAR_PTR scene_update_functions[NUM_SCENES];

#define _SCENE(name) \
    scene_init_state_functions[_##name] = TO_FAR_PTR(scene_init_state_##name, BANK(name##_bankref)); \
    scene_update_functions[_##name] = TO_FAR_PTR(scene_update_##name, BANK(name##_bankref)); 

void init_scene_functions(void){ 
    SCENES 
} 
#undef _SCENE
