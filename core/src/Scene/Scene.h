#ifndef SCENE_H
#define SCENE_H
#include "../Actor/Actor.h"
#include <stdint.h>
typedef struct Scene {
    Actor* actors;
    
    uint8_t num_actors;

    void add_actor(Actor* actor);
    void remove_actor(Actor* actor);
    void update_actors(void);

} Scene;

Scene* THIS_SCENE;
#endif // SCENE_H