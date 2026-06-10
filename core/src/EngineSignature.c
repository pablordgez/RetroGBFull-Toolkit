#include "EngineSignature.h"

const uint8_t retrogbfull_engine_signature[RETROGBFULL_ENGINE_SIGNATURE_LENGTH] = {
    0x52U, 0x47U, 0x42U, 0x46U, 0x55U, 0x4CU, 0x4CU, 0x21U
};

static const uint8_t* volatile retrogbfull_engine_signature_anchor;

void retrogbfull_retain_engine_signature(void) NONBANKED{
    retrogbfull_engine_signature_anchor = retrogbfull_engine_signature;
}
