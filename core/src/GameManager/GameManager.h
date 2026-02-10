#ifndef GAME_MANAGER_H
#define GAME_MANAGER_H
#include "../Scene/Scene.h"
typedef struct{
    Scene* current_scene;
    void update(void);
    void set_scene(Scene* scene);

} GameManager;
#endif // GAME_MANAGER_H