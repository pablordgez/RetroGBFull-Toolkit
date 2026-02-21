#include "SampleScene.h"

void SINIT(void){
    SampleScene* scene = (SampleScene*) THIS_SCENE; 
    init_scene(&scene->base); 
    Player* p = (Player*) malloc(sizeof(Player));
    p->base.type = _Player;
    THIS_ACTOR = (Actor*) p;
    actor_init_functions[p->base.type]();
    set_actor_position(500, 500);
    Collider* p_collider = (Collider*) malloc(sizeof(Collider));
    p_collider->x = 500;
    p_collider->y = 500;
    p_collider->width = 128;
    p_collider->height = 128;
    p_collider->is_blocking = 1;
    p_collider->type = BOX_COLLIDER;
    p_collider->id = 0;
    set_collider(p_collider);
    add_actor((Actor*) p);
    Ball *b = (Ball*) malloc(sizeof(Ball));
    b->base.type = _Ball;
    THIS_ACTOR = (Actor*) b;
    actor_init_functions[b->base.type]();
    set_actor_position(700, 700);
    Collider* b_collider = (Collider*) malloc(sizeof(Collider));
    b_collider->x = 700;
    b_collider->y = 700;
    b_collider->width = 128;
    b_collider->height = 128;
    b_collider->is_blocking = 1;
    b_collider->type = BOX_COLLIDER;
    b_collider->id = 1;
    set_collider(b_collider);
    add_actor((Actor*) b);
    THIS_ACTOR = (Actor*) p;
    attach_child((Actor*) b);
    Ball *b2 = (Ball*) malloc(sizeof(Ball));
    b2->base.type = _Ball;
    THIS_ACTOR = (Actor*) b2;
    actor_init_functions[b2->base.type]();
    set_actor_position(2000, 2000);
    Collider* b2_collider = (Collider*) malloc(sizeof(Collider));
    b2_collider->x = 2000;
    b2_collider->y = 2000;
    b2_collider->width = 128;
    b2_collider->height = 128;
    b2_collider->is_blocking = 1;
    b2_collider->type = BOX_COLLIDER;
    b2_collider->id = 2;
    set_collider(b2_collider);
    add_actor((Actor*) b2);
}

void SUPDATE(void){
    update_actors();
    draw_actors();
    __asm \
        nop \
    __endasm;
}  