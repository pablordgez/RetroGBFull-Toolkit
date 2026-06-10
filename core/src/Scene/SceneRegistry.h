#ifndef SCENE_REGISTRY_H
#define SCENE_REGISTRY_H
#include "../MainDefinitions.h"

#define SCENES \
    _SCENE(SampleScene)

#define _SCENE(name) _##name,
typedef enum { 
    SCENES 
    NUM_SCENES 
} SceneType; 
#undef _SCENE

extern FAR_PTR scene_init_state_functions[NUM_SCENES];
extern FAR_PTR scene_update_functions[NUM_SCENES]; 

void init_scene_functions(void);

#define _SCENE(name) \
    BANKREF_EXTERN(name##_bankref) \
    void scene_init_state_##name(void) BANKED; \
    void scene_update_##name(void) BANKED; 
    SCENES 
#undef _SCENE

#endif /* SCENE_REGISTRY_H */
