#include "Player.h"

const Animation* animation1;
const Animation* animation2;

void AINIT(void){
    Player* player = (Player*) THIS_ACTOR;
    init_actor(&player->base);
    animation1 = animations[animationsample1];
    animation2 = animations[animationsample2];
    set_actor_animation(animation1);
}

void AUPDATE(void){
    if(joypad() & J_A){
        set_actor_animation(animation1);
    }
    if(joypad() & J_B){
        set_actor_animation(animation2);
    }
}

