#include "Actor.h"

Actor* THIS_ACTOR;

void init_actor(Actor* actor){
    actor->current_animation = NULL;
    actor->child = NULL;
    actor->sibling = NULL;
    actor->physics_mode = BALANCED;
    
}

void set_tag(Tags tag, uint8_t index){
    if(index < 5){
        THIS_ACTOR->tags[index] = tag;
    }
}

void set_actor_animation(Animation* animation){
    if(animation == THIS_ACTOR->current_animation){
        return;
    }
    
    if(THIS_ACTOR->current_animation != NULL){
        set_animation_context();
        unload_animation();
    }
    THIS_ACTOR->current_animation = animation;
    THIS_ACTOR->animation_state = malloc(sizeof(AnimationState));
    set_animation_context();
    init_animation_state(THIS_ACTOR->animation_state);
    load_animation(THIS_ACTOR->x >> 4, THIS_ACTOR->y >> 4);

} 

void set_animation_context(void){ 
    THIS_ANIMATION = THIS_ACTOR->current_animation; 
    THIS_ANIMATION_STATE = THIS_ACTOR->animation_state; 
}

void draw(void){
    set_animation_context();
    uint8_t draw_x = THIS_ACTOR->x >> 4;
    uint8_t draw_y = THIS_ACTOR->y >> 4;
    update_animation(draw_x, draw_y);
}

void move_actor(int16_t dx, int16_t dy){
    Actor* next_child = THIS_ACTOR->child;
    while(next_child != NULL){
        THIS_ACTOR = next_child;
        move_actor(dx, dy);
        next_child = next_child->sibling;
    }
    if(THIS_ACTOR->physics_mode == HIGH_PERF){
        THIS_ACTOR->x += dx;
        THIS_ACTOR->y += dy;
        Collider out[] = malloc(sizeof(Collider) * 1);
        uint8_t num_collisions = 0;
        check_blocking_collisions(out, 1, &num_collisions);
        if(num_collisions > 0){
            if(dx > 0){
                THIS_ACTOR->x = out[0].x - THIS_ACTOR->current_animation->width;
            } else if(dx < 0){
                THIS_ACTOR->x = out[0].x + out[0].width;
            }
            if(dy > 0){
                THIS_ACTOR->y = out[0].y - THIS_ACTOR->current_animation->height;
            } else if(dy < 0){
                THIS_ACTOR->y = out[0].y + out[0].height;
            }
        }
    }
    else if(THIS_ACTOR->physics_mode == BALANCED){
        THIS_ACTOR->x += dx;
        THIS_ACTOR->y += dy;
        Collider out[] = malloc(sizeof(Collider) * 5);
        uint8_t num_collisions = 0;
        check_blocking_collisions(out, 5, &num_collisions);
        uint16_t finalY = 0;
        uint16_t finalX = 0;
        if(num_collisions > 0){
            if(dx > 0){
                uint8_t first = 1;
                for(int i = 0; i < num_collisions; i++){
                    uint16_t candidateX = out[i].x - THIS_ACTOR->current_animation->width;
                    if(candidateX < finalX || first){
                        finalX = candidateX;
                        first = 0;
                    }
                }
            }
            else if(dx < 0){
                uint8_t first = 1;
                for(int i = 0; i < num_collisions; i++){
                    uint16_t candidateX = out[i].x + out[i].width;
                    if(candidateX > finalX || first){
                        finalX = candidateX;
                        first = 0;
                    }
                }
            }
            if(dy > 0){
                uint8_t first = 1;
                for(int i = 0; i < num_collisions; i++){
                    uint16_t candidateY = out[i].y - THIS_ACTOR->current_animation->height;
                    if(candidateY < finalY || first){
                        finalY = candidateY;
                        first = 0;
                    }
                }
            }
            else if(dy < 0){
                uint8_t first = 1;
                for(int i = 0; i < num_collisions; i++){
                    uint16_t candidateY = out[i].y + out[i].height;
                    if(candidateY > finalY || first){
                        finalY = candidateY;
                        first = 0;
                    }
                }
            }
            THIS_ACTOR->x = finalX;
            THIS_ACTOR->y = finalY;
        } 
    } else{
        uint16_t absdx = dx > 0 ? dx : -dx;
        uint16_t absdy = dy > 0 ? dy : -dy;
        int8_t sign = dx > 0 ? 1 : -1;
        for(int i = 0; i < absdx; i++){
            THIS_ACTOR->physics_mode = BALANCED;
            move_actor(sign, 0);
            THIS_ACTOR->physics_mode = HIGH_FIDELITY;
        }
        sign = dy > 0 ? 1 : -1;
        for(int i = 0; i < absdy; i++){
            THIS_ACTOR->physics_mode = BALANCED;
            move_actor(0, sign);
            THIS_ACTOR->physics_mode = HIGH_FIDELITY;
        }
    }
}

void set_actor_position(uint16_t x, uint16_t y){
    int16_t dx = x - THIS_ACTOR->x;
    int16_t dy = y - THIS_ACTOR->y;
    move_actor(dx, dy);
}