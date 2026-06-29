#ifndef SCENE_REGISTRY_H
#define SCENE_REGISTRY_H
#include "../MainDefinitions.h"

// BEGIN GENERATED SCENE REGISTRY ENTRIES
#define SCENES \
    _SCENE(SampleScene)
// END GENERATED SCENE REGISTRY ENTRIES

#define _SCENE_IMPL(name, implementation) _##name,
#define _SCENE(name) _SCENE_IMPL(name, name)
typedef enum { 
    SCENES 
    NUM_SCENES 
} SceneType; 
#undef _SCENE
#undef _SCENE_IMPL

#define SCENE_REGISTRY_FUNCTION_COUNT ((NUM_SCENES == 0) ? 1 : NUM_SCENES)

struct Scene;

extern FAR_PTR scene_init_state_functions[SCENE_REGISTRY_FUNCTION_COUNT];
extern FAR_PTR scene_update_functions[SCENE_REGISTRY_FUNCTION_COUNT];

void init_scene_functions(void);
struct Scene* create_scene(SceneType type) BANKED;

#define _SCENE_IMPL(name, implementation) \
    BANKREF_EXTERN(implementation##_bankref) \
    void scene_init_state_##implementation(void) BANKED; \
    void scene_update_##implementation(void) BANKED;
#define _SCENE(name) _SCENE_IMPL(name, name)
SCENES
#undef _SCENE
#undef _SCENE_IMPL

#endif /* SCENE_REGISTRY_H */
