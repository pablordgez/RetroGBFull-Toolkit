#pragma bank 255
#include "SampleScene.h"
#include "Collisions/CollisionManager.h"
#include "Saves/SaveData.h"
#include <string.h>

Ball* SAMPLE_PUSHABLE_BOX = NULL;
int16_t SAMPLE_PLAYER_PUSH_DX = 0;
int16_t SAMPLE_PLAYER_PUSH_DY = 0;

static Collider* create_box_collider(uint16_t x, uint16_t y, uint8_t id) BANKED{
    Collider* collider = (Collider*) malloc(sizeof(Collider));
    memset(collider, 0, sizeof(Collider));
    collider->x = x;
    collider->y = y;
    collider->width = 128;
    collider->height = 128;
    collider->is_blocking = 1;
    collider->type = BOX_COLLIDER;
    collider->id = id;
    return collider;
}

static uint8_t collider_has_tag(Collider* collider, Tags tag) BANKED{
    for(uint8_t i = 0; i < 5; i++){
        if(collider->tags[i] == tag){
            return 1;
        }
    }
    return 0;
}

static void push_box_on_collision(void) NONBANKED{
    Actor* previous_actor;

    if(SAMPLE_PUSHABLE_BOX == NULL){
        return;
    }
    if(!collider_has_tag(OTHER_COLLIDER, TAG_PLAYER)){
        return;
    }
    if(SAMPLE_PLAYER_PUSH_DX == 0 && SAMPLE_PLAYER_PUSH_DY == 0){
        return;
    }

    previous_actor = THIS_ACTOR;
    THIS_ACTOR = (Actor*) SAMPLE_PUSHABLE_BOX;
    move_actor(SAMPLE_PLAYER_PUSH_DX, SAMPLE_PLAYER_PUSH_DY);
    THIS_ACTOR = previous_actor;
}

void SINIT(void) BANKED{
    SampleScene* scene = (SampleScene*) THIS_SCENE; 
    init_scene(&scene->base); 
    SAMPLE_PUSHABLE_BOX = NULL;
    SAMPLE_PLAYER_PUSH_DX = 0;
    SAMPLE_PLAYER_PUSH_DY = 0;
    Player* p = (Player*) malloc(sizeof(Player));
    p->base.type = _Player;
    THIS_ACTOR = (Actor*) p;
    actor_init_functions[p->base.type]();
    set_actor_position(500, 500);
    p->base.followed = 1;
    Collider* p_collider = create_box_collider(500, 500, 0);
    p_collider->tags[0] = TAG_PLAYER;
    set_collider(p_collider);
    add_actor((Actor*) p);
    Ball *b = (Ball*) malloc(sizeof(Ball));
    b->base.type = _Ball;
    THIS_ACTOR = (Actor*) b;
    actor_init_functions[b->base.type]();
    set_actor_position(700, 700);
    Collider* b_collider = create_box_collider(700, 700, 1);
    set_collider(b_collider);
    add_actor((Actor*) b);
    THIS_ACTOR = (Actor*) p;
    attach_child((Actor*) b);
    Ball *b2 = (Ball*) malloc(sizeof(Ball));
    b2->base.type = _Ball;
    THIS_ACTOR = (Actor*) b2;
    actor_init_functions[b2->base.type]();
    set_actor_position(2000, 2000);
    Collider* b2_collider = create_box_collider(2000, 2000, 2);
    set_collider(b2_collider);
    add_actor((Actor*) b2);
    Ball* push_box = (Ball*) malloc(sizeof(Ball));
    push_box->base.type = _Ball;
    THIS_ACTOR = (Actor*) push_box;
    actor_init_functions[push_box->base.type]();
    set_actor_position(save_data.sample_box_x, save_data.sample_box_y);
    Collider* push_box_collider = create_box_collider(save_data.sample_box_x, save_data.sample_box_y, 3);
    set_collider(push_box_collider);
    set_collision_callback(push_box_collider, push_box_on_collision);
    add_actor((Actor*) push_box);
    SAMPLE_PUSHABLE_BOX = push_box;
    set_scene_map(maps[map1]);
    set_scene_window(maps[ui_test]);
}

void SUPDATE(void){
    update_actors();
    draw_actors();
}  
