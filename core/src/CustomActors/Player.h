#ifndef PLAYER_H
#define PLAYER_H
#include "Actor/Actor.h"
#include "Assets/Animations/AnimationRegistry.h"
#include "gb/gb.h"
#include <stdio.h>
typedef struct {
    Actor base;
    Animation* animation1;
    Animation* animation2;
} Player;



#endif // PLAYER_H