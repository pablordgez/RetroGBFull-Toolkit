#include "SpaceManager.h"

void init_space_manager(SpaceManager* manager, uint8_t num_spaces){
    // each space uses only 1 bit, so each entry is 8 spaces
    uint8_t num_bytes = (num_spaces + 7) / 8;
    manager->spaces = (uint8_t*)malloc(num_bytes);
    manager->total_spaces = num_spaces;
    if(manager->spaces == (void*)0){
        return; // Memory allocation failed
    }
}

uint8_t register_space(SpaceManager* manager, uint8_t size) {
    uint8_t block_start = 0;
    uint8_t consecutive_free = 0;
    for(uint8_t slot = 0; slot < manager->total_spaces; slot++){
        /*
            slot >> 3 = slot / 8
            si queremos mirar un slot en el primer byte, por ejemplo, 2, nos va a dar 0, primer byte
            si queremos mirar un slot en el tercer byte, por ejemplo, 20, nos va a dar 2, tercer byte

            slot & 7 = slot % 8
            queremos saber qué bit es dentro del byte
            si queremos mirar el slot 2, nos va a dar 2, tercer bit
            si queremos mirar el slot 20, nos va a dar 4, quinto bit

            1 << (slot & 7)
            un byte con un 1 en la posición del bit que queremos mirar

            al hacer & con el byte en el que está el slot y un byte con un 1 en la posición del bit que queremos mirar, nos da 1 si está ocupado, 0 si está libre
        */
        if((manager->spaces[slot >> 3] & (1 << (slot & 7))) == 0){
            if(consecutive_free == 0){
                block_start = slot;
            }
            consecutive_free++;
            if(consecutive_free == size){
                // Mark spaces as used
                for(uint8_t i = block_start; i < block_start + size; i++){
                    /*
                        i >> 3 nos da el byte en el que está el slot i
                        |= es un operador OR de asignación, similar a los operadores aritméticos como +=, pero con el operador OR
                        (1 << (i & 7)) nos da un byte con un 1 en la posición del bit del slot i
                        al hacer |= con el byte en el que está el slot i y un byte con un 1 en la posición del bit del slot i, marcamos ese bit como ocupado
                    */
                    manager->spaces[i >> 3] |= (1 << (i & 7));
                }
                return block_start;
            }
        } else {
            consecutive_free = 0;
        }
    }
    return 0; // Not enough space
}


void remove_spaces(SpaceManager* manager, uint8_t slot, uint8_t size) {
    if(slot >= manager->total_spaces) {
        return; // Invalid slot
    }
    /*
        slot >> 3 nos da el byte en el que está el slot
        ~(1 << (slot & 7)) nos da un byte con un 0 en la posición del bit del slot y 1s en las demás posiciones
        al hacer &= con el byte en el que está el slot y un byte con un 0 en la posición del bit del slot, marcamos ese bit como libre
    */
    for(uint8_t i = slot; i < slot + size; i++){
        /*
            i >> 3 nos da el byte en el que está el slot i
            &= es un operador AND de asignación, similar a los operadores aritméticos como +=, pero con el operador AND
            ~(1 << (i & 7)) nos da un byte con un 0 en la posición del bit del slot i y 1s en las demás posiciones
            al hacer &= con el byte en el que está el slot i y un byte con un 0 en la posición del bit del slot i, marcamos ese bit como libre
        */
        manager->spaces[i >> 3] &= ~(1 << (i & 7));
    }
}

