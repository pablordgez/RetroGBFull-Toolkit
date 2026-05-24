#include "GameManager.h"

GameManager* THIS_GAME_MANAGER;

static uint8_t apply_pending_scene(void){
    Scene* scene = THIS_GAME_MANAGER->pending_scene;
    if(scene == NULL){
        return 0;
    }

    THIS_GAME_MANAGER->pending_scene = NULL;
    set_scene(scene);
    return 1;
}

void update_game(void){
    THIS_SCENE = THIS_GAME_MANAGER->current_scene;
    if(THIS_SCENE == NULL){
        apply_pending_scene();
        return;
    }
    FAR_CALL(scene_update_functions[THIS_SCENE->type], RVoid_PVoid_BANKED);
    if(apply_pending_scene()){
        return;
    }
#if COLLISION_CALLBACKS_EVERY_FRAME
    run_collision_callbacks();
    apply_pending_scene();
#endif
}

void set_scene(Scene* scene){
    if(THIS_GAME_MANAGER->pending_scene != NULL && THIS_GAME_MANAGER->pending_scene != scene){
        free(THIS_GAME_MANAGER->pending_scene);
    }
    THIS_GAME_MANAGER->pending_scene = NULL;

    if(THIS_GAME_MANAGER->current_scene != NULL){
        THIS_SCENE = THIS_GAME_MANAGER->current_scene;
        cleanup_scene(THIS_GAME_MANAGER->current_scene);
    }
    THIS_GAME_MANAGER->current_scene = scene;
    THIS_SCENE = scene;
    FAR_CALL(scene_init_state_functions[scene->type], RVoid_PVoid_BANKED);
}

void set_scene_deferred(Scene* scene){
    if(scene == NULL){
        return;
    }

    if(THIS_GAME_MANAGER->pending_scene != NULL && THIS_GAME_MANAGER->pending_scene != scene){
        free(THIS_GAME_MANAGER->pending_scene);
    }
    THIS_GAME_MANAGER->pending_scene = scene;
}
