#include "Camera.h"

void update_camera(uint8_t f_drawx, uint8_t f_drawy){
    
    if(f_drawx > (SCREEN_WIDTH - deadzone_right)){
        camera_x += (f_drawx - (SCREEN_WIDTH - deadzone_right));
    }
    else if(f_drawx < deadzone_left){
        camera_x -= (deadzone_left - f_drawx);
    }

    if(f_drawy > (SCREEN_HEIGHT - deadzone_bottom)){
        camera_y += (f_drawy - (SCREEN_HEIGHT - deadzone_bottom));
    }
    else if(f_drawy < deadzone_top){
        camera_y -= (deadzone_top - f_drawy);
    }
}