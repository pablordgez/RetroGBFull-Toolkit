#ifndef MAIN_DEFINITIONS_H
#define MAIN_DEFINITIONS_H

#define _CONCAT_DELAY(A,B) A ## B
#define CONCAT(A,B) _CONCAT_DELAY(A,B)
#define UPDATE CONCAT(Update_, FILE_NAME)
#define INIT CONCAT(Init_, FILE_NAME)

#define ACTOR_ID CONCAT(_, FILE_NAME)


typedef void (*RVoid_PVoid)(void);

#endif // MAIN_DEFINITIONS_H