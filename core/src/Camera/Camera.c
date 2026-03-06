#include "Camera.h"

uint16_t camera_x = 0;
uint16_t camera_y = 0;
uint8_t deadzone_left = 20;
uint8_t deadzone_right = 20;
uint8_t deadzone_top = 20;
uint8_t deadzone_bottom = 20;

void update_camera(uint16_t worldx, uint16_t worldy){
    uint8_t old_cam_tile_x = camera_x >> 3; 
    uint8_t old_cam_tile_y = camera_y >> 3;

    int16_t f_drawx = ((int16_t)worldx >> 4) - (int16_t)camera_x - 8;
    int16_t f_drawy = ((int16_t)worldy >> 4) - (int16_t)camera_y - 16;

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

    if ((int16_t)camera_x < 0) {
        camera_x = 0;
    }
    else {
        uint16_t max_cam_x = (THIS_SCENE->map->width << 3) - SCREEN_WIDTH;
        if (camera_x > max_cam_x) {
            camera_x = max_cam_x;
        }
    }

    if ((int16_t)camera_y < 0) {
        camera_y = 0;
    } 
    else {
        uint16_t max_cam_y = (THIS_SCENE->map->height << 3) - SCREEN_HEIGHT;
        if (camera_y > max_cam_y) {
            camera_y = max_cam_y;
        }
    }

    uint8_t new_cam_tile_x = camera_x >> 3;
    uint8_t new_cam_tile_y = camera_y >> 3;

    if (new_cam_tile_x > old_cam_tile_x) {
        load_map_section(new_cam_tile_x + 20, new_cam_tile_y, 1, 19, 0);
    } 
    else if (new_cam_tile_x < old_cam_tile_x) {
        load_map_section(new_cam_tile_x, new_cam_tile_y, 1, 19, 0);
    }

    if (new_cam_tile_y > old_cam_tile_y) {
        load_map_section(new_cam_tile_x, new_cam_tile_y + 18, 21, 1, 0);
    } 
    else if (new_cam_tile_y < old_cam_tile_y) {
        load_map_section(new_cam_tile_x, new_cam_tile_y, 21, 1, 0);
    }

    move_bkg(camera_x, camera_y);
}
