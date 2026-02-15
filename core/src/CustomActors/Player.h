#ifndef PLAYER_H
#define PLAYER_H
#include "Actor/Actor.h"
#include "Assets/Animations/AnimationRegistry.h"
#include "gb/gb.h"
#include <stdio.h>
typedef struct {
    Actor base;
} Player;

extern const Animation* animation1;
extern const Animation* animation2;

#endif // PLAYER_H