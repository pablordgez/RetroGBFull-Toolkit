#ifndef CAMERA_H
#define CAMERA_H

#include <stdint.h>
#include "MainDefinitions.h"
#include "Scene/Scene.h"

uint16_t camera_x;
uint16_t camera_y;
uint8_t deadzone_left;
uint8_t deadzone_right;
uint8_t deadzone_top;
uint8_t deadzone_bottom;

void update_camera(uint8_t f_drawx, uint8_t f_drawy);


#endif // CAMERA_H