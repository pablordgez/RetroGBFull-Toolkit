#include "GameManager.h"

GameManager* THIS_GAME_MANAGER;

void update_game(void){
    THIS_SCENE = THIS_GAME_MANAGER->current_scene;
    scene_update_functions[THIS_SCENE->type]();
#if COLLISION_CALLBACKS_EVERY_FRAME
    run_collision_callbacks();
#endif
}

void set_scene(Scene* scene){
    if(THIS_GAME_MANAGER->current_scene != NULL){
        cleanup_scene(THIS_GAME_MANAGER->current_scene);
    }
    THIS_GAME_MANAGER->current_scene = scene;
    THIS_SCENE = scene;
    scene_init_state_functions[scene->type]();
}
