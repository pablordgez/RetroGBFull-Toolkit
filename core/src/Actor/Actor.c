#pragma bank 255
#include "Actor.h"
#include "Camera/Camera.h"


Actor* THIS_ACTOR;

extern uint8_t actor_map_bounds_active;
extern uint16_t actor_map_max_x;
extern uint16_t actor_map_max_y;

#define UPDATE_ACTOR_AND_COLLIDER_AXIS(actor_pos, collider_pos, delta) do { \
    uint16_t old_pos = (actor_pos); \
    UPDATE_COORD_SAFE((actor_pos), (delta)); \
    (collider_pos) += (int16_t)((actor_pos) - old_pos); \
} while(0)

#define UPDATE_NONBLOCKING_ACTOR_AXIS(actor_pos, collider_pos, delta, max_pos) do { \
    if((delta) < 0 && (actor_pos) < (uint16_t)-(delta)){ \
        if(THIS_ACTOR->collider != NULL){ \
            (collider_pos) -= (actor_pos); \
        } \
        (actor_pos) = 0; \
    } else{ \
        (actor_pos) += (delta); \
        if(THIS_ACTOR->collider != NULL){ \
            (collider_pos) += (delta); \
        } \
        if(actor_map_bounds_active && (actor_pos) > (max_pos)){ \
            uint16_t correction = (actor_pos) - (max_pos); \
            (actor_pos) = (max_pos); \
            if(THIS_ACTOR->collider != NULL){ \
                (collider_pos) -= correction; \
            } \
        } \
    } \
} while(0)

static void clamp_actor_to_map(Actor* actor) NONBANKED{
    if (!actor_map_bounds_active) {
        return;
    }

    if (actor->x > actor_map_max_x) {
        if (actor->collider != NULL) {
            actor->collider->x -= actor->x - actor_map_max_x;
        }
        actor->x = actor_map_max_x;
    }
    if (actor->y > actor_map_max_y) {
        if (actor->collider != NULL) {
            actor->collider->y -= actor->y - actor_map_max_y;
        }
        actor->y = actor_map_max_y;
    }
}

void init_actor(Actor* actor) BANKED{
    memset(actor->tags, 0, sizeof(actor->tags));
    actor->current_animation = NULL;
    actor->animation_state = NULL;
    actor->x = 0;
    actor->y = 0;
    actor->child = NULL;
    actor->sibling = NULL;
    actor->parent = NULL;
    actor->collider = NULL;
    actor->physics_mode = BALANCED;
    actor->followed = 0;
}

void set_tag(Tags tag, uint8_t index) BANKED{
    if(index < 5){
        THIS_ACTOR->tags[index] = tag;
    }
}

void set_actor_animation(Animation* animation) NONBANKED{
    if(animation == THIS_ACTOR->current_animation){
        return;
    }
    
    if(THIS_ACTOR->current_animation != NULL){
        set_animation_context();
        hide_animation();
        unload_animation();
        THIS_ACTOR->animation_state = NULL;
    }
    THIS_ACTOR->current_animation = animation;
    if(animation == NULL){
        return;
    }
    THIS_ACTOR->animation_state = malloc(sizeof(AnimationState));
    if(THIS_ACTOR->animation_state == NULL){
        THIS_ACTOR->current_animation = NULL;
        return;
    }
    set_animation_context();
    init_animation_state(THIS_ACTOR->animation_state);
    if(load_animation(THIS_ACTOR->x >> 4, THIS_ACTOR->y >> 4) == 0){
        free(THIS_ACTOR->animation_state);
        THIS_ACTOR->animation_state = NULL;
        THIS_ACTOR->current_animation = NULL;
    }

} 

void set_collider(Collider* collider) BANKED{
    if(THIS_ACTOR->collider != NULL){
        disable_collider(THIS_ACTOR->collider);
        free(THIS_ACTOR->collider);
    }
    THIS_ACTOR->collider = collider;
    if(collider != NULL){
        collider->parent = THIS_ACTOR;
        collider->num_collision_callbacks = 0;
        collider->num_collision_exit_callbacks = 0;
        memset(collider->on_collision, 0, sizeof(collider->on_collision));
        memset(collider->on_collision_exit, 0, sizeof(collider->on_collision_exit));
        enable_collider(collider);
    }
}

void set_animation_context(void) BANKED{ 
    THIS_ANIMATION = THIS_ACTOR->current_animation; 
    THIS_ANIMATION_STATE = THIS_ACTOR->animation_state; 
}

void draw(void) NONBANKED{
    if(THIS_ACTOR->current_animation == NULL || THIS_ACTOR->animation_state == NULL){
        return;
    }
    set_animation_context();
    int16_t draw_x = (THIS_ACTOR->x >> 4) - (int16_t)camera_x;
    int16_t draw_y = (THIS_ACTOR->y >> 4) - (int16_t)camera_y;

    int16_t cull_left = 8 - THIS_ANIMATION->width;
    int16_t cull_top = 16 - THIS_ANIMATION->height;

    if(draw_x < cull_left || draw_x > SCREEN_WIDTH + 8 || draw_y < cull_top || draw_y > SCREEN_HEIGHT + 16){
        hide_animation();
        return;
    }
    update_animation(draw_x, draw_y);
}

void balanced_physics(int16_t dx, int16_t dy) BANKED{
    UPDATE_ACTOR_AND_COLLIDER_AXIS(THIS_ACTOR->x, THIS_COLLIDER->x, dx);
    UPDATE_ACTOR_AND_COLLIDER_AXIS(THIS_ACTOR->y, THIS_COLLIDER->y, dy);

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
    clamp_actor_to_map(THIS_ACTOR);
}

void move_actor_hierarchy(int16_t dx, int16_t dy) BANKED{
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
            if (THIS_ACTOR->collider != NULL) {
                UPDATE_ACTOR_AND_COLLIDER_AXIS(THIS_ACTOR->x, THIS_ACTOR->collider->x, dx);
                UPDATE_ACTOR_AND_COLLIDER_AXIS(THIS_ACTOR->y, THIS_ACTOR->collider->y, dy);
            } else{
                UPDATE_COORD_SAFE(THIS_ACTOR->x, dx);
                UPDATE_COORD_SAFE(THIS_ACTOR->y, dy);
            }
            clamp_actor_to_map(THIS_ACTOR);
            continue;
        }

        THIS_COLLIDER = THIS_ACTOR->collider;

        if (THIS_ACTOR->physics_mode == HIGH_PERF) {
            UPDATE_ACTOR_AND_COLLIDER_AXIS(THIS_ACTOR->x, THIS_COLLIDER->x, dx);
            UPDATE_ACTOR_AND_COLLIDER_AXIS(THIS_ACTOR->y, THIS_COLLIDER->y, dy);

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
            clamp_actor_to_map(THIS_ACTOR);
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
            clamp_actor_to_map(THIS_ACTOR);
        }
    }
    THIS_ACTOR = parent;
}

void move_actor(int16_t dx, int16_t dy) BANKED{
    if(THIS_ACTOR->child == NULL &&
        (THIS_ACTOR->collider == NULL || THIS_ACTOR->collider->is_blocking == 0)){
        if(dy == 0 && dx != 0){
            UPDATE_NONBLOCKING_ACTOR_AXIS(
                THIS_ACTOR->x,
                THIS_ACTOR->collider->x,
                dx,
                actor_map_max_x
            );
            return;
        }
        if(dx == 0 && dy != 0){
            UPDATE_NONBLOCKING_ACTOR_AXIS(
                THIS_ACTOR->y,
                THIS_ACTOR->collider->y,
                dy,
                actor_map_max_y
            );
            return;
        }
    }

    move_actor_hierarchy(dx, dy);
}

void set_actor_position(uint16_t x, uint16_t y) BANKED{
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
        
        if (current->collider != NULL) {
            UPDATE_ACTOR_AND_COLLIDER_AXIS(current->x, current->collider->x, dx);
            UPDATE_ACTOR_AND_COLLIDER_AXIS(current->y, current->collider->y, dy);
        } else{
            UPDATE_COORD_SAFE(current->x, dx);
            UPDATE_COORD_SAFE(current->y, dy);
        }
        clamp_actor_to_map(current);
    }
    THIS_ACTOR = parent;
}

void attach_child(Actor* child) BANKED{
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

void detach_child(Actor* child) BANKED{
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

void destroy_actor(Actor* actor) BANKED{
    if(actor == NULL){
        return;
    }

    THIS_ACTOR = actor;
    set_actor_animation(NULL);
    set_collider(NULL);
    actor->child = NULL;
    actor->sibling = NULL;
    actor->parent = NULL;
    free(actor);
}
