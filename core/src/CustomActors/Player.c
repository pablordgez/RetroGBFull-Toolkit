#include "Player.h"
void AINIT(void){
    Player* player = (Player*) THIS_ACTOR;
    init_actor(player->base);
    player->base->type = ID;
}

void AUPDATE(void){

}

