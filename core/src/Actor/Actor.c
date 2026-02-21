#include "Actor.h"

Actor* THIS_ACTOR;

void init_actor(Actor* actor){
    actor->current_animation = NULL;
    actor->child = NULL;
    actor->sibling = NULL;
    actor->collider = NULL;
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

void set_collider(Collider* collider){
    if(THIS_ACTOR->collider != NULL){
        disable_collider(THIS_ACTOR->collider);
        free(THIS_ACTOR->collider);
    }
    THIS_ACTOR->collider = collider;
    if(collider != NULL){
        enable_collider(collider);
    }
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

void balanced_physics(int16_t dx, int16_t dy) {
    UPDATE_COORD_SAFE(THIS_ACTOR->x, dx);
    UPDATE_COORD_SAFE(THIS_ACTOR->y, dy);
    UPDATE_COORD_SAFE(THIS_COLLIDER->x, dx);
    UPDATE_COORD_SAFE(THIS_COLLIDER->y, dy);

    Collider* out[5];
    uint8_t num_collisions = 0;
    check_blocking_collisions(out, 5, &num_collisions);

    if (num_collisions > 0) {
        uint16_t finalX = THIS_COLLIDER->x;
        uint16_t finalY = THIS_COLLIDER->y;

        if (dx > 0) {
            for (int i = 0; i < num_collisions; i++) {
                uint16_t candidateX = out[i]->x - THIS_COLLIDER->width;
                if (i == 0 || candidateX < finalX) finalX = candidateX;
            }
        } else if (dx < 0) {
            for (int i = 0; i < num_collisions; i++) {
                uint16_t candidateX = out[i]->x + out[i]->width;
                if (i == 0 || candidateX > finalX) finalX = candidateX;
            }
        }

        if (dy > 0) {
            for (int i = 0; i < num_collisions; i++) {
                uint16_t candidateY = out[i]->y - THIS_COLLIDER->height;
                if (i == 0 || candidateY < finalY) finalY = candidateY;
            }
        } else if (dy < 0) {
            for (int i = 0; i < num_collisions; i++) {
                uint16_t candidateY = out[i]->y + out[i]->height;
                if (i == 0 || candidateY > finalY) finalY = candidateY;
            }
        }

        int16_t correctionX = finalX - THIS_COLLIDER->x;
        int16_t correctionY = finalY - THIS_COLLIDER->y;

        THIS_ACTOR->x += correctionX;
        THIS_ACTOR->y += correctionY;
        THIS_COLLIDER->x += correctionX;
        THIS_COLLIDER->y += correctionY;
    }
}

void move_actor(int16_t dx, int16_t dy) {
    Actor* parent = THIS_ACTOR;
    Actor* stack[STACK_SIZE];
    uint8_t sp = 0;
    stack[sp++] = parent;

    while (sp > 0) {
        Actor* current = stack[--sp];
        Actor* next_child = current->child;
        while (next_child != NULL) {
            stack[sp++] = next_child;
            next_child = next_child->sibling;
        }
        
        THIS_ACTOR = current;

        if (THIS_ACTOR->collider == NULL || THIS_ACTOR->collider->is_blocking == 0) {
            UPDATE_COORD_SAFE(THIS_ACTOR->x, dx);
            UPDATE_COORD_SAFE(THIS_ACTOR->y, dy);

            if (THIS_ACTOR->collider != NULL) {
                UPDATE_COORD_SAFE(THIS_ACTOR->collider->x, dx);
                UPDATE_COORD_SAFE(THIS_ACTOR->collider->y, dy);
            }
            continue;
        }

        THIS_COLLIDER = THIS_ACTOR->collider;

        if (THIS_ACTOR->physics_mode == HIGH_PERF) {
            UPDATE_COORD_SAFE(THIS_ACTOR->x, dx);
            UPDATE_COORD_SAFE(THIS_ACTOR->y, dy);
            UPDATE_COORD_SAFE(THIS_COLLIDER->x, dx);
            UPDATE_COORD_SAFE(THIS_COLLIDER->y, dy);

            Collider* out[1];
            uint8_t num_collisions = 0;
            check_blocking_collisions(out, 1, &num_collisions);

            if (num_collisions > 0) {
                uint16_t pre_correction_x = THIS_COLLIDER->x;
                uint16_t pre_correction_y = THIS_COLLIDER->y;

                if (dx > 0) THIS_COLLIDER->x = out[0]->x - THIS_COLLIDER->width;
                else if (dx < 0) THIS_COLLIDER->x = out[0]->x + out[0]->width;

                if (dy > 0) THIS_COLLIDER->y = out[0]->y - THIS_COLLIDER->height;
                else if (dy < 0) THIS_COLLIDER->y = out[0]->y + out[0]->height;

                THIS_ACTOR->x += (THIS_COLLIDER->x - pre_correction_x);
                THIS_ACTOR->y += (THIS_COLLIDER->y - pre_correction_y);
            }
        } 
        else if (THIS_ACTOR->physics_mode == BALANCED) {
            balanced_physics(dx, dy);
        } 
        else {
            uint16_t absdx = dx > 0 ? dx : -dx;
            uint16_t absdy = dy > 0 ? dy : -dy;
            int8_t signX = dx > 0 ? 1 : -1;
            int8_t signY = dy > 0 ? 1 : -1;

            for (int i = 0; i < absdx; i++) {
                THIS_ACTOR->physics_mode = BALANCED;
                balanced_physics(signX, 0);
                THIS_ACTOR->physics_mode = HIGH_FIDELITY;
            }
            for (int i = 0; i < absdy; i++) {
                THIS_ACTOR->physics_mode = BALANCED;
                balanced_physics(0, signY);
                THIS_ACTOR->physics_mode = HIGH_FIDELITY;
            }
        }
    }
    THIS_ACTOR = parent;
}

void set_actor_position(uint16_t x, uint16_t y) {
    Actor* parent = THIS_ACTOR;
    Actor* stack[STACK_SIZE];
    uint8_t sp = 0;
    stack[sp++] = parent;
    
    int16_t dx = x - THIS_ACTOR->x;
    int16_t dy = y - THIS_ACTOR->y;

    while (sp > 0) {
        Actor* current = stack[--sp];
        Actor* next_child = current->child;
        while (next_child != NULL) {
            stack[sp++] = next_child;
            next_child = next_child->sibling;
        }
        
        UPDATE_COORD_SAFE(current->x, dx);
        UPDATE_COORD_SAFE(current->y, dy);
        
        if (current->collider != NULL) {
            UPDATE_COORD_SAFE(current->collider->x, dx);
            UPDATE_COORD_SAFE(current->collider->y, dy);
        }
    }
    THIS_ACTOR = parent;
}

void attach_child(Actor* child){
    child->parent = THIS_ACTOR;
    if(THIS_ACTOR->child == NULL){
        THIS_ACTOR->child = child;
    } else{
        Actor* sibling = THIS_ACTOR->child;
        while(sibling->sibling != NULL){
            sibling = sibling->sibling;
        }
        sibling->sibling = child;
    }
}

void detach_child(Actor* child){
    if(THIS_ACTOR->child == child){
        THIS_ACTOR->child = child->sibling;
        child->sibling = NULL;
        child->parent = NULL;
    } else{
        Actor* sibling = THIS_ACTOR->child;
        while(sibling != NULL && sibling->sibling != child){
            sibling = sibling->sibling;
        }
        if(sibling != NULL){
            sibling->sibling = child->sibling;
            child->sibling = NULL;
            child->parent = NULL;
        }
    }
}