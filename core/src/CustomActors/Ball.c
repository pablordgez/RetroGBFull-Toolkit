#include "Ball.h"

void AINIT(void){
    Ball* ball = (Ball*) THIS_ACTOR;
    init_actor(&ball->base);
    set_actor_animation(animations[ballsprite]);
}

void AUPDATE(void){

}