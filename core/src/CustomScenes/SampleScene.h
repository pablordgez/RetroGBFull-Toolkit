#ifndef SAMPLE_SCENE_H
#define SAMPLE_SCENE_H
#include "Scene/Scene.h"
#include "CustomActors/Player.h"
#include "CustomActors/Ball.h"
#include "Collisions/Collider.h"
#include "Collisions/ColliderRegistry.h"
typedef struct {
    Scene base;
} SampleScene;
#endif // SAMPLE_SCENE_H