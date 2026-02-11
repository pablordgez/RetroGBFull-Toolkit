#include "Player.h"
void INIT(void){
    Player* player = (Player*) THIS_ACTOR;
    init_actor(player->base);
    player->base->type = ACTOR_ID;
}

void UPDATE(void){

}

