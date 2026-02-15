#ifndef MAIN_DEFINITIONS_H
#define MAIN_DEFINITIONS_H

#define _CONCAT_DELAY(A,B) A ## B
#define CONCAT(A,B) _CONCAT_DELAY(A,B)
#define AUPDATE CONCAT(Actor_Update_, FILE_NAME)
#define AINIT CONCAT(Actor_Init_, FILE_NAME)
#define SUPDATE CONCAT(scene_update_, FILE_NAME) 
#define SINIT CONCAT(scene_init_state_, FILE_NAME)

#define ID CONCAT(_, FILE_NAME)

typedef void (*RVoid_PVoid)(void);

#endif // MAIN_DEFINITIONS_H