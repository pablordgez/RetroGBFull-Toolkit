#include "Scene.h"
#include <stdio.h>

Scene* THIS_SCENE;

void init_scene(Scene* scene){
    scene->num_actors = 0;
    scene->actors = NULL;
}



void add_actor(Actor* actor){
    THIS_SCENE->actors = realloc(THIS_SCENE->actors, sizeof(Actor*) * (THIS_SCENE->num_actors + 1));
    THIS_SCENE->actors[THIS_SCENE->num_actors++] = actor;
}

void remove_actor(Actor* actor){
    for(int i = 0; i < THIS_SCENE->num_actors; i++){
        if(THIS_SCENE->actors[i] == actor){
            for(int j = i; j < THIS_SCENE->num_actors - 1; j++){
                THIS_SCENE->actors[j] = THIS_SCENE->actors[j + 1];
            }
            THIS_SCENE->num_actors--;
            THIS_SCENE->actors = realloc(THIS_SCENE->actors, sizeof(Actor*) * THIS_SCENE->num_actors);
            break;
        }
    }
}

void update_actors(void){
    for(int i = 0; i < THIS_SCENE->num_actors; i++){
        THIS_ACTOR = THIS_SCENE->actors[i];
        actor_update_functions[THIS_ACTOR->type]();
    }
}

void draw_actors(void) {
    for(int i = 0; i < THIS_SCENE->num_actors; i++){ 
        THIS_ACTOR = THIS_SCENE->actors[i]; 
        draw(); 
    }
}

void get_actors_by_tag(ActorTags tag, Actor* result[], uint8_t result_limit){
    uint8_t count = 0;
    for(int i = 0; i < THIS_SCENE->num_actors && count < result_limit; i++){
        for(int j = 0; j < 5; j++){
            if(THIS_SCENE->actors[i]->tags[j] == tag){
                result[count++] = THIS_SCENE->actors[i];
                break;
            }
        }
    }
}

void cleanup_scene(Scene* scene){
    free(scene->actors);
    scene->actors = NULL;
    scene->num_actors = 0;
    free(scene);
}