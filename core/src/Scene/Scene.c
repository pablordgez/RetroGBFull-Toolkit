#include "Scene.h"

void update_actors(void){
    for(int i = 0; i < THIS_SCENE->num_actors; i++){
        actor_update_functions[THIS_SCENE->actors[i].type]();
    }
}