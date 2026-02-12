#include "SampleScene.h"

void SINIT(void){
    SampleScene* scene = (SampleScene*) THIS_SCENE; 
    init_scene(scene->base); 
    scene->base->type = ID;
}

void SUPDATE(void){
    update_actors();
    draw_actors();

}  