#include "GameManager.h"
#include "Collisions/CollisionManager.h"

GameManager* THIS_GAME_MANAGER;
uint8_t HALF_RATE_PHASE;

static void apply_deferred_operations(void){
    if(DEFERRED_COLLIDER_DISABLES_PENDING){
        flush_deferred_collider_disables();
    }
    if(DEFERRED_ACTOR_REMOVALS_PENDING){
        flush_deferred_actor_removals();
    }
}

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
    HALF_RATE_PHASE ^= 1U;
    FAR_CALL(scene_update_functions[THIS_SCENE->type], RVoid_PVoid_BANKED);
    apply_deferred_operations();
    if(apply_pending_scene()){
        return;
    }
#if COLLISION_CALLBACKS_EVERY_FRAME
    if(!THIS_SCENE->collision_callbacks_30hz || HALF_RATE_PHASE){
        run_collision_callbacks();
        apply_deferred_operations();
        apply_pending_scene();
    }
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
