#include "Collider.h"
#include "ColliderRegistry.h"
Collider* THIS_COLLIDER;
Collider* OTHER_COLLIDER;

uint8_t check_collision(){
    uint16_t wA, hA, wB, hB;
    
    if(THIS_COLLIDER->type == BOX_COLLIDER){
        wA = ((BoxCollider*)THIS_COLLIDER)->width;
        hA = ((BoxCollider*)THIS_COLLIDER)->height;
    } else {
        wA = ((CapsuleCollider*)THIS_COLLIDER)->radiusX << 1;
        hA = ((CapsuleCollider*)THIS_COLLIDER)->radiusY << 1;
    }

    if(OTHER_COLLIDER->type == BOX_COLLIDER){
        wB = ((BoxCollider*)OTHER_COLLIDER)->width;
        hB = ((BoxCollider*)OTHER_COLLIDER)->height;
    } else {
        wB = ((CapsuleCollider*)OTHER_COLLIDER)->radiusX << 1;
        hB = ((CapsuleCollider*)OTHER_COLLIDER)->radiusY << 1;
    }
    
    int16_t dx = (int16_t)THIS_COLLIDER->x - (int16_t)OTHER_COLLIDER->x;
    int16_t dy = (int16_t)THIS_COLLIDER->y - (int16_t)OTHER_COLLIDER->y;
    
    if(dx < 0) dx = -dx;
    if(dy < 0) dy = -dy;

    if((uint16_t)dx * 2 >= (wA + wB)) return 0;
    if((uint16_t)dy * 2 >= (hA + hB)) return 0;

    if(THIS_COLLIDER->type == BOX_COLLIDER && OTHER_COLLIDER->type == BOX_COLLIDER){
        return 1;
    }

    if(THIS_COLLIDER->type != BOX_COLLIDER && OTHER_COLLIDER->type != BOX_COLLIDER){
        CapsuleCollider* c1 = (CapsuleCollider*)THIS_COLLIDER;
        CapsuleCollider* c2 = (CapsuleCollider*)OTHER_COLLIDER;

        int16_t ox1 = 0, oy1 = 0, ox2 = 0, oy2 = 0;
        uint16_t iw1, ih1, iw2, ih2;
        uint8_t r1, r2;

        if(c1->radiusY > c1->radiusX) {
            r1 = c1->radiusX;
            oy1 = c1->radiusY - c1->radiusX;
            iw1 = c1->radiusX << 1; ih1 = oy1 << 1;
        } else {
            r1 = c1->radiusY;
            ox1 = c1->radiusX - c1->radiusY;
            iw1 = ox1 << 1; ih1 = c1->radiusY << 1;
        }

        if(c2->radiusY > c2->radiusX) {
            r2 = c2->radiusX;
            oy2 = c2->radiusY - c2->radiusX;
            iw2 = c2->radiusX << 1; ih2 = oy2 << 1;
        } else {
            r2 = c2->radiusY;
            ox2 = c2->radiusX - c2->radiusY;
            iw2 = ox2 << 1; ih2 = c2->radiusY << 1;
        }

        uint32_t rSum = r1 + r2;
        rSum *= rSum;

        for(int i = -1; i <= 1; i += 2) {
            for(int j = -1; j <= 1; j += 2) {
                int16_t px1 = c1->base.x + (ox1 * i);
                int16_t py1 = c1->base.y + (oy1 * i);
                int16_t px2 = c2->base.x + (ox2 * j);
                int16_t py2 = c2->base.y + (oy2 * j);

                int16_t ddx = px1 - px2;
                int16_t ddy = py1 - py2;
                
                if( ((int32_t)ddx*ddx + (int32_t)ddy*ddy) < rSum ) return 1;
            }
        }

        if( (uint16_t)dx * 2 < (iw1 + iw2) && (uint16_t)dy * 2 < (ih1 + ih2) ) return 1;
        
        return 0;
    }

    BoxCollider* box;
    CapsuleCollider* cap;

    if(THIS_COLLIDER->type == BOX_COLLIDER) { box = (BoxCollider*)THIS_COLLIDER; cap = (CapsuleCollider*)OTHER_COLLIDER; }
    else { box = (BoxCollider*)OTHER_COLLIDER; cap = (CapsuleCollider*)THIS_COLLIDER; }

    int16_t ox = 0, oy = 0;
    uint16_t iw, ih;
    uint32_t rSq;

    if(cap->radiusY > cap->radiusX) {
        rSq = (uint32_t)cap->radiusX * cap->radiusX;
        oy = cap->radiusY - cap->radiusX;
        iw = cap->radiusX << 1; ih = oy << 1;
    } else {
        rSq = (uint32_t)cap->radiusY * cap->radiusY;
        ox = cap->radiusX - cap->radiusY;
        iw = ox << 1; ih = cap->radiusY << 1;
    }

    int16_t boxL = box->base.x - (box->width >> 1);
    int16_t boxR = box->base.x + (box->width >> 1);
    int16_t boxT = box->base.y - (box->height >> 1);
    int16_t boxB = box->base.y + (box->height >> 1);

    for(int i = -1; i <= 1; i += 2) {
        int16_t cx = cap->base.x + (ox * i);
        int16_t cy = cap->base.y + (oy * i);

        int16_t closeX = cx;
        if(closeX < boxL) closeX = boxL;
        else if(closeX > boxR) closeX = boxR;

        int16_t closeY = cy;
        if(closeY < boxT) closeY = boxT;
        else if(closeY > boxB) closeY = boxB;

        int16_t ddx = cx - closeX;
        int16_t ddy = cy - closeY;

        if( ((int32_t)ddx*ddx + (int32_t)ddy*ddy) < rSq ) return 1;
    }

    if( (uint16_t)dx * 2 < (box->width + iw) && (uint16_t)dy * 2 < (box->height + ih) ) return 1;

    return 0;
}