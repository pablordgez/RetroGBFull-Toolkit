#include "Player.h"

uint8_t prev_joy = 0;

void AINIT(void){
    Player* player = (Player*) THIS_ACTOR;
    init_actor(&player->base);
    player->animation1 = animations[animationsample1];
    player->animation2 = animations[animationsample2];
    set_actor_animation(player->animation1);
}

void AUPDATE(void){
    Player* player = (Player*) THIS_ACTOR;
    if(joypad() & J_A){
        set_actor_animation(player->animation1);
    }
    if(joypad() & J_B){
        set_actor_animation(player->animation2);
    }
    if(joypad() & J_LEFT){
        move_actor(-10, 0);
    }
    else if(joypad() & J_RIGHT){
        move_actor(10, 0);
    }
    if(joypad() & J_UP){
        move_actor(0, -10);
    }
    else if(joypad() & J_DOWN){
        move_actor(0, 10);
    }

    if(joypad() & J_START && !(prev_joy & J_START)){
        printf("Player position: %u, %u\n", THIS_ACTOR->x, THIS_ACTOR->y);
    }
    prev_joy = joypad();
}

