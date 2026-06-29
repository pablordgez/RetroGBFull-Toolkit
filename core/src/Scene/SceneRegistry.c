#include "SceneRegistry.h"
#include "Scene.h"
#include <stdlib.h>

// BEGIN GENERATED SCENE REGISTRY INCLUDES
#include "CustomScenes/SampleScene.h"
// END GENERATED SCENE REGISTRY INCLUDES

FAR_PTR scene_init_state_functions[SCENE_REGISTRY_FUNCTION_COUNT];
FAR_PTR scene_update_functions[SCENE_REGISTRY_FUNCTION_COUNT];

void init_scene_functions(void){
#define _SCENE_IMPL(name, implementation) \
    scene_init_state_functions[_##name] = TO_FAR_PTR(scene_init_state_##implementation, BANK(implementation##_bankref)); \
    scene_update_functions[_##name] = TO_FAR_PTR(scene_update_##implementation, BANK(implementation##_bankref));
#define _SCENE(name) _SCENE_IMPL(name, name)
    SCENES
#undef _SCENE
#undef _SCENE_IMPL
}

struct Scene* create_scene(SceneType type) BANKED{
    struct Scene* scene = NULL;

    if(type >= NUM_SCENES){
        return NULL;
    }

    switch(type){
#define _SCENE_IMPL(name, implementation) \
        case _##name: \
            scene = (struct Scene*) malloc(sizeof(implementation)); \
            break;
#define _SCENE(name) _SCENE_IMPL(name, name)
        SCENES
#undef _SCENE
#undef _SCENE_IMPL
        default:
            return NULL;
    }

    if(scene == NULL){
        return NULL;
    }

    scene->type = type;
    return scene;
}
