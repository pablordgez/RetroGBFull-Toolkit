#ifndef SAMPLE_SCENE_H
#define SAMPLE_SCENE_H
#include "Scene/Scene.h"
#include "CustomActors/Player.h"
#include "CustomActors/Ball.h"
#include "Collisions/Collider.h"
#include "Collisions/ColliderRegistry.h"
#include <stdint.h>
typedef struct {
    Scene base;
} SampleScene;

extern Ball* SAMPLE_PUSHABLE_BOX;
extern int16_t SAMPLE_PLAYER_PUSH_DX;
extern int16_t SAMPLE_PLAYER_PUSH_DY;

#endif // SAMPLE_SCENE_H
