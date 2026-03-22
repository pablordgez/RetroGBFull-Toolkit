#ifndef MAIN_DEFINITIONS_H
#define MAIN_DEFINITIONS_H

#include <stdint.h>
#include <gb/gb.h>

#define _CONCAT_DELAY(A,B) A ## B
#define CONCAT(A,B) _CONCAT_DELAY(A,B)
#define AUPDATE CONCAT(Actor_Update_, FILE_NAME)
#define AINIT CONCAT(Actor_Init_, FILE_NAME)
#define SUPDATE CONCAT(scene_update_, FILE_NAME) 
#define SINIT CONCAT(scene_init_state_, FILE_NAME)

#define SCREEN_WIDTH 160
#define SCREEN_HEIGHT 144

#define ID CONCAT(_, FILE_NAME)

typedef void (*RVoid_PVoid)(void);
typedef void (*RVoid_PVoid_BANKED)(void) BANKED;
typedef uint8_t (*RUInt8_PVoid)(void);

#define STACK_SIZE 10
#ifndef COLLISION_CALLBACKS_EVERY_FRAME
#define COLLISION_CALLBACKS_EVERY_FRAME 1
#endif

#define UPDATE_COORD_SAFE(pos, delta) do { \
    if ((delta) < 0 && (uint16_t)(-(delta)) > (pos)) { (pos) = 0; } \
    else { (pos) += (delta); } \
} while(0)

#endif // MAIN_DEFINITIONS_H
