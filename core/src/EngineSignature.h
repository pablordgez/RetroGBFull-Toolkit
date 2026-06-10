#ifndef ENGINE_SIGNATURE_H
#define ENGINE_SIGNATURE_H

#include <gb/gb.h>
#include <stdint.h>

#define RETROGBFULL_ENGINE_SIGNATURE_LENGTH 8U

extern const uint8_t retrogbfull_engine_signature[RETROGBFULL_ENGINE_SIGNATURE_LENGTH];

void retrogbfull_retain_engine_signature(void) NONBANKED;

#endif // ENGINE_SIGNATURE_H
