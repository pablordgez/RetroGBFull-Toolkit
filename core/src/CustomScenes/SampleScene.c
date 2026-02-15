#include "SampleScene.h"

void SINIT(void){
    SampleScene* scene = (SampleScene*) THIS_SCENE; 
    init_scene(&scene->base); 
    Player* p = (Player*) malloc(sizeof(Player));
    p->base.type = _Player;
    THIS_ACTOR = (Actor*) p;
    actor_init_functions[p->base.type]();
    move_actor(500, 500);
    add_actor((Actor*) p);
}

void SUPDATE(void){
    update_actors();
    draw_actors();
    __asm \
        nop \
    __endasm;
}  