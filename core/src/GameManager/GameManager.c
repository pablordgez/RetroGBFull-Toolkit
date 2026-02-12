#include "GameManager.h"

GameManager* THIS_GAME_MANAGER;

void update_game(void){
    THIS_SCENE = THIS_GAME_MANAGER->current_scene;
    update_actors();
    draw_actors();
}

void set_scene(Scene* scene){
    cleanup_scene(THIS_GAME_MANAGER->current_scene);
    THIS_GAME_MANAGER->current_scene = scene;
    init_scene(THIS_GAME_MANAGER->current_scene);
    THIS_SCENE = THIS_GAME_MANAGER->current_scene;
}