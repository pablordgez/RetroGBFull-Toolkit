#ifndef SCENE_H
#define SCENE_H
#include "../Actor/Actor.h"
#include <stdint.h>
#include <stdlib.h>
typedef struct Scene {
    Actor* actors;
    uint8_t num_actors;
} Scene;

void init_scene(Scene* scene);
void scene_initial_state(void);
void add_actor(Actor* actor);
void remove_actor(Actor* actor);
void update_actors(void);
void get_actors_by_tag(ActorTags tag, Actor* result[], uint8_t result_limit);
void cleanup_scene(Scene* scene);

extern Scene* THIS_SCENE;
#endif // SCENE_H