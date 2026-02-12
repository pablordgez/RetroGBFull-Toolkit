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

extern RVoid_PVoid scene_init_state_functions[NUM_SCENES];
extern RVoid_PVoid scene_update_functions[NUM_SCENES]; 

void init_scene_functions(void);

#define _SCENE(name) \
    void scene_init_state_##name(void); \
    void scene_update_##name(void); 
    SCENES 
#undef _SCENE

#endif /* SCENE_REGISTRY_H */