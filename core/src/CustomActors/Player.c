#include "Player.h"
#include "CustomScenes/SampleScene.h"
#include "Saves/SaveData.h"

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
    uint8_t current_joy = joypad();

    SAMPLE_PLAYER_PUSH_DX = 0;
    SAMPLE_PLAYER_PUSH_DY = 0;

    if(current_joy & J_A){
        set_actor_animation(player->animation1);
    }
    if(current_joy & J_B){
        set_actor_animation(player->animation2);
    }
    if(current_joy & J_LEFT){
        SAMPLE_PLAYER_PUSH_DX = -10;
        move_actor(-10, 0);
    }
    else if(current_joy & J_RIGHT){
        SAMPLE_PLAYER_PUSH_DX = 10;
        move_actor(10, 0);
    }
    if(current_joy & J_UP){
        SAMPLE_PLAYER_PUSH_DY = -10;
        move_actor(0, -10);
    }
    else if(current_joy & J_DOWN){
        SAMPLE_PLAYER_PUSH_DY = 10;
        move_actor(0, 10);
    }

    if(current_joy & J_START && !(prev_joy & J_START)){
        printf("Player position: %u, %u\n", THIS_ACTOR->x, THIS_ACTOR->y);
    }
    if(current_joy & J_SELECT && !(prev_joy & J_SELECT)){
        if(SAMPLE_PUSHABLE_BOX != NULL){
            uint16_t saved_x = SAMPLE_PUSHABLE_BOX->base.x;
            uint16_t saved_y = SAMPLE_PUSHABLE_BOX->base.y;
            save_data.sample_box_x = saved_x;
            save_data.sample_box_y = saved_y;
            save_save_data();
        }
        play_song(songs[happybirthday], 0);
    }
    prev_joy = current_joy;
}
