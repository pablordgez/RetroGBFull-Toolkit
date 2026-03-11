#ifndef GAME_MANAGER_H
#define GAME_MANAGER_H
#include "Scene/Scene.h"
#include "Scene/SceneRegistry.h"
#include "Assets/Music/Music.h"
typedef struct{
    Scene* current_scene;
    

} GameManager;

extern GameManager* THIS_GAME_MANAGER;
void update_game(void);
void set_scene(Scene* scene);

#endif // GAME_MANAGER_H