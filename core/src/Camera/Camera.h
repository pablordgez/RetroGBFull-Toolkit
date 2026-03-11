#ifndef CAMERA_H
#define CAMERA_H

#include <stdint.h>
#include "MainDefinitions.h"
#include "Scene/Scene.h"

extern uint16_t camera_x;
extern uint16_t camera_y;
extern uint8_t deadzone_left;
extern uint8_t deadzone_right;
extern uint8_t deadzone_top;
extern uint8_t deadzone_bottom;

void update_camera(uint16_t worldx, uint16_t worldy) BANKED;


#endif // CAMERA_H
