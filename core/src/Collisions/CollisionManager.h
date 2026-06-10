#ifndef COLLISION_MANAGER_H
#define COLLISION_MANAGER_H
#include "Collider.h"

void enable_collider(Collider* collider) BANKED;
void disable_collider(Collider* collider) BANKED;
void set_collision_callback(Collider* collider, CollisionCallback callback) BANKED;
void set_collision_exit_callback(Collider* collider, CollisionCallback callback) BANKED;
void check_collisions(Collider* out[], uint8_t max_collisions, uint8_t* num_collisions) BANKED;
void check_collisions_with_tags(Collider* out[], uint8_t max_collisions, uint8_t* num_collisions, Tags tag) BANKED;
void check_blocking_collisions(Collider* out[], uint8_t max_collisions, uint8_t* num_collisions) BANKED;
void check_blocking_collisions_with_tags(Collider* out[], uint8_t max_collisions, uint8_t* num_collisions, Tags tag) BANKED;
void run_collision_callbacks(void) BANKED;

#endif // COLLISION_MANAGER_H
